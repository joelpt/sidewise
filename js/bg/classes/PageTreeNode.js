/**
  * @constructor
  * @extends DataTreeNode
  */
var PageTreeNode = function()
{
    PageTreeNode._base.call(this);
    this.label = '';
    this.highlighted = false;
    this.collapsed = false;
    this.hibernated = false;
    this.restorable = false;
};

PageTreeNode.extend(DataTreeNode);
