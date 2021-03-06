"use strict";

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var PAGETREE_ONMODIFIED_DELAY_ON_STARTUP_MS = 1500;
var PAGETREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS = 1000;
var PAGETREE_ONMODIFIED_STARTUP_DURATION_MS = 20000;
var CONFORM_TAB_INDEX_DELAY_MS = 5500;
var CONFORM_ALL_TAB_INDEX_DELAY_MS = 5000;

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

    this.$base(['id', 'chromeId']);
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
        var existing = this.getNode(node.id);
        if (existing) {
            throw new Error('A node with this id already exists in the tree', node.id, node);
        }

        if (node instanceof WindowNode) {
            this.tabIndexes[node.windowId] = [];
        }

        var parent;
        if (parentMatcher) {
            parent = this.getNode(parentMatcher);
        }

        if (preferChromeTabIndex && !beforeSiblingMatcher && node.isTab()) {
            var index = node.index;
            var winTabs = this.tabIndexes[node.windowId];
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

        // record removed-details on the node being removed for use by caller
        node.removedAt = Date.now();
        if (!(node.parent instanceof WindowNode)) {
            node.removedFromParentId = node.parent.id;
        }

        var topParent = node.topParent();
        node.removedFromTopParentId = topParent ? topParent.id : null;

        // record removed-sibling details on ex-siblings
        var beforeSibling = node.beforeSibling();
        if (beforeSibling) {
            beforeSibling.removedAfterSiblingId = node.id;
        }

        var afterSibling = node.afterSibling();
        if (afterSibling) {
            afterSibling.removedBeforeSiblingId = node.id;
        }

        this.removeFromTabIndex(node);

        if (removeChildren) {
            var descendants = this.filter(function(e) { return e; }, node.children);
            for (var i = descendants.length - 1; i >= 0; i--) {
                this.removeFromTabIndex(descendants[i]);
                descendants[i].removedAt = Date.now();
            }
        }
        else {
            if (!(node instanceof WindowNode)) {
                // record removed-parent details on ex-children
                for (var i = 0; i < node.children.length; i++) {
                    node.children[i].removedPreviousParentId = node.id;
                };
            }
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
            var nextByIndex = this.tabIndexes[moving.windowId][index];
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

        if (keepChildren) {
            var descendants = this.filter(function(e) { return e instanceof PageNode; }, moving.children);
            for (var i = descendants.length - 1; i >= 0; i--) {
                this.removeFromTabIndex(descendants[i]);
            }
        }
        this.removeFromTabIndex(moving);

        var r = this.$super('moveNode')(moving, parent, beforeSiblingMatcher, keepChildren);

        this.addToTabIndex(moving);
        if (keepChildren) {
            for (var i = 0; i < descendants.length; i++) {
                this.addToTabIndex(descendants[i]);
            }
        }

        if (r !== undefined) {
            this.callbackProxyFn('move', {
                element: r[0],
                newParentId: parentMatcher ? r[1].id : undefined,
                beforeSiblingId: beforeSiblingMatcher ? r[2].id : undefined,
                keepChildren: keepChildren || false,
                callbackBlocked: blockCallback
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
        var fromParent;
        if (moving.parent && !moving.parent.isRoot) {
            fromParent = moving.parent;
        }

        if (keepChildren) {
            var descendants = this.filter(function(e) { return e instanceof PageNode; }, moving.children);
            for (var i = descendants.length - 1; i >= 0; i--) {
                this.removeFromTabIndex(descendants[i]);
            }
        }
        this.removeFromTabIndex(moving);

        var r = this.$super('moveNodeRel')(moving, relation, toMatcher, keepChildren);

        this.addToTabIndex(moving);
        if (keepChildren) {
            for (var i = 0; i < descendants.length; i++) {
                this.addToTabIndex(descendants[i]);
            }
        }

        if (r !== undefined) {
            this.callbackProxyFn('move', {
                element: r[0],
                newParentId: r[1] ? r[1].id : undefined,
                beforeSiblingId: r[2] ? r[2].id : undefined,
                keepChildren: keepChildren || false,
                callbackBlocked: blockCallback
            });

            if (fromParent && fromParent.collapsed && fromParent.children.length == 0) {
                // automatically set .collapsed to false when removing the last child from the move-from parent
                // so that it does not get "stuck on"
                this.updateNode(fromParent, { collapsed: false });
            }
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

    focusPage: function(tabId)
    {
        log(tabId);

        var page = this.getNode(['chromeId', tabId]);

        if (!page) {
            log('Page node does not exist to be focused yet', 'tabId', tabId);
            return;
        }

        if (tabId != this.focusedTabId) {
            this.lastFocusedTabId = this.focusedTabId;
            this.focusedTabId = tabId;
        }
        this.callbackProxyFn('focusPage', { id: page.id });

        if (page.unread) {
            this.updatePage(page, { unread: false });
        }
    },

    // update an existing page with given details
    updatePage: function(tabIdOrElem, details)
    {
        log(tabIdOrElem, details);

        if (typeof(tabIdOrElem) == 'number') {
            var page = this.getNode(['chromeId', tabIdOrElem]);
        }
        else {
            var page = this.getNode(tabIdOrElem);
        }

        this.updateNode(page, details);
        return page;
    },

    // hibernate pages
    hibernatePages: function(tabIds, skipLastTabCheck)
    {
        log(tabIds);
        for (var i = tabIds.length - 1; i >= 0; i--) {
            this.hibernatePage(tabIds[i], skipLastTabCheck);
        };
    },

    // hibernate a single page
    hibernatePage: function(tabId, skipLastTabCheck)
    {
        var page = this.updatePage(['chromeId', tabId], {
            hibernated: true,
            restorable: false,
            chromeId: null,
            status: 'complete',
            mediaState: null,
            mediaTime: null });

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

        var hibernatingTabIds = hibernating.map(function(e) { return e.chromeId; });

        var self = this;

        function _hibernateWindowTabs() {
            for (var i = 0; i < hibernating.length; i++) {
                self.hibernatePage(hibernating[i].chromeId, true);
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
                    _hibernateWindowTabs();
                    if (!settings.get('shown_prompt_hibernatingLastTab')) {
                        alert(getMessage('prompt_hibernatingLastTab'));
                        settings.set('shown_prompt_hibernatingLastTab', true);
                    }
                });
                return;
            }
            _hibernateWindowTabs();
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
            // need a new Chrome window to load tabs into
            var newWinMetrics = sidebarHandler.getIdealNewWindowMetrics();
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
                    && isNewTabUrl(e.children[0].url)
                    && !(e.children[0].hibernated);
            });

            var adoptTabId, adoptWinId;
            if (winNodeWithOneNewTabPage) {
                adoptWinId = winNodeWithOneNewTabPage[1].chromeId;
                adoptTabId = winNodeWithOneNewTabPage[1].children[0].chromeId;
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

                var newWinNode = self.getNode(['chromeId', win.id]);
                log(newWinNode);
                if (newWinNode) {
                    self.mergeNodes(newWinNode, existingWindowNode);
                }

                self.setWindowToAwake(existingWindowNode, win.id);
                self.expandNode(existingWindowNode);

                rectifyAssociations(1000);
            });
            return;
        }

        // existingWindowNode is not hibernated (its Chrome window already exists)
        var self = this;
        var windowId = existingWindowNode.chromeId;
        nodes.forEach(function(e) {
            var index;
            var prev;
            var next = e.following(function(test) { return test.isTab() && test.windowId == e.windowId; });
            if (next) {
                log('looking up tab index for next tab', next.id);
                index = self.getTabIndex(next);
            }
            else {
                var prev = e.preceding(function(test) { return test.isTab() && test.windowId == e.windowId; });
                if (prev) {
                    log('looking up tab index for preceding tab', prev.id);
                    index = self.getTabIndex(prev);
                    if (index !== undefined) {
                        index += 1;
                    }
                }
            }

            if (index === undefined) {
                if (next) {
                    log('fallback on next.index', next.id, next.index);
                    index = next.index;
                }
                else if (prev) {
                    log('fallback on prev.index', prev.id, prev.index);
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
            }, function() { rectifyAssociations(1000); });
        });
    },

    setWindowToAwake: function(winNode, newWindowId) {
        this.updateNode(winNode, {
            chromeId: newWindowId,
            restored: true,
            restorable: false,
            hibernated: false,
            old: false,
            title: WINDOW_DEFAULT_TITLE
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
        var winNode = this.getNode(['chromeId', tab.windowId]);

        // If pageNode is already in the tree, remove it from the tree first
        if (this.getNode(function(e) { return e === pageNode; })) {
            log('page node is already in tree, remove it before adding it back to tree under new windowId', pageNode.id, tab.windowId);
            this.removeNode(pageNode, false);
        }

        if (!winNode) {
            log('window node does not exist, create it then add page to it', pageNode.id, tab.windowId);
            winNode = new WindowNode({ id: tab.windowId, incognito: tab.incognito, type: 'normal' });
            this.addNode(winNode);
            // need to ask for window's type, but don't want to make onAdded() wait to be called
            // until after chrome.windows.get() returns, so do this separately
            var self = this;
            chrome.windows.get(tab.windowId, function(win) {
                self.updateNode.call(self, winNode, { type: win.type } );
            });
        }
        else {
            log('window node exists, add page to it', pageNode.id, winNode.id);
        }

        this.addNode(pageNode, winNode);
        log('window node now', this.getNode(['chromeId', tab.windowId]));
        if (onAdded) {
            onAdded(pageNode, winNode);
        }
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
        // log(node.id, node.index, node);
        if (!node.isTab()) {
            return;
        }

        var topParent = node.topParent();

        if (!(topParent instanceof WindowNode)) {
            return;
        }

        if (!this.tabIndexes[topParent.chromeId]) {
            this.tabIndexes[topParent.chromeId] = [];
        }

        var index = node.index;
        if (index >= this.tabIndexes[topParent.chromeId].length) {
            this.tabIndexes[topParent.chromeId].push(node);
            return;
        }
        this.tabIndexes[topParent.chromeId].splice(index, 0, node);
        // log('after addToTabIndex', this.dumpTabIndexes());
    },

    // Remove the given node from the tab index
    removeFromTabIndex: function(node) {
        if (!(node instanceof PageNode)) {
            return;
        }

        var windowId = node.windowId;

        if (!windowId) {
            console.warn('No windowId found on node', node.id, node);
            return;
        }

        if (!this.tabIndexes[windowId]) {
            if (node.hibernated) {
                return;
            }
            console.warn('No tab index found for windowId ' + windowId, 'node', node.id, node, this.tabIndexes);
            return;
        }

        var index = this.tabIndexes[windowId].indexOf(node);
        if (index > -1) {
            this.tabIndexes[windowId].splice(index, 1);
            if (this.tabIndexes[windowId].length == 0) {
                delete this.tabIndexes[windowId];
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
        this.tabIndexes = this.groupBy(function(e) {
            if (e.isTab()) {
                return e.windowId;
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
                var page = self.getNode(['chromeId', tab.id]);
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
            }, CONFORM_TAB_INDEX_DELAY_MS);
            return;
        }

        if (node.isTab() && node.chromeId) {
            var topParent = node.topParent();
            if (topParent instanceof WindowNode) {
                var self = this;
                chrome.tabs.get(node.chromeId, function(tab) {
                    if (!skipIndexRebuild) {
                        self.rebuildTabIndex();
                    }
                    if (!tab) {
                        log('Tab not found to conform', node.id);
                        return;
                    }
                    var indexes = self.tabIndexes[topParent.chromeId];
                    if (indexes) {
                        var newIndex = indexes.indexOf(node);
                        if (tab.index != newIndex) {
                            log('Conforming chrome tab index', 'id', tab.id, 'tab.index', tab.index, 'target index', newIndex);
                            expectingTabMoves.push(tab.id);
                            chrome.tabs.move(tab.id, { index: newIndex }, function() {
                                setTimeout(function() { removeFromExpectingTabMoves(tab.id); }, 250);
                            });
                        }
                        else {
                            // log('Not conforming tab', tab.id, tab, node.id, node);
                        }
                    }
                    else {
                        log('Could not find index', topParent.id, topParent.chromeId, topParent);
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
            }, CONFORM_ALL_TAB_INDEX_DELAY_MS);
            return;
        }

        this.rebuildTabIndex();

        var windows = this.tree.filter(function(e) {
            return e instanceof WindowNode && !e.hibernated;
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
        var moving = this.getNode(['chromeId', tabId]);
        tree.updateNode(moving, { windowId: windowId });

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
        this.moveNodeRel(moving, 'append', this.getNode(['chromeId', windowId]));
    },


    ///////////////////////////////////////////////////////////
    // Miscellaneous functions
    ///////////////////////////////////////////////////////////

    clear: function() {
        this.root = new DataTreeRootNode(this);
        this.tree = this.root.children;
        this.indexes = {'id': {}, 'chromeId': {}};
        this.tabIndexes = {};
        this.updateLastModified();
    },

    // Returns contents of tree formatted as a string. Used for debugging.
    dump: function()
    {
        var self = this;
        var dumpFn = function(lastValue, e, depth) {
            var topParent = self.getNodeEx(e).ancestors[0];
            var indexes = self.tabIndexes[topParent.chromeId];
            var index;

            if (indexes) {
                index = indexes.indexOf(e);
                if (index == -1) {
                    index = '---';
                }
            }
            else {
                index = '---';
            }

            return lastValue + '\n'
                + padStringLeft(index, 3) + '/'
                + padStringLeft(e.index, 3) + '|'
                + padStringLeft(e.id, 30) + ': '
                + Array(-4 + 1 + (1 + depth) * 4).join(' ')
                + (e instanceof PageNode ? e.title : 'window ' + e.type + (e.incognito ? ' incognito' : ''))
                // + ' +' + e.children.length + ''
                // + (e.placed ? ' P' : ' -')
                + ' @' + e.historylength
                + ' R:' + e.referrer;
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
                s += '  ' + tab.id + ':' + i + '(' + tab.index + ') ' + tab.url + '\n';
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
        TimeoutManager.reset('onModifiedPageTree_' + this.name, function() {
            // log('doing tree post-modification stuff', self);
            self.conformAllChromeTabIndexes();
            self.rebuildPageNodeWindowIds(function() {
                self.onModifiedDelayed();
            });
        }, this.onModifiedDelayedWaitMs);
    },

    // Permanently disables all callbacks by this object.
    disableCallbacks: function() {
        this.callbackProxyFn = function() {};
        this.onModified = function() {};
        this.onModifiedDelayed = function() {};
        TimeoutManager.clear('onModifiedPageTree_' + this.name);
    },


    ///////////////////////////////////////////////////////////
    // Matchers, to be passed into .getNode(), et al.
    ///////////////////////////////////////////////////////////

    // returns a matcherFn for finding a page with a given id
    getPageIdMatcherFn: function(id)
    {
        return this.getIdMatcherFn(chromeId);
    },

    // returns a matcherFn for finding a window with a given id
    getWindowIdMatcherFn: function(id)
    {
        return this.getIdMatcherFn(chromeId);
    },

    // returns generic matcherFn for matching against an element's id
    getIdMatcherFn: function(id)
    {
        return this.getKeyMatcherFn('id', id);
    }
}

extendClass(PageTree, DataTree, PageTree.prototype);
