///////////////////////////////////////////////////////////
// FancyTree.init.js
// Initialization
///////////////////////////////////////////////////////////

FancyTree.prototype.init = function(treeReplaceElem, filterBoxReplaceElem, options) {
    // prepare new tree elements to append to treeReplaceElem
    var rootNode = $('<div class="ftRoot"/>');
    var rootUL = $('<ul class="ftChildren"/>');
    rootNode.append(rootUL);

    // append to treeReplaceElem
    var treeHostElem = $(treeReplaceElem);
    treeHostElem.replaceWith(rootNode);

    // prepare type-in filter box to put above tree
    if (options.showFilterBox !== false) {
        // construct a unique identifier for the search box's history
        var idElem = $(filterBoxReplaceElem).get(0);
        var autosaveId = treeHostElem.parents().toArray().reverse()
            .reduce(function(prev, curr) {
                return prev + '/' + curr.tagName + '.' + curr.className + '#' + curr.id
            }, ''
        ) + '/' + idElem.tagName + '.' + idElem.className + '#' + idElem.id;

        // prepare filter box element
        var filterElem = $('<div/>', { class: 'ftFilterControl' });
        filterElem.append($('<input/>', {
            class: 'ftFilterInput',
            type: 'search',
            placeholder: options.filterPlaceholderText || 'Type to search',
            results: 100,
            autosave: autosaveId
        }));
        this.filterElem = filterElem;
        $(filterBoxReplaceElem).replaceWith(filterElem);

        // filter status element
        var filterStatusElem = $('<div/>', { class: 'ftFilterStatus' })
            .text(options.filterActiveText || 'Matches shown, click here or hit Esc to clear')
            .hide();
        rootNode.before(filterStatusElem);
        this.filterStatusElem = filterStatusElem;
    }

    // configure tree initial state
    this.root = rootNode;
    this.permitTooltipHandler = options.permitTooltipHandler;
    this.useAdvancedFiltering = options.useAdvancedFiltering;
    this.scrollTargetElem = options.scrollTargetElem || $(document.body);

    this.focusedRow = null;
    this.hoveredRow = null;
    this.filtering = false;

    this.multiSelection = [];
    this.lastMultiSelectedFromId = null;
    this.lastMultiSelectedToId = null;

    this.onContextMenuShow = onContextMenuShow;
    this.contextMenuItems = {};
    this.contextMenuShown = false;
    this.contextMenuTarget = null;

    this.dragging = false;
    this.draggingToNext = false;
    this.draggingOverRow = null;

    // configure tooltip stuff
    this.tooltipTopOffset = options.tooltipTopOffset || 12;
    this.tooltip = null;
    this.simpletip = $('<div id="ftSimpleTip"/>').hide();
    $('body').append(this.simpletip);
    this.tooltipShowTimer = null;
    var treeObj = this;
    this.rowButtonTooltipParams = {
        tip: '#ftSimpleTip',
        predelay: 400,
        position: 'top left',
        offset: [-7, 12],
        onShow: function(evt) {
            // prevent tooltip from showing whenever permitTooltipHandler() returns false
            if (treeObj.permitTooltipHandler && !treeObj.permitTooltipHandler()) {
                this.hide();
            }
        }
    }

    // configure row types
    this.rowTypes = {};
    var rowTypes = options.rowTypes || {'row': {}};
    for (var rowType in rowTypes) {
        this.addRowType(rowType, rowTypes[rowType]);
    }

    // configure tree's event handlers
    var treeObj = this;
    var data = { treeObj: treeObj };

    $(document)
        .on('mouseenter', '.ftItemRow', data, this.onItemRowMouseEnter)
        .on('mouseleave', '.ftItemRow', data, this.onItemRowMouseLeave)
        .on('mouseover', '#ftTooltip', data, this.handleHideTooltipEvent)
        .on('click', '.ftExpander', data, this.onExpanderClick)
        .on('mouseenter', '.ftButtons', data, this.onMouseEnterButtons)
        .on('mouseleave', '.ftButtons', data, this.onMouseLeaveButtons)
        .on('contextmenu', rootNode, data, this.onContextMenu)
        .on('mouseup', '.ftContextMenuItem', data, this.onContextMenuItemClick)
        .on('mouseup', '.ftContextMenuSeparator', data, function() { return false; })
        .on('mouseup', 'body', data, this.onBodyMouseUp);

    if (options.showFilterBox != false) {
        // add event handlers for filter box
        $(document)
            .on('click', this.filterElem, data, this.onFilterBoxModified)
            .on('keyup', this.filterElem, data, this.onFilterBoxModified)
            .on('click', '.ftFilterStatus', data, this.onFilterStatusClick)
            .on('keydown', 'body', data, this.onBodyKeyDown);
    }
};

/**
  * Adds a new rowtype.
  * @param name     The name of the row type used for referencing it elsewhere.
  * @param params   The row type's parameters; see FancyTree class header for details
  */
FancyTree.prototype.addRowType = function(name, params) {
    var thisObj = this;
    this.rowTypes[name] = params;

    // configure onFormatTitle handler
    var onFormatTitle = params.onFormatTitle || this.defaultFormatTitleHandler;
    params.onFormatTitle = function(row) {
        onFormatTitle.call(thisObj, row, thisObj.getInnerRow(row).children('.ftItemText'));
    }

    // configure event handling
    var selector = '.ftRowNode[rowtype=' + name + '] > .ftItemRow > .ftItemRowContent';
    var data = params;
    data.treeObj = this;
    $(document)
        .on('mousedown', selector, data, this.rowMouseDownHandler)
        .on('mouseup', selector, data, this.rowMouseUpHandler)
        .on('dblclick', selector, data, this.rowDoubleClickHandler);

    // configure row button event handling
    for (var i in params.buttons)
    {
        var buttonClass = '.ftButton__' + name + '_' + i;
        var buttonData = { treeObj: this, onClick: params.buttons[i].onClick };
        $(document).on('mouseup', buttonClass, buttonData, this.rowButtonClickHandler);
    }

    // construct empty HTML element for this rowtype
    params.baseElement = this.buildRowTypeElem(name);

    if (!params.allowedDropTargets || params.allowedDropTargets.length == 0) {
        return;
    }

    // configure draggable and droppable parameters
    params.draggableParams = {
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

    var dropSelectors = params.allowedDropTargets.map(function(e) {
        if (e == 'ROOT') {
            return '.ftRoot';
        }

        return '.ftRowNode[rowtype="' + e + '"] > .ftItemRow > .ftItemRowContent > .ftInnerRow';
    });

    params.droppableParams = {
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