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
    // INITIALIZATION
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
    // PAGE MANIPULATION FUNCTIONS
    /////////////////////////////////////////////////////

    // retrieve a page from the tree given its tabId
    getPage: function(tabId, hitFn)
    {
        if (hitFn === undefined) {
            return this.findElemById('p' + tabId);
        }
        return this.findElem(this.getPageIdMatcherFn(tabId), this.tree, hitFn);
    },

    focusPage: function(tabId, blockCallback)
    {
        log(tabId);
        var page = this.getPage(tabId);
        page.unread = false;

        this.focusedTabId = tabId;
        if (!blockCallback) {
            this.callbackProxyFn('focusPage', { id: 'p' + tabId });
            this.callbackProxyFn('updatePage', { id: 'p' + tabId, element: page });
        }
    },

    // add given element as a child of the element with the given id
    add: function(element, parentId, blockCallback)
    {
        if (parentId === undefined) {
            this.addElem(element);
        }
        else {
            this.addElem(element, this.getIdMatcherFn(parentId));
        }

        if (!blockCallback) {
            this.callbackProxyFn('add', { element: element, parentId: parentId });
        }
    },

    // remove the element matching id or element from the tree
    remove: function(idOrElem, blockCallback)
    {
        if (idOrElem instanceof DataTreeElement) {
            var id = idOrElem.id;
            var r = this.removeElem(idOrElem);
        }
        else {
            var id = idOrElem;
            var r = this.removeElem(id);
        }

        if (r && !blockCallback) {
            this.callbackProxyFn('remove', { id: id });
        }

        return r;
    },

    // move the element with id to reside under newParentId
    // this is a shallow move; moving elements's children are spliced in-place into its old location
    move: function(id, newParentId, blockCallback)
    {
        var r = this.moveElem(this.getIdMatcherFn(id), newParentId);

        if (r && !blockCallback) {
            this.callbackProxyFn('move', { id: id, newParentId: newParentId });
        }

        return r;
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

        if (tabIdOrElem instanceof DataTreeElement) {
            var id = tabIdOrElem.id;
            var r = this.updateElem(tabIdOrElem, details);
        }
        else {
            var id = 'p' + tabIdOrElem;
            var r = this.updateElem(id, details);
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
    awakenPage: function(tabId)
    {
        log(tabId);
        var treeObj = this;
        this.getPage(tabId, function(e, i, a, p, pi, pa, a) {
            treeObj.awakeningPages[e.url] = e;
            var topParent = a[0];
            if (topParent instanceof Window) {
                var windowId = parseInt(topParent.id.slice(1));
                log('awakening', e.url, 'windowId', windowId);
                chrome.tabs.create({ url: e.url, windowId: windowId });
                return;
            }
            log('awakening', e.url, 'no found windowId');
            chrome.tabs.create({ url: e.url });
        });

        // chrome.tabs.create the new tab in its old window
        // to do that we need to be able to recurse up the tree, and we thus need to obtain
        // an array of all of the parents of a tree element
    },

    /////////////////////////////////////////////////////
    // GENERIC ELEMENT TRAVERSAL/MANIPULATION FUNCTIONS
    /////////////////////////////////////////////////////

    // retrieve element with given id
    findById: function(id, hitFn)
    {
        if (hitFn === undefined) {
            return this.findElemById(id);
        }
        return this.findElem(this.getIdMatcherFn(id), this.tree, hitFn);
    },


    /////////////////////////////////////////////////////
    // MISCELLANEOUS FUNCTIONS
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
    // MATCHERS
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
