///////////////////////////////////////////////////////////
// FancyTree.dragDrop.js
// Stuff to assist with drag and drop.
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var DRAG_TO_ABOVE_SENSITIVITY_RATIO = 0.30;
var DRAG_TO_BELOW_SENSITIVITY_RATIO = 0.70;


///////////////////////////////////////////////////////////
// jQuery.draggable/droppable parameter setting
///////////////////////////////////////////////////////////

FancyTree.prototype.setDraggableDroppable = function(row, rowTypeParams) {
    var itemRow = this.getItemRow(row);

    if (!rowTypeParams) {
        rowTypeParams = this.getRowTypeParams(row);
    }

    // configure drag & drop
    if (rowTypeParams.draggableParams) {
        itemRow.draggable(rowTypeParams.draggableParams);
    }

    if (rowTypeParams.droppableParams) {
        itemRow.droppable(rowTypeParams.droppableParams);
    }
};

FancyTree.prototype.getDraggableParams = function() {
    var thisObj = this;

    return {
            axis: 'y',
            containment: 'document',
            cursorAt: { top: -30, left: 5 },
            distance: 5,
            delay: 50,
            helper: function(e, ui)
            {
                var multiSelectionFakeLength = (thisObj.multiSelection.length == 0 ? 1 : thisObj.multiSelection.length);
                return '<div class="ftDragHelper">Moving ' + multiSelectionFakeLength + ' row' + (multiSelectionFakeLength == 1 ? '' : 's') + '</div>';
            },
            revert: 'invalid',
            opacity: 0.96,
            revertDuration: 300,
            scroll: true,
            start: function(evt, ui) {
                var target = $(evt.target);
                var row = thisObj.getParentRowNode(target);
                var rowTypeParams = thisObj.getRowTypeParams(row);

                // TODO figure out how to make this work properly, currently it mangles the tree structure somehow
                // but without it, we have difficulty with dragdrops sometimes not working when you are in some 1px naughtyland in between rows
                // MIGHT be using margin instead of padding on .ftChildren, or vice versa... any way you go though, if you want
                var droppableParams = thisObj.getGenericDroppableParams(); // TODO should not need a get() function for this; make it static
                // thisObj.root.droppable(droppableParams);
                thisObj.root.find('.ftChildren').droppable(droppableParams);

                thisObj.hideTooltip.call(thisObj);
                thisObj.dragging = true;
                thisObj.dropping = false;
                thisObj.draggingRow = thisObj.getParentRowNode(target);
                thisObj.canAcceptDropTo = false;
                thisObj.dragSelectedCollapsedRow = false;
                var isCollapsed = target.parent().hasClass('ftCollapsed');
                var hiddenRowCount = 0;

                console.log('start drag, row being dragged', thisObj.draggingRow);
                if (evt.ctrlKey) {
                    thisObj.clearMultiSelection.call(thisObj);
                    thisObj.toggleMultiSelectionSingle.call(thisObj, row.attr('id'));
                    thisObj.dragToreOffParent = true;
                }
                else {
                    thisObj.dragToreOffParent = false;
                    if (thisObj.multiSelection.length == 0 || !(target.parent().hasClass('ftSelected')))
                    {
                        console.log('resetting multiselection before dragging');
                        // pageRowClicked(row);
                        thisObj.clearMultiSelection.call(thisObj);
                        thisObj.toggleMultiSelectionSingle.call(thisObj, row.attr('id'));

                        thisObj.dragSelectedCollapsedRow = isCollapsed;

                        if (!isCollapsed && rowTypeParams.autoselectChildrenOnDrag) {
                            console.log('selecting children too');
                            // select every child too by default; holding ctrl and click+dragging will just grab the parent
                            row.children('.ftChildren').find('.ftRowNode').each(function(i, e) {
                                    var $e = $(e);
                                    if ($e.parents('.ftCollapsed').length > 0) {
                                        return;
                                    }
                                    thisObj.toggleMultiSelectionSingle.call(thisObj, $e.attr('id'));
                                });
                        }

                        // if (evt.shiftKey) {
                        //     // select every child too
                        //     row.find('.ftChildren > .ftRowNode').each(function(i, e) {
                        //         thisObj.toggleMultiSelectionSingle.call(thisObj, e.attributes.id.value);
                        //     });
                        // }
                    }

                    if (rowTypeParams.autoselectChildrenOnDrag) {
                        // ensure all children of collapsed nodes are also selected
                        var $collapsedRows = $('#' + thisObj.multiSelection.join('.ftCollapsed,#') + '.ftCollapsed');
                        var $collapsedUnselectedChildren = $collapsedRows.find('.ftRowNode:not(.ftSelected)');
                        console.log('selecting hidden (collapsed) children rows', $collapsedUnselectedChildren);
                        $collapsedUnselectedChildren.each(function(i, e) {
                            thisObj.toggleMultiSelectionSingle.call(thisObj, e.attributes.id.value);
                        });

                        // count up collapsed+selected children (hidden rows)
                        var $collapsedSelectedChildren = $collapsedRows.find('.ftRowNode.ftSelected');
                        hiddenRowCount = $collapsedSelectedChildren.length;
                    }
                }


                $('.ftDragHelper').html(
                    'Moving ' + thisObj.multiSelection.length + ' row' + (thisObj.multiSelection.length == 1 ? '' : 's')
                    + (hiddenRowCount > 0 ? ' (' + hiddenRowCount + ' hidden)' : '')
                );

                // NO, this causes weird behavior with child nodes getting bad widths,
                // one fix is to always bring along all children of a collapsed node including unselected ones
                // when we do a move; this is a good idea and is just another case before the rest of the logic
                // "if collapsed, movePageRow keepChildren=true, to the correct insert-point ... done and done"
                //
                // else
                // {
                //     // select kids of collapsed nodes automagically
                //     thisObj.multiSelection.forEach(function(e) {
                //         var $row = thisObj.getRow.call(thisObj, e);

                //         if (!($row.hasClass('ftCollapsed'))) {
                //             return;
                //         }

                //         $row.find('.ftChildren > .ftRowNode').each(function(i, e) {
                //             thisObj.toggleMultiSelectionSingle.call(thisObj, e.attributes.id.value);
                //         });

                //     });
                // }
            },
            stop: function(e, ui) {
                thisObj.dragging = false;
                thisObj.canAcceptDropTo = false;
                thisObj.draggingOverRow = null;
                thisObj.draggingTo = null;
                $('.ftDragToChild').removeClass('ftDragToChild');
                thisObj.hideDragInsertBar();
                // Finding this annoying
                // if (thisObj.multiSelection.length == 1)
                // {
                //     thisObj.clearMultiSelection.call(thisObj);
                // }
            }
        };
};

FancyTree.prototype.getDroppableParams = function() {
    var thisObj = this;
    return {
        tolerance: 'pointer',
        hoverClass: 'ftDragOver',
        accept: function(e) {
            // console.log('accept:', thisObj.canAcceptDropTo);
            return thisObj.canAcceptDropTo;
        },
        drop: function(evt, ui) {
            return;
            thisObj.onItemRowDrop(evt, ui);
            evt.stopPropagation();
            return false;
        }
    };
};

FancyTree.prototype.getGenericDroppableParams = function() {
    var thisObj = this;
    return {
        accept: '*',
        tolerance: 'pointer',
        hoverClass: 'ftDragOver',
        drop: function(evt, ui) {
            thisObj.onItemRowDrop(evt, ui);
            evt.stopPropagation();
            return false;
        }
    };
};


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

    // TODO make this smarter re: sibling drops vs child drops
    // var canAcceptDropTo = (allowedDropTargets.indexOf(draggingToRowType) >= 0 && !(overRow.is(treeObj.draggingRow)) );
    var canAcceptDropTo = (allowedDropTargets.indexOf(draggingToRowType) >= 0 && treeObj.multiSelection.indexOf(overRow.attr('id')) == -1);
    // var canAcceptDropTo = (allowedDropTargets.indexOf(draggingToRowType) >= 0);

    if (!canAcceptDropTo) {
        return;
    }

    treeObj.canAcceptDropTo = true;
    treeObj.draggingOverRow = overRow;

    $('.ftDragToChild').removeClass('ftDragToChild');
    treeObj.hideDragInsertBar.call(treeObj);

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
            treeObj.hideDragInsertBar.call(treeObj);
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
            if (underRoot && children.length == 0) {
                // to child (within)
                draggingTo = 'C';
                dragInsertBarTarget = overItemRowContent;
                overRow.addClass('ftDragToChild');
                treeObj.hideDragInsertBar.call(treeObj);
            }
            else {
                // insert below hovered row (as sibling)
                draggingTo = 'B';
                dragInsertBarTarget = overItemRowContent;
                treeObj.drawDragInsertBar.call(treeObj, 'B', dragInsertBarTarget, treeObj.getParentRowNode(dragInsertBarTarget).attr('rowtype'));
            }
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

FancyTree.prototype.onItemRowDrop = function(evt, ui) {
    if (this.dropping) {
        return;
    }
    if (!this.canAcceptDropTo || !this.draggingOverRow) {
        return;
    }

    this.dropping = true;
    console.log('---PERFORM DROP---');
    console.log('this', this);
    console.log('drop info', 'target', this.getParentRowNode(this.draggingOverRow).attr('id'), 'to', this.draggingTo);
    var $rows = this.root.find('#' + this.multiSelection.join(',#')).not(this.draggingOverRow);

    if ($rows.length == 0) {
        return;
    }

    var fxAreOff = $.fx.off;
    if (($rows.length == 1 && !this.dragToreOffParent) || this.dragSelectedCollapsedRow) {
        // don't animate single row movements, it is just annoying; we'll still use normal
        // animation if the ctrl key is held however, because this probably means a parent
        // was torn off with ctrl and those moves can be rather confusing (children popping
        // out of parent)
        $.fx.off = true;
    }

    var thisObj = this;
    this.moveDraggedRowsAnimate($rows, this.draggingTo, this.draggingOverRow, function(moves) {
        $.fx.off = fxAreOff;
        if (thisObj.onDragDrop) {
            thisObj.onDragDrop(moves);
        }
        setTimeout(function() { thisObj.dropping = false; }, 150);
    });
};


///////////////////////////////////////////////////////////
// Dragging insertion bar
///////////////////////////////////////////////////////////

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

    var droppableParams = this.getGenericDroppableParams;
    bar.droppable(droppableParams);
};

FancyTree.prototype.hideDragInsertBar = function() {
    $('#ftDragInsertBar').hide();
};


///////////////////////////////////////////////////////////
// Moving dragged rows
///////////////////////////////////////////////////////////

FancyTree.prototype.moveDraggedRowsAnimate = function($rows, moveToPosition, $moveToRow, onComplete) {
    var thisObj = this;

    if ($rows.length == 0) {
        throw new Error('Nothing to move');
    }

    console.log('dragmoving these', $rows);

    var defaultRowHeight = 0;
    $rows.each(function(i, e) {
        var height = $(e).children('.ftItemRow').height();
        if (height > defaultRowHeight) {
            defaultRowHeight = height;
            console.log('SetDefaultHeight', height)
        }
    });

    var moves;
    thisObj.slideOutAndShrink.call(thisObj, $rows, defaultRowHeight, function(heights) {
        thisObj.moveDraggedRows.call(thisObj, $rows, moveToPosition, $moveToRow, function(movesDone) {
            moves = movesDone;
        });
        thisObj.growAndSlideIn.call(thisObj, $rows, heights, function() {
            if (onComplete) {
                onComplete(moves);
            }
        });
    });
};

FancyTree.prototype.moveDraggedRows = function($rows, moveToPosition, $moveToRow, onComplete) {
    var thisObj = this;
    var $moveToChildren = thisObj.getChildrenContainer($moveToRow);
    var moveToHasChildren = $moveToChildren.children().length > 0;
    var moveToIsCollapsed = $moveToRow.hasClass('.ftCollapsed');
    var moves = [];
    var $topParents = $moveToRow.parents('.ftRowNode').last(); // add topmost parent of move destination row
    if ($topParents.length == 0) {
        $topParents = $moveToRow;
    }

    if (moveToPosition == 'B') {
        // causes us to do moves in a way that retains the original ordering
        $rows = $rows.reverse();
    }

    // move each row
    $rows.each(function(i, e) {
        var $e = $(e);
        var $parents = $e.parents('.ftRowNode');
        var $parent = $parents.first(); // immediate parent
        var $parentsSelected = $parents.filter(function(i, p) { return $(p).is($rows) }); // intersect selected and parents lists

        var $topParent = $parents.last();
        if ($topParent.length == 0) {
            // no topmost parent; just add ourselves
            $topParents = $topParents.add($e);
        }
        else {
            // add topmost parent
            $topParents = $topParents.add($topParent);
        }

        // iterate through the children of each row in $rows, finding those rows that are not also in $rows
        // and moving them up the tree to their closest parent row which is not also in $rows
        var $childrenNotSelected = thisObj.getChildrenContainer($e).children().filter(function(i, c) { return !($(c).is($rows)) });
        var $closestUnselectedParent;
        var $selectedParentInClosestUnselectedParent;
        console.log('unselected childrens', $childrenNotSelected);

        $childrenNotSelected.each(function(i, c) {
            var $child = $(c);
            var $childParents = $child.parents('.ftRowNode');

            for (var i = 0; i < $childParents.length; i++) {
                var $childParent = $($childParents[i]);
                if (!($childParent.is($rows))) {
                    $closestUnselectedParent = $childParent;
                    break;
                }
                $selectedParentInClosestUnselectedParent = $childParent;
            }

            if ($closestUnselectedParent) {
                // move the unselected child up the tree
                moves.push(thisObj.moveRow($child, $closestUnselectedParent, $selectedParentInClosestUnselectedParent, true, true));
            }
        });

        // determine parent row of move target
        var $moveToParent = thisObj.getParentRowNode($moveToRow.parent());
        if ($moveToParent.length == 0) {
            $moveToParent = undefined; // no parent row, we'll just leave this blank so the tree's root acts as the parent
        }

        // move the row
        if ($parentsSelected.length == 0) {
            console.log('none of my parents are selected');
            // no ancestors are selected; move row to dragged-to position
            if (moveToPosition == 'A') { // above
                moves.push(thisObj.moveRow($e, $moveToParent, $moveToRow, true, true));
                // $moveToRow.before($e);
                return;
            }

             if (moveToPosition == 'B') { // below
                if (moveToHasChildren && !moveToIsCollapsed) {
                    // find the first child row of $moveToRow which is not the moving row itself, $e
                    var $moveToBeforeChild = $moveToChildren.children().first();
                    while ($moveToBeforeChild.length == 1 && $moveToBeforeChild.is($e)) {
                        $moveToBeforeChild = $moveToBeforeChild.next();
                    }

                    if ($moveToBeforeChild.length == 0) {
                        $moveToBeforeChild = undefined;
                    }

                    moves.push(thisObj.moveRow($e, $moveToRow, $moveToBeforeChild, true, true));
                    // $moveToChildren.prepend($e);
                    return;
                }

                // find the nearest next-sibling of $moveToRow which is not the moving row itself, $e
                var $moveToNextSibling = $moveToRow.next();
                while ($moveToNextSibling.length == 1 && $moveToNextSibling.is($e)) {
                    $moveToNextSibling = $moveToNextSibling.next();
                }

                if ($moveToNextSibling.length == 0) {
                    $moveToNextSibling = undefined;
                }

                moves.push(thisObj.moveRow($e, $moveToParent, $moveToNextSibling, true, true));
                // $moveToRow.after($e);
                return;
            }

            if (moveToPosition == 'C') { // child of
                moves.push(thisObj.moveRow($e, $moveToRow, undefined, true, true));
                // $moveToChildren.append($e);
                return;
            }

            throw new Error('Unrecognized value for draggingTo');
        }

        // at least one ancestor is selected
        var $closestParent = $parentsSelected.first();

        if ($closestParent.is($parent)) {
            // already under my current and selected parent, do naught
            // thisObj.setDraggableDroppable.call(thisObj, $e);
            return;
        }

        console.log('move to closest selected ancestor');
        // not immediately under a selected parent; move to the closest
        // selected ancestor
        // TODO use .movePageRow here, or else stop using .movePageRow above and implement
        // a move to hiddenDiv -> move to target scenario in this function instead
        moves.push(thisObj.moveRow($e, $closestParent, undefined, true, true));
        // thisObj.getChildrenContainer.call(thisObj, $closestParent).children().append($e);
    });

    console.log('top parents', $topParents);
    var $fixups;
    if ($topParents.length == 0) {
        // just moving to/from root level, update everybody
        $fixups = thisObj.root.find('.ftRowNode');
    }
    else {
        // only do potentially affected nodes
        $fixups = $topParents.find('.ftRowNode').add($topParents);
    }

    // reconfigure all possibly affected nodes in a moment
    setTimeout(function() {
        $fixups.each(function(i, e) {
            var $e = $(e);
            thisObj.setDraggableDroppable.call(thisObj, $e);
            thisObj.updateRowExpander.call(thisObj, $e);
            thisObj.setRowButtonTooltips.call(thisObj, $e);
            thisObj.formatRowTitle.call(thisObj, $e);
        });
    }, 10);

    if (onComplete) {
        onComplete(moves);
    }
};
