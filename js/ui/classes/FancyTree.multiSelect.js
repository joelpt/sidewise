///////////////////////////////////////////////////////////
// FancyTree.multiSelect.js
// Multiselection
///////////////////////////////////////////////////////////

FancyTree.prototype.toggleMultiSelectionSingle = function($row, forceOn) {
    var exists = this.multiSelection.is($row);

    if (exists && !forceOn) {
        // already in selection so remove it
        this.multiSelection = this.multiSelection.not($row);
        this.removeSelectionEffect($row);

        if (this.multiSelection.length == 0) {
            this.clearMultiSelection();
        }
        return;
    }

    if (!exists) {
        // add to selection
        this.multiSelection = this.multiSelection.add($row);
        this.addSelectionEffect($row);
        this.root.addClass('ftMultiselecting');
    }
};

FancyTree.prototype.removeMultiSelectionSingle = function($row) {
    var exists = this.multiSelection.is($row);

    if (!exists) {
        return false;
    }

    this.multiSelection = this.multiSelection.not($row);
    this.removeSelectionEffect($row);

    if (this.multiSelection.length == 0) {
        this.clearMultiSelection();
    }
    return true;
};

FancyTree.prototype.addMultiSelectionBetween = function($fromRow, $toRow) {
    // if from and to are the same, just do a single selection
    if ($fromRow.is($toRow)) {
        this.toggleMultiSelectionSingle($fromRow);
        return;
    }


    var $rows;
    if (this.filtering) {
        // when tree is filtered, only select pages which match the filter
        $rows = this.root.find('.ftFilteredIn');
    }
    else {
        // select from all pages
        $rows = this.root.find('.ftRowNode');
    }

    // filter out rows that are not visible because they are children of a collapsed row
    $rows = $rows.not(function() {
        return $(this).parents('.ftCollapsed').length > 0;
    });

    // filter out non-multiselectable rows
    var self = this;
    $rows = $rows.filter(function(i, e) {
        return (self.multiSelectableRowTypes.indexOf(e.attributes.rowtype.value) >= 0);
    });

    // flatten selectable node branches to get the ids in the visible page order disregarding nesting
    var flattened = $rows.map(function(i, e) { return e.id; }).toArray();

    // find index of start and end tabs
    var start = flattened.indexOf($fromRow.attr('id'));
    var end = flattened.indexOf($toRow.attr('id'));

    if (start == -1 || end == -1) {
        throw new Error('Could not find both start and end rows', $fromRow, $toRow);
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
    var self = this;
    range.forEach(function(e) {
        var $row = $rows.filter('#' + e);
        if (!self.multiSelection.is($row)) {
            self.multiSelection = self.multiSelection.add($row);
            self.addSelectionEffect($row);
        }
    });

    this.root.addClass('ftMultiselecting');

    return;
};

FancyTree.prototype.clearMultiSelection = function() {
    // remove visual selection effects
    var self = this;
    this.multiSelection.each(function(i, e) {
        var $e = $(e);
        // try {
            self.removeSelectionEffect($e);
        // }
        // catch (ex) { }
    });
    this.root.removeClass('ftMultiselecting');

    // reset multiSelection variables
    this.multiSelection = $();
    this.lastMultiSelectedFromId = null;
    this.lastMultiSelectedToId = null;
};

FancyTree.prototype.setMultiSelectedChildrenUnderRow = function($underRow, $newSelections, removalFilter) {
    var $oldSelections = this.multiSelection.filter(function(i, e) {
        return $(e).parents($underRow).length > 0;
    });

    var $removes = $oldSelections.not($newSelections);
    var $adds = $newSelections.not($oldSelections);

    if (removalFilter) {
        $removes = $removes.filter(removalFilter);
    }

    var self = this;
    $removes.each(function(i, e) { self.removeMultiSelectionSingle($(e)); });

    if ($adds.length == 1 && this.multiSelection.length == 0) {
        return;
    }

    $adds.each(function(i, e) { self.toggleMultiSelectionSingle($(e), true); });
}

FancyTree.prototype.addSelectionEffect = function($row) {
    var rowTypeParams = this.getRowTypeParams($row);
    if (!rowTypeParams.multiselectable) {
        return;
    }
    $row.addClass('ftSelected');
};

FancyTree.prototype.removeSelectionEffect = function($row) {
    $row.removeClass('ftSelected');
};