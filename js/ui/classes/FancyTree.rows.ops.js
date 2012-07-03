///////////////////////////////////////////////////////////
// FancyTree.rows.ops.js
// Basic operations on tree rows (get, add, remove, ...)
///////////////////////////////////////////////////////////

FancyTree.prototype.getRow = function(idOrElem) {
    if (idOrElem instanceof jQuery) {
        return idOrElem;
    }

    var elem = $('#' + idOrElem);
    // var elem = this.root.find('#' + idOrElem); // this method is ~5x slower

    if (elem.length == 0) {
        throw new Error('Could not find element with id ' + idOrElem);
    }

    return elem;
};

FancyTree.prototype.addRow = function(elem, parentId) {
    if (!parentId) {
        // When parentId is missing just add elem to the root level children
        this.root.children('.ftChildren').append(elem);
        return;
    }
    var parent = this.getRow(parentId);
    parent.children('.ftChildren').append(elem);
    this.updateRowExpander(parent);
    this.formatLineageTitles(parent);
};

FancyTree.prototype.removeRow = function(id, removeChildren, skipElementReconfiguration) {
    var elem = this.getRow(id);
    var parent = elem.parent().parent();

    // ensure button tooltips don't popup after the row is removed, after the tips' predelay
    this.getButtons(elem).each(function(i, e) {
        var tooltipData = $(e).data('tooltip');
        if (tooltipData) {
            tooltipData.onShow(function() { this.hide(); });
        }
    });

    if (removeChildren) {
        elem.remove();
    }
    else {
        elem.replaceWith(elem.children('.ftChildren').children());
    }

    this.hideTooltip();

    if (skipElementReconfiguration) {
        return;
    }

    this.updateRowExpander(parent);
    this.formatLineageTitles(parent);
};

FancyTree.prototype.moveRow = function(id, newParentId, beforeSiblingId, keepChildren, skipElementReconfiguration) {
    var elem = this.getRow(id);
    var oldParent = elem.parent().parent();

    var newParent;
    if (!newParentId) {
        newParent = this.root;
    }
    else {
        newParent = this.getRow(newParentId);
    }

    this.removeRow(id, keepChildren, true); // prevents possible DOM_HIERARCHY exceptions

    var newParentChildren = this.getChildrenContainer(newParent);
    var sibling;
    if (beforeSiblingId) {
        var beforeSibling = this.getRow(beforeSiblingId);
        sibling = newParentChildren.children('#' + beforeSibling.attr('id'));
        if (sibling.length == 0) {
            throw new Error('Could not find sibling ' + beforeSiblingId);
        }
        sibling.before(elem);
    }
    else {
        newParentChildren.append(elem);
    }

    if (!skipElementReconfiguration) {
        this.setRowButtonTooltips(elem);

        this.setDraggableDroppable(elem);

        this.updateRowExpander(oldParent);
        this.updateRowExpander(newParent);
        this.updateRowExpander(elem);

        this.formatLineageTitles(oldParent);
        this.formatLineageTitles(newParent);
    }

    return { row: elem, parent: newParent, beforeSibling: sibling, keepChildren: keepChildren };
};

FancyTree.prototype.updateRow = function(id, details) {
    var row = this.getRow(id);
    var innerRow = this.getInnerRow(row);

    row.attr(details);

    if (details.icon) {
        innerRow.children('.ftRowIcon').attr('src', details.icon);
    }

    this.getRowTypeParams(row).onFormatTitle(row);
};

FancyTree.prototype.focusRow = function(idOrElem) {
    var elem = this.getRow(idOrElem);
    var id = elem.attr('id');

    if (this.focusedRow == elem) {
        return;
    }

    if (this.focusedRow) {
        this.focusedRow.removeClass('ftFocused');
    }

    if (this.multiSelection.length > 0) {
        if (this.multiSelection.indexOf(id) == -1) {
            this.clearMultiSelection();
        }
    }
    this.lastMultiSelectedToId = id;
    this.lastMultiSelectedFromId = id;

    this.focusedRow = elem;
    elem.addClass('ftFocused');

    var innerRow = this.getInnerRow(elem);
    var scrollDistance = this.scrollDistanceRequired(innerRow, this.root, this.scrollTargetElem);
    if (scrollDistance) {
        var scrollParam = (scrollDistance > 0 ? '+' : '-') + '=' + (Math.abs(scrollDistance) + 2);
        this.scrollTargetElem.scrollTo(scrollParam, { duration: 200 });
    }
};

FancyTree.prototype.expandRow = function(id) {
    var thisObj = this;
    var row = this.getRow(id);
    var expanded = !(row.hasClass('ftCollapsed'));

    if (expanded) {
        return false;
    }

    var children = this.getChildrenContainer(row);
    var rowTypeParams = this.getRowTypeParams(row);
    var onExpanderClick = rowTypeParams.onExpanderClick;
    var onFormatTitle = rowTypeParams.onFormatTitle;

    children.slideDown(100, function() {
        row.removeClass('ftCollapsed');

        if (onExpanderClick) {
            var evt = { data: { treeObj: thisObj, row: row, expanded: !expanded } };
            onExpanderClick(evt);
        }
        onFormatTitle(row);
    });

    return true;
};

FancyTree.prototype.collapseRow = function(id) {
    var thisObj = this;
    var row = this.getRow(id);
    var expanded = !(row.hasClass('ftCollapsed'));

    if (!expanded) {
        return false;
    }

    var children = this.getChildrenContainer(row);
    var rowTypeParams = this.getRowTypeParams(row);
    var onExpanderClick = rowTypeParams.onExpanderClick;
    var onFormatTitle = rowTypeParams.onFormatTitle;

    children.slideUp(100, function() {
        row.addClass('ftCollapsed');

        if (onExpanderClick) {
            var evt = { data: { treeObj: thisObj, row: row, expanded: !expanded } };
            onExpanderClick(evt);
        }
        onFormatTitle(row);
    });

    return true;
};

/**
  * Toggles expanded/collapsed state of an element.
  * Calls the row's rowtype's onExpanderClick function, if defined.
  * @returns true if element is now expanded, false if now collapsed
  */
FancyTree.prototype.toggleExpandRow = function(id) {
    var thisObj = this;
    var row = this.getRow(id);
    var children = this.getChildrenContainer(row);
    var rowTypeParams = this.getRowTypeParams(row);
    var onExpanderClick = rowTypeParams.onExpanderClick;
    var onFormatTitle = rowTypeParams.onFormatTitle;

    var expanded = !(row.hasClass('ftCollapsed'));
    children.slideToggle(100, function() {
        if (expanded) {
            row.addClass('ftCollapsed');
        }
        else {
            row.removeClass('ftCollapsed');
        }

        if (onExpanderClick) {
            var evt = { data: { treeObj: thisObj, row: row, expanded: !expanded } };
            onExpanderClick(evt);
        }
        onFormatTitle(row);
    });

    return expanded;
};

FancyTree.prototype.mergeRows = function(fromId, toId) {
    var from = this.getRow(fromId);
    var to = this.getRow(toId);

    // Append from's children to the end of to's children
    to.append(this.getChildrenContainer(from).children());

    // Destroy from node
    from.remove();

    // Update stuffs
    this.updateRowExpander(to);
    this.formatLineageTitles(to);
};
