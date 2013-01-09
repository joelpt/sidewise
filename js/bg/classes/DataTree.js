/**
  * @class
  * Hierarchical data structure with traversal and manipulation funcions.
  *
  * @requires DataTreeNode
  * @constructor
  */
var DataTree = function(indexKeys) {

    /////////////////////////////////////////////////////
    // Intialization
    /////////////////////////////////////////////////////

    this.root = new DataTreeRootNode(this);
    this.tree = this.root.children; // root level children
    this.lastModified = null;
    this.onModified = null;
    this.indexes = {};

    if (!indexKeys) {
        indexKeys = [];
    }
    if (indexKeys.indexOf('id') == -1) {
        indexKeys.push('id');
    }

    for (var i = indexKeys.length - 1; i >= 0; i--) {
        this.addIndex(indexKeys[i]);
    }
};

DataTree.prototype = {

    /////////////////////////////////////////////////////
    // Node retrieval
    /////////////////////////////////////////////////////

    /**
      * Find a node in the tree.
      * @param matcher Used to identify the sought node; may be one of:
      *                Function(e):  Passed the node to test; return true to indicate a match.
      *                String:       Treated as an id and an id index lookup is performed.
      *                [key, value]: Pass a key(string)/value(non-object) pair to search the tree for.
      *                              If an index exists for the specified key, it will be used and the first
      *                              matching node will be returned. If no index exists a tree scan is performed
      *                              instead.
      *                Object:       The matcher arg is assumed to be the node sought and is just returned.
      *                              This does not verify that the node exists in the tree! For that use
      *                              t.getNode(node.id) or t.getNode(t.getObjectIdentityMatcher(node)).
      */
    getNode: function(matcher) {
        if (typeof(matcher) == 'string') {
            var r = this.indexes['id'][matcher];
            if (!r) {
                return undefined;
            }
            return r[0];
        }

        if (Array.isArray(matcher)) {
            var index = this.indexes[matcher[0]];
            if (!index) {
                // no index for the requested key so just scan the tree for a match
                return this.getNodeStep(this.getKeyMatcherFn(matcher[0], matcher[1]));
            }
            var r = index[matcher[1]];
            if (!r) {
                // node does not exist
                return undefined;
            }
            return r[0]; // return first node matching specified key/value pairing
        }

        if (matcher instanceof DataTreeNode) {
            return matcher;
        }

        if (matcher instanceof Function) {
            return this.getNodeStep(matcher, this.tree);
        }

        console.error('Bad matcher type:', typeof(matcher));
        console.error(matcher);
        throw new Error('Unsupported matcher argument passed');
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
    addNode: function(node, parentMatcher, beforeSiblingMatcher, skipIndexing)
    {
        var parent, beforeSibling;

        if (parentMatcher) {
            parent = this.getNode(parentMatcher);

            if (!parent) {
                console.error(JSON.stringify(parentMatcher));
                throw new Error('For adding node ' + node.id + ', could not find element matching parentMatcher');
            }
        }

        if (beforeSiblingMatcher) {
            beforeSibling = this.getNode(beforeSiblingMatcher);

            if (!beforeSibling) {
                console.error(beforeSiblingMatcher);
                throw new Error('For adding node ' + node.id + ', could not find element matching beforeSiblingMatcher');
            }

            if (parent && beforeSibling.parent !== parent) {
                throw new Error('For adding node ' + node.id + ', specified sibling ' + beforeSibling.id + ' is not a child of specified parent ' + parent.id + '; sibling\'s real parent is ' + beforeSibling.parent.id);
            }
        }

        if (parent && !parent.isRoot) {
            if (beforeSibling) {
                parent.children.splice(beforeSibling.siblingIndex(), 0, node);
            }
            else {
                parent.children.push(node);
            }
            node.parent = parent;
        }
        else {
            if (beforeSibling) {
                beforeSibling.siblings().splice(beforeSibling.siblingIndex(), 0, node);
                node.parent = beforeSibling.parent;
            }
            else {
                this.tree.push(node);
                node.parent = this.root;
            }
        }

        node.root = this.root;

        if (!skipIndexing) {
            this.indexNode(node);
        }

        this.updateLastModified();
        return [node, parent, beforeSibling];
    },

    addNodeRel: function(node, relation, toMatcher, skipIndexing) {
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
        log(node.id, relation, toMatcher ? toMatcher.id : 'none', '- parent id', parent ? parent.id : 'none', 'before sibling id', beforeSibling ? beforeSibling.id : 'none', node, toMatcher);
        return this.addNode(node, parent, beforeSibling, skipIndexing);
    },

    // Update the first element that matches matcher
    updateNode: function(matcher, details, blockUpdateLastModified, skipIndexing)
    {
        var node = this.getNode(matcher);
        if (node === undefined) {
            throw new Error('updateNode could not find a matching node to update');
        }

        if (!skipIndexing) {
            this.updateIndexForNode(node, details);
        }

        for (var key in details)
        {
            node[key] = details[key];
        }

        if (!blockUpdateLastModified) {
            this.updateLastModified();
        }

        return node;
    },


    // remove the first element from the tree matching matcher
    // removeChildren: if true, remove element's children; if false (default), splice them into element's old spot
    removeNode: function(matcher, removeChildren, skipDeindexing)
    {
        var node = this.getNode(matcher);
        if (!node) {
            throw new Error('Could not find requested element to remove matching ' + matcher.toString());
        }

        if (removeChildren) {
            // remove all children
            node.siblings().splice(node.siblingIndex(), 1);
            if (!skipDeindexing) {
                var descendants = this.filter(function(e) { return e; }, node.children);
                for (var i = descendants.length - 1; i >= 0; i--) {
                    this.deindexNode(descendants[i]);
                }
            }
        }
        else {
            node.children.forEach(function(e) { e.parent = node.parent; });
            Array.prototype.splice.apply(node.siblings(), [node.siblingIndex(), 1].concat(node.children));
        }

        if (!skipDeindexing) {
            this.deindexNode(node);
        }

        this.updateLastModified();
        return node;
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
            this.removeNode(moving, true, true);
            r = this.addNode(moving, parent, beforeSiblingMatcher, true);
        }
        else {
            this.removeNode(moving, false, true);
            moving.children = []; // remove all of its children
            r = this.addNode(moving, parent, beforeSiblingMatcher, true);
        }
        this.updateLastModified();
        return r;
    },

    moveNodeRel: function(movingMatcher, relation, toMatcher, keepChildren)
    {
        var moving = this.getNode(movingMatcher);
        if (!moving) {
            throw new Error('Could not find node matching movingMatcher');
        }

        if (keepChildren) {
            this.removeNode(moving, true, true);
        }
        else {
            this.removeNode(moving, false, true);
            moving.children = []; // remove all of its children
        }

        var rel = this.getNodeRel(relation, toMatcher);
        this.updateLastModified();
        return this.addNode(moving, rel.parent, rel.following, true);
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
    loadTree: function(treeData, casts) {
        if (!casts) {
            // Default cast
            casts = { 'node': DataTreeNode }
        };

        var newRootNode = new DataTreeRootNode(this);

        if (treeData) {
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
        }
        else {
            newRootNode.children = [];
        }

        this.root = newRootNode;
        this.tree = this.root.children;
        this.rebuildIndexes();
        this.rebuildParents();
        this.lastModified = Date.now();
    },

    // rebuild .parent relations
    rebuildParents: function(startingParent) {
        var children;
        if (!startingParent) {
            startingParent = this.root;
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
      * @example tree.filter(function(node) { return node instanceof FolderNode; });
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

    // Returns a data structure looking like
    //  [
    //      {
    //          node: node,
    //          children: [
    //              {
    //                  node: node,
    //                  children: [...]
    //              }, ...
    //          ]
    //      }, ...
    //  ]
    //
    //  Only nodes for which matcherFn(node) returns true are included in the
    //  resultant structure. The 'real' children of a given node is available
    //  via node.children in the structure, whereas the 'matching' children
    //  are in children. When a node does not match but its descendant(s) do,
    //  we pull those descendants up to the nearest matching-parent's children
    //  depth.
    //
    getCondensedTree: function(matcherFn, inArray)
    {
        var self = this;
        var ary = inArray || this.tree;
        var result = [];
        for (var i = 0; i < ary.length; i++) {
            var node = ary[i];
            var matchedChildren = this.getCondensedTree(matcherFn, node.children);

            // When we match, add the node to result and recurse on its children
            if (matcherFn(node)) {
                var r = {
                    node: node,
                    children: matchedChildren
                };
                result.push(r);
                continue;
            }

            // Otherwise, concatenate
            result = result.concat(matchedChildren);
        }
        return result;
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

    ///////////////////////////////////////////////////////////
    // Index handling
    ///////////////////////////////////////////////////////////

    addIndex: function(key) {
        this.indexes[key] = {};
    },

    indexNode: function(node) {
        for (var key in this.indexes) {
            var value = node[key];
            if (value === undefined) {
                continue;
            }
            var index = this.indexes[key];
            if (index === undefined) {
                throw new Error('Index not defined for given index key', key);
            }
            var ary = index[value];
            if (ary === undefined) {
                ary = [];
                index[value] = ary;
            }
            ary.push(node);
        }
    },

    updateIndexForNode: function(node, details) {
        for (var key in details) {
            var index = this.indexes[key];
            if (index === undefined) {
                continue;
            }

            var newValue = details[key];
            var oldValue = node[key];
            if (newValue == oldValue) {
                continue;
            }

            // remove previous indexed value
            if (oldValue !== undefined) {
                var oldAry = index[oldValue];
                if (oldAry !== undefined) {
                    var oldIndexOf = oldAry.indexOf(node);
                    if (oldIndexOf > -1) {
                        oldAry.splice(oldIndexOf, 1);
                        if (oldAry.length == 0) {
                            delete index[oldValue];
                        }
                    }
                }
            }

            // add new indexed value
            if (newValue !== undefined) {
                var newAry = index[newValue];
                if (newAry === undefined) {
                    newAry = [];
                    index[newValue] = newAry;
                }
                newAry.push(node);
            }
        }
    },

    deindexNode: function(node) {
        for (var key in this.indexes) {
            var value = node[key];
            if (value === undefined) {
                continue;
            }
            var index = this.indexes[key];
            if (index === undefined) {
                throw new Error('Index not defined for given index key', key);
            }
            var ary = index[value];
            if (ary === undefined) {
                continue;
            }
            var indexOf = ary.indexOf(node);
            if (indexOf > -1) {
                ary.splice(indexOf, 1);
                if (ary.length == 0) {
                    delete index[value];
                }
            }
        }
    },

    rebuildIndexes: function() {
        for (var key in this.indexes) {
            if (this.indexes[key] === undefined) {
                throw new Error('Could not find key in indexes to populate', key);
            }
            this.indexes[key] = this.reduce(function(last, e) {
                var value = e[key];
                if (value === undefined) {
                    return last;
                }
                var ary = last[value];
                if (ary === undefined) {
                    ary = [];
                    last[value] = ary;
                }
                ary.push(e);
                return last;
            }, {});
        }
    },

    /////////////////////////////////////////////////////
    // Miscellaneous
    /////////////////////////////////////////////////////

    // Returns full contents of tree formatted as a string. Useful for debugging.
    dump: function()
    {
        var dumpFn = function(lastValue, node, depth) {
            // Clone node and strip its children off before JSON.stringifying.
            var cloned = clone(node, ['parent', 'root', 'children']);

            return lastValue + '\n'
                + Array(1 + (1 + depth) * 4).join(' ')
                + JSON.stringify(cloned);

        }
        return this.reduce(dumpFn, '');
    },

    // Empties the tree.
    clear: function() {
        this.root = new DataTreeRootNode(this);
        this.tree = this.root.children;
        this.indexes = this.indexes.reduce(function(last, e) {
            last[e] = {};
            return last;
        }, {});
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

    // Prohibits this.onModified() from getting called ever again.
    disableCallbacks: function() {
        this.onModified = function() {};
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

