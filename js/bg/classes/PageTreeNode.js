/**
  * @constructor
  * @extends DataTreeNode
  */
var PageTreeNode = function()
{
    PageTreeNode._base.call(this);
    this.label = '';
    this.collapsed = false;
};

PageTreeNode.extend(DataTreeNode);
