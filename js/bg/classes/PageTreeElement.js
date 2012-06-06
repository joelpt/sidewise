/**
  * @constructor
  * @extends DataTreeElement
  */
var PageTreeElement = function()
{
    PageTreeElement._base.call(this);
    this.collapsed = false;
};

PageTreeElement.extend(DataTreeElement);
