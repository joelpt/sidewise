/**
  * @class
  * Barebones node object for use as a node in DataTree.
  * @see DataTree
  * @constructor
  */
var DataTreeNode = function()
{
    this.id = null;
    this.elemType = 'node';
    this.children = [];
    this.UUID = generateGuid();
};

extendClass(DataTreeNode, Object, {});