/**
  * @constructor
  * @extends PageTreeElement
  */
var Page = function(tab, overrideStatus)
{
    Page._base.call(this);

    var url = tab.url ? dropUrlHash(tab.url) : '';

    this.elemType = 'page';
    this.id = 'p' + tab.id;
    this.url = url;
    this.title = getBestPageTitle(tab.title, url);
    this.status = overrideStatus || tab.status;
    this.pinned = tab.pinned;
    this.placed = false;
    this.favicon = getBestFavIconUrl(tab.favIconUrl, url);
    this.unread = false;
    this.referrer = null;
    this.historylength = null;

    log('Page', tab, this);
    console.log(this.status, tab.id);
};

Page.extend(PageTreeElement);

