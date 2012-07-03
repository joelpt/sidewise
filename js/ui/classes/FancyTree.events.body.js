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

FancyTree.prototype.onBodyKeyDown = function(evt) {
    var treeObj = evt.data.treeObj;

    if (evt.keyCode == 70 && evt.ctrlKey) { // Ctrl+F
        // focus filter box
        treeObj.filterElem.children('.ftFilterInput').focus();
        return false;
    }
    if (evt.keyCode == 27) { // Esc
        // clear filter box
        treeObj.filterElem.children('.ftFilterInput').val('').trigger('keyup');
        treeObj.filtering = false;

        // close context menu
        if (treeObj.contextMenuShown) {
            treeObj.disableContextMenu.call(treeObj);
        }

        if (treeObj.dragging) {
            // debugger;
            // console.log(document.elementFromPoint(evt.clientX, evt.clientY));
            // TODO move this stuff into a new func FT.resetDragState();
            treeObj.dragToreOffParent = false;
            treeObj.canAcceptDropTo = false;
            treeObj.draggingRow = null;
            treeObj.draggingOverRow = null;
            treeObj.dragging = false;
            treeObj.draggingJustCancelled = true;
            treeObj.ignoreNextRowMouseUpEvent = true;
            $('.ui-draggable-dragging')
                .trigger('mouseup');
        }
        return false;
    }
    return true;
};
