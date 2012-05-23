/**
  * @constructor
  * @extends DataTreeElement
  */
var PageTreeElement = function()
{
    this.collapsed = false;

    DataTreeElement.call(this);
};

extend(PageTreeElement, DataTreeElement);
