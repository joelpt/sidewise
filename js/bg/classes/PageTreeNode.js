/**
  * @constructor
  * @extends DataTreeNode
  */
var PageTreeNode = function()
{
    this.$base();

    this.title = '';
    this.label = '';
    this.highlighted = false;
    this.collapsed = false;
    this.hibernated = false;
    this.restorable = false;
    this.createdOn = Date.now();
};

PageTreeNode.prototype = {
    isTab: function() {
        return false;
    }
};

extendClass(PageTreeNode, DataTreeNode, PageTreeNode.prototype);
