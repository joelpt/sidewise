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
    var rowTypeParams = treeObj.getRowTypeParams(row);
    var buttons = treeObj.getButtons(row);

    if (rowTypeParams.onShowButtons) {
        var show = rowTypeParams.onShowButtons(row, rowTypeParams.buttons);
        var showClasses = show.map(function(e) { return '.ftButton__' + rowTypeParams.name + '_' + e.id; }).join(',');
        buttons.filter(showClasses).show();
        buttons.not(showClasses).hide();
    }

    buttons.parent().show();
    treeObj.getInnerRow(row).children('.ftItemTextAffix').hide();
    treeObj.hoveredRow = row;
    treeObj.startTooltipTimer(row, evt);

    if (treeObj.clickOnHoverDelayMs >= 0 && rowTypeParams.allowClickOnHover) {
        if (treeObj.clickOnHoverTimer) {
            clearTimeout(treeObj.clickOnHoverTimer);
        }

        treeObj.clickOnHoverTimer = setTimeout(function() {
            if (evt.shiftKey || evt.ctrlKey || treeObj.contextMenuShown || treeObj.multiSelection.length > 1) {
                return;
            }

            if (evt.data.autofocusOnClick !== false) {
                // automatically set focus to clicked row
                treeObj.focusRow(row);
            }

            if (rowTypeParams.onClick) {
                // handle left click
                var evtdata = evt.data;
                var onComplete = function() {
                    evt.data = evtdata;
                    evt.data.row = row;
                    evt.data.clickedViaHover = true;
                    rowTypeParams.onClick(evt);
                };
                treeObj.resetDragDropState(onComplete);
            }

        }, treeObj.clickOnHoverDelayMs);
    }
};

FancyTree.prototype.onItemRowMouseLeave = function(evt) {
    var treeObj = evt.data.treeObj;
    var row = treeObj.getParentRowNode($(this));

    treeObj.getButtons(row).parent().hide();

    var itemTextAffix = treeObj.getInnerRow(row).children('.ftItemTextAffix');
    if (itemTextAffix.html()) {
        itemTextAffix.show();
    }

    treeObj.hoveredRow = null;
    treeObj.handleHideTooltipEvent(evt);

    if (treeObj.clickOnHoverTimer) {
        clearTimeout(treeObj.clickOnHoverTimer);
    }
};

FancyTree.prototype.defaultFormatTitleHandler = function(row, itemTextElem) {
    var label = row.attr('label');
    var text = row.attr('text');

    itemTextElem.children('.ftItemTitle').text(text);

    if (label) {
        itemTextElem.children('.ftItemLabel').text(label + (text ? ': ' : ''));
    }
};