///////////////////////////////////////////////////////////
// FancyTree.events.row.js
// General row-level event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.onTooltipMouseOver = function(evt) {
    $(this).hide();
};

FancyTree.prototype.onExpanderClick = function(evt) {
    var treeObj = evt.data.treeObj;

    if (treeObj.contextMenuShown) {
        treeObj.disableContextMenu.call(treeObj);
        return false;
    }
    treeObj.hideTooltip();

    var expander = $(this);
    var parentLI = expander.closest('.ftRowNode');
    treeObj.toggleExpandRow(parentLI);
    evt.stopPropagation();
};

FancyTree.prototype.onMouseEnterButtons = function(evt) {
    var treeObj = evt.data.treeObj;
    treeObj.handleHideTooltipEvent(evt);
};

FancyTree.prototype.onMouseLeaveButtons = function(evt) {
    var treeObj = evt.data.treeObj;
    var row = evt.data.treeObj.getParentRowNode($(this));
    treeObj.startTooltipTimer(row, evt);
};

FancyTree.prototype.onItemRowMouseEnter = function(evt) {
    var treeObj = evt.data.treeObj;
    var row = treeObj.getParentRowNode($(this));

    treeObj.getButtons(row).parent().show();
    treeObj.hoveredRow = row;
    treeObj.startTooltipTimer(row, evt);
};

FancyTree.prototype.onItemRowMouseLeave = function(evt) {
    var treeObj = evt.data.treeObj;
    var row = treeObj.getParentRowNode($(this));

    treeObj.getButtons(row).parent().hide();
    treeObj.hoveredRow = null;
    treeObj.handleHideTooltipEvent(evt);
};

FancyTree.prototype.defaultFormatTitleHandler = function(row, itemTextElem) {
    var label = row.attr('label');
    var text = row.attr('text');

    itemTextElem.children('.ftItemTitle').text(text);

    if (label) {
        itemTextElem.children('.ftItemLabel').text(label + (text ? ': ' : ''));
    }
};