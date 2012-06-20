/**
  * @constructor
  * @extends PageTreeNode
  */
var PageNode = function(tab, overrideStatus)
{
    PageNode._base.call(this);

    var url = tab.url ? dropUrlHash(tab.url) : '';

    this.elemType = 'page';
    this.id = 'p' + tab.id;
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
};

PageNode.extend(PageTreeNode);

