/**
  * Hierarchical data model used by Sidewise in the background page to keep track of page opener/opened structure.
  *
  * @param callbackProxy Proxy object with same-named functions as PageTree's page/window functions. Called after a suitable PageTree function call succeeds.
  * @constructor
  * @extends DataTree
  */
var PageTree = function(callbackProxyFn, onModifiedDelayed)
{
    /////////////////////////////////////////////////////
    // Initialization
    /////////////////////////////////////////////////////

    PageTree._base.call(this);
    this.callbackProxyFn = callbackProxyFn; // callback proxy function for page/window functions
    this.focusedTabId = null;
    this.onModified = this._onPageTreeModified;
    this.onModifiedDelayed = onModifiedDelayed;
    this.onModifiedDelayedWaitMs = 5000;
    this.onModifiedDelayedTimeout = null;
    this.awakeningPages = {};
};

PageTree.extend(DataTree, {

    /////////////////////////////////////////////////////
    // General node manipulation
    /////////////////////////////////////////////////////

    // add given node as a child of the node matching parentMatcher
    addNode: function(node, parentMatcher)
    {
        var r = PageTree._super.addNode.call(this, node, parentMatcher);
        this.callbackProxyFn('add', { element: node, parentId: r[1] ? r[1].id : undefined });
    },

    // remove the element matching matcher
    removeNode: function(matcher)
    {
        var r = PageTree._super.removeNode.call(this, matcher);
        this.callbackProxyFn('remove', { element: r });
        return r;
    },

    // move the element with id to reside under newParentId
    // this is a shallow move; moving elements's children are spliced in-place into its old location
    moveNode: function(id, newParentId)
    {
        var r = PageTree._super.moveNode.call(this, id, newParentId);
        this.callbackProxyFn('move', { element: r, newParentId: newParentId });
        return r;
    },


    /////////////////////////////////////////////////////
    // Page-node manipulation
    /////////////////////////////////////////////////////

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
    updatePage: function(tabIdOrElem, details, blockCallback)
    {
        log(tabIdOrElem, details);

        if (tabIdOrElem instanceof DataTreeNode) {
            var id = tabIdOrElem.id;
            var r = this.updateNode(tabIdOrElem, details);
        }
        else {
            var id = 'p' + tabIdOrElem;
            var r = this.updateNode(id, details);
        }

        if (r && !blockCallback) {
            this.callbackProxyFn('updatePage', { id: id, element: r });
        }

        return r;
    },

    // hibernate a page
    hibernatePage: function(tabId)
    {
        log(tabId);
        // var page = this.getPage(tabId);
        this.updatePage(tabId, { hibernated: true });
        chrome.tabs.remove(tabId);
    },

    // awaken (unhibernate) a page
    awakenPage: function(tabId, activateAfter)
    {
        log(tabId);
        var found = this.getPageEx(tabId);

        this.awakeningPages[found.node.url] = found.node;
        var topParent = found.ancestors[0];
        if (topParent instanceof WindowNode) {
            var windowId = parseInt(topParent.id.slice(1));
            log('awakening', found.node.url, 'windowId', windowId);
            chrome.tabs.create({ url: found.node.url, windowId: windowId, active: activateAfter || false });
            return;
        }
        log('awakening', found.node.url, 'no found windowId');
        chrome.tabs.create({ url: found.node.url });
    },


    /////////////////////////////////////////////////////
    // Miscellaneous
    /////////////////////////////////////////////////////

    // Returns contents of tree formatted as a string. Used for debugging.
    toString: function()
    {
        var toStringFn = function(lastValue, e, depth) {
            return lastValue + '\n'
                + Array(-4 + 1 + (1 + depth) * 4).join(' ')
                + e.id + ': '
                + (e.id[0] == 'p' ? e.title : 'window ' + e.type + (e.incognito ? ' incognito' : ''))
                + ' +' + e.children.length + ''
                + (e.placed ? ' P' : ' -')
                + ' R:' + e.referrer
                + '@' + e.historylength;
        }
        return this.reduce(toStringFn, '');
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


    /////////////////////////////////////////////////////
    // Matchers
    /////////////////////////////////////////////////////

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
});
