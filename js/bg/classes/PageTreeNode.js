/**
  * @constructor
  * @extends DataTreeNode
  */
var PageTreeNode = function()
{
    this.$base();

    this.label = '';
    this.highlighted = false;
    this.collapsed = false;
    this.hibernated = false;
    this.restorable = false;
};

extendClass(PageTreeNode, DataTreeNode, {});
