///////////////////////////////////////////////////////////
// FancyTree.events.rowClick.js
// Row click-event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.rowMouseDownHandler = function(evt) {
    if (evt.data.onMiddleClick && evt.which == 2) {
        // middle click
        return false; // eat middle click event to avoid the autoscroll cursor
    }
};

FancyTree.prototype.rowMouseUpHandler = function(evt) {
    var treeObj = evt.data.treeObj;

    if (treeObj.dragging) {
        return;
    }

    if (treeObj.ignoreNextRowMouseUpEvent) {
        // When rowButtonClickHandler fires, it sets this to true, and rowMouseUpHandler
        // gets called immediately after; this prevents us from performing the row-click
        // behavior immediately after clicking a row button, while still allowing for
        // event propagation to occur (important for drag & drop to receive all mouseup events)
        treeObj.ignoreNextRowMouseUpEvent = false;
        return;
    }

    var $this = $(this);
    var row = treeObj.getParentRowNode($this);
    evt.data.row = row;

    // hide any visible tooltips
    treeObj.hideTooltip();

    // middle click
    if (evt.which == 2) {
        if (evt.data.onMiddleClick) {
            if (treeObj.contextMenuShown) {
                treeObj.disableContextMenu.call(treeObj);
            }

            // handle middle click
            evt.data.onMiddleClick(evt);
        }
        return;
    }

    // left click
    if (evt.which == 1) {
        if (evt.ctrlKey || evt.shiftKey) {
            if (treeObj.contextMenuShown) {
                treeObj.disableContextMenu.call(treeObj);
            }

            // we got a left click and ctrl or shift was held down
            treeObj.rowMultiSelectionClickHandler(evt);
            return;
        }

        // regular left click (no modifier keys)
        if (treeObj.contextMenuShown) {
            treeObj.clearMultiSelection.call(treeObj);
            treeObj.disableContextMenu.call(treeObj);
        }

        // clear existing multiselection if any
        treeObj.clearMultiSelection();

        if (evt.data.autofocusOnClick !== false) {
            // automatically set focus to clicked row
            treeObj.focusRow(row);
        }

        if (evt.data.onClick) {
            // handle left click
            var evtdata = evt.data;
            var onComplete = function() {
                evt.data = evtdata;
                evt.data.onClick(evt);
            };
            treeObj.resetDragDropState(onComplete);
        }

        return;
    }
};

FancyTree.prototype.rowMultiSelectionClickHandler = function(evt) {
    if (evt.data.multiselectable === false) {
        // cannot multiselect this type of row
        return;
    }

    var row = evt.data.row;
    var treeObj = evt.data.treeObj;
    var focusedId = treeObj.focusedRow.attr('id');
    var fromId = treeObj.lastMultiSelectedToId || focusedId;
    var id = row.attr('id');

    var $fromRow = treeObj.getRow(fromId);
    var $toRow = treeObj.getRow(id);

    if (evt.ctrlKey) {
        treeObj.lastMultiSelectedFromId = null; // prevent shift+selection from expanding selection chain
        if (evt.shiftKey) {
            // Ctrl+Shift: Incrementally add spanned range of rows to current multiselection
            treeObj.addMultiSelectionBetween($fromRow, $toRow);
        }
        else {
            // Ctrl: Un/select a single row

            // Do we have any multiselection yet? If not, add the current focused id
            // in addition to the ctrl+clicked row
            if (treeObj.multiSelection.length == 0) {
                // Don't support ctrl+clicking the currently focused row if nothing
                // else is selected
                if (focusedId == id) {
                    return;
                }
                // turn on selection of focused row
                treeObj.toggleMultiSelectionSingle(treeObj.focusedRow);
            }
            // toggle selection ctrl+clicked row
            treeObj.toggleMultiSelectionSingle($toRow);
        }
        treeObj.lastMultiSelectedToId = id;
        return;
    }

    if (evt.shiftKey && fromId) {
        if (!treeObj.lastMultiSelectedFromId) {
            // if this isn't a continuation of a previous shift+select,
            // clear selection first
            treeObj.clearMultiSelection();
        }
        // select range of rows
        treeObj.addMultiSelectionBetween($fromRow, $toRow);
        treeObj.lastMultiSelectedFromId = fromId;
        treeObj.lastMultiSelectedToId = id;
        return;
    }
};

FancyTree.prototype.rowDoubleClickHandler = function(evt) {
    if (evt.which != 1) {
        // not the left mouse button
        return;
    }

    if (evt.ctrlKey || evt.shiftKey) {
        // don't perform double click actions when ctrl/shift selecting
        return;
    }

    var treeObj = evt.data.treeObj;

    if (treeObj.ignoreDoubleClickEvent) {
        return;
    }

    var $this = $(this);
    var row = treeObj.getParentRowNode($this);

    treeObj.hideTooltip();

    evt.data.row = row;
    evt.data.onDoubleClick(evt);
};

FancyTree.prototype.rowButtonClickHandler = function(evt) {
    var treeObj = evt.data.treeObj;

    if (treeObj.contextMenuShown) {
        treeObj.disableContextMenu.call(treeObj);
    }

    if (evt.which != 1) {
        return;
    }

    if (treeObj.multiSelection.length > 0) {
        treeObj.clearMultiSelection();
    }

    $('#ftSimpleTip').hide();
    evt.data.row = $(this).closest('.ftRowNode');
    evt.data.onClick(evt);

    treeObj.ignoreNextRowMouseUpEvent = true;
    treeObj.resetDragDropState();
    treeObj.ignoreDoubleClickEvent = true;

    if (treeObj.ignoreDoubleClickEventResetTimer) {
        clearTimeout(treeObj.ignoreDoubleClickEventResetTimer);
    }

    treeObj.ignoreDoubleClickEventResetTimer = setTimeout(function() { treeObj.ignoreDoubleClickEvent = false; }, 500);
};
