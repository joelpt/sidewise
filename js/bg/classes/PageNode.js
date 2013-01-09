/**
  * @constructor
  * @extends PageTreeNode
  */
var PageNode = function(tab, overrideStatus)
{
    this.$base();

    this.id = 'p' + this.UUID;
    this.elemType = 'page';
    this.referrer = '';
    this.historylength = 1;
    this.placed = false;
    this.unread = false;
    this.smartFocusParentTabId = null;
    this.initialCreation = false;
    this.restored = false;
    this.incognito = tab.incognito || false;
    this.sessionGuid = null;
    this.mediaState = null;
    this.mediaTime = null;
    this.restored = false;
    this.restorable = false;

    if (tab) {
        var url = tab.url ? dropUrlHash(tab.url) : '';
        this.chromeId = tab.id;
        this.windowId = tab.windowId;
        this.openerTabId = tab.openerTabId;
        this.index = tab.index;
        this.url = tab.url;
        this.favicon = getBestFavIconUrl(tab.favIconUrl, url);
        this.title = getBestPageTitle(tab.title, tab.url);
        this.status = overrideStatus || tab.status;
        this.pinned = tab.pinned;
    }
    else {
        this.hibernated = true;
        this.chromeId = null;
        this.windowId = null;
        this.openerTabId = null;
        this.index = null;
        this.url = null;
        this.favicon = null;
        this.title = null;
        this.status = overrideStatus || 'complete';
        this.pinned = false;
    }
};

PageNode.prototype = {
    isTab: function() {
        return !this.hibernated;
    }
};

extendClass(PageNode, PageTreeNode, PageNode.prototype);
