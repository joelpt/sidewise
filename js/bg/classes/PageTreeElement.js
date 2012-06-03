/**
  * @constructor
  * @extends DataTreeElement
  */
var PageTreeElement = function()
{
    DataTreeElement.call(this);
    this.collapsed = false;
};

extend(PageTreeElement, DataTreeElement);
