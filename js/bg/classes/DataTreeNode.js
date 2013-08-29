"use strict";

/**
  * @class
  * Barebones node object for use as a node in DataTree.
  * @see DataTree
  * @constructor
  */
var DataTreeNode = function()
{
    this.UUID = generateGuid();
    this.id = this.UUID;
    this.elemType = 'node';
    this.children = [];
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

    beforeSiblings: function() {
        return this.siblings().slice(0, this.siblingIndex()).reverse();
    },

    afterSibling: function() {
        var index = this.siblingIndex() + 1;
        if (index >= this.parent.children.length) {
            return;
        }
        return this.parent.children[index];
    },

    afterSiblings: function() {
        return this.siblings().slice(this.siblingIndex() + 1);
    },

    precedingNodes: function(topmostParent) {
        var found = false;
        var self = this;
        if (!topmostParent) {
            topmostParent = this.root;
        }
        return this.root.hostTree.filter(function(e) {
            if (e === self) {
                found = true;
                return false;
            }
            if (found) {
                return false;
            }
            return true;
        }, topmostParent.children);
    },

    preceding: function(matchFn, topmostParent) {
        var p = this.precedingNodes(topmostParent);
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

    followingNodes: function(topmostParent) {
        var found = false;
        var self = this;
        if (!topmostParent) {
            topmostParent = this.root;
        }
        return this.root.hostTree.filter(function(e) {
            if (e === self) {
                found = true;
                return false;
            }
            if (!found) {
                return false;
            }
            return true;
        }, topmostParent.children);
    },

    following: function(matchFn, topmostParent) {
        var p = this.followingNodes(topmostParent);
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