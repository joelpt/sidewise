///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var PAGETREE_ONMODIFIED_DELAY_MS = 1500;


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
    this.onModifiedDelayed = onModifiedDelayed;
    this.onModifiedDelayedWaitMs = PAGETREE_ONMODIFIED_DELAY_MS;
    this.awakeningPages = {};
};

PageTree.prototype = {

    ///////////////////////////////////////////////////////////
    // Node manipulation
    ///////////////////////////////////////////////////////////

    // add given node as a child of the node matching parentMatcher
    addNode: function(node, parentMatcher)
    {
        var r = this.$super('addNode')(node, parentMatcher);
        this.callbackProxyFn('add', { element: node, parentId: r[1] ? r[1].id : undefined });
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
    removeNode: function(matcher)
    {
        var r = this.$super('removeNode')(matcher);
        this.callbackProxyFn('remove', { element: r });
        return r;
    },

    // move the element matching movingMatcher to reside under parent matching parentMatcher
    // this is a shallow move; moving elements's children are spliced in-place into its old location
    moveNode: function(movingMatcher, parentMatcher)
    {
        var moving = tree.getNode(movingMatcher);
        var parent = tree.getNode(parentMatcher);
        var r = this.$super('moveNode')(moving, parent);

        if (r !== undefined) {
            this.callbackProxyFn('move', { element: r, newParentId: parent.id });
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
        this.focusedTabId = tabId;
        this.callbackProxyFn('focusPage', { id: 'p' + tabId });

        if (page.unread) {
            this.updatePage(page, { unread: false });
        }
    },

    // move the page with tabId to reside under newParentTabId, bringing children along
    movePageDeep: function(tabId, newParentTabId)
    {
        return this.moveElemDeep(this.getPageIdMatcherFn(tabId), this.getPageIdMatcherFn(newParentTabId));
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
        // TODO use c.t.create's callback to set a page's state to awakened instead of or in parallel
        // to this.awakeningPages? this would be a more reliable method of awakening the page because
        // we'd definitely know the tab id that got woke up and which node it goes to, but we would still
        // probably need .awakeningPages in order to prevent onTabCreated from making another entry in
        // the tree; if onTC got fired AFTER c.t.create's callback then we could actually store
        // k=tabId v=node in awakeningPages instead but i suspect the callbacks fire the other way around :(
        this.awakeningPages[found.node.url] = found.node;
        var topParent = found.ancestors[0];
        if (topParent.elemType == 'window') {
            var windowId = parseInt(topParent.id.slice(1));
            log('awakening', found.node.url, 'windowId', windowId);
            chrome.tabs.create({ url: found.node.url, windowId: windowId, active: activateAfter || false });
            return;
        }
        log('awakening', found.node.url, 'no found windowId');
        chrome.tabs.create({ url: found.node.url });
        this.updateLastModified();
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
