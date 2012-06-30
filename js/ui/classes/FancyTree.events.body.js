///////////////////////////////////////////////////////////
// FancyTree.events.body.js
// Body level event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.onBodyMouseUp = function(evt) {
    var treeObj = evt.data.treeObj;
    if ($(evt.target).parents().is(treeObj.root)) {
        return true;
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

        return false;
    }
    return true;
};
