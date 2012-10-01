///////////////////////////////////////////////////////////
// FancyTree.events.body.js
// Body level event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.onBodyMouseUp = function(evt) {
    var treeObj = evt.data.treeObj;

    if ($(evt.target).parents().is(treeObj.root)) {
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


FancyTree.prototype.onBodyMouseWheel = function(evt) {
    var treeObj = evt.data.treeObj;

    if (!treeObj.clickOnMouseWheel) {
        return true;
    }

    if (!treeObj.focusedRow) {
        return true;
    }

    if (evt.ctrlKey || evt.shiftKey || treeObj.multiSelection > 1) {
        return true;
    }

    if (!treeObj.allowClickOnScrollSelector) {
        return true;
    }

    if (evt.originalEvent.wheelDeltaY < 0) {
        // scroll down
        var $toRow = treeObj.focusedRow.following(treeObj.allowClickOnScrollSelector);
    }
    else {
        // scroll up
        var $toRow = treeObj.focusedRow.preceding(treeObj.allowClickOnScrollSelector);
    }

    console.log($toRow);

    if ($toRow.length == 0) {
        return true;
    }

    var rowTypeParams = treeObj.getRowTypeParams($toRow);
    if (rowTypeParams.autofocusOnClick !== false) {
        // automatically set focus to clicked row
        treeObj.focusRow($toRow);
    }

    if (rowTypeParams.onClick) {
        // simulate left click
        var evtdata = evt.data;
        var onComplete = function() {
            evt.data = evtdata;
            evt.data.row = $toRow;
            rowTypeParams.onClick(evt);
        };
        treeObj.resetDragDropState(onComplete);
    }
    return false;
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
