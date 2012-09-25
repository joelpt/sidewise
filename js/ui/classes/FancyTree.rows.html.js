///////////////////////////////////////////////////////////
// FancyTree.rows.html.js
// Row element HTML creation, retrieval
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Row HTML element retrieval
///////////////////////////////////////////////////////////

FancyTree.prototype.getParentRowNode = function(elem) {
    return elem.closest('.ftRowNode');
};

FancyTree.prototype.getItemRow = function(elem) {
    return elem.children('.ftItemRow');
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
    var itemTextAffix = $('<div/>', { class: 'ftItemTextAffix' }).hide();
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
            class: 'ftIconButton ftButton__' + rowType + '_' + buttonSpec.id,
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
        .append(itemText)
        .append(itemTextAffix);

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
    var itemRow = this.getItemRow(row);
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

    // set draggable and droppable
    this.setDraggableDroppable(row, rowTypeParams);

    return row;
};
