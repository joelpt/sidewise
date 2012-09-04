/**
  * @constructor
  * @extends DataTreeNode
  */
var DataTreeRootNode = function(hostTree)
{
    this.$base();
    this.type = 'root';
    this.isRoot = true;
    this.hostTree = hostTree;
};

extendClass(DataTreeRootNode, DataTreeNode, {});
