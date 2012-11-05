/**
  * @class
  * Hierarchical data structure with traversal and manipulation funcions.
  *
  * @requires DataTreeNode
  * @constructor
  */
var DataTree = function() {

    /////////////////////////////////////////////////////
    // Intialization
    /////////////////////////////////////////////////////

    this.root = new DataTreeRootNode(this);
    this.tree = this.root.children; // root level children
    this.lastModified = null;
    this.onModified = null;
    this.idIndex = {};
};

DataTree.prototype = {

    /////////////////////////////////////////////////////
    // Node retrieval
    /////////////////////////////////////////////////////

    /**
      * Find a node in the tree.
      * @param matcher Used to identify the sought node; may be one of:
      *                Function: it is passed the node to test; return true to indicate a match.
      *                String: treated as an id and an id index lookup is performed.
      *                Object: matcher is assumed to be the node sought and is just returned.
      */
    getNode: function(matcher) {
        if (typeof(matcher) == 'string') {
            return this.idIndex[matcher];
        }

        if (matcher instanceof DataTreeNode) {
            return matcher;
        }

        if (matcher instanceof Function) {
            return this.getNodeStep(matcher, this.tree);
        }

        throw new Error('Unsupported "matcher" argument passed');
    },

    /**
      * @private
      * Steps through inArray's nodes and children recursively looking for a node for which matcherFn returns true
      */
    getNodeStep: function(matcherFn, inArray) {
        for (var i in inArray)
        {
            var elem = inArray[i];
            if (matcherFn(elem)) {
                return elem;
            }
            var childElem = this.getNodeStep(matcherFn, elem.children);
            if (childElem !== undefined)
                return childElem;
        }
        return undefined;
    },

    // Find position in tree bearing the given relation (before, after, prepend, append) to the node matching toMatcher.
    // Returns the parent and following nodes that correspond to the position found, plus the 'to' node that matched toMatcher.
    getNodeRel: function(relation, toMatcher)
    {
        var to = this.getNode(toMatcher);
        var parent;
        var following;

        if (!to) {
            throw new Error('Could not find node matching toMatcher');
        }

        switch (relation) {
            case 'prepend':
                parent = to;
                following = to.children[0];
                break;
            case 'append':
                parent = to;
                following = undefined;
                break;
            case 'before':
                parent = to.parent;
                following = to;
                break;
            case 'after':
                parent = to.parent;
                following = to.afterSibling();
                break;
            default:
                throw new Error('Unrecognized relation ' + relation);
        }

        return { parent: parent, following: following, to: to };
    },

    /**
      * Find a node in the tree and return additional details.
      * @param matcher Used to identify the sought node; may be one of:
      *                Function: it is passed the node to test; return true to indicate a match.
      *                String: treated as an id and an id index lookup is performed.
      *                Object: matcher is assumed to be the node sought.
      * @param inArray If matcher is Function, search starting in this array; if omitted, search whole tree.
      * @returns A dictionary containing:
      *          node: the matched node
      *          index: index of matched node within parent's children array
      *          siblings: parent's children array
      *          parent: parent of matched node
      *          parentIndex: index of parent within matched node's grandparent's children array
      *          parentSiblings: grandparent's children array
      *          ancestors: ancestors; first node is the topmost in the tree, last is immediate parent
      */
    getNodeEx: function(matcher, inArray) {
        var matcherFn;
        if (typeof(matcher) == 'string') {
            // assume caller is asking for a match on id
            matcherFn = this.getKeyMatcherFn('id', matcher);
        }
        else if (matcher instanceof DataTreeNode) {
            // matcher is a DataTreeNode, do a lookup by object identity
            matcherFn = this.getObjectIdentityMatcher(matcher);
        }
        else if (matcher instanceof Function) {
            matcherFn = matcher;
        }
        else {
            throw new Error('Unsupported "matcher" argument passed');
        }

        if (inArray === undefined) {
            inArray = this.tree;
        }

        return this.getNodeExStep(matcherFn, inArray, []);
    },

    /**
      * @private
      * Steps through inArray's nodes and children recursively looking for a node for which matcherFn returns true
      */
    getNodeExStep: function(matcherFn, inArray, ancestors, parentElem, parentIndex, parentArray) {
        for (var i in inArray)
        {
            var elem = inArray[i];
            var newAncestors = ancestors.concat(elem);
            var index = parseInt(i);
            if (matcherFn(elem, ancestors, parentElem, parentIndex, parentArray)) {
                var r = {
                    node: elem,
                    index: index,
                    siblings: inArray,
                    parent: parentElem,
                    parentIndex: parentIndex,
                    parentSiblings: parentArray,
                    ancestors: newAncestors
                };
                return r;
            }
            var found = this.getNodeExStep(matcherFn, elem.children, newAncestors, elem, index, inArray);
            if (found !== undefined) {
                return found;
            }
        }
        return undefined;
    },


    /////////////////////////////////////////////////////
    // Node add, update, remove, move, merge
    /////////////////////////////////////////////////////

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
        var parent, beforeSibling;

        if (parentMatcher) {
            parent = this.getNode(parentMatcher);

            if (!parent) {
                throw new Error('Could not find element matching parentMatcher');
            }
        }

        if (beforeSiblingMatcher) {
            beforeSibling = this.getNodeEx(beforeSiblingMatcher);

            if (!beforeSibling) {
                throw new Error('Could not find element matching beforeSiblingMatcher');
            }

            if (parent && beforeSibling.parent !== parent) {
                throw new Error('Specified sibling is not a child of specified parent');
            }
        }

        if (parent) {
            if (beforeSibling) {
                parent.children.splice(beforeSibling.index, 0, node);
            }
            else {
                parent.children.push(node);
            }
            node.parent = parent;
        }
        else {
            if (beforeSibling) {
                beforeSibling.siblings.splice(beforeSibling.index, 0, node);
                node.parent = beforeSibling.parent;
            }
            else {
                this.tree.push(node);
                node.parent = this.root;
            }
        }

        node.root = this.root;
        this.idIndex[node.id] = node;
        this.updateLastModified();
        return [node, parent, beforeSibling ? beforeSibling.node : undefined];
    },

    addNodeRel: function(node, relation, toMatcher) {
        var parent;
        var beforeSibling;

        if (!toMatcher) {
            if (relation == 'before' || relation == 'after') {
                throw new Error('Cannot add node ' + relation + ' the root node');
            }
            if (relation == 'prepend') {
                beforeSibling = this.root.children[0];
            }
        }
        else {
            var rel = this.getNodeRel(relation, toMatcher);
            parent = rel.parent;
            beforeSibling = rel.following;
        }
        log(node, relation, toMatcher, 'parent id', parent ? parent.id : 'none', 'before sibling id', beforeSibling ? beforeSibling.id : 'none');
        return this.addNode(node, parent, beforeSibling);
    },

    // Update the first element that matches matcher
    updateNode: function(matcher, details, blockUpdateLastModified)
    {
        var elem = this.getNode(matcher);
        if (elem === undefined) {
            throw new Error('updateNode could not find a matching element to update');
        }
        if (details.id && details.id != elem.id) {
            delete this.idIndex[elem.id];
            elem.id = details.id;
            this.idIndex[details.id] = elem;
        }
        for (var key in details)
        {
            elem[key] = details[key];
        }

        if (!blockUpdateLastModified) {
            this.updateLastModified();
        }

        return elem;
    },

    // remove the first element from the tree matching matcher
    // removeChildren: if true, remove element's children; if false (default), splice them into element's old spot
    removeNode: function(matcher, removeChildren)
    {
        var found = this.getNodeEx(matcher);
        if (found === undefined) {
            console.error(matcher);
            throw new Error('Could not find requested element to remove matching above matcher');
        }

        if (removeChildren) {
            // remove all children
            found.siblings.splice(found.index, 1);
        }
        else {
            found.node.children.forEach(function(e) { e.parent = found.parent; });
            Array.prototype.splice.apply(found.siblings, [found.index, 1].concat(found.node.children));
        }

        delete this.idIndex[found.node.id];

        this.updateLastModified();
        return found.node;
    },

    // Move the node matching movingMatcher to reside under the node matching parentMatcher.
    // If beforeSiblingMatcher is specified, node will be placed before beforeSiblingMatcher under new parent.
    // If keepChildren is true, all children of the moving node will keep its existing children after the move.
    // If keepChildren if false (default), the moving node's children get spliced into the moving node's old spot.
    //
    // Returns [moved, newParent, beforeSibling] if a move was actually performed, or undefined if not.
    moveNode: function(movingMatcher, parentMatcher, beforeSiblingMatcher, keepChildren)
    {
        var moving = this.getNode(movingMatcher);
        var parent = this.getNode(parentMatcher);

        if (keepChildren) {
            // don't allow move if parent is currently a child of moving (would create a cycle)
            var test = tree.getNodeEx(function(e) { return e === parent; }, moving.children);
            if (test !== undefined) {
                log('Denying move; would have created a cycle');
                return undefined;
            }
        }

        var r;
        if (keepChildren) {
            this.removeNode(moving, true);
            r = this.addNode(moving, parent, beforeSiblingMatcher);
        }
        else {
            this.removeNode(moving, false);
            moving.children = []; // remove all of its children
            r = this.addNode(moving, parent, beforeSiblingMatcher);
        }
        return r;
    },

    moveNodeRel: function(movingMatcher, relation, toMatcher, keepChildren)
    {
        var moving = this.getNode(movingMatcher);
        if (!moving) {
            throw new Error('Could not find node matching movingMatcher');
        }

        if (keepChildren) {
            this.removeNode(moving, true);
        }
        else {
            this.removeNode(moving, false);
            moving.children = []; // remove all of its children
        }


        var rel = this.getNodeRel(relation, toMatcher);
        return this.addNode(moving, rel.parent, rel.following);
    },

    // Merge the node matching fromNodeMatcher and all its children into the node matching toNodeMatcher.
    // The properties of the toNode will not be modified, it just receives all the children of the fromNode.
    // The fromNode is removed from the tree after the merge.
    mergeNodes: function(fromNodeMatcher, toNodeMatcher)
    {
        var fromNodeEx = this.getNodeEx(fromNodeMatcher);
        if (!fromNodeEx) {
            throw new Error('Could not find fromNode');
        }

        var toNode = this.getNode(toNodeMatcher);
        if (!toNode) {
            throw new Error('Could not find toNode');
        }

        var fromId = fromNodeEx.node.id;
        var toId = toNode.id;

        // Update parents of children about to be moved
        fromNodeEx.node.children.forEach(function(e) { e.parent = toNode; });

        // Merge children
        toNode.children = toNode.children.concat(fromNodeEx.node.children);

        // Remove fromNode from tree
        fromNodeEx.siblings.splice(fromNodeEx.index, 1);

        return { fromId: fromId, toId: toId };
    },


    ///////////////////////////////////////////////////////////
    // Bulk load operations
    ///////////////////////////////////////////////////////////

    // Load contents of tree in bulk.
    // Make sure to call rebuildIdIndex() and updateLastModified() afterwards.
    loadTree: function(treeData, casts) {
        if (!casts) {
            // Default cast
            casts = { 'node': DataTreeNode }
        };

        var newRootNode = new DataTreeRootNode(this);

        if (treeData instanceof Array) {
            newRootNode.children = treeData;
        }
        else {
            treeData = treeData.children;
        }

        treeData = this.mapTree(function(e) {
            var castTo = casts[e.elemType];
            if (castTo) {
                // pseudocast: doesn't actually change the object's type, but
                // will cause instanceof to report correct prototype inheritance
                e.__proto__ = castTo.prototype;
            }
            return e;
        }, treeData);

        newRootNode.children = treeData;
        this.root = newRootNode;
        this.tree = this.root.children;
    },

    // rebuild the id index
    rebuildIdIndex: function() {
        this.idIndex = this.reduce(function(last, e) {
            last[e.id] = e;
            return last;
        }, {});
    },

    // rebuild .parent relations
    rebuildParents: function(startingParent) {
        var children;
        if (!startingParent) {
            startingParent = null;
            children = this.tree;
        }
        else {
            children = startingParent.children;
        }

        for (var i = children.length - 1; i >= 0; i--) {
            children[i].parent = startingParent;
            children[i].root = this.root;
            this.rebuildParents(children[i]);
        };
    },

    ///////////////////////////////////////////////////////////
    // Comprehension style operations
    ///////////////////////////////////////////////////////////

    /**
      * Reduces each node and its descendants to a single value by accumulating the results of
      * successive calls to reduceFn.
      * @param {Function} reduceFn
      *        Called for each node in sequence.
      *        Takes parameters (lastValue, node, containingArray).
      *        Should return the value which will be assigned as lastValue to the next reduceFn() call.
      * @param initialValue Starting value for lastValue.
      * @param {Array} [inArray=the entire tree] Act on nodes in given array and their descendants.
      * @returns The accumulated results (last return value) of the calls to reduceFn().
      * @example
      * tree.reduce(function(lastValue, node, containingArray) {
      *     return lastValue + node.id + ',';
      * }, '');
      */
    reduce: function(reduceFn, initialValue, inArray)
    {
        return this.reduceStep(reduceFn, initialValue, 0, inArray || this.tree);
    },

    /**
      * @private
      */
    reduceStep: function(reduceFn, initial, depth, inArray)
    {
        var value = initial;
        for (i in inArray)
        {
            var node = inArray[i];
            value = reduceFn(value, node, depth);
            value = this.reduceStep(reduceFn, value, depth + 1, node.children);
        }
        return value;
    },

    /**
      * Find all nodes in the tree for which matcherFn returns true.
      * @param matcherFn Function(node): return true for each node to be included in the result set.
      * @param inArray If provided, act only on nodes and descendents in given array; acts on whole tree otherwise.
      * @returns An array of all matching nodes.
      * @example tree.filter(function(node) { return node.id[0] == 'f'; });
      */
    filter: function(matcherFn, inArray)
    {
        return this.reduce(function(l, e) {
            if (matcherFn(e)) {
                return l.concat(e);
            }
            return l;
        }, [], inArray);
    },

    groupBy: function(groupByFn, inArray)
    {
        return this.reduce(function(l, e) {
            var groupVar = groupByFn(e);
            if (!groupVar) {
                return l;
            }
            if (!l[groupVar]) {
                l[groupVar] = [];
            }
            l[groupVar].push(e);
            return l;
        }, {}, inArray);
    },

    /**
      * Map all nodes in the tree from one value to another value, returning a flattened array.
      * @param mapFn Function(node): Receives each node and should return the desired mapped value.
      * @param inArray If provided, act only on nodes and descendents in given array; acts on whole tree otherwise.
      * @returns A flattened array of the values returned by mapFn().
      * @example tree.map(function(node) { return node.id; });
      */
    map: function(mapFn, inArray)
    {
        return this.reduce(function(l, e) {
            return l.concat(mapFn(e));
        }, [], inArray);
    },

    // Like map(), but preserves the tree structure of the nodes by setting the .children property on each node.
    // Note that this alters the original objects of inArray or the tree; clone the tree and its nodes to leave
    // the original nodes unaltered.
    mapTree: function(mapFn, inArray)
    {
        var self = this;
        var ary = inArray || this.tree;
        return ary.map(function(e) {
            var children = e.children;
            e = mapFn(e);
            e.children = self.mapTree(mapFn, children);
            return e;
        });
    },

    /**
      * Execute eachFn for each item.
      * @param eachFn Function(node, depth, containingArray, parentNode):
      *        Called for each node in sequence and should return the desired mapped value.
      * @param inArray If provided, act only on nodes and descendents in given array; acts on whole tree otherwise.
      * @example
      * tree.forEach(function(node, index, depth, containingArray, parentNode) {
      *     console.log(node.id, index, depth, containingArray, parentNode);
      * });
      */
    forEach: function(eachFn, inArray)
    {
        this.forEachStep(eachFn, 0, inArray || this.tree, undefined);
    },

    /**
      * @private
      */
    forEachStep: function(eachFn, depth, inArray, parent) {
        var treeObj = this;
        var i = 0;
        inArray.forEach(function(e) {
            eachFn(e, i++, depth, inArray, parent);
            treeObj.forEachStep(eachFn, depth + 1, e.children, e);
        });
    },


    /////////////////////////////////////////////////////
    // Miscellaneous
    /////////////////////////////////////////////////////

    // Returns full contents of tree formatted as a string. Useful for debugging.
    dump: function()
    {
        // Quick and dirty cloneObject().
        var cloneObject = function(obj) {
            var clone = {};
            for(var i in obj) {
                if(typeof(obj[i])=="object")
                    clone[i] = cloneObject(obj[i]);
                else
                    clone[i] = obj[i];
            }
            return clone;
        }

        var dumpFn = function(lastValue, node, depth) {
            // Clone node and strip its children off before JSON.stringifying.
            var cloned = cloneObject(node);
            delete cloned.children;

            return lastValue + '\n'
                + Array(1 + (1 + depth) * 4).join(' ')
                + JSON.stringify(cloned)
                + ' [' + node.children.length + ' children]';
        }
        return this.reduce(dumpFn, '');
    },

    // Empties the tree.
    clear: function() {
        this.root = new DataTreeRootNode(this);
        this.tree = this.root.children;
        this.idIndex = [];
        this.updateLastModified();
    },

    toString: function() {
        var s = '[Tree with ' + this.tree.length + ' top level elements, '
            + tree.reduce(function(l, e) { return l + 1; }, 0) + ' total elements]';
        return s;
    },

    // Updates this.lastModified and calls this.onModified, if set.
    updateLastModified: function() {
        this.lastModified = Date.now();
        if (this.onModified) {
            this.onModified();
        }
    },


    /////////////////////////////////////////////////////
    // Matchers
    /////////////////////////////////////////////////////

    // returns generic matcherFn for matching an element's key against value
    getKeyMatcherFn: function(key, value)
    {
        return function(e) { return e[key] == value; };
    },

    // returns generic matcherFn for matching an object by object identity
    getObjectIdentityMatcher: function(object)
    {
        return function(e) { return e === object; };
    }
}

extendClass(DataTree, Object, DataTree.prototype);

