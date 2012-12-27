/**
  * @constructor
  * @extends DataTreeNode
  */
var GhostNode = function(id, elemType)
{
    this.$base();

    this.elemType = 'ghost';
    this.id = id;
    this.ghostType = elemType;
    this.alive = true;
};

GhostNode.prototype = {
};

extendClass(GhostNode, DataTreeNode, GhostNode.prototype);
