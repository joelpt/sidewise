///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var PAGETREE_ONMODIFIED_DELAY_ON_STARTUP_MS = 1500;
var PAGETREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS = 1000;
var PAGETREE_ONMODIFIED_STARTUP_DURATION_MS = 20000;


///////////////////////////////////////////////////////////
// PageTree class
///////////////////////////////////////////////////////////

/**
  * @class
  * Hierarchical data model used by Sidewise in the background page to keep track of page opener/opened structure.
  *
  * @param callbackProxy Proxy object with same-named functions as PageTree's page/window functions. Called after a suitable PageTree function call succeeds.
  * @constructor
  * @extends DataTree
  */
var PageTree = function(callbackProxyFn, onModifiedDelayed)
{
    ///////////////////////////////////////////////////////////
    // Initialization
    ///////////////////////////////////////////////////////////

    this.$base();
    this.callbackProxyFn = callbackProxyFn; // callback proxy function for page/window functions
    this.focusedTabId = null;
    this.lastFocusedTabId = null;
    this.tabIndexes = {};
    this.onModified = this._onPageTreeModified;
    this.awakeningPages = [];
    this.onModifiedDelayed = onModifiedDelayed;

    // Set startup onModifiedDelay duration
    this.onModifiedDelayedWaitMs = PAGETREE_ONMODIFIED_DELAY_ON_STARTUP_MS;

    // Update onModifiedDelay duration after startup period
    var self = this;
    setTimeout(function() {
        self.onModifiedDelayedWaitMs = PAGETREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS;
    }, PAGETREE_ONMODIFIED_STARTUP_DURATION_MS);
};

PageTree.prototype = {

    ///////////////////////////////////////////////////////////
    // Node manipulation
    ///////////////////////////////////////////////////////////

    /**
      * Adds a node to the tree as a child of the element matched by parentMatcher.
      *
      * @param node The node to add.
      * @param parentMatcher The parentMatcher to use for identifying the parent; see getNode().
      *                      If parentMatcher is omitted, add to the top level of the tree.
      * @param beforeSiblingMatcher If provided, node will be added under the parent before the
      *                             node that matches beforeSiblingMatcher.
      * @returns [node, parent, beforeSibling], where parent/beforeSibling may be undefined
      */
    addNode: function(node, parentMatcher, beforeSiblingMatcher, preferChromeTabIndex)
    {
        if (node instanceof WindowNode) {
            this.tabIndexes[node.windowId] = [];
        }

        var parent;
        if (parentMatcher) {
            parent = this.getNode(parentMatcher);
        }

        if (preferChromeTabIndex && !beforeSiblingMatcher && node.isTab()) {
            var index = node.index;
            var winTabs = this.tabIndexes['w' + node.windowId];
            if (winTabs) {
                var nextByIndex = winTabs[index];
                if (nextByIndex) {
                    if (nextByIndex.parent === parent) {
                        beforeSiblingMatcher = nextByIndex;
                    }
                }
            }
        }

        var r = this.$super('addNode')(node, parent, beforeSiblingMatcher);

        var parentId = r[1] ? r[1].id : undefined;

        this.callbackProxyFn('add', {
            element: node,
            parentId: r[1] ? r[1].id : undefined,
            beforeSiblingId: r[2] ? r[2].id : undefined
        });

        this.addToTabIndex(node);

        return r;
    },

    addNodeRel: function(node, relation, toMatcher)
    {
        var r = this.$super('addNodeRel')(node, relation, toMatcher);

        this.callbackProxyFn('add', {
            element: node,
            parentId: r[1] ? r[1].id : undefined,
            beforeSiblingId: r[2] ? r[2].id : undefined
        });

        this.addToTabIndex(node);
        return r;
    },

    // update an existing node matching matcher with given details
    updateNode: function(matcher, details, blockUpdateLastModified)
    {
        // log(matcher, details);

        var page = this.getNode(matcher);

        if (!page) {
            throw new Error('Could not find node to update');
        }

        var existingId = page.id;

        this.$super('updateNode')(page, details, blockUpdateLastModified);
        this.callbackProxyFn('update', { id: existingId, element: details });

        return page;
    },

    // remove the element matching matcher
    removeNode: function(matcher, removeChildren)
    {
        // var found = this.getNodeEx(matcher);
        // var index = found.node.index;
        var node = this.getNode(matcher);

        if (!node) {
            throw new Error('Node not found to remove');
        }

        this.removeFromTabIndex(node);

        if (removeChildren) {
            var descendants = this.filter(function(e) { return e; }, node.children);
            for (var i = descendants.length - 1; i >= 0; i--) {
                this.removeFromTabIndex(descendants[i]);
            };
        }

        var r = this.$super('removeNode')(node, removeChildren);
        this.callbackProxyFn('remove', { element: r, removeChildren: removeChildren || false });

        return r;
    },

    // Move the node matching movingMatcher to reside under the node matching parentMatcher, then conform
    // Chrome's tab order to match the tab order in the tree as needed.
    //
    // If beforeSiblingMatcher is specified, node will be placed before beforeSiblingMatcher under new parent.
    // If keepChildren is true, all children of the moving node will keep its existing children after the move.
    // If keepChildren if false (default), the moving node's children get spliced into the moving node's old spot.
    // If blockCallback is true, don't call this PageTree instance's callback proxy handler.
    // If preferChromeTabIndex is true and a beforeSiblingMatcher is not given, attempt to move the node to
    //      be a child of the given parentMatcher, and in the correct order amongst its siblings based on
    //      the movingMatcher node's .index value.
    //
    // Returns [moved, newParent, beforeSibling] if a move was actually performed, or undefined if not.
    moveNode: function(movingMatcher, parentMatcher, beforeSiblingMatcher, keepChildren, blockCallback, preferChromeTabIndex)
    {
        var moving = this.getNode(movingMatcher);
        var parent = this.getNode(parentMatcher);

        if (preferChromeTabIndex && !beforeSiblingMatcher && moving.isTab()) {
            var index = moving.index;
            var nextByIndex = this.tabIndexes['w' + moving.windowId][index];
            if (nextByIndex) {
                if (nextByIndex === moving && parent === nextByIndex.parent) {
                    log('moveNode would move node to same position after compensating for preferChromeTabIndex, doing nothing', movingMatcher, parentMatcher);
                    return;
                }
                var ex = this.getNodeEx(nextByIndex);
                if (ex.parent === parent) {
                    beforeSiblingMatcher = nextByIndex;
                }
            }
        }

        log('moving node', 'moving', moving, 'parent', parent, 'beforeSiblingMatcher', beforeSiblingMatcher, 'keepChildren', keepChildren, 'preferChromeTabIndex', preferChromeTabIndex);
        var r = this.$super('moveNode')(moving, parent, beforeSiblingMatcher, keepChildren);
        if (r === undefined) {
            log('$super.move returned undefined');
        }
        if (r !== undefined && !blockCallback) {
            this.callbackProxyFn('move', {
                element: r[0],
                newParentId: parentMatcher ? r[1].id : undefined,
                beforeSiblingId: beforeSiblingMatcher ? r[2].id : undefined,
                keepChildren: keepChildren || false
            });
        }
        return r;
    },


    // Move node matching movingMatcher to position relative to toMatcher based on given relation.
    //
    // If keepChildren is true, all children of the moving node will keep its existing children after the move.
    // If keepChildren if false (default), the moving node's children get spliced into the moving node's old spot.
    // If blockCallback is true, don't call this PageTree instance's callback proxy handler.
    //
    moveNodeRel: function(movingMatcher, relation, toMatcher, keepChildren, blockCallback)
    {
        var moving = this.getNode(movingMatcher);
        if (!moving) {
            throw new Error('Could not find node to move', movingMatcher, relation, toMatcher);
        }
        this.removeFromTabIndex(moving);
        var r = this.$super('moveNodeRel')(moving, relation, toMatcher, keepChildren);
        this.addToTabIndex(moving);

        if (r !== undefined && !blockCallback) {
            this.callbackProxyFn('move', {
                element: r[0],
                newParentId: r[1] ? r[1].id : undefined,
                beforeSiblingId: r[2] ? r[2].id : undefined,
                keepChildren: keepChildren || false
            });
        }
        return r;
    },

    // Merge the node matching fromNodeMatcher and all its children into the node matching toNodeMatcher.
    // The fromNode is removed from the tree after the merge.
    mergeNodes: function(fromNodeMatcher, toNodeMatcher)
    {
        var r = this.$super('mergeNodes')(fromNodeMatcher, toNodeMatcher);
        if (r !== undefined) {
            this.callbackProxyFn('merge', { fromId: r.fromId, toId: r.toId });
        }
        this.rebuildTabIndex();
        return r;
    },

    expandNode: function(matcher)
    {
        var node = this.getNode(matcher);

        if (!node) {
            throw new Error('Could not find node to expand');
        }

        if (!node.collapsed) {
            return;
        }

        node.collapsed = false;
        this.callbackProxyFn('expand', { id: node.id });
    },

    collapseNode: function(matcher)
    {
        var node = this.getNode(matcher);

        if (!node) {
            throw new Error('Could not find node to collapse');
        }

        if (node.collapsed) {
            return;
        }

        node.collapsed = true;
        this.callbackProxyFn('collapse', { id: node.id });
    },


    ///////////////////////////////////////////////////////////
    // PageNode-specific manipulation
    ///////////////////////////////////////////////////////////

    // retrieve a page from the tree given its tabId
    getPage: function(tabId)
    {
        return this.getNode('p' + tabId);
    },

    // retrieve a page from the tree given its tabId, and return additional details
    getPageEx: function(tabId, inArray) {
        return this.getNodeEx('p' + tabId, inArray);
    },

    focusPage: function(tabId)
    {
        // log(tabId);

        var page = this.getPage(tabId);

        if (!page) {
            log('Page node does not exist to be focused yet', 'tabId', tabId);
            return;
        }

        this.lastFocusedTabId = this.focusedTabId;
        this.focusedTabId = tabId;
        this.callbackProxyFn('focusPage', { id: 'p' + tabId });

        if (page.unread) {
            this.updatePage(page, { unread: false });
        }
    },

    // update an existing page with given details
    updatePage: function(tabIdOrElem, details)
    {
        // log(tabIdOrElem, details);

        if (typeof(tabIdOrElem) == 'number') {
            var page = this.getNode('p' + tabIdOrElem);
        }
        else {
            var page = this.getNode(tabIdOrElem);
        }

        this.updateNode(page, details);
        return page;
    },

    // hibernate pages
    hibernatePages: function(pageNodeIds, skipLastTabCheck)
    {
        log(pageNodeIds);
        for (var i = pageNodeIds.length - 1; i >= 0; i--) {
            this.hibernatePage(pageNodeIds[i], skipLastTabCheck);
        };
    },

    // hibernate a single page
    hibernatePage: function(id, skipLastTabCheck)
    {
        var tabId = getNumericId(id);
        var page = this.updatePage(tabId, { hibernated: true, restorable: false, id: 'pH' + generateGuid(), status: 'complete' });

        var self = this;
        function removeAfterHibernate() {
            chrome.tabs.remove(tabId);
            tree.removeFromTabIndex(page);
            self.updateLastModified();
        }

        if (skipLastTabCheck) {
            removeAfterHibernate();
            return;
        }

        chrome.tabs.query({ windowType: 'normal' }, function(tabs) {
            tabs = tabs.filter(function(e) { return e.id != tabId });

            if (tabs.length == 0) {
                // open the New Tab page to prevent Chrome auto-exiting upon
                // hibernating the last open tab
                chrome.tabs.create({ url: 'chrome://newtab' }, function() {
                    removeAfterHibernate();
                    if (!settings.get('shown_prompt_hibernatingLastTab')) {
                        settings.set('shown_prompt_hibernatingLastTab', true);
                        alert(getMessage('prompt_hibernatingLastTab'));
                    }
                });
                return;
            }
            removeAfterHibernate();
        });

    },

    // awaken (unhibernate) pages
    awakenPages: function(pageNodeIds, activateAfter)
    {
        log(pageNodeIds);

        var windows = {};
        var cnt = 0;

        // build a hash of {windowNodeId: { windowNode, pageNodes: [pageNode, ..] }, ..}
        for (var i = pageNodeIds.length - 1; i >= 0; i--) {
            var id = pageNodeIds[i];
            var found = this.getNodeEx(id);
            var topParent = found.ancestors[0];
            if (!(topParent instanceof WindowNode)) {
                throw new Error('Tried to awakenPages() but page is not contained under a WindowNode');
            }
            if (!windows[topParent.id]) {
                windows[topParent.id] = {windowNode: topParent, pageNodes: []};
                cnt++;
            }
            windows[topParent.id].pageNodes.push(found.node);
        };

        // awaken pages in groups by their window nodes
        var i = 0;
        for (var winId in windows) {
            if (!windows.hasOwnProperty(winId)) {
                continue;
            }
            this.awakenPageNodes(windows[winId].pageNodes, windows[winId].windowNode,
                i == 0 ? activateAfter : false);
            i++;
        }

        this.updateLastModified();
    },


    ///////////////////////////////////////////////////////////
    // WindowNode-specific manipulation
    ///////////////////////////////////////////////////////////

    // awaken (unhibernate) a window node
    awakenWindow: function(id, wakeTabsMatchingFn)
    {
        log(id);
        var winNode = this.getNode(id);

        // collect list of nodes that need to be woken;
        // that list is then reversed to be more compatible
        // with tab index ordering when waking the tabs
        var awakening = this.filter(function(e) {
            var r = e instanceof PageNode && e.hibernated;
            if (!r) {
                return false;
            }
            if (wakeTabsMatchingFn) {
                return wakeTabsMatchingFn(e);
            }
            return true;
        }, winNode.children).reverse();

        this.awakenPageNodes(awakening, winNode);
        this.updateLastModified();
    },

    // hibernate a window node and all its children
    hibernateWindow: function(id)
    {
        log(id);
        var winNode = this.getNode(id);

        var hibernating = this.filter(function(e) {
            return e instanceof PageNode && !e.hibernated;
        }, winNode.children);

        var hibernatingTabIds = hibernating.map(function(e) { return getNumericId(e.id); });

        var self = this;
        function hibernateWindowTabs() {
            for (var i = 0; i < hibernating.length; i++) {
                self.hibernatePage(hibernating[i].id, true);
            }
        }

        chrome.tabs.query({ windowType: 'normal' }, function(tabs) {
            tabs = tabs.filter(function(e) {
                return hibernatingTabIds.indexOf(e.id) == -1;
            });

            if (tabs.length == 0) {
                // open the New Tab page to prevent Chrome auto-exiting upon
                // hibernating the last open tab
                chrome.tabs.create({ url: 'chrome://newtab' }, function() {
                    hibernateWindowTabs();
                    if (!settings.get('shown_prompt_hibernatingLastTab')) {
                        alert(getMessage('prompt_hibernatingLastTab'));
                        settings.set('shown_prompt_hibernatingLastTab', true);
                    }
                });
                return;
            }
            hibernateWindowTabs();
        });

        this.updateLastModified();
    },


    ///////////////////////////////////////////////////////////
    // Hibernation control
    ///////////////////////////////////////////////////////////

    awakenPageNodes: function(nodes, existingWindowNode, activateAfter) {
        var self = this;
        var urls = nodes.map(function(e) { return e.url; });
        nodes.forEach(function(e) { self.awakeningPages.push(e); });

        if (existingWindowNode.hibernated) {
            // need a new window to load page(s) into
            var newWinMetrics;
            if (sidebarHandler.dockState != 'undocked') {
                newWinMetrics = clone(sidebarHandler.currentDockWindowMetrics);
                delete newWinMetrics.state;
            }
            else {
                // TODO get monitor info of monitor that sidebar is on
                // and put us on the same monitor
                newWinMetrics = {
                    left: monitorInfo.monitors[0].left,
                    top: monitorInfo.monitors[0].top,
                    width: monitorInfo.monitors[0].availWidth,
                    height: monitorInfo.monitors[0].availHeight
                };
            }

            var newWinCreateDetails = clone(newWinMetrics);
            newWinCreateDetails.type = 'normal';
            newWinCreateDetails.url = urls;

            // look for a New Tab tab that is all alone in a window; if we find one,
            // adopt it to the new window
            var winNodeWithOneNewTabPage = first(tree.tree, function(e) {
                return e instanceof WindowNode
                    && e.type == 'normal'
                    && !(e.hibernated)
                    && e.children.length == 1
                    && e.children[0].children.length == 0
                    && e.children[0].url == 'chrome://newtab/'
                    && !(e.children[0].hibernated);
            });

            var adoptTabId, adoptWinId;
            if (winNodeWithOneNewTabPage) {
                adoptWinId = getNumericId(winNodeWithOneNewTabPage[1].id);
                adoptTabId = getNumericId(winNodeWithOneNewTabPage[1].children[0].id);
                newWinCreateDetails.tabId = adoptTabId;
            }

            // create new window for awakening
            chrome.windows.create(newWinCreateDetails, function(win) {
                // if we adopted a New Tab tab, destroy that tab now
                if (adoptTabId) {
                    chrome.tabs.remove(adoptTabId, function() {
                        // update docked-to window id if needed
                        if (sidebarHandler.dockState == 'undocked') {
                            return;
                        }
                        if (!sidebarHandler.dockWindowId || sidebarHandler.dockWindowId == adoptWinId) {
                            sidebarHandler.dockWindowId = win.id;
                        }
                    });
                }

                chrome.windows.update(win.id, newWinMetrics);

                var newWinNode = self.getNode('w' + win.id);
                log(newWinNode);
                if (newWinNode) {
                    self.mergeNodes(newWinNode, existingWindowNode);
                }

                self.updateNode(existingWindowNode, {
                    id: 'w' + win.id,
                    restored: true,
                    restorable: false,
                    hibernated: false,
                    title: WINDOW_DEFAULT_TITLE
                });
                self.expandNode(existingWindowNode);
            });
            return;
        }

        // existingWindowNode is not hibernated (its Chrome window already exists)
        var self = this;
        var windowId = getNumericId(existingWindowNode.id);
        nodes.forEach(function(e) {
            var index;
            var prev;
            var next = e.following(function(test) { return test.isTab() && test.windowId == e.windowId; });
            if (next) {
                console.log('looking up tab index for next tab', next.id);
                index = self.getTabIndex(next);
            }
            else {
                var prev = e.preceding(function(test) { return test.isTab() && test.windowId == e.windowId; });
                if (prev) {
                    console.log('looking up tab index for preceding tab', prev.id);
                    index = self.getTabIndex(prev);
                    if (index !== undefined) {
                        index += 1;
                    }
                }
            }

            if (index === undefined) {
                if (next) {
                    console.log('fallback on next.index', next.id, next.index);
                    index = next.index;
                }
                else if (prev) {
                    console.log('fallback on prev.index', prev.id, prev.index);
                    index = prev.index + 1;
                }

                if (index === undefined) {
                    index = 99999; // Chrome will clamp this value to the number of tabs actually in the window
                                   // thereby putting the tab at the end of the window's tab bar
                }
            }

            log('awakening', e.url, 'windowId', windowId, 'index', index);
            chrome.tabs.create({
                url: e.url,
                windowId: windowId,
                active: activateAfter || false,
                pinned: e.pinned,
                index: index
            });
        });
    },


    ///////////////////////////////////////////////////////////
    // Chrome tab convenience functions
    ///////////////////////////////////////////////////////////

    // @param tab {Chrome.Tab} to add under window node
    // @param pageNode {PageNode} if given, use this instead of creating a new PageNode from tab
    // @param onAdded {Function(pageNode, winNode)} if given, call this after performing addition(s)
    addTabToWindow: function(tab, pageNode, onAdded) {
        var pageNode = pageNode || new PageNode(tab);
        var winNode = this.getNode('w' + tab.windowId);

        if (winNode) {
            // window node exists, add page to it
            this.addNode(pageNode, winNode);
            if (onAdded) {
                onAdded(pageNode, winNode);
            }
            return;
        }

        // window node doesn't exist; create it, then add page to it
        var self = this;
        chrome.windows.get(tab.windowId, function(win) {
            var winNode = new WindowNode(win);
            self.addNode(winNode);
            self.addNode(pageNode, winNode);
            if (onAdded) {
                onAdded(pageNode, winNode);
            }
        });
    },


    ///////////////////////////////////////////////////////////
    // Tab index maintenance
    ///////////////////////////////////////////////////////////

    getTabIndex: function(node) {
        var winTabs = this.getWindowTabIndexArray(node.windowId);
        if (winTabs) {
            var r = winTabs.indexOf(node);
            if (r == -1) {
                return undefined;
            }
            return r;
        }
        return undefined;
    },

    getTabByIndex: function(windowId, index) {
        var winTabs = this.getWindowTabIndexArray(windowId);
        if (winTabs) {
            return winTabs[index];
        }
        return undefined;
    },

    getWindowTabIndexArray: function(windowId) {
        if (typeof(windowId) == 'number') {
            windowId = 'w' + windowId;
        }
        return this.tabIndexes[windowId];
    },

    getWindowIndexedTabsCount: function(windowId) {
        var winTabs = this.getWindowTabIndexArray(windowId);
        if (winTabs) {
            return winTabs.length;
        }
        return undefined;
    },

    // Add the given node to the tab index based on its .index
    addToTabIndex: function(node) {
        log(node.id, node.index, node);
        if (!node.isTab()) {
            return;
        }

        var topParent = node.topParent();

        if (!(topParent instanceof WindowNode)) {
            return;
        }

        if (!this.tabIndexes[topParent.id]) {
            this.tabIndexes[topParent.id] = [];
        }

        var index = node.index;
        if (index >= this.tabIndexes[topParent.id].length) {
            this.tabIndexes[topParent.id].push(node);
            return;
        }
        this.tabIndexes[topParent.id].splice(index, 0, node);
        // log('after addToTabIndex', this.dumpTabIndexes());
    },

    // Remove the given node from the tab index
    removeFromTabIndex: function(node) {
        var topParent = node.topParent();

        if (!(topParent instanceof WindowNode)) {
            return;
        }

        if (!this.tabIndexes[topParent.id]) {
            return;
        }

        var index = this.tabIndexes[topParent.id].indexOf(node);
        if (index > -1) {
            this.tabIndexes[topParent.id].splice(index, 1);
            if (this.tabIndexes[topParent.id].length == 0) {
                delete this.tabIndexes[topParent.id];
            }
        }
    },

    // reorganize the tree by tab index after getting current windowId/index values
    // from Chrome, then rebuild .tabIndexes and run a conform pass
    rebuildTreeByTabIndex: function(instant) {
        var self = this;
        if (!instant) {
            TimeoutManager.reset('rebuildTreeByTabIndex', function() {
                self.rebuildTreeByTabIndex(true);
            }, 2500);
            return;
        }

        this.rebuildPageNodeWindowIds(function() {
            self.reorganizeTreeByTabIndex();
            self.rebuildTabIndex();
            self.conformAllChromeTabIndexes(true);
        });
    },

    // rebuild the tab index
    rebuildTabIndex: function() {
        // useChromeOrder) {
        // if (useChromeOrder) {
        //     chrome.tabs.get({ }, function(tabs) {
        //         this.tabIndexes = {};
        //         for (var i = 0; i < tabs.length; i++) {
        //             var tab = tabs[i];
        //             if (this.tabIndexes['w' + tab.windowId] === undefined) {
        //                 this.tabIndexes['w' + tab.windowId] = [];
        //             }
        //             this.tabIndexes['w' + tab.windowId].push(tab.id);
        //         }
        //     });
        //     return;
        // }

        this.tabIndexes = this.groupBy(function(e) {
            if (e.isTab()) {
                return 'w' + e.windowId;
            }
        });
    },

    // reorganize the tree on the basis of .index values
    reorganizeTreeByTabIndex: function() {
        var pages = this.filter(function(e) { return e.isTab(); }).reverse();
        for (var i = 0; i < pages.length; i++) {
            var page = pages[i];
            var nextByIndex = this.getNode(function(e) {
                return e.isTab()
                    && e !== page
                    && e.windowId == page.windowId
                    && e.index == page.index + 1;
            });
            if (nextByIndex) {
                var preceding = nextByIndex.preceding(function(e) { return e.isTab() && e.windowId == page.windowId; });
                if (preceding !== page) {
                    log('Moving misplaced page to before', page, page.id, page.index, page.windowId, 'before', nextByIndex, nextByIndex.id, nextByIndex.index, nextByIndex.windowId);
                    this.moveNodeRel(page, 'before', nextByIndex);
                }
                return;
            }
            var prevByIndex = this.getNode(function(e) {
                return e.isTab()
                    && e !== page
                    && e.windowId == page.windowId
                    && e.index == page.index - 1;
            });
            if (prevByIndex) {
                var following = prevByIndex.following(function(e) { return e.isTab() && e.windowId == page.windowId; });
                if (following !== page) {
                    log('Moving misplaced page to after', page, page.id, page.index, page.windowId, 'after', prevByIndex, prevByIndex.id, prevByIndex.index, prevByIndex.windowId);
                    this.moveNodeRel(page, 'after', prevByIndex);
                }
                return;
            }
        }
    },

    // rebuild window ids and indexes on all page nodes
    rebuildPageNodeWindowIds: function(onComplete) {
        var self = this;
        chrome.tabs.query({ }, function(tabs) {
            for (var i in tabs) {
                var tab = tabs[i];
                var page = self.getPage(tab.id);
                if (page) {
                    page.windowId = tab.windowId;
                    page.index = tab.index;
                }
            }
            if (onComplete) {
                onComplete();
            }
        });
    },

    validateTabIndexes: function() {
        var tabs = this.filter(function(e) { return e.isTab(); });
        for (var i = 0; i < tabs.length; i++) {
            var tab = tabs[i];
            if (tab.index != this.getTabIndex(tab)) {
                var atIndex = this.getTabByIndex(tab.windowId, tab.index);
                console.error('Validation error for tab index', 'tab', tab, 'tab.id', tab.id,
                    'tab.index', tab.index, 'getTabIndex', this.getTabIndex(tab),
                    'getTabIndex(tab.index)', atIndex, atIndex.id, atIndex.index);
                console.error('tree dump', this.dump());
                console.error('index dump', this.dumpTabIndexes());
                return;
            }
        }
    },

    // conform a given page node's tab index within Chrome to match
    // the page node's vertically ordered position within the tree
    conformChromeTabIndexForPageNode: function(node, conformDescendants, skipIndexRebuild, instant) {
        if (!instant) {
            var self = this;
            TimeoutManager.reset('conformChromeTabIndexForPageNode_' + generateGuid(), function() {
                self.conformChromeTabIndexForPageNode(node, conformDescendants, skipIndexRebuild, true);
            }, 5000);
            return;
        }

        if (node.isTab()) {
            var topParent = node.topParent();
            if (topParent instanceof WindowNode) {
                var self = this;
                chrome.tabs.get(getNumericId(node.id), function(tab) {
                    if (!skipIndexRebuild) {
                        self.rebuildTabIndex();
                    }
                    if (!tab) {
                        return;
                    }
                    var indexes = self.tabIndexes[topParent.id];
                    if (indexes) {
                        var newIndex = indexes.indexOf(node);
                        if (tab.index != newIndex) {
                            // log('Conforming chrome tab index', 'id', tab.id, 'tab.index', tab.index, 'target index', newIndex);
                            expectingTabMoves.push(tab.id);
                            chrome.tabs.move(tab.id, { index: newIndex }, function() {
                                setTimeout(function() { removeFromExpectingTabMoves(tab.id); }, 250);
                            });
                        }
                    }
                });
            }
        }
        if (conformDescendants) {
            this.conformChromeTabIndexForNodeArray(node.children, true, skipIndexRebuild);
        }

    },

    // conform tab indexes of page nodes in given array and optionally all descendant page nodes
    conformChromeTabIndexForNodeArray: function(nodeArray, conformDescendants, skipIndexRebuild) {
        if (!skipIndexRebuild) {
            this.rebuildTabIndex();
        }
        for (var i = 0; i < nodeArray.length; i++) {
            var node = nodeArray[i];
            // log('Conforming from array', node.id, conformDescendants);
            this.conformChromeTabIndexForPageNode(node, conformDescendants, true, true);
        }
    },

    // conform tab indexes of all page nodes
    conformAllChromeTabIndexes: function(instant) {
        if (!instant) {
            var self = this;
            TimeoutManager.reset('conformAllChromeTabIndexes', function() {
                self.conformAllChromeTabIndexes(true);
            }, 2000);
            return;
        }

        this.rebuildTabIndex();

        var windows = this.tree.filter(function(e) {
            return e instanceof WindowNode && !e.hiberanted;
        });

        for (var i = 0; i < windows.length; i++) {
            var win = windows[i];
            this.conformChromeTabIndexForNodeArray(win.children, true, true);
        }
    },

    // update a page's position in the tree on a tab index basis, given its new windowId, old fromIndex, and new toIndex
    updatePageIndex: function(tabId, windowId, fromIndex, toIndex)
    {
        log('updating page index', tabId, windowId, fromIndex, toIndex);
        var to;
        var moving = this.getPage(tabId);
        tree.updateNode(moving, { windowId: windowId });
        windowId = 'w' + windowId;

        if (toIndex < fromIndex) {
            // moving tab to the left
            moving.index = toIndex;
            to = this.tabIndexes[windowId][toIndex];
        }
        else {
            // moving tab to the right
            moving.index = toIndex;
            to = this.tabIndexes[windowId][toIndex + 1];
        }

        if (to) {
            log('moving to before by index', moving.id, 'before', to.id);
            this.moveNodeRel(moving, 'before', to);
            return;
        }

        log('moving to append by index', moving.id, 'append to', windowId);
        this.moveNodeRel(moving, 'append', this.getNode(windowId));
    },


    ///////////////////////////////////////////////////////////
    // Miscellaneous functions
    ///////////////////////////////////////////////////////////

    clear: function() {
        this.$super('clear')();
        this.tabIndexes = {};
    },

    // Returns contents of tree formatted as a string. Used for debugging.
    dump: function()
    {
        var self = this;
        var dumpFn = function(lastValue, e, depth) {
            var topParent = self.getNodeEx(e).ancestors[0];
            var indexes = self.tabIndexes[topParent.id];
            if (indexes) {
                var index = indexes.indexOf(e);
                if (index == -1) {
                    index = '---';
                }
                else {
                    index = '   ' + index;
                    index = index.slice(index.length - 3);
                }
            }
            else {
                var index = '---';
            }

            if (e.index === undefined) {
                index += '----';
            }
            else {
                var index2 = '   ' + e.index;
                index += '=' + index2.slice(index2.length - 3);
            }


            return lastValue + '\n'
                + index + '|'
                + Array(-4 + 1 + (1 + depth) * 4).join(' ')
                + e.id + ': '
                + (e.id[0] == 'p' ? e.title : 'window ' + e.type + (e.incognito ? ' incognito' : ''))
                + ' +' + e.children.length + ''
                + (e.placed ? ' P' : ' -')
                + ' R:' + e.referrer
                + '@' + e.historylength;
        }
        return this.reduce(dumpFn, '');
    },

    dumpTabIndexes: function() {
        var s = '';
        for (var windowId in this.tabIndexes) {
            s += windowId + ':\n';
            var indexes = this.tabIndexes[windowId];
            for (var i = 0; i < indexes.length; i++) {
                var tab = indexes[i];
                s += '    ' + tab.id + ':' + i + '(' + tab.index + ') ' + tab.url + '\n';
            }
        }
        return s;
    },

    // Handles onModified event for DataTree, updating a timer and calling
    // this.onModifiedDelayed after the timeout; prevents executing
    // this.onModifiedDelayed every time tree is updated
    _onPageTreeModified: function() {
        if (!this.onModifiedDelayed) {
            return;
        }
        var self = this;
        TimeoutManager.reset('onPageTreeModified', function() {
            // log('doing tree post-modification stuff');
            self.conformAllChromeTabIndexes();
            self.rebuildPageNodeWindowIds(function() {
                self.onModifiedDelayed();
            });
        }, this.onModifiedDelayedWaitMs);
    },


    ///////////////////////////////////////////////////////////
    // Matchers, to be passed into .getNode(), et al.
    ///////////////////////////////////////////////////////////

    // returns a matcherFn for finding a page with a given id
    getPageIdMatcherFn: function(id)
    {
        return this.getIdMatcherFn('p' + id);
    },

    // returns a matcherFn for finding a window with a given id
    getWindowIdMatcherFn: function(id)
    {
        return this.getIdMatcherFn('w' + id);
    },

    // returns generic matcherFn for matching against an element's id
    getIdMatcherFn: function(id)
    {
        return this.getKeyMatcherFn('id', id);
    }
}

extendClass(PageTree, DataTree, PageTree.prototype);
