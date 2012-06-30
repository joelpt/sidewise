///////////////////////////////////////////////////////////
// FancyTree.rows.js
// Row element handling functionality
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Row HTML element retrieval
///////////////////////////////////////////////////////////

FancyTree.prototype.getParentRowNode = function(elem) {
    return elem.closest('.ftRowNode');
};

FancyTree.prototype.getItemRowContent = function(elem) {
    return elem.children('.ftItemRow').children('.ftItemRowContent');
};

FancyTree.prototype.getInnerRow = function(elem) {
    return this.getItemRowContent(elem).children('.ftInnerRow');
};

FancyTree.prototype.getButtons = function(elem) {
    return this.getItemRowContent(elem).children('.ftButtons').children();
};

FancyTree.prototype.getChildrenContainer = function(elem) {
    return elem.children('.ftChildren');
};

FancyTree.prototype.getChildrenCount = function(elem) {
    return this.getChildrenContainer(elem).find('.ftRowNode').length;
};


///////////////////////////////////////////////////////////
// Row HTML element construction
///////////////////////////////////////////////////////////

// construct an empty HTML element for a given rowType
FancyTree.prototype.buildRowTypeElem = function(rowType) {
    var params = this.rowTypes[rowType];

    // create elements
    var rowContainer = $('<li/>', { rowtype: rowType, class: 'ftRowNode' });
    var itemRow = $('<div/>', { class: 'ftItemRow' });
    var expander = $('<img/>', { class: 'ftIconButton ftTreeControl ftNode', src: '/images/x.gif' });
    var itemRowContent = $('<div/>', { class: 'ftItemRowContent' });
    var innerRow = $('<div/>', { class: 'ftInnerRow' });
    var icon = $('<img/>', { class: 'ftIconButton ftRowIcon', src: icon });
    var itemText = $('<div/>', { class: 'ftItemText' });
    var itemLabel = $('<span/>', { class: 'ftItemLabel' });
    var itemInnerTitle = $('<span/>', { class: 'ftItemTitle' });
    var buttons = $('<div/>', { class: 'ftButtons' });
    var children = $('<ul/>', { class: 'ftChildren' });

    // set iconerror handler
    if (params.onIconError) {
        icon.error({ treeObj: this }, function(evt) {
            evt.data.row = evt.data.treeObj.getParentRowNode($(this));
            params.onIconError(evt);
        });
    }

    // build buttons
    for (var i in params.buttons) {
        var buttonSpec = params.buttons[i];
        var button = $('<img>', {
            class: 'ftIconButton ftButton__' + rowType + '_' + i,
            src: buttonSpec.icon,
            tooltip: buttonSpec.tooltip
        });
        buttons.append(button);
    }

    // construction
    itemText
        .append(itemLabel)
        .append(itemInnerTitle);

    innerRow
        .append(icon)
        .append(itemText);

    itemRowContent
        .append(innerRow)
        .append(buttons);

    itemRow
        .append(expander)
        .append(itemRowContent);

    rowContainer
        .append(itemRow)
        .append(children);

    return rowContainer;
};

// clone a new rowType's baseElement and populate it with the provided arguments
FancyTree.prototype.getNewRowElem = function(rowType, id, icon, label, text, extraAttributes, collapsed) {
    var rowTypeParams = this.rowTypes[rowType];
    var row = rowTypeParams.baseElement.clone(true, true);
    var innerRow = this.getInnerRow(row);
    var iconElem = innerRow.find('.ftRowIcon');

    row
        .attr('id', id)
        .attr('label', label)
        .attr('text', text)
        .attr('icon', icon);

    // set row's icon
    iconElem.attr('src', icon);

    // set collapsed state
    if (collapsed) {
        row.addClass('ftCollapsed');
    }

    // add extra attribs
    if (extraAttributes) {
        row.attr(extraAttributes);
    }

    // format title
    rowTypeParams.onFormatTitle(row, innerRow.children('.ftItemText'));

    // configure row button tooltips
    this.setRowButtonTooltips(row);

    // configure drag & drop
    if (rowTypeParams.draggableParams) {
        innerRow.draggable(rowTypeParams.draggableParams);
    }

    if (rowTypeParams.droppableParams) {
        innerRow.droppable(rowTypeParams.droppableParams);
    }

    return row;
};


///////////////////////////////////////////////////////////
// Row helper functions
///////////////////////////////////////////////////////////

FancyTree.prototype.setRowButtonTooltips = function(row) {
    var rowType = row.attr('rowtype');
    var buttons = this.getButtons(row);

    buttons.each(function(i, e) {
        var $e = $(e);
        $e.attr('title', $e.attr('tooltip'));
    });

    buttons.tooltip(this.rowButtonTooltipParams);
};

FancyTree.prototype.updateRowExpander = function(row) {
    var cnt = row.find('.ftChildren').children().length;
    var expander = row.children('.ftItemRow').children('.ftTreeControl');

    if (cnt == 0) {
        expander.removeClass('ftExpander').addClass('ftNode');
        row.removeClass('ftCollapsed');
        return;
    }

    expander.removeClass('ftNode').addClass('ftExpander');
};

// Call rowType.onFormatTitle() on the given row and all its parent rows
FancyTree.prototype.formatLineageTitles = function(row) {
    var thisObj = this;
    row.parents('.ftRowNode').add(row).each(function(i, e) {
        var $e = $(e);
        var rowTypeParams = thisObj.getRowTypeParams($e);
        if (rowTypeParams && rowTypeParams.onFormatTitle) {
            rowTypeParams.onFormatTitle($e);
        }
    });
};
