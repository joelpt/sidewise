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
    this.url = url;
    this.favicon = getBestFavIconUrl(tab.favIconUrl, url);
    this.referrer = null;
    this.historylength = null;
    this.title = getBestPageTitle(tab.title, url);
    this.status = overrideStatus || tab.status;
    this.pinned = tab.pinned;
    this.placed = false;
    this.unread = false;
    this.hibernated = false;
    this.smartFocusParentTabId = null;

    log('Page', tab, this);
    console.log(this.status, tab.id);
};

PageNode.extend(PageTreeNode);

