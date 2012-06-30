///////////////////////////////////////////////////////////
// FancyTree.dragDrop.js
// Stuff to assist with drag and drop.
///////////////////////////////////////////////////////////

FancyTree.prototype.getDraggableParams = function() {
    var thisObj = this;

    return {
            cursorAt: { top: 35, left: 0 },
            distance: 5,
            delay: 50,
            helper: function(e, ui)
            {
                var multiSelectionFakeLength = (thisObj.multiSelection.length == 0 ? 1 : thisObj.multiSelection.length);
                return '<div class="ftDragHelper"><b>Moving ' + multiSelectionFakeLength + ' tab' + (multiSelectionFakeLength == 1 ? '' : 's') + '</b></div>';
            },
            revert: 'invalid',
            opacity: 0.95,
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
            // },
            // drag: function(e, ui) {
            //   var over = $(e.target);
            //   var overPageRow = over.closest('.pageRow');
            //   var rowHeight = overPageRow.height();
            //   var topDelta = e.pageY - overPageRow.position().top;

            //   console.log(topDelta > rowHeight / 2);
            //   console.log('should be over tab id ' + overPageRow.attr('id'));
            //   var isOnLowerHalf = (topDelta > rowHeight / 2);

            //   $('.dragToNext').removeClass('dragToNext');
            //   overPageRow.addClass('dragToNext');

            // }
        };
};


FancyTree.prototype.getDroppableParams = function(allowedDropTargets) {
    var dropSelectors = allowedDropTargets.map(function(e) {
        if (e == 'ROOT') {
            return '.ftRoot';
        }

        return '.ftRowNode[rowtype="' + e + '"] > .ftItemRow > .ftItemRowContent > .ftInnerRow';
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