///////////////////////////////////////////////////////////
// FancyTree.dragDrop.js
// Stuff to assist with drag and drop.
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var DRAG_TO_NEXT_SENSITIVITY_RATIO = 0.45;


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

    console.log(topDelta, rowHeight, topDelta > rowHeight / 2);
    //console.log(evt.pageX + ', ' + evt.pageY + ' .. ');
    //console.log(overRow.attr('id'));
    //console.log(over.position().left + ', ' + over.position().top);
    // var isOnLowerHalf = ( (topDelta / rowHeight) > dragToChildSensitivityRatio );
    // draggingToNext = !isOnLowerHalf;
    var rowHeight = overRow.height();
    var topDelta = evt.pageY - overRow.offset().top;
    draggingToNext = ((topDelta / rowHeight) > DRAG_TO_NEXT_SENSITIVITY_RATIO);

    $('.ftDragToChild').removeClass('ftDragToChild');
    $('.ftDragToNext').removeClass('ftDragToNext');

    if (draggingToNext) {
        overRow.addClass('ftDragToNext');
    } else {
        overRow.addClass('ftDragToChild');
    }

    treeObj.draggingOverRow = overRow;
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
            start: function(e, ui) {
                thisObj.dragging = true;
                if (thisObj.multiSelection.length == 0 || !$(e.target).parent().hasClass('ftSelected'))
                {
                    console.log('resetting multiselection before dragging');
                    var row = thisObj.getParentRowNode($(e.target));
                    // pageRowClicked(row);
                    thisObj.clearMultiSelection.call(thisObj);
                    thisObj.toggleMultiSelectionSingle.call(thisObj, row.attr('id'));
                    //thisObj.multiSelection.push(row.attr('id'));
                }
            },
            stop: function(e, ui) {
                thisObj.dragging = false;
                $('.ftDragToChild').removeClass('ftDragToChild');
                $('.ftDragToNext').removeClass('ftDragToNext');
                if (thisObj.multiSelection.length == 1)
                {
                    thisObj.clearMultiSelection.call(thisObj);
                }
            }
        };
};


FancyTree.prototype.getDroppableParams = function(allowedDropTargets) {
    var dropSelectors = allowedDropTargets.map(function(e) {
        if (e == 'ROOT') {
            return '.ftRoot';
        }

        return '.ftRowNode[rowtype="' + e + '"] > .ftItemRow *';
    });

    var thisObj = this;
    return {
            accept: dropSelectors.join(','),
            tolerance: 'pointer',
            hoverClass: 'ftDragOver',
            drop: function(e, ui) {
                console.log('drop!');
                console.log(e.target);
                console.log(ui);
                console.log(thisObj.multiSelection.length);
                // console.log(thisObj.draggingOverRow.attr('id'));
                console.log(thisObj.draggingToNext);
                console.log('!pord');

                console.log('PERFORM DROP');

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