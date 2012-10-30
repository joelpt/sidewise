///////////////////////////////////////////////////////////
// FancyTree.events.body.js
// Body level event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.onBodyMouseUp = function(evt) {
    var treeObj = evt.data.treeObj;
    var $target = $(evt.target);
    if ($target.parents().is(treeObj.root) && !$target.is('.ftBottomPadding')) {
        // over the tree
        return true;
    }

    if (treeObj.draggingJustCancelled) {
        treeObj.ignoreNextRowMouseUpEvent = false;
        treeObj.draggingJustCancelled = false;
    }

    treeObj.clearMultiSelection.call(treeObj);

    if (treeObj.contextMenuShown) {
        treeObj.disableContextMenu.call(treeObj);
        return false;
    }
    return true;
};

FancyTree.prototype.onBodyMouseLeave = function(evt) {
    evt.data.treeObj.hideTooltip.call(evt.data.treeObj);
};

FancyTree.prototype.onBodyMouseWheel = function(evt) {
    var treeObj = evt.data.treeObj;

    if (!treeObj.clickOnMouseWheel && !evt.shiftKey) {
        return true;
    }

    if (treeObj.clickOnMouseWheel && evt.altKey) {
        return true;
    }

    if (treeObj.clickOnMouseWheelIgnoring) {
        return false;
    }

    if (!treeObj.focusedRow) {
        return true;
    }

    if (treeObj.multiSelection.length > 1) {
        return true;
    }

    if (!treeObj.allowClickOnScrollSelector) {
        return true;
    }

    if (treeObj.scrollTargetElem.get(0).scrollHeight > treeObj.scrollTargetElem.height()) {
        // scrollbar is visible
        var rightEdge = 0.85 * (treeObj.scrollTargetElem.width()+treeObj.scrollTargetElem.offset().left) - 16;
        if (evt.originalEvent.pageX >= rightEdge) {
            // don't switch rows when scroll was performed in right 15% of the sidebar, just do a normal scroll
            return true;
        }
    }

    treeObj.hideTooltip();

    if (evt.originalEvent.wheelDelta < 0) {
        // scroll down
        var $toRow = treeObj.focusedRow.following(treeObj.allowClickOnScrollSelector);
        if ($toRow.length == 0) {
            // wrap around to top
            $toRow = treeObj.root.find('.ftRowNode[rowtype=page][hibernated=false]:first');
        }
    }
    else {
        // scroll up
        var $toRow = treeObj.focusedRow.preceding(treeObj.allowClickOnScrollSelector);
        if ($toRow.length == 0) {
            // wrap around to bottom
            $toRow = treeObj.root.find('.ftRowNode[rowtype=page][hibernated=false]:last');
        }
    }

    if ($toRow.length == 0) {
        return true;
    }

    treeObj.clickOnMouseWheelIgnoring = true;
    treeObj.clickOnMouseWheelTimer = setTimeout(function() {
        treeObj.clickOnMouseWheelIgnoring = false;
    }, 20);

    treeObj.bodyMouseWheelHandler.call(treeObj, evt, $toRow);
    return false;
};

FancyTree.prototype.bodyMouseWheelHandler = function(evt, $row) {
    var rowTypeParams = this.getRowTypeParams($row);
    if (rowTypeParams.autofocusOnClick !== false) {
        // automatically set focus to clicked row
        this.focusRow($row);
    }

    if (rowTypeParams.onClick) {
        // simulate left click
        var evtdata = evt.data;
        var onComplete = function() {
            evt.data = evtdata;
            evt.data.row = $row;
            evt.data.clickedViaScroll = true;
            rowTypeParams.onClick(evt);
        };
        this.resetDragDropState(onComplete);
    }
};

FancyTree.prototype.onDocumentKeyDown = function(evt) {
    var treeObj = evt.data.treeObj;
    // console.log(evt.keyCode, evt);

    if (treeObj.filterBoxShown && evt.keyCode == 70 && evt.ctrlKey) { // Ctrl+F
        // focus filter box
        treeObj.filterElem.children('.ftFilterInput').focus();
        return false;
    }

    if (evt.keyCode == 27) { // Esc
        if (treeObj.filterBoxShown) {
            // clear filter box
            treeObj.filterElem.children('.ftFilterInput').val('').trigger('keyup');
            treeObj.filtering = false;
            if (treeObj.filterElem.children('.ftFilterInput').is(':focus')) {
                treeObj.filterElem.children('.ftFilterInput').blur();
                return true;
            }
        }

        // close context menu
        if (treeObj.contextMenuShown) {
            treeObj.disableContextMenu.call(treeObj);
        }

        if (treeObj.dragging) {
            treeObj.ignoreNextRowMouseUpEvent = true;
            treeObj.resetDragDropState();
        }
        return false;
    }

    if (evt.ctrlKey || evt.altKey) {
        return true;
    }

    if (treeObj.filterBoxShown && evt.keyCode >= 48 && evt.keyCode <= 90) {
        if (treeObj.filterElem.children('.ftFilterInput').is(':focus')) {
            return true;
        }
        // focus filter box
        setTimeout(function() {
            treeObj.filterElem.children('.ftFilterInput')
                .focus()
                .val(String.fromCharCode(evt.keyCode).toLowerCase());
        }, 5);
        return true;
    }

    return true;
};
