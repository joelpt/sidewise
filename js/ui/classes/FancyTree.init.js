///////////////////////////////////////////////////////////
// FancyTree.init.js
// Initialization
///////////////////////////////////////////////////////////

/**
  * @constructor
  * @param treeReplaceElem The DOM element to replace with the treeview.
  * @param filterBoxReplaceElem The root DOM element to replace with the filter box.
  * @param options A dictionary of options, all optional:
  *        <pre>
  *        {
  *          scrollTargetElem: jQueryElem,       // the tree parent element that can scroll
  *          onContextMenuShow: Function(rows),  // passed a list of rows that are currently selected, this
  *                                              // should return an array of context menu items to show
  *          onRowsMoved: Function(moves)        // called when rows have been moved as a result of e.g. drag & drop
  *                                              // moves is an array of objects with the following properties,
  *                                              // describing the sequence of move actions performed:
  *                                              //   [{ $row, relation, $to, keepChildren, staticMove,
  *                                              //      $newParent, $newBeforeSibling, $newAfterSibling,
  *                                              //      $oldAncestors }, ...]
  *                                              //   All $named properties are jQuery objects.
  *                                              //   relation is one of: "before" "after" "append" "prepend" "nomove"
  *                                              //   staticMove is true when no actual move was performed.
  *                                              //   keepChildren is true when children were kept with the moved $row;
  *                                              //     if false, the $row's children were spliced into the tree in
  *                                              //     $row's previous location.
  *                                              //   $new* gives details about the $row's neighbors after the move.
  *                                              //   $oldAncestors is the ancestry of $row prior to being moved.
  *          autoSelectChildrenOnDrag: Boolean,  // if true, permit autoselecting of children in dragged rows
  *                                              // if the row's rowType.permitAutoSelectChildren is also true
  *          allowDropHandler: Function($fromRows, relation, $toRow),
  *                                              // if specified, this function must return true for a drop operation
  *                                              // to be permitted
  *          showFilterBox: Boolean,             // if set to false, hide type-in filtering box above tree
  *          filterPlaceholderText: String,      // text to show in filter box when otherwise empty
  *          filterActiveText: String,           // text to show below filter box when filtering is active
  *          useAdvancedFiltering: Boolean,      // if true, use nonadjacent char matching when filtering
  *          permitTooltipHandler: Function(),   // if this function returns false, block showing a row tip
  *          tooltipTopOffset: Integer,          // offset row tip from row by this much pixel spacing
  *          rowTypes:
  *          {
  *            identifier:                       // identifying string for each type of row to support
  *            {
  *              allowAtTopLevel: Boolean,       // allow row at top (root) level, default=true
  *              allowAtChildLevel: Boolean,     // allow row as child of another row, default=true
  *              autofocusOnClick: Boolean,      // if true (default), set focus to row when clicked
  *              multiselectable: Boolean,       // if true (default), row can be in ctrl/shift selections
  *              allowedDropTargets: Array,      // if provided, a row of this type will be permitted to be
  *                                              // drag-dropped into the given rowtypes; pass the allowed row
  *                                              // type identifiers as strings, and pass the special
  *                                              // identifier 'ROOT' to permit dropping onto the root level
  *                                              // of the tree, e.g. ['bookmark', 'folder', 'ROOT']
  *              permitAutoSelectChildren: Bool, // if true, autoselect children of single dragged rows
  *              alwaysMoveChildren: Boolean,    // if true, dragging a row of this type also moves all its children
  *                                              // without a visual cue
  *              onClick: Function(evt),         // left single click event handler
  *              onDoubleClick: Function(evt),   // left double click event handler
  *              onMiddleClick: Function(evt),   // middle click event handler
  *              onExpanderClick: function(evt), // called when a row's branch expander arrow is clicked
  *              onIconError: Function(evt),     // row icon onerror event handler
  *              onFormatTitle: Function(row, itemTextElement), // called whenever row title might need updating
  *              onFormatTooltip: Function(evt), // called to obtain HTML for a row's tip before showing it
  *              onResizeTooltip: Function(evt), // called if a row tip is forcibly resized by FancyTree
  *              filterByExtraParams: [String],  // additional parameter(s) to examine when filtering
  *              tooltipMaxWidthFixed: Integer,  // max width of row tip, as number of pixels
  *              tooltipMaxWidthPercent: Float,  // max width or row tip, as % of parent width (0.0-1.0)
  *              buttons:                        // array of show-on-row-hover row action buttons
  *              [
  *                {
  *                  icon: String,               // URL string of icon for button
  *                  tooltip: String,            // tooltip text of button shown on extended hover
  *                  onClick: Function(evt)      // left click event handler for button
  *                },
  *                ...
  *              ]
  *            },
  *            ...
  *          }
  *       }
  *       </pre>
  *
  *       All rowTypes' event handlers are passed the hosting FancyTree object in evt.data.treeObj, and the
  *       involved row's <li> jQuery element in evt.data.row.
  *
  */
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
    this.filterBoxShown = options.showFilterBox;

    this.focusedRow = null;
    this.hoveredRow = null;
    this.filtering = false;
    this.ignoreNextRowMouseUpEvent = false;

    this.onContextMenuShow = options.onContextMenuShow;
    this.multiSelection = $();
    this.multiSelectableRowTypes = [];
    this.lastMultiSelectedFromId = null;
    this.lastMultiSelectedToId = null;
    this.contextMenuSelectionData = null;
    this.contextMenuItems = {};
    this.contextMenuShown = false;
    this.contextMenuTarget = null;

    this.onRowsMoved = options.onRowsMoved;
    this.autoSelectChildrenOnDrag = options.autoSelectChildrenOnDrag;
    this.allowDropHandler = options.allowDropHandler;
    this.dragging = false;
    this.draggingRow = null;
    this.draggingTo = null;
    this.draggingOverRow = null;
    this.canAcceptDropTo = false;
    this.dropping = false;
    this.dragToreOffParent = false;
    this.draggingJustCancelled = false;
    this.dragSelectedCollapsedRow = false;

    // configure tooltip stuff
    this.tooltipTopOffset = options.tooltipTopOffset || 20;
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
        .on('mouseup', 'body', data, this.onBodyMouseUp)
        .on('keydown', data, this.onDocumentKeyDown)
        .on('mousemove', '.ftItemRow', data, this.onItemRowMouseMove);

    if (options.showFilterBox != false) {
        // add event handlers for filter box
        $(document)
            .on('click', this.filterElem, data, this.onFilterBoxModified)
            .on('keyup', this.filterElem, data, this.onFilterBoxModified)
            .on('click', '.ftFilterStatus', data, this.onFilterStatusClick);
    }
};
