/**
  * Hierarchical data structure with traversal and manipulation funcions.
  *
  * @constructor
  */
var DataTree = function() {
    this.tree = []; // primary internal data structure's top level of children
    this.lastModified = null;
    this.onModified = null;
    this.idIndex = {};
};

// TODO give the tree a root node, probably makes traversal functions more logical:
// function each(fn, node) { fn(node); node.children.each(fn); } // or something

DataTree.prototype = {

    /////////////////////////////////////////////////////
    // GENERIC ELEMENT TRAVERSAL/MANIPULATION FUNCTIONS
    /////////////////////////////////////////////////////

    /**
      * Adds an element to the tree as a child of the element which makes parentMatcherFn(element) return true.
      *
      * @param {Function} If parentMatcherFn is undefined, add to the root node.
      *                   If parentMatcherFn is defined and does not find a match, an exception is thrown.
      */
    addElem: function(elem, parentMatcherFn)
    {
        if (parentMatcherFn === undefined)
        {
            this.tree.push(elem);
            this.idIndex[elem.id] = elem;
            return elem;
        }
        parent = this.findElem(parentMatcherFn, this.tree);
        if (parent === undefined)
        {
            throw 'addElem did not find parent element matching parentMatcherFn';
        }
        parent.children.push(elem);
        this.idIndex[elem.id] = elem;
        this.updateLastModified();
        return elem;
    },

    // TODO merge functionality of findElemParent into findElem by passing the parentElem recursively

    // Find an element in our tree starting in inArray for which matcherFn(elem) returns true
    // hitfn: if given as Function(elem, index, containing_array) it is executed against the element matched
    findElem: function(matcherFn, inArray, hitFn, parentElem, parentIndex, parentArray)
    {
        for (var i in inArray)
        {
            var elem = inArray[i];
            if (matcherFn(elem)) {
                if (hitFn !== undefined) {
                    hitFn(elem, parseInt(i), inArray, parentElem, parseInt(parentIndex), parentArray);
                }
                return elem;
            }
            var childElem = this.findElem(matcherFn, elem.children, hitFn, elem, i, inArray);
            if (childElem !== undefined)
                return childElem;
        }
        return undefined;
    },

    findElemById: function(id) {
        return this.idIndex[id];
    },

    findElemParent: function(matcherFn, root)
    {
        var inArray = root instanceof Array ? root : root.children;
        for (var i in inArray)
        {
            var elem = inArray[i];
            if (matcherFn(elem)) {
                return root;
            }
            var foundElem = this.findElemParent(matcherFn, elem);
            if (foundElem !== undefined)
                return foundElem;
        }
        return undefined;
    },

    // Update the first element for which matcherFn returns true with the given details
    updateElem: function(matcherFn, details)
    {
        var elem = this.findElem(matcherFn, this.tree);
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

    // Applies reduceFn(lastValue, elem, tree_depth, containing_array) to each element and its child-elements in sequence
    // initial: starting value for lastValue
    reduce: function(reduceFn, initial)
    {
        return this.reduceElem(reduceFn, initial, 0, this.tree);
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

    // Move the element matching movingMatcherFn to reside under the element matching parentMatcherFn
    // This is a shallow move; the moved element's children are spliced in-place into its old location
    moveElem: function(movingMatcherFn, parentMatcherFn)
    {
        var parent = this.findElem(parentMatcherFn, this.tree);
        var moving = this.removeElem(movingMatcherFn);
        if (moving === undefined)
        {
            throw 'moveElem could not find/remove element matching movingMatcherFn';
        }
        moving.children = []; // remove all of its children
        // TODO when moving an element we must replace the moved element with its children in-placeS
        parent.children.push(moving); // put moving back into tree as child of desired new parent
        this.updateLastModified();
        return moving;
    },

    // Move the first element matching movingMatcherFn, and all of its children, to reside under the first element
    // matching parentMatcherFn. Moves that would create a cycle (trying to make a page its own descendant) will
    // throw an exception.
    moveElemDeep: function(movingMatcherFn, parentMatcherFn)
    {
        var parent = this.findElem(parentMatcherFn, this.tree);
        var result = this.findElem(movingMatcherFn, this.tree, function(e, i, a) {
            // don't allow move if parent is currently a child of page (moving would create a cycle)
            var test = tree.findElem(function(elem) { return elem == parent; }, e.children);
            if (test !== undefined)
                throw 'moveElemDeep would have created a cycle, aborting';

            a.splice(i, 1); // remove moving page from its current spot
            parent.children.push(e); // insert moving page as child of new parent
        });
        this.updateLastModified();
        return result;
    },

    // remove the first element from the tree where matcherFn(element) returns true
    // removeChildren: if given as true, also remove all the element's children, otherwise splice them into tree
    removeElem: function(matcherFn, removeChildren)
    {
        var treeObj = this;
        return this.findElem(matcherFn, this.tree, function(e, i, a) {
            treeObj.updateLastModified();
            if (removeChildren) {
                a.splice(i, 1);
            }
            else {
                Array.prototype.splice.apply(a, [i, 1].concat(e.children));
            }
            delete treeObj.idIndex[e.id];
        });
    },

    updateLastModified: function() {
        this.lastModified = Date.now();
        if (this.onModified) {
            this.onModified();
        }
    },

    /////////////////////////////////////////////////////
    // MISCELLANEOUS FUNCTIONS
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
    // MATCHERS
    /////////////////////////////////////////////////////

    // returns generic matcherFn for matching an element's key against value
    getKeyMatcherFn: function(key, value)
    {
        return function(e) { return e[key] == value; };
    }
}
