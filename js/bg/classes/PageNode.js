/**
  * @constructor
  * @extends PageTreeNode
  */
var PageNode = function(tab, overrideStatus)
{
    this.$base();

    var url = tab.url ? dropUrlHash(tab.url) : '';

    this.elemType = 'page';
    this.id = 'p' + tab.id;
    this.windowId = tab.windowId;
    this.openerTabId = tab.openerTabId;
    this.index = tab.index;
    this.url = tab.url;
    this.favicon = getBestFavIconUrl(tab.favIconUrl, url);
    this.referrer = '';
    this.historylength = 1;
    this.title = getBestPageTitle(tab.title, tab.url);
    this.status = overrideStatus || tab.status;
    this.pinned = tab.pinned;
    this.placed = false;
    this.unread = false;
    this.smartFocusParentTabId = null;
    this.initialCreation = false;
    this.restored = false;
    this.incognito = tab.incognito || false;
    this.sessionGuid = null;
};

extendClass(PageNode, PageTreeNode, {});

