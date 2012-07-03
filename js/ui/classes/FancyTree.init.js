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

    this.onContextMenuShow = options.onContextMenuShow;
    this.contextMenuItems = {};
    this.contextMenuShown = false;
    this.contextMenuTarget = null;

    this.onDragDrop = options.onDragDrop;
    this.dragging = false;
    this.draggingRow = null;
    this.draggingTo = null;
    this.draggingOverRow = null;
    this.canAcceptDropTo = false;
    this.dropping = false;

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
        .on('mouseup', 'body', data, this.onBodyMouseUp)
        .on('mousemove', '.ftItemRow', data, this.onItemRowMouseMove);


    if (options.showFilterBox != false) {
        // add event handlers for filter box
        $(document)
            .on('click', this.filterElem, data, this.onFilterBoxModified)
            .on('keyup', this.filterElem, data, this.onFilterBoxModified)
            .on('click', '.ftFilterStatus', data, this.onFilterStatusClick)
            .on('keydown', 'body', data, this.onBodyKeyDown);
    }
};
