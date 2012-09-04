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
    this.parent = null;
};

DataTreeNode.prototype = {

    parents: function() {
        var parents = [];
        var parent = this.parent;
        while (parent) {
            parents.push(parent);
            parent = parent.parent;
        }
        return parents;
    },

    topParent: function() {
        var top = this;
        while (top.parent) {
            top = top.parent;
        }
        if (top === this) {
            return null;
        }
        return top;
    }

};

extendClass(DataTreeNode, Object, DataTreeNode.prototype);