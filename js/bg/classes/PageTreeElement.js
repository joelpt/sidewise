/**
  * @constructor
  * @extends DataTreeElement
  */
var PageTreeElement = function()
{
    PageTreeElement._base.call(this);
    this.collapsed = false;
};

extend(PageTreeElement, DataTreeElement);
