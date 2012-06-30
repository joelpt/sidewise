///////////////////////////////////////////////////////////
// FancyTree.multiSelect.js
// Multiselection
///////////////////////////////////////////////////////////

FancyTree.prototype.toggleMultiSelectionSingle = function(id) {
    var row = ft.getRow(id);
    var index = this.multiSelection.indexOf(id);
    if (index > -1) {
        // already in selection so remove it
        this.multiSelection.splice(index, 1);
        this.removeSelectionEffect(row);

        if (this.multiSelection.length == 0) {
            this.clearMultiSelection();
        }
        return;
    }

    // add to selection
    this.multiSelection.push(id);
    this.addSelectionEffect(row);
    this.root.addClass('ftMultiselecting');
};

FancyTree.prototype.addMultiSelectionBetween = function(fromId, toId) {
    // if fromId and toId are the same, just do a single selection
    if (fromId == toId) {
        this.toggleMultiSelectionSingle(fromId);
        return;
    }


    var rows;
    if (this.filtering) {
        // when tree is filtered, only select pages which match the filter
        rows = this.root.find('.ftFilteredIn');
    }
    else {
        // select from all pages
        // TODO handle pages that are not visible due to
        // parent branch being collapsed
        rows = this.root.find('.ftRowNode');
    }

    // build a list of rowtypes which may be multiselected
    var multiselectableRowTypes = mapObjectProps(this.rowTypes, function(k, v) {
        return (v.multiselectable === false ? undefined : k);
    });

    // filter out non-multiselectable rows
    rows = rows.filter(function(i, e) {
        return (multiselectableRowTypes.indexOf(e.attributes.rowtype.value) >= 0);
    });

    // flatten the tree to get the ids in the visible page order disregarding nesting
    var flattened = rows.map(function(i, e) { return e.id; }).toArray();

    // find index of start and end tabs
    var start = flattened.indexOf(fromId);
    var end = flattened.indexOf(toId);

    if (start == -1 || end == -1) {
        throw new Error('Could not find both start and end indices ' + fromId + ', ' + toId);
    }

    // switch start and end around if start doesn't precede end
    if (start > end) {
        var swap = start;
        start = end;
        end = swap;
    }

    // get the list of ids between start and end inclusive
    var range = flattened.slice(start, end + 1);

    if (range.length == 0) {
        return;
    }

    // add these to multiSelection
    var thisObj = this;
    range.forEach(function(e) {
        if (thisObj.multiSelection.indexOf(e) == -1) {
            thisObj.multiSelection.push(e);
            thisObj.addSelectionEffect(thisObj.getRow(e));
        }
    });

    this.root.addClass('ftMultiselecting');

    return;
};

FancyTree.prototype.clearMultiSelection = function() {
    // remove visual selection effects
    var thisObj = this;
    this.multiSelection.forEach(function(e) {
        try {
            var row = thisObj.getRow(e);
            thisObj.removeSelectionEffect(row);
        }
        catch (ex) { }
    });
    this.root.removeClass('ftMultiselecting');

    // reset multiSelection variables
    this.multiSelection = [];
    this.lastMultiSelectedFromId = null;
    this.lastMultiSelectedToId = null;
};

FancyTree.prototype.addSelectionEffect = function(row) {
    var rowTypeParams = this.getRowTypeParams(row);
    if (!rowTypeParams.multiselectable) {
        return;
    }
    row.addClass('ftSelected');
};

FancyTree.prototype.removeSelectionEffect = function(row) {
    row.removeClass('ftSelected');
};