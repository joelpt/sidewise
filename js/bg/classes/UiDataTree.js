///////////////////////////////////////////////////////////
// UiDataTree class
///////////////////////////////////////////////////////////

/**
  * @class
  * Adds callback-calling to DataTree's node manipulation functions.
  * Adds node collapsed-state management.
  * Adds immediate and delayed onModified callbacks.
  *
  * @param callbackProxyFn Called after node manipulation operations such as .addNode().
  * @constructor
  * @extends DataTree
  */
var UiDataTree = function(callbackProxyFn, onModified, onModifiedDelayed, initialDelayMs, initialPeriodMs, postInitialDelayMs)
{
    ///////////////////////////////////////////////////////////
    // Initialization
    ///////////////////////////////////////////////////////////

    this.$base();
    this.callbackProxyFn = callbackProxyFn; // callback proxy function for page/window functions

    this.onModified = this._onModified;
    this.onModifiedImmediate = onModified;
    this.onModifiedDelayed = onModifiedDelayed;
    this.onModifiedTimer = null;

    // Set startup onModifiedDelay duration
    this.onModifiedDelayedWaitMs = initialDelayMs;

    // Update onModifiedDelay duration after startup period
    var self = this;
    setTimeout(function() {
        self.onModifiedDelayedWaitMs = postInitialDelayMs;
    }, initialPeriodMs);

};

UiDataTree.prototype = {

    ///////////////////////////////////////////////////////////
    // Node manipulation
    ///////////////////////////////////////////////////////////

    /**
      * Adds a node to the tree as a child of the element matched by parentMatcher.
      *
      * @param node The node to add.
      * @param parentMatcher The parentMatcher to use for identifying the parent; see getNode().
      *                      If parentMatcher is omitted, add to the top level of the tree.
      * @param beforeSiblingMatcher If provided, node will be added under the parent before the
      *                             node that matches beforeSiblingMatcher.
      * @returns [node, parent, beforeSibling], where parent/beforeSibling may be undefined
      */
    addNode: function(node, parentMatcher, beforeSiblingMatcher)
    {
        var r = this.$super('addNode')(node, parent, beforeSiblingMatcher);

        this.callbackProxyFn('add', {
            element: node,
            parentId: r[1] ? r[1].id : undefined,
            beforeSiblingId: r[2] ? r[2].id : undefined
        });

        return r;
    },

    addNodeRel: function(node, relation, toMatcher)
    {
        var r = this.$super('addNodeRel')(node, relation, toMatcher);

        this.callbackProxyFn('add', {
            element: node,
            parentId: r[1] ? r[1].id : undefined,
            beforeSiblingId: r[2] ? r[2].id : undefined
        });

        return r;
    },

    // update an existing node matching matcher with given details
    updateNode: function(matcher, details, blockUpdateLastModified)
    {
        var updated = this.$super('updateNode')(matcher, details, blockUpdateLastModified);
        this.callbackProxyFn('update', { id: updated.id, element: details });
        return updated;
    },

    // remove the element matching matcher
    removeNode: function(matcher, removeChildren)
    {
        var r = this.$super('removeNode')(matcher, removeChildren);
        this.callbackProxyFn('remove', { element: r, removeChildren: removeChildren || false });
        return r;
    },

    // Move the node matching movingMatcher to reside under the node matching parentMatcher, then conform
    // Chrome's tab order to match the tab order in the tree as needed.
    //
    // If beforeSiblingMatcher is specified, node will be placed before beforeSiblingMatcher under new parent.
    // If keepChildren is true, all children of the moving node will keep its existing children after the move.
    // If keepChildren if false (default), the moving node's children get spliced into the moving node's old spot.
    // If blockCallback is true, don't call this UiDataTree instance's callback proxy handler.
    // If preferChromeTabIndex is true and a beforeSiblingMatcher is not given, attempt to move the node to
    //      be a child of the given parentMatcher, and in the correct order amongst its siblings based on
    //      the movingMatcher node's .index value.
    //
    // Returns [moved, newParent, beforeSibling] if a move was actually performed, or undefined if not.
    moveNode: function(movingMatcher, parentMatcher, beforeSiblingMatcher, keepChildren, blockCallback)
    {
        var r = this.$super('moveNode')(movingMatcher, parentMatcher, beforeSiblingMatcher, keepChildren);

        if (r !== undefined && !blockCallback) {
            this.callbackProxyFn('move', {
                element: r[0],
                newParentId: parentMatcher ? r[1].id : undefined,
                beforeSiblingId: beforeSiblingMatcher ? r[2].id : undefined,
                keepChildren: keepChildren || false
            });
        }
        return r;
    },


    // Move node matching movingMatcher to position relative to toMatcher based on given relation.
    //
    // If keepChildren is true, all children of the moving node will keep its existing children after the move.
    // If keepChildren if false (default), the moving node's children get spliced into the moving node's old spot.
    // If blockCallback is true, don't call this UiDataTree instance's callback proxy handler.
    //
    moveNodeRel: function(movingMatcher, relation, toMatcher, keepChildren, blockCallback)
    {
        var moving = this.getNode(movingMatcher);
        if (!moving) {
            throw new Error('Could not find node to move', movingMatcher, relation, toMatcher);
        }
        var fromParent;
        if (moving.parent && !moving.parent.isRoot) {
            fromParent = moving.parent;
        }

        var r = this.$super('moveNodeRel')(moving, relation, toMatcher, keepChildren);
        if (r !== undefined && !blockCallback) {
            this.callbackProxyFn('move', {
                element: r[0],
                newParentId: r[1] ? r[1].id : undefined,
                beforeSiblingId: r[2] ? r[2].id : undefined,
                keepChildren: keepChildren || false
            });

            if (fromParent && fromParent.collapsed && fromParent.children.length == 0) {
                // automatically set .collapsed to false when removing the last child from the move-from parent
                // so that it does not get "stuck on"
                this.updateNode(fromParent, { collapsed: false });
            }
        }
        return r;
    },

    // Merge the node matching fromNodeMatcher and all its children into the node matching toNodeMatcher.
    // The fromNode is removed from the tree after the merge.
    mergeNodes: function(fromNodeMatcher, toNodeMatcher)
    {
        var r = this.$super('mergeNodes')(fromNodeMatcher, toNodeMatcher);
        if (r !== undefined) {
            this.callbackProxyFn('merge', { fromId: r.fromId, toId: r.toId });
        }
        return r;
    },

    expandNode: function(matcher)
    {
        var node = this.getNode(matcher);

        if (!node) {
            throw new Error('Could not find node to expand');
        }

        if (!node.collapsed) {
            return;
        }

        node.collapsed = false;
        this.callbackProxyFn('expand', { id: node.id });
    },

    collapseNode: function(matcher)
    {
        var node = this.getNode(matcher);

        if (!node) {
            throw new Error('Could not find node to collapse');
        }

        if (node.collapsed) {
            return;
        }

        node.collapsed = true;
        this.callbackProxyFn('collapse', { id: node.id });
    },

    removeZeroChildTopNodes: function() {
        for (var i = this.root.children.length - 1; i >= 0; i--) {
            var child = this.root.children[i];
            if (child.children.length == 0) {
                this.removeNode(child);
            }
        }
    },

    // Handles onModified event for UiDataTree, updating a timer and calling
    // this.onModifiedDelayed after the timeout; prevents executing
    // this.onModifiedDelayed every time tree is updated
    _onModified: function() {
        if (this.onModifiedImmediate) {
            this.onModifiedImmediate();
        }

        if (!this.onModifiedDelayed) {
            return;
        }

        var self = this;
        clearTimeout(this.onModifiedTimer);
        this.onModifiedTimer = setTimeout(function() {
            self.onModifiedDelayed();
        }, this.onModifiedDelayedWaitMs);
    }

}

extendClass(UiDataTree, DataTree, UiDataTree.prototype);
