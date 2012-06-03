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

    DataTree.call(this);
    this.callbackProxyFn = callbackProxyFn; // callback proxy function for page/window functions
    this.focusedTabId = null;
    this.onModified = this._onPageTreeModified;
    this.onModifiedDelayed = onModifiedDelayed;
    this.onModifiedDelayedWaitMs = 5000;
    this.onModifiedDelayedTimeout = null;
};

PageTree.prototype = {

    /////////////////////////////////////////////////////
    // PAGE MANIPULATION FUNCTIONS
    /////////////////////////////////////////////////////

    // retrieve a page from the tree given its tabId
    getPage: function(tabId, hitFn)
    {
        return this.findElem(this.getPageIdMatcherFn(tabId), this.tree, hitFn);
    },

    getPageParent: function(tabId)
    {
        return this.findElemParent(this.getPageIdMatcherFn(tabId), this.tree);
    },

    focusPage: function(tabId, blockCallback)
    {
        log(tabId);
        var page = this.getPage(tabId);
        page.unread = false;

        this.focusedTabId = tabId;
        if (!blockCallback) {
            this.callbackProxyFn('focusPage', { id: 'p' + tabId });
            this.callbackProxyFn('updatePage', { tabId: tabId, element: page });
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

    // remove the element matching id from the tree
    remove: function(id, blockCallback)
    {
        var r = this.removeElem(this.getIdMatcherFn(id));

        if (r && !blockCallback) {
            this.callbackProxyFn('remove', { id: id });
        }

        return r;
    },

    // move the element with id to reside under newParentId
    // this is a shallow move; moving elements's children are spliced in-place into its old location
    move: function(id, newParentId, blockCallback)
    {
        var r = this.moveElem(this.getIdMatcherFn(id), this.getIdMatcherFn(newParentId));

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
    updatePage: function(tabId, details, blockCallback)
    {
        var r = this.updateElem(this.getPageIdMatcherFn(tabId), details);

        if (r && !blockCallback) {
            this.callbackProxyFn('updatePage', { tabId: tabId, element: r });
        }

        return r;
    },


    /////////////////////////////////////////////////////
    // WINDOW MANIPULATION FUNCTIONS
    /////////////////////////////////////////////////////

    // retrieve a window from the tree given its windowId
    getWindow: function(windowId, hitFn)
    {
        return this.findById('w' + windowId, hitFn);
    },

    // remove the window with windowId, and all its children, from the tree
    removeWindow: function(windowId)
    {
        return this.removeElem(this.getWindowIdMatcherFn(windowId), true);
    },



    /////////////////////////////////////////////////////
    // GENERIC ELEMENT TRAVERSAL/MANIPULATION FUNCTIONS
    /////////////////////////////////////////////////////

    // retrieve element with given id
    findById: function(id, hitFn)
    {
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
                + ' [' + e.children.length + ' children]'
                + (e.placed ? ' P' : ' -');
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

        if (this.onModifiedDelayedTimeout) {
            clearTimeout(this.onModifiedDelayedTimeout);
        }

        this.onModifiedDelayedTimeout =
            setTimeout(this.onModifiedDelayed, this.onModifiedDelayedWaitMs);
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
};

extend(PageTree, DataTree);
