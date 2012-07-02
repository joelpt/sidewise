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
        tolerance: 'pointer',
        hoverClass: 'ftDragOver',
        accept: function(e) {
            console.log('accept:', thisObj.canAcceptDropTo);
            return thisObj.canAcceptDropTo;
        },
        drop: function(evt, ui) {
            thisObj.onItemRowDrop.call(thisObj);
        }
    };
};

FancyTree.prototype.onItemRowDrop = function() {
    this.dropping = true;
    console.log('---PERFORM DROP---');
    console.log('drop info', 'target', this.getParentRowNode(this.draggingOverRow).attr('id'), 'to', this.draggingTo);
    var $rows = this.root.find('#' + this.multiSelection.join(',#'));

    if ($rows.length == 0) {
        return;
    }
    if ($rows.length == 1) {
        // don't animate single row movements, it is just annoying
        var fxAreOff = $.fx.off;
        $.fx.off = true;
        this.moveDraggedRowsAnimate($rows, this.draggingTo, this.draggingOverRow, function() {
            this.dropping = false; $.fx.off = fxAreOff;
        });
    }
    else {
        this.moveDraggedRowsAnimate($rows, this.draggingTo, this.draggingOverRow, function() {
            this.dropping = false;
        });
    }
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

    thisObj.slideOutAndShrink.call(thisObj, $rows, function(heights) {
        thisObj.moveDraggedRows.call(thisObj, $rows, moveToPosition, $moveToRow);
        thisObj.growAndSlideIn.call(thisObj, $rows, heights, onComplete);
    });
};

FancyTree.prototype.moveDraggedRows = function($rows, moveToPosition, $moveToRow, onComplete) {
    var thisObj = this;
    var $moveToChildren = thisObj.getChildrenContainer($moveToRow);
    var moveToHasChildren = $moveToChildren.children().length > 0;
    var moveToIsCollapsed = $moveToRow.hasClass('.ftCollapsed');

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
                thisObj.moveRow($child, $closestUnselectedParent, $selectedParentInClosestUnselectedParent, true, true);
            }
        });

        // determine parent row of move target
        var $moveToParent = thisObj.getParentRowNode($moveToRow.parent());
        if ($moveToParent.length == 0) {
            $moveToParent = undefined; // no parent row, we'll just leave this blank so the tree's root acts as the parent
        }

        // move the row
        if ($parentsSelected.length == 0) {
            // no ancestors are selected; move row to dragged-to position
            if (moveToPosition == 'A') { // above
                thisObj.moveRow.call(thisObj, $e, $moveToParent, $moveToRow, true, true);
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

                    thisObj.moveRow.call(thisObj, $e, $moveToRow, $moveToBeforeChild, true, true);
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

                thisObj.moveRow.call(thisObj, $e, $moveToParent, $moveToNextSibling, true, true);
                // $moveToRow.after($e);
                return;
            }

            if (moveToPosition == 'C') { // child of
                thisObj.moveRow.call(thisObj, $e, $moveToRow, undefined, true, true);
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

        // not immediately under a selected parent; move to the closest
        // selected ancestor
        // TODO use .movePageRow here, or else stop using .movePageRow above and implement
        // a move to hiddenDiv -> move to target scenario in this function instead
        $closestParent.append($e);
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
    }, 0);

    if (onComplete) {
        onComplete();
    }
};
