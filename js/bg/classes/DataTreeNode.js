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
    this.root = null;
};

DataTreeNode.prototype = {

    toString: function() {
        return this.elemType + ':' + this.id;
    },

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
        while (top.parent && !top.parent.isRoot) {
            top = top.parent;
        }
        if (top === this) {
            return null;
        }
        return top;
    },

    siblings: function() {
        return this.parent.children;
    },

    siblingIndex: function() {
        return this.parent.children.indexOf(this);
    },

    beforeSibling: function() {
        var index = this.siblingIndex() - 1;
        if (index < 0) {
            return;
        }
        return this.parent.children[index];
    },

    afterSibling: function() {
        var index = this.siblingIndex() + 1;
        if (index >= this.parent.children.length) {
            return;
        }
        return this.parent.children[index];
    },

    precedingNodes: function() {
        var found = false;
        var self = this;
        return this.root.hostTree.filter(function(e) {
            if (e === self) {
                found = true;
                return false;
            }
            if (found) {
                return false;
            }
            return true;
        });
    },

    preceding: function(matchFn) {
        var p = this.precedingNodes();
        if (p.length == 0) {
            return;
        }

        if (!matchFn) {
            return p[p.length - 1];
        }

        var r = first(p.reverse(), function(e) { return matchFn(e); });

        if (r) {
            return r[1];
        }
        return;
    },

    followingNodes: function() {
        var found = false;
        var self = this;
        return this.root.hostTree.filter(function(e) {
            if (e === self) {
                found = true;
                return false;
            }
            if (!found) {
                return false;
            }
            return true;
        });
    },

    following: function(matchFn) {
        var p = this.followingNodes();
        if (p.length == 0) {
            return;
        }

        if (!matchFn) {
            return p[0];
        }

        var r = first(p, function(e) { return matchFn(e); });

        if (r) {
            return r[1];
        }
        return;
    }


};

extendClass(DataTreeNode, Object, DataTreeNode.prototype);