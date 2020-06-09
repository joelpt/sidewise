// Used to detect when Chrome is showing a malware warning page, which can cause the Sidewide sidebar to also
// show as a malware warning page due to its loading of favicons from malware-warning sites.

var IconTester = function() {
    this.testTab = undefined;
    this.testResetTime = undefined;
    this.testOnFinished = undefined;
    this.badNodesFound = [];
};

var IconTesterDomWindow = undefined;

IconTester.prototype = {
    testIcons: function() {
        preventTestIconsCheck = true;
        var msg = 'Sidewise\'s sidebar appears to be showing a Chrome malware warning page. This can happen when you visit a ' +
            'page which Chrome believes to contain malware. Because Sidewise shows the favicon of such pages in the sidebar, ' +
            'this also triggers Chrome\'s malware warning within the sidebar itself.\n\n' +
            'Sidewise can try to fix this by identifying the bad favicon and removing it from the sidebar.\n\n' +
            'This process will take about a minute. DO NOT interact with Chrome until it is complete.';
        if (!confirm(msg)) {
            alert('You declined to do the favicon malware test. Sidewise won\'t ask again until you restart Chrome.');
            return;
        }

        this.testTab = undefined;
        this.testOnFinished = undefined;

        try {
            if (sidebarHandler.sidebarExists()) {
                sidebarHandler.remove();
            }
            this.doTestIcons(this.onTestIconsFinished);
        }
        catch (ex) {
            this.destroyTestIconsPage();
            alert('Sorry, but something went wrong during the testing process. No changes have been made to your tree.');
        }
    },

    onTestIconsFinished: function(badNodes) {
        var self = this;

        if (badNodes.length > 0) {
            badNodes.forEach(function(e) {
                e.favicon = 'chrome://favicon';
            });
            savePageTreeToLocalStorage(tree, 'pageTree', true);
            savePageTreeToLocalStorage(recentlyClosedTree, 'recentlyClosedTree', true);

            // Remember what we have found so far and run the test suite again
            // until we're all clear
            this.badNodesFound.push(badNodes);
            this.doTestIcons(this.onTestIconsFinished);
            return;
        }
        this.destroyTestIconsPage();

        setTimeout(function() {
            sidebarHandler.createWithDockState(settings.get('dockState'));
            if (self.badNodesFound.length == 0) {
                setTimeout(function() {
                    alert('Sidewise did not find any favicons that caused the malware page problem. Sorry!\n\n' +
                        'If you are still seeing the malware page in the sidebar, restarting Chrome and rerunning this test will usually fix it.');
                }, 100);
                return;
            }
            setTimeout(function() {
                alert('The testing process is complete and Sidewise has detected ' + self.badNodesFound.length.toString() + ' favicon(s) that caused the malware page problem.' +
                '\n\nSidewise has removed these favicons from the sidebar and the problem should now be resolved.');
            }, 100);
            preventTestIconsCheck = false;
        }, 500);
    },

    doTestIcons: function(onFinished) {
        this.testTab = undefined;
        this.testOnFinished = onFinished;
        this.startTestIconsLoops();
    },

    createTestIconsPage: function(onCreated) {
        var self = this;
        IconTesterDomWindow = undefined;
        chrome.tabs.create({ url: 'test_icons.html' }, function(tab) {
            self.onTestIconsTabCreated(tab, onCreated);
        });
    },

    resetTestIconsPage: function(onResetDone) {
        var self = this;
        if (this.testTab) {
            this.destroyTestIconsPage(function() {
                self.createTestIconsPage(onResetDone);
            });
            return;
        }
        this.createTestIconsPage(onResetDone);
    },

    destroyTestIconsPage: function(onDestroyed) {
        var self = this;
        onDestroyed = onDestroyed || function() { };
        if (this.testTab) {
            chrome.tabs.remove(this.testTab.id, function() {
                self.testTab = undefined;
                IconTesterDomWindow = undefined;
                onDestroyed();
            });
            return;
        }
        onDestroyed();
    },

    onTestIconsTabCreated: function(tab, onReady) {
        var self = this;
        if (!tab) {
            throw new Error('Test icons tab failed to load.');
        }
        this.testTab = tab;
        setTimeout(function() {
            if (!IconTesterDomWindow) {
                self.onTestIconsTabCreated(tab, onReady);
                return;
            }
            onReady();
        }, 250);
    },

    startTestIconsLoops: function() {
        var self = this;
        var badNodes = [];
        this.testIconsInTree(tree, function(badNode) {
            if (badNode) {
                console.warn('GOT IT', badNode.id, badNode.favicon);
                badNodes.push(badNode);
            }
            self.testIconsInTree(recentlyClosedTree, function(badNode) {
                if (badNode) {
                    console.warn('RC GOT IT', badNode.id, badNode.favicon);
                    badNodes.push(badNode);
                }
                self.testOnFinished(badNodes);
            });
        });
    },

    testIconsInTree: function(tree, onFinished) {
        var self = this;
        var nodes = tree.filter(function(e) {
            return e instanceof PageNode && e.favicon;
        });
        this.testResetTime = 5000;
        this.testIconBatch(nodes, function() {
            self.destroyTestIconsPage(function() { onFinished(); });
        }, function(badNode) {
            self.destroyTestIconsPage(function() { onFinished(badNode); });
        });
    },

    testIconBatch: function(nodes, onAllValid, onFoundInvalid) {
        var self = this;
        this.resetTestIconsPage(function() {
            for (var i = 0; i < nodes.length; i++) {
                var node = nodes[i];
                IconTesterDomWindow.testIcon(node.favicon);
            };
            setTimeout(function() {
                chrome.tabs.get(self.testTab.id, function(t) {
                    if (t.title.toLowerCase().indexOf('malware') >= 0) {
                        // one of the tested icons had a problem
                        if (nodes.length == 1) {
                            // found the bad icon
                            onFoundInvalid(nodes[0]);
                            return;
                        }
                        // more than one tested icon had a problem,
                        // so split the test batch in half and test
                        // each half separately
                        var batch1 = nodes.slice(0, nodes.length / 2);
                        var batch2 = nodes.slice(nodes.length / 2);

                        self.testResetTime = 2000;
                        self.testIconBatch(batch1, function() {
                            // all the icons in the first batch are valid
                            // so test the second batch
                            self.testIconBatch(batch2, function() {
                                // all the icons in the second batch are valid
                                // but this should be impossible
                                throw new Error('Found a bad icon in an earlier iteration but did not find it in subdivision process!');
                            }, onFoundInvalid);
                        }, onFoundInvalid);
                    }
                    else {
                        // no icon came up on error
                        onAllValid();
                    }
                });
            }, self.testResetTime);
        });
    }
};
