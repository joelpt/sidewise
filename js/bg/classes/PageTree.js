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
    this.onModified = this._onPageTreeModified;
    this.awakeningPages = [];
    this.onModifiedDelayed = onModifiedDelayed;

    // Set startup onModifiedDelay duration
    this.onModifiedDelayedWaitMs = PAGETREE_ONMODIFIED_DELAY_ON_STARTUP_MS;

    // Update onModifiedDelay duration after startup period
    var thisObj = this;
    setTimeout(function() {
        thisObj.onModifiedDelayedWaitMs = PAGETREE_ONMODIFIED_DELAY_AFTER_STARTUP_MS;
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
    addNode: function(node, parentMatcher, beforeSiblingMatcher)
    {
        var r = this.$super('addNode')(node, parentMatcher, beforeSiblingMatcher);
        this.callbackProxyFn('add', {
            element: node,
            parentId: r[1] ? r[1].id : undefined,
            beforeSiblingId: r[2] ? r[2].id : undefined
        });
        return r;
    },

    // update an existing node matching matcher with given details
    updateNode: function(matcher, details)
    {
        log(matcher, details);

        var page = this.getNode(matcher);

        if (!page) {
            throw new Error('Could not find node to update');
        }

        var existingId = page.id;

        this.$super('updateNode')(page, details);
        this.callbackProxyFn('update', { id: existingId, element: details });

        return page;
    },

    // remove the element matching matcher
    removeNode: function(matcher, removeChildren)
    {
        var found = this.getNodeEx(matcher);
        var r = this.$super('removeNode')(found.node, removeChildren);
        this.callbackProxyFn('remove', { element: r, removeChildren: removeChildren || false });

        var topParent = found.ancestors[0];
        if (topParent instanceof WindowNode && topParent.hibernated && topParent.children.length == 0) {
            var removedParent = this.$super('removeNode')(topParent, false);
            this.callbackProxyFn('remove', { element: removedParent });
        }

        return r;
    },

    // Move the node matching movingMatcher to reside under the node matching parentMatcher.
    // If beforeSiblingMatcher is specified, node will be placed before beforeSiblingMatcher under new parent.
    // If keepChildren is true, all children of the moving node will keep its existing children after the move.
    // If keepChildren if false (default), the moving node's children get spliced into the moving node's old spot.
    // If blockCallback is true, don't call the callback.
    //
    // Returns [moved, newParent, beforeSibling] if a move was actually performed, or undefined if not.
    moveNode: function(movingMatcher, parentMatcher, beforeSiblingMatcher, keepChildren, blockCallback)
    {
        var r = this.$super('moveNode')(movingMatcher, parentMatcher, beforeSiblingMatcher, keepChildren);

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

    moveNodeRel: function(movingMatcher, relation, toMatcher, blockCallback)
    {
        var r = this.$super('moveNodeRel')(movingMatcher, relation, toMatcher);

        if (r !== undefined && !blockCallback) {
            this.callbackProxyFn('moveRel', {
                moved: r[0],
                relation: r[1],
                to: r[2]
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
    getPageEx: function(tabId) {
        return this.getNodeEx('p' + tabId);
    },

    focusPage: function(tabId)
    {
        log(tabId);

        var page = this.getPage(tabId);

        if (!page) {
            log('Page node does not exist to be focused yet', 'tabId', tabId);
            return;
        }

        this.focusedTabId = tabId;
        this.callbackProxyFn('focusPage', { id: 'p' + tabId });

        if (page.unread) {
            this.updatePage(page, { unread: false });
        }
    },

    // update an existing page with given details
    updatePage: function(tabIdOrElem, details)
    {
        log(tabIdOrElem, details);

        if (typeof(tabIdOrElem) == 'number') {
            var page = this.getNode('p' + tabIdOrElem);
        }
        else {
            var page = this.getNode(tabIdOrElem);
        }

        this.updateNode(page, details);
        return page;
    },

    // hibernate a page
    hibernatePage: function(id)
    {
        log(id);
        var tabId = getNumericId(id);
        this.updatePage(tabId, { hibernated: true, id: 'pH' + generateGuid(), status: 'complete' });
        chrome.tabs.remove(tabId);
        this.updateLastModified();
    },

    // awaken (unhibernate) a page
    awakenPage: function(id, activateAfter)
    {
        log(id);
        var found = this.getNodeEx(id);

        var topParent = found.ancestors[0];
        if (!(topParent instanceof WindowNode)) {
            throw new Error('Tried to awakenPage() but page is not contained under a WindowNode');
        }

        this.awakenPageNodes([found.node], topParent, activateAfter);
        this.updateLastModified();
    },


    ///////////////////////////////////////////////////////////
    // WindowNode-specific manipulation
    ///////////////////////////////////////////////////////////

    // awaken (unhibernate) a window node
    awakenWindow: function(id)
    {
        log(id);
        var winNode = this.getNode(id);

        var awakening = this.filter(function(e) {
            return e instanceof PageNode && e.hibernated;
        }, winNode.children);

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

        var self = this;
        hibernating.forEach(function(e) {
            self.hibernatePage(e.id);
        });

        this.updateLastModified();
    },


    ///////////////////////////////////////////////////////////
    // Hibernation control
    ///////////////////////////////////////////////////////////

    awakenPageNodes: function(nodes, existingWindowNode, activateAfter) {
        var thisObj = this;

        var urls = nodes.map(function(e) { return e.url; });
        nodes.forEach(function(e) { thisObj.awakeningPages.push(e); });

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

            var newWinCreateDetails = { type: 'normal', url: urls };

            // look for a New Tab tab that is all alone in a window; if we find one,
            // adopt it to the new window
            var winNodeWithOneNewTabPage = first(tree.tree, function(e) {
                return e instanceof WindowNode
                    && !(e.hibernated)
                    && e.children.length == 1
                    && e.children[0].children.length == 0
                    && e.children[0].url == 'chrome://newtab/'
                    && !(e.children[0].hibernated);
            });

            var adoptTabId;
            if (winNodeWithOneNewTabPage) {
                adoptTabId = getNumericId(winNodeWithOneNewTabPage[1].children[0].id);
                newWinCreateDetails.tabId = adoptTabId;
            }

            // create new window for awakening
            chrome.windows.create(newWinCreateDetails, function(win) {
                // if we adopted a New Tab tab, destroy that tab now
                if (adoptTabId) {
                    chrome.tabs.remove(adoptTabId);
                }

                chrome.windows.update(win.id, newWinMetrics);

                var newWinNode = thisObj.getNode('w' + win.id);
                log(newWinNode);
                if (newWinNode) {
                    thisObj.mergeNodes(newWinNode, existingWindowNode);
                }

                thisObj.updateNode(existingWindowNode, {
                    id: 'w' + win.id,
                    restored: true,
                    restorable: false,
                    hibernated: false,
                    title: WINDOW_DEFAULT_TITLE
                });
                thisObj.expandNode(existingWindowNode);
            });
            return;
        }

        // existingWindowNode is not hibernated (its Chrome window already exists)
        var windowId = getNumericId(existingWindowNode.id);
        nodes.forEach(function(e) {
            log('awakening', e.url, 'windowId', windowId);
            chrome.tabs.create({
                url: e.url,
                windowId: windowId,
                active: activateAfter || false,
                pinned: e.pinned
            });
        });
    },


    ///////////////////////////////////////////////////////////
    // Chrome tab convenience functions
    ///////////////////////////////////////////////////////////

    addTabToWindow: function(tab, onAdded) {
        var pageNode = new PageNode(tab);
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
        var thisObj = this;
        chrome.windows.get(tab.windowId, function(win) {
            var winNode = new WindowNode(win);
            thisObj.addNode(winNode);
            thisObj.addNode(pageNode, winNode);
            if (onAdded) {
                onAdded(pageNode, winNode);
            }
        });
    },


    ///////////////////////////////////////////////////////////
    // Miscellaneous functions
    ///////////////////////////////////////////////////////////

    // Returns contents of tree formatted as a string. Used for debugging.
    dump: function()
    {
        var dumpFn = function(lastValue, e, depth) {
            return lastValue + '\n'
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

    // Handles onModified event for DataTree, updating a timer and calling
    // this.onModifiedDelayed after the timeout; prevents executing
    // this.onModifiedDelayed every time tree is updated
    _onPageTreeModified: function() {
        if (!this.onModifiedDelayed) {
            return;
        }
        TimeoutManager.reset('onPageTreeModified', this.onModifiedDelayed, this.onModifiedDelayedWaitMs);
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
