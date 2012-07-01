///////////////////////////////////////////////////////////
// FancyTree.dragDrop.js
// Stuff to assist with drag and drop.
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var DRAG_TO_ABOVE_SENSITIVITY_RATIO = 0.34;
var DRAG_TO_BELOW_SENSITIVITY_RATIO = 0.66;


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

FancyTree.prototype.onItemRowMouseMove = function(evt) {
    var treeObj = evt.data.treeObj;

    if (!treeObj.dragging) {
        return;
    }

    console.log(evt.target.className);
    var over = $(evt.target);
    var overRow = treeObj.getParentRowNode(over);
    var draggingParams = treeObj.getRowTypeParams(treeObj.draggingRow);
    var allowedDropTargets = draggingParams.allowedDropTargets;
    var draggingToRowType = overRow.attr('rowtype');

    $('.ftDragToChild').removeClass('ftDragToChild');
    $('.ftDragAbove').removeClass('ftDragAbove');
    $('.ftDragBelow').removeClass('ftDragBelow');
    $('.ftDragAboveParent').removeClass('ftDragAboveParent');

    // TODO make this smarter re: sibling drops vs child drops
    var canAcceptDropTo = (allowedDropTargets.indexOf(draggingToRowType) >= 0 && !(overRow.is(treeObj.draggingRow)) );

    if (!canAcceptDropTo) {
        return;
    }

    treeObj.canAcceptDropTo = true;
    treeObj.draggingOverRow = overRow;

    var overItemRow = treeObj.getItemRow(overRow);
    var overItemRowContent = treeObj.getItemRowContent(overRow);
    //console.log(evt.pageX + ', ' + evt.pageY + ' .. ');
    //console.log(overRow.attr('id'));
    //console.log(over.position().left + ', ' + over.position().top);
    // var isOnLowerHalf = ( (topDelta / rowHeight) > dragToChildSensitivityRatio );
    // draggingToNext = !isOnLowerHalf;
    var rowHeight = overItemRow.height();
    var topDelta = evt.pageY - overItemRow.offset().top;
    var draggingTo;
    var dragInsertBarTarget;
    var deltaPct = topDelta / rowHeight;
    var children = treeObj.getChildrenContainer(overRow).children();
    var isCollapsed = overRow.hasClass('ftCollapsed');
    var underRoot = overRow.parent().parent().hasClass('ftRoot');

    if (deltaPct <= DRAG_TO_ABOVE_SENSITIVITY_RATIO) {
        // to above position
        console.log('my container is root', underRoot);
        if (underRoot && draggingParams.allowAtTopLevel && allowedDropTargets.indexOf('ROOT') >= 0) {
            draggingTo = 'A';
            dragInsertBarTarget = overItemRow;
            treeObj.drawDragInsertBar.call(treeObj, 'A', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
        }
        else if (!underRoot || (draggingParams.allowAtTopLevel
            && allowedDropTargets.indexOf('ROOT') >= 0))
        {
            draggingTo = 'A';
            dragInsertBarTarget = overItemRowContent;
            treeObj.drawDragInsertBar.call(treeObj, 'A', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
        }
        else if (!underRoot && !(draggingParams.allowAtChildLevel)) {
            hideDragInsertBar();
            return;
        }
        else if (children.length == 0 || isCollapsed) {
            // to child (within)
            draggingTo = 'C';
            dragInsertBarTarget = overItemRowContent;
            overRow.addClass('ftDragToChild');
            treeObj.hideDragInsertBar.call(treeObj);
        }
        else {
            draggingTo = 'B';
            dragInsertBarTarget = overItemRowContent;
            treeObj.drawDragInsertBar.call(treeObj, 'B', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
        }
    }
    else if (underRoot && !(draggingParams.allowAtChildLevel)) {
        draggingTo = 'A';
        dragInsertBarTarget = overItemRow;
        treeObj.drawDragInsertBar.call(treeObj, 'A', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
    }
    else if (deltaPct >= DRAG_TO_BELOW_SENSITIVITY_RATIO) {
        // to below position
        if (children.length > 0 && isCollapsed) {
            // to child (within)
            draggingTo = 'C';
            dragInsertBarTarget = overItemRowContent;
            overRow.addClass('ftDragToChild');
            treeObj.hideDragInsertBar.call(treeObj);
        }
        else if (children.length > 0 && !isCollapsed)
        {
            // insert below hovered row, but show insert bar as above
            // first child of hovered row
            draggingTo = 'B';
            dragInsertBarTarget = treeObj.getItemRowContent(children.first());
            treeObj.drawDragInsertBar.call(treeObj, 'A', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
        }
        else {
            // insert below hovered row (as sibling)
            draggingTo = 'B';
            dragInsertBarTarget = overItemRowContent;
            treeObj.drawDragInsertBar.call(treeObj, 'B', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
        }
    }
    else {
        if (children.length > 0 && !isCollapsed) {
            draggingTo = 'B';
            dragInsertBarTarget = treeObj.getItemRowContent(children.first());
            treeObj.drawDragInsertBar.call(treeObj, 'A', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
        }
        else {
            // to child (within)
            draggingTo = 'C';
            dragInsertBarTarget = overItemRowContent;
            overRow.addClass('ftDragToChild');
            treeObj.hideDragInsertBar.call(treeObj);
        }
    }

    treeObj.draggingTo = draggingTo;
};


FancyTree.prototype.drawDragInsertBar = function(dragToPosition, targetElem, targetRowType) {
    var offset = targetElem.offset();
    var left = offset.left;
    var top = offset.top;
    var width = targetElem.width();
    var height = targetElem.height();
    console.log(dragToPosition, left, top, width, height, targetElem, targetRowType);
    switch (dragToPosition) {
        case 'A':
            this.drawDragInsertBarAt(targetRowType, left, top - 1, width, 0);
            break;
        case 'B':
            this.drawDragInsertBarAt(targetRowType, left, top + height + 3, width, 0);
            break;
    }
};

FancyTree.prototype.drawDragInsertBarAt = function(targetRowType, left, top, width, height) {
    var bar = $('#ftDragInsertBar');
    bar.attr('targetrowtype', targetRowType);
    if (bar.length == 0) {
        bar = $('<div/>', { id: 'ftDragInsertBar' });
        $('body').append(bar);
    }
    console.log('set bar css to: LTRB', left, top, width, height);
    bar.css({ left: left, top: top, width: width, height: height });
    bar.show();
};

FancyTree.prototype.hideDragInsertBar = function() {
    $('#ftDragInsertBar').hide();
};


///////////////////////////////////////////////////////////
// jQuery.draggable/droppable parameter getters
///////////////////////////////////////////////////////////

FancyTree.prototype.getDraggableParams = function() {
    var thisObj = this;

    return {
            cursorAt: { top: -30, left: 5 },
            distance: 5,
            delay: 50,
            helper: function(e, ui)
            {
                var multiSelectionFakeLength = (thisObj.multiSelection.length == 0 ? 1 : thisObj.multiSelection.length);
                return '<div class="ftDragHelper"><b>Moving ' + multiSelectionFakeLength + ' tab' + (multiSelectionFakeLength == 1 ? '' : 's') + '</b></div>';
            },
            revert: 'invalid',
            opacity: 0.96,
            revertDuration: 300,
            scroll: true,
            start: function(evt, ui) {
                thisObj.hideTooltip.call(thisObj);
                var target = $(evt.target);
                thisObj.dragging = true;
                thisObj.draggingRow = thisObj.getParentRowNode(target);
                thisObj.canAcceptDropTo = false;
                console.log('start drag, row being dragged', thisObj.draggingRow);
                if (thisObj.multiSelection.length == 0 || !target.parent().hasClass('ftSelected'))
                {
                    console.log('resetting multiselection before dragging');
                    var row = thisObj.getParentRowNode(target);
                    // pageRowClicked(row);
                    thisObj.clearMultiSelection.call(thisObj);
                    thisObj.toggleMultiSelectionSingle.call(thisObj, row.attr('id'));
                    //thisObj.multiSelection.push(row.attr('id'));
                }
            },
            stop: function(e, ui) {
                thisObj.dragging = false;
                $('.ftDragToChild').removeClass('ftDragToChild');
                thisObj.hideDragInsertBar.call(thisObj);
                if (thisObj.multiSelection.length == 1)
                {
                    thisObj.clearMultiSelection.call(thisObj);
                }
            }
        };
};

FancyTree.prototype.getDroppableParams = function(allowedDropTargets) {
    // var dropSelectors = allowedDropTargets.map(function(e) {
    //     if (e == 'ROOT') {
    //         return '.ftRoot';
    //     }

    //     return '.ftRowNode[rowtype="' + e + '"] > .ftItemRow';
    // });

    // console.log(dropSelectors.join(','));
    console.log('generating droppableParams');

    var thisObj = this;
    return {
        // accept: dropSelectors.join(', '),
            tolerance: 'pointer',
            hoverClass: 'ftDragOver',
            accept: function(e) {
                console.log('accept:', thisObj.canAcceptDropTo);
                return thisObj.canAcceptDropTo;
            },
            // accept: function(e) {
            //     console.log('accept', allowedDropTargets, allowedDropTargets.indexOf(thisObj.draggingRow.attr('rowtype')));
            //     if (allowedDropTargets.indexOf(thisObj.draggingRow.attr('rowtype')) >= 0) {
            //         return true;
            //     }
            //     return false;
            // },
            drop: function(evt, ui) {
                console.log('---PERFORM DROP---');
                console.log('drop info', 'target',
                    thisObj.getParentRowNode(thisObj.draggingOverRow).attr('id'),
                    'to', thisObj.draggingTo);

                // var overTabId = thisObj.draggingOverRow.attr('id');
            }
                // for (index in thisObj.multiSelection)
                // {
                //     var tabId = multiSelection[index];
                //     console.log('moving ' + tabId + ' draggingToNext ' + draggingToNext);
                //     if (draggingToNext)
                //     {
                //         var siblingPageRow = getPageRowByTabId(overTabId);
                //         var parentTabId = siblingPageRow.parents('.pageRow:first').attr('id');
                //         var afterSiblingTabId = overTabId;
                //         movePageRow(getPageRowByTabId(tabId), parentTabId, afterSiblingTabId);
                //     }
                //     else
                //     {
                //         movePageRow(getPageRowByTabId(tabId), overTabId, -1);
                //     }
                // }

                // clearMultiSelection();
                // },
                // over: function(e, ui) {
                //     document.title = 'over ' + e.target.parentNode.id;
                //     console.log(e);
                //     console.log(ui);
                // }
    };
};