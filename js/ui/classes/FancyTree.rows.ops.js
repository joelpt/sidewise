///////////////////////////////////////////////////////////
// FancyTree.rows.ops.js
// Basic operations on tree rows (get, add, remove, ...)
///////////////////////////////////////////////////////////

FancyTree.prototype.getRow = function(idOrElem) {
    if (idOrElem instanceof jQuery) {
        return idOrElem;
    }

    var $row = $('#' + idOrElem);
    // var elem = this.root.find('#' + idOrElem); // this method is ~5x slower but 'safer'

    if ($row.length == 0) {
        throw new Error('Could not find element with id ' + idOrElem);
    }

    return $row;
};

FancyTree.prototype.addRow = function($row, parentId, beforeSiblingId) {
    var $parent;
    if (beforeSiblingId) {
        var $beforeSibling = this.getRow(beforeSiblingId);
        $beforeSibling.before($row);
        $parent = $beforeSibling.parent();
    }
    else {
        if (parentId) {
            $parent = this.getRow(parentId);
        }
        else {
            $parent = this.root;
        }
        $parent.children('.ftChildren').append($row);
    }

    this.updateRowExpander($parent);
    this.formatLineageTitles($parent);
};

FancyTree.prototype.removeRow = function(id, removeChildren, skipRowReconfiguration, skipRemoveFromMultiSelection) {
    var $row = this.getRow(id);
    var $parent = $row.parent().parent();

    // ensure button tooltips don't popup after the row is removed, after the tips' predelay
    this.getButtons($row).each(function(i, e) {
        var tooltipData = $(e).data('tooltip');
        if (tooltipData) {
            tooltipData.onShow(function() { this.hide(); });
        }
    });

    if (removeChildren) {
        var self = this;
        $row.find('.ftRowNode').each(function(i, e) {
            self.removeMultiSelectionSingle($(e));
        });
        $row.remove();
    }
    else {
        $row.replaceWith($row.children('.ftChildren').children());
    }

    if (!skipRemoveFromMultiSelection) {
        this.removeMultiSelectionSingle($row);
    }

    this.hideTooltip();

    if (skipRowReconfiguration === true) {
        return;
    }

    this.updateRowExpander($parent);
    this.formatLineageTitles($parent);
};

FancyTree.prototype.moveRow = function(id, newParentId, beforeSiblingId, keepChildren, skipRowReconfiguration) {
    var $row = this.getRow(id);
    var $oldParent = $row.parent().parent();
    var $oldAncestors = $row.parents('.ftRowNode');

    var $newParent;
    if (!newParentId) {
        $newParent = this.root;
    }
    else {
        $newParent = this.getRow(newParentId);
    }

    this.removeRow(id, keepChildren, true, true); // prevents possible DOM_HIERARCHY exceptions

    var $newParentChildren = this.getChildrenContainer($newParent);
    var $sibling;
    if (beforeSiblingId) {
        var beforeSibling = this.getRow(beforeSiblingId);
        $sibling = $newParentChildren.children('#' + beforeSibling.attr('id'));
        if ($sibling.length == 0) {
            throw new Error('Could not find sibling ' + beforeSiblingId);
        }
        $sibling.before($row);
    }
    else {
        $newParentChildren.append($row);
    }

    if (!skipRowReconfiguration) {
        this.setRowButtonTooltips($row);
        this.setDraggableDroppable($row);

        if (keepChildren) {
            var self = this;
            $row.find('.ftRowNode').each(function(i, e) {
                self.setDraggableDroppable($(e));
            });
        }

        this.updateRowExpander($oldParent);
        this.updateRowExpander($newParent);
        this.updateRowExpander($row);

        this.formatLineageTitles($oldParent);
        this.formatLineageTitles($newParent);
    }

    return { row: $row, parent: $newParent, beforeSibling: $sibling, keepChildren: keepChildren, oldAncestors: $oldAncestors };
};

FancyTree.prototype.moveRowRel = function(id, relation, toId, keepChildren, skipRowReconfiguration) {
    var $row = this.getRow(id);
    if (!$row) {
        throw new Error('Could not find row to move with id ' + JSON.stringify(id));
    }
    var $to = this.getRow(toId);
    if (!$to) {
        throw new Error('Could find row to move to with toId ' + JSON.stringify(toId));
    }

    var $oldParent = this.getParentRowNode($row.parent());
    var $oldAncestors = $row.parents('.ftRowNode');

    this.removeRow($row, keepChildren, true, true); // prevents possible DOM_HIERARCHY exceptions

    if (relation == 'before') {
        $to.before($row);
    }
    else if (relation == 'after') {
        $to.after($row);
    }
    else if (relation == 'prepend') {
        $to.children('.ftChildren').prepend($row);
    }
    else if (relation == 'append') {
        $to.children('.ftChildren').append($row);
    }
    else {
        throw new Error('Unrecognized relation ' + relation);
    }

    var $newParent = this.getParentRowNode($row.parent());
    var $newBeforeSibling = $row.prev();
    var $newAfterSibling = $row.next();

    if ($newBeforeSibling.length == 0) {
        $newBeforeSibling = undefined;
    }

    if ($newAfterSibling.length == 0) {
        $newAfterSibling = undefined;
    }

    if (!skipRowReconfiguration) {
        this.setRowButtonTooltips($row);
        this.setDraggableDroppable($row);

        this.updateRowExpander($oldParent);
        this.updateRowExpander($newParent);
        this.updateRowExpander($row);

        this.formatLineageTitles($oldParent);
        this.formatLineageTitles($newParent);
    }

    return {
        $row: $row,
        relation: relation,
        $to: $to,
        $newParent: $newParent,
        $newBeforeSibling: $newBeforeSibling,
        $newAfterSibling: $newAfterSibling,
        $oldAncestors: $oldAncestors,
        keepChildren: keepChildren,
        staticMove: false
    };
};

FancyTree.prototype.updateRow = function(id, details) {
    var $row = this.getRow(id);
    var $innerRow = this.getInnerRow($row);

    $row.attr(details);

    if (details.icon) {
        $innerRow.children('.ftRowIcon').attr('src', details.icon);
    }

    this.getRowTypeParams($row).onFormatTitle($row);
};

FancyTree.prototype.focusRow = function(idOrElem) {
    var $row = this.getRow(idOrElem);
    var id = $row.attr('id');

    if (this.focusedRow == $row) {
        return;
    }

    if (this.focusedRow) {
        this.focusedRow.removeClass('ftFocused');
        this.root.find('.ftChildFocused').removeClass('ftChildFocused');
    }

    // if (this.multiSelection.length > 0) {
    //     this.clearMultiSelection();
    // }

    this.lastMultiSelectedToId = id;
    this.lastMultiSelectedFromId = id;

    this.focusedRow = $row;
    $row.addClass('ftFocused');
    $row.parents('.ftRowNode').addClass('ftChildFocused');

    var $innerRow = this.getInnerRow($row);

    if (this.scrollToRowTimeout) {
        clearTimeout(this.scrollToRowTimeout);
    }

    var self = this;
    var scrollDistance = self.scrollDistanceRequired($innerRow, self.root, self.scrollTargetElem);
    if (scrollDistance) {
        var scrollParam = (scrollDistance > 0 ? '+' : '-') + '=' + (Math.abs(scrollDistance) + 2);
        self.scrollTargetElem.scrollTo(scrollParam, { duration: 0 });
    }
};

FancyTree.prototype.expandRow = function(id) {
    var self = this;
    var $row = this.getRow(id);
    var expanded = !($row.hasClass('ftCollapsed'));

    if (expanded) {
        return false;
    }

    var $children = this.getChildrenContainer($row);
    var rowTypeParams = this.getRowTypeParams($row);
    var onExpanderClick = rowTypeParams.onExpanderClick;
    var onFormatTitle = rowTypeParams.onFormatTitle;

    $children.slideDown(100, function() {
        $row.removeClass('ftCollapsed');

        if (onExpanderClick) {
            var evt = { data: { treeObj: self, row: $row, expanded: !expanded } };
            onExpanderClick(evt);
        }
        onFormatTitle($row);
    });

    return true;
};

FancyTree.prototype.collapseRow = function(id) {
    var self = this;
    var $row = this.getRow(id);
    var expanded = !($row.hasClass('ftCollapsed'));

    if (!expanded) {
        return false;
    }

    var $children = this.getChildrenContainer($row);
    var rowTypeParams = this.getRowTypeParams($row);
    var onExpanderClick = rowTypeParams.onExpanderClick;
    var onFormatTitle = rowTypeParams.onFormatTitle;

    $children.slideUp(100, function() {
        $row.addClass('ftCollapsed');

        if (onExpanderClick) {
            var evt = { data: { treeObj: self, row: $row, expanded: !expanded } };
            onExpanderClick(evt);
        }
        onFormatTitle($row);
    });

    return true;
};

/**
  * Toggles expanded/collapsed state of an element.
  * Calls the row's rowtype's onExpanderClick function, if defined.
  * @returns true if element is now expanded, false if now collapsed
  */
FancyTree.prototype.toggleExpandRow = function(id) {
    var self = this;
    var $row = this.getRow(id);
    var $children = this.getChildrenContainer($row);
    var rowTypeParams = this.getRowTypeParams($row);
    var onExpanderClick = rowTypeParams.onExpanderClick;
    var onFormatTitle = rowTypeParams.onFormatTitle;

    var expanded = !($row.hasClass('ftCollapsed'));
    $children.slideToggle(100, function() {
        if (expanded) {
            $row.addClass('ftCollapsed');
        }
        else {
            $row.removeClass('ftCollapsed');
        }

        if (onExpanderClick) {
            var evt = { data: { treeObj: self, row: $row, expanded: !expanded } };
            onExpanderClick(evt);
        }
        onFormatTitle($row);
    });

    return expanded;
};

FancyTree.prototype.mergeRows = function(fromId, toId) {
    var $from = this.getRow(fromId);
    var $to = this.getRow(toId);

    // Append from's children to the end of to's children
    $to.append(this.getChildrenContainer($from).children());

    // Destroy from node
    $from.remove();

    // Update stuffs
    this.updateRowExpander($to);
    this.formatLineageTitles($to);
};
