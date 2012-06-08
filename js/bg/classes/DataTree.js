/**
  * Hierarchical data structure with traversal and manipulation funcions.
  *
  * @constructor
  */
var DataTree = function() {

    /////////////////////////////////////////////////////
    // Intialization
    /////////////////////////////////////////////////////

    this.tree = []; // primary internal data structure's top level of children
    this.lastModified = null;
    this.onModified = null;
    this.idIndex = {};
};

// TODO give the tree a root node, probably makes traversal functions more logical:
// function each(fn, node) { fn(node); node.children.each(fn); } // or something

DataTree.prototype = {

    /////////////////////////////////////////////////////
    // Node create-read-update-delete operations
    /////////////////////////////////////////////////////

    /**
      * Adds a node to the tree as a child of the element matched by parentMatcher.
      *
      * @param node The node to add.
      * @param parentMatcher The parentMatcher to use for identifying the parent; see findNode().
      *                      If parentMatcher is omitted, add to the top level of the tree.
      * @returns [node, parent]
      */
    addNode: function(node, parentMatcher)
    {
        if (parentMatcher === undefined)
        {
            this.tree.push(node);
            this.idIndex[node.id] = node;
            return [node, undefined];
        }
        parent = this.findNode(parentMatcher);
        parent.children.push(node);
        this.idIndex[node.id] = node;
        this.updateLastModified();
        return [node, parent];
    },

    /**
      * Find a node in the tree.
      * @param matcher Used to identify the sought node; may be one of:
      *                Function: it is passed the node to test; return true to indicate a match.
      *                String: treated as an id and an id index lookup is performed.
      *                DataTreeNode: matcher is assumed to be the node sought and is just returned.
      */
    findNode: function(matcher) {
        if (typeof(matcher) == 'string') {
            return this.idIndex[matcher];
        }

        if (matcher instanceof DataTreeNode) {
            return matcher;
        }

        if (matcher instanceof Function) {
            return this.findNodeStep(matcher, this.tree);
        }

        throw 'Unsupported "matcher" argument passed';
    },

    // Steps through inArray's nodes and children recursively looking for a node for which matcherFn returns true
    findNodeStep: function(matcherFn, inArray) {
        for (var i in inArray)
        {
            var elem = inArray[i];
            if (matcherFn(elem)) {
                return elem;
            }
            var childElem = this.findNodeStep(matcherFn, elem.children);
            if (childElem !== undefined)
                return childElem;
        }
        return undefined;
    },

    /**
      * Find a node in the tree and return additional details.
      * @param matcher Used to identify the sought node; may be one of:
      *                Function: it is passed the node to test; return true to indicate a match.
      *                String: treated as an id and an id index lookup is performed.
      *                DataTreenode: matcher is assumed to be the node sought.
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
    findNodeEx: function(matcher, inArray) {
        var matcherFn;
        if (typeof(matcher) == 'string') {
            // assume caller is asking for a match on id
            matcherFn = this.getKeyMatcherFn('id', matcher);
        }
        else if (matcher instanceof DataTreeNode) {
            // matcher is a DataTreeNode, do a lookup by object identity
            matcherFn = this.getElementMatcherFn(matcher);
        }
        else if (matcher instanceof Function) {
            matcherFn = matcher;
        }
        else {
            throw 'Unsupported "matcher" argument passed';
        }

        if (inArray === undefined) {
            inArray = this.tree;
        }

        return this.findNodeExStep(matcherFn, inArray);
    },

    // Steps through inArray's nodes and children recursively looking for a node for which matcherFn returns true
    findNodeExStep: function(matcherFn, inArray, parentElem, parentIndex, parentArray) {
        for (var i in inArray)
        {
            var elem = inArray[i];
            if (matcherFn(elem)) {
                var r = {
                    node: elem,
                    index: parseInt(i),
                    siblings: inArray,
                    parent: parentElem,
                    parentIndex: parseInt(parentIndex),
                    parentSiblings: parentArray,
                    ancestors: [parentElem]
                };
                return r;
            }
            var found = this.findNodeExStep(matcherFn, elem.children, elem, i, inArray);
            if (found !== undefined) {
                if (parentElem !== undefined) {
                    found.ancestors.splice(0, 0, parentElem);
                }
                return found;
            }
        }
        return undefined;
    },

    // Update the first element that matches matcher
    updateElem: function(matcher, details)
    {
        var elem = this.findNode(matcher);
        if (elem === undefined) {
            throw 'updateElem could not find a matching element to update';
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
        this.updateLastModified();
        return elem;
    },

    // Move the element matching movingMatcher to reside under the element matching parentMatcher.
    // This is a shallow move; the moved element's children are spliced in-place into its old location
    moveNode: function(movingMatcher, parentMatcher)
    {
        var moving = this.removeNode(movingMatcher);
        moving.children = []; // remove all of its children
        this.addNode(moving, parentMatcher);
        return moving;
    },

    // Move the first element matching movingMatcherFn, and all of its children, to reside under the first element
    // matching parentMatcherFn. Moves that would create a cycle (trying to make a page its own descendant) will
    // throw an exception.
    // moveElemDeep: function(movingMatcherFn, parentMatcherFn)
    // {
    //     var parent = this.findElem(parentMatcherFn, this.tree);
    //     var result = this.findElem(movingMatcherFn, this.tree, function(e, i, a) {
    //         // don't allow move if parent is currently a child of page (moving would create a cycle)
    //         var test = tree.findElem(function(elem) { return elem == parent; }, e.children);
    //         if (test !== undefined)
    //             throw 'moveElemDeep would have created a cycle, aborting';

    //         a.splice(i, 1); // remove moving page from its current spot
    //         parent.children.push(e); // insert moving page as child of new parent
    //     });
    //     this.updateLastModified();
    //     return result;
    // },

    // remove the first element from the tree matching matcher
    // removeChildren: if true, remove element's children; if false, splice them into element's old spot
    removeNode: function(matcher, removeChildren)
    {
        var found = this.findNodeEx(matcher);
        if (found === undefined) {
            throw 'Could not find requested element to remove matching: ' + matcher;
        }

        this.updateLastModified();
        if (removeChildren) {
            // remove all children
            // TODO consider if we need to trigger callbackProxy 'removePage' for each child node
            // that gets removed in PageTree; perhaps not if removePage() doesn't take a removeChildren
            // arg itself
            found.siblings.splice(found.index, 1);
        }
        else {
            Array.prototype.splice.apply(found.siblings, [found.index, 1].concat(found.node.children));
        }
        delete this.idIndex[found.node.id];
        return found.node;
    },

    updateLastModified: function() {
        this.lastModified = Date.now();
        if (this.onModified) {
            this.onModified();
        }
    },


    /////////////////////////////////////////////////////
    // Comprehension-style operations
    /////////////////////////////////////////////////////

    // Applies reduceFn(lastValue, elem, tree_depth, containing_array) to each element
    // and its child-elements in sequential order
    // initialValue: starting value for lastValue
    reduce: function(reduceFn, initialValue)
    {
        return this.reduceElem(reduceFn, initialValue, 0, this.tree);
    },

    reduceElem: function(reduceFn, initial, depth, inArray)
    {
        var value = initial;
        for (i in inArray)
        {
            var elem = inArray[i];
            value = reduceFn(value, elem, depth);
            value = this.reduceElem(reduceFn, value, depth + 1, elem.children);
        }
        return value;
    },

    forEach: function(eachFn, depth, inArray, parent)
    {
        inArray = inArray || this.tree;
        depth = depth || 0;
        var treeObj = this;
        inArray.forEach(function(e) {
            eachFn(e, depth, inArray, parent);
            treeObj.forEach(eachFn, depth + 1, e.children, e);
        });
    },


    /////////////////////////////////////////////////////
    // Miscellaneous
    /////////////////////////////////////////////////////

    // Returns contents of tree formatted as a string. Used for debugging.
    toString: function()
    {
        var toStringFn = function(lastValue, e, depth) {
            return lastValue + '\n'
                + Array(1 + (1 + depth) * 4).join(' ')
                + e.toString()
                + ' [' + e.children.length + ' children]';
        }
        return this.reduce(toStringFn, '');
    },


    /////////////////////////////////////////////////////
    // Matchers
    /////////////////////////////////////////////////////

    // returns generic matcherFn for matching an element's key against value
    getKeyMatcherFn: function(key, value)
    {
        return function(e) { return e[key] == value; };
    },

    // returns generic matcherFn for matching an element by object identity
    getElementMatcherFn: function(element)
    {
        return function(e) { return e === element; };
    }
}
