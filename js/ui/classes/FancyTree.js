var ROW_TOOLTIP_SHOW_DELAY_MS = 1000;

/**
  * @constructor
  * @param appendToElem The root DOM element to append the FancyTree under.
  * @param options A dictionary of options, all optional:
  *        <pre>
  *        {
  *          showFilterBox: Boolean,             // if set to false, hide type-in filtering box above tree
  *          filterPlaceholderText: String,      // text to show in filter box when otherwise empty
  *          filterActiveText: String,           // text to show below filter box when filtering is active
  *          permitTooltipHandler: Function(),   // if this function returns false, block showing a row tip
  *          tooltipTopOffset: Integer,          // offset row tip from row by this much pixel spacing
  *          rowTypes:
  *          {
  *            identifier:                       // identifying string for each type of row to support
  *            {
  *              autofocusOnClick: Boolean,      // if true (default), set focus to row when clicked
  *              multiselectable: Boolean,       // if true (default), row can be in ctrl/shift selections
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
var FancyTree = function(appendToElem, options) {
    this.init(appendToElem, options);
}

FancyTree.prototype = {

    ///////////////////////////////////////////////////////////
    // Initialization
    ///////////////////////////////////////////////////////////

    init: function(appendToElem, options) {
        // prepare new tree <ul> to appendToElem
        var rootNode = $('<div class="ftRoot">');
        var rootUL = $('<ul class="ftChildren">');
        rootNode.append(rootUL);

        // append new element to appendToElem as child
        var parentElem = $(appendToElem);
        parentElem.append(rootNode);

        // prepare type-in filter box to put above tree
        if (options.showFilterBox != false) {
            // prepare a unique identifier for the search box's history
            var idElem = $(appendToElem).get(0);
            var autosaveId = parentElem.parents().toArray().reverse()
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

            // filter status element
            var filterStatusElem = $('<div/>', { class: 'ftFilterStatus' })
                .text(options.filterActiveText || 'Matches shown, click here or hit Esc to clear')
                .hide();
            filterElem.append(filterStatusElem);

            // put filter box before tree element
            rootNode.before(filterElem);
            this.filterElem = filterElem;
        }

        // configure tree initial state
        this.root = rootNode;
        this.permitTooltipHandler = options.permitTooltipHandler;
        this.focusedRow = null;
        this.hoveredRow = null;
        this.hoveringRowButtons = false;
        this.filtering = false;
        this.multiSelection = [];
        this.lastMultiSelectedFromId = null;
        this.lastMultiSelectedToId = null;

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
            .on('mouseenter', '.ftItemRowContent', data, this.onItemRowContentMouseEnter)
            .on('mouseleave', '.ftItemRowContent', data, this.onItemRowContentMouseLeave)
            .on('mouseover', '#ftTooltip', data, this.handleHideTooltipEvent)
            .on('click', '.ftExpander', data, this.onExpanderClick)
            .on('mouseenter', '.ftButtons', data, this.onMouseEnterButtons)
            .on('mouseleave', '.ftButtons', data, this.onMouseLeaveButtons);

        if (options.showFilterBox != false) {
            // add event handlers for filter box
            $(document)
                .on('click', this.filterElem, data, this.onFilterBoxModified)
                .on('keyup', this.filterElem, data, this.onFilterBoxModified)
                .on('click', '.ftFilterStatus', data, this.onFilterStatusClick)
                .on('keydown', 'document', data, this.onDocumentKeyDown);
        }
    },

    /**
      * Adds a new rowtype.
      * @param name     The name of the row type used for referencing it elsewhere.
      * @param params   The row type's parameters; see FancyTree class header for details
      */
    addRowType: function(name, params) {
        var thisObj = this;
        this.rowTypes[name] = params;

        var onFormatTitle = params.onFormatTitle || this.defaultFormatTitleHandler;

        params.onFormatTitle = function(row) {
            onFormatTitle.call(thisObj, row, thisObj.getInnerRow(row).children('.ftItemText'));
        }

        // configure event handling
        var selector = '.ftRowNode[rowtype=' + name + '] > .ftItemRow > .ftItemRowContent';
        var data = params;
        data.treeObj = this;
        $(document)
            .on('mousedown', selector, data, this._rowMouseDownHandler)
            .on('mouseup', selector, data, this._rowMouseUpHandler)
            .on('dblclick', selector, data, this._rowDoubleClickHandler);

        // configure row button event handling
        for (var i in params.buttons)
        {
            var buttonClass = '.ftButton__' + name + '_' + i;
            var buttonData = { treeObj: this, onClick: params.buttons[i].onClick };
            $(document).on('click', buttonClass, buttonData, this._rowButtonClickHandler);
        }

        // construct empty HTML element for this rowtype
        params.baseElement = this.buildRowTypeElem(name);
    },


    ///////////////////////////////////////////////////////////
    // Element manipulation
    ///////////////////////////////////////////////////////////

    getRow: function(idOrElem) {
        if (idOrElem instanceof jQuery) {
            return idOrElem;
        }

        var elem = $('#' + idOrElem);
        // var elem = this.root.find('#' + idOrElem); // this method is ~5x slower

        if (elem.length == 0) {
            throw new Error('Could not find element with id ' + idOrElem);
        }

        return elem;
    },

    addRow: function(elem, parentId) {
        if (!parentId) {
            // When parentId is missing just add elem to the root level children
            this.root.children('.ftChildren').append(elem);
            return;
        }
        var parent = this.getRow(parentId);
        parent.children('.ftChildren').append(elem);
        this.updateRowExpander(parent);
        this.formatLineageTitles(parent);
    },

    removeRow: function(id) {
        var elem = this.getRow(id);
        var parent = elem.parent().parent();

        // ensure button tooltips don't popup after the row is removed, after the tips' predelay
        this.getButtons(elem)
            .each(function(i, e) { $(e).data('tooltip').onShow(function() { this.hide(); } ); })

        // if the element being removed is the currently hovered element, clear hoveringRowButtons state boolean
        if (this.hoveredRow === elem) {
            this.hoveringRowButtons = false;
            this.hoveredRow = null;
        }

        elem.replaceWith(elem.children('.ftChildren').children());

        this.updateRowExpander(parent);
        this.formatLineageTitles(parent);

        this.hideTooltip();
    },

    moveRow: function(id, newParentId, beforeSiblingId) {
        var elem = this.getRow(id);
        var oldParent = elem.parent().parent();

        var newParent;
        if (!newParentId) {
            newParent = this.root;
        }
        else {
            newParent = this.getRow(newParentId);
        }

        if (!beforeSiblingId && oldParent.get(0).id == newParent.get(0).id) {
            return;
        }

        this.removeRow(id); // prevents possible DOM_HIERARCHY exceptions

        var children = this.getChildrenContainer(newParent);
        if (beforeSiblingId) {
            var sibling = children.children('#' + beforeSiblingId);
            if (sibling.length == 0) {
                throw new Error('Could not find sibling with id ' + beforeSiblingId);
            }
            sibling.before(elem);
        }
        else {
            children.append(elem);
        }
        this.setRowButtonTooltips(elem);

        this.updateRowExpander(oldParent);
        this.updateRowExpander(newParent);
        this.updateRowExpander(elem);

        formatLineageTitles(oldParent);
        formatLineageTitles(newParent);
    },

    updateRow: function(id, details) {
        var row = this.getRow(id);
        var innerRow = this.getInnerRow(row);

        row.attr(details);

        if (details.icon) {
            innerRow.children('.ftRowIcon').attr('src', details.icon);
        }

        this.getRowTypeParams(row).onFormatTitle(row);
    },

    focusRow: function(idOrElem) {
        var elem = this.getRow(idOrElem);
        var id = elem.attr('id');
        if (this.focusedRow) {
            this.focusedRow.removeClass('ftFocused');
        }

        this.lastMultiSelectedToId = id;
        this.lastMultiSelectedFromId = id;

        this.focusedRow = elem;
        elem.addClass('ftFocused');

        if (!isScrolledIntoView(elem)) {
            $.scrollTo(elem, 150);
        }
    },

    /**
      * Toggles expanded/collapsed state of an element.
      * Calls the row's rowtype's onExpanderClick function, if defined.
      * @returns true if element is now expanded, false if now collapsed
      */
    toggleExpandRow: function(id) {
        var thisObj = this;
        var row = this.getRow(id);
        var children = this.getChildrenContainer(row);
        var rowTypeParams = this.getRowTypeParams(row);
        var onExpanderClick = rowTypeParams.onExpanderClick;
        var onFormatTitle = rowTypeParams.onFormatTitle;

        var expanded = row.hasClass('ftCollapsed');

        children.slideToggle(100, function() {
            if (expanded) {
                row.removeClass('ftCollapsed');
            }
            else {
                row.addClass('ftCollapsed');
            }

            if (onExpanderClick) {
                var evt = { data: { treeObj: thisObj, row: row, expanded: expanded } };
                onExpanderClick(evt);
            }
            onFormatTitle(row);
        });

        return expanded;
    },

    mergeRows: function(fromId, toId) {
        var from = this.getRow(fromId);
        var to = this.getRow(toId);

        // Append from's children to the end of to's children
        to.append(this.getChildrenContainer(from).children());

        // Destroy from node
        from.remove();

        // Update stuffs
        this.updateRowExpander(to);
        this.formatLineageTitles(to);
    },

    ///////////////////////////////////////////////////////////
    // Event handlers
    ///////////////////////////////////////////////////////////

    onDocumentKeyDown: function(evt) {
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
            return false;
        }
        return true;
    },

    onFilterStatusClick: function(evt) {
        var treeObj = evt.data.treeObj;
        treeObj.filterElem.children('.ftFilterInput').val('').trigger('keyup');
        treeObj.filtering = false;
        return false;

    },

    onFilterBoxModified: function(evt) {
        if (evt.keyCode == 27) // Esc key pressed
        {
            // Clear any existing filter
            evt.target.value = '';
        }

        var filter = evt.target.value || '';
        var treeObj = evt.data.treeObj;
        treeObj.handleHideTooltipEvent(evt);

        // remove char highlighting effects
        treeObj.root.find('.ftFilteredIn > .ftItemRow > .ftItemRowContent > .ftInnerRow > .ftItemText')
            .children().each(function(i, e) {
                var $e = $(e);
                $e.text($e.text());
            });

        // reset which rows are filtered
        treeObj.root.find('.ftFilteredIn').removeClass('ftFilteredIn');

        if (filter.length == 0)
        {
            treeObj.filtering = false;

            // remove filtering class
            treeObj.root.removeClass('ftFiltering');

            // hide filter status message
            treeObj.filterElem.children('.ftFilterStatus').hide();
        }
        else
        {
            treeObj.filtering = true;

            // filter out non matching entries
            var advancedFilter = loadSetting('useAdvancedTreeFiltering');
            var escapedFilter = filter.replace('"', '\\"'); // escape embedded double quotes
            if (advancedFilter) {
                filter = filter.replace(/ /g, '');
                var regexFilter = filter.split('').join('.*').replace('"', '\\"');
                var selector = '.ftItemText:regexicontains("' + regexFilter + '")';
            }
            else {
                var words = filter.split(' ');
                var regexFilter = words.join('.*').replace('"', '\\"');
                var selector = '.ftItemText:regexicontains("' + regexFilter + '")';
            }

            var matches = treeObj.root.find(selector).closest('.ftRowNode');

            // highlight matched letters in row's visible text
            treeObj.highlightMatches.call(treeObj, matches, filter, words, advancedFilter);

            // filter by additional per-rowType parameter filters
            for (var rowType in treeObj.rowTypes) {
                var extraParams = treeObj.rowTypes[rowType].filterByExtraParams;
                if (extraParams && extraParams.length > 0) {
                    for (var i in extraParams) {
                        var selector = '.ftRowNode[' + extraParams[i] + '*="' + escapedFilter + '"]';
                        matches = matches.add(treeObj.root.find(selector));
                    }
                }
            }

            // apply ftFilteredIn css class to matched rows
            matches.each(function(i, e) { $(e).addClass('ftFilteredIn'); });

            // apply filtering css styling which will filter out unmatched rows
            treeObj.root.addClass('ftFiltering');

            // show filter status message
            treeObj.filterElem.children('.ftFilterStatus').show();

        }
    },

    onTooltipMouseOver: function(evt) {
        $(this).hide();
    },

    onExpanderClick: function(evt) {
        var expander = $(this);
        var parentLI = expander.closest('.ftRowNode');
        evt.data.treeObj.toggleExpandRow(parentLI);
        evt.stopPropagation();
    },

    onMouseEnterButtons: function(evt) {
        var treeObj = evt.data.treeObj;
        treeObj.hoveringRowButtons = true;
        treeObj.handleHideTooltipEvent(evt);
    },

    onMouseLeaveButtons: function(evt) {
        var treeObj = evt.data.treeObj;
        var row = evt.data.treeObj.getParentRowNode($(this));
        treeObj.hoveringRowButtons = false;
        treeObj.startTooltipTimer(row, evt);
    },

    onItemRowContentMouseEnter: function(evt) {
        var treeObj = evt.data.treeObj;
        var row = treeObj.getParentRowNode($(this));

        treeObj.getButtons(row).parent().show();
        treeObj.hoveredRow = row;
        treeObj.startTooltipTimer(row, evt);
    },

    onItemRowContentMouseLeave: function(evt) {
        var treeObj = evt.data.treeObj;
        var row = treeObj.getParentRowNode($(this));

        treeObj.getButtons(row).parent().hide();
        treeObj.hoveredRow = null;
        treeObj.handleHideTooltipEvent(evt);
    },

    defaultFormatTitleHandler: function(row, itemTextElem) {
        var label = row.attr('label');
        var text = row.attr('text');

        itemTextElem.children('.ftItemTitle').text(text);

        if (label) {
            itemTextElem.children('.ftItemLabel').text(label + (text ? ': ' : ''));
        }
    },


    ///////////////////////////////////////////////////////////
    // Row click event handlers
    ///////////////////////////////////////////////////////////

    _rowMouseDownHandler: function(evt) {
        if (evt.data.onMiddleClick && evt.which == 2) {
            // middle click
            return false; // eat middle click event to avoid the autoscroll cursor
        }
    },

    _rowMouseUpHandler: function(evt) {
        var $this = $(this);
        var treeObj = evt.data.treeObj;
        var row = treeObj.getParentRowNode($this);
        evt.data.row = row;

        if (treeObj.hoveringRowButtons) {
            // we manage this state and manually check it here because jquery
            // doesn't really give us a way to only trigger a child-element's event handlers
            // without also triggering all container-element's handlers first;
            // this is basically the inverse of evt.stopPropagation()
            return;
        }

        // hide any visible tooltips
        treeObj.hideTooltip();

        // middle click
        if (evt.which == 2) {
            if (evt.data.onMiddleClick) {
                // handle middle click
                evt.data.onMiddleClick(evt);
            }
            return;
        }

        // left click
        if (evt.which == 1) {
            if (evt.ctrlKey || evt.shiftKey) {
                // we got a left click and ctrl or shift was held down
                treeObj._rowMultiSelectionClickHandler(evt);
                return;
            }

            // regular left click (no modifier keys)
            if (evt.data.onClick) {
                // clear existing multiselection if any
                treeObj.clearMultiSelection();

                if (evt.data.autofocusOnClick !== false) {
                    // automatically set focus to clicked row
                    treeObj.focusRow(row);
                }

                // handle left click
                evt.data.onClick(evt);
            }
            return;
        }
    },

    _rowMultiSelectionClickHandler: function(evt) {
        if (evt.data.multiselectable === false) {
            // cannot multiselect this type of row
            return;
        }

        var row = evt.data.row;
        var treeObj = evt.data.treeObj;
        var focusedId = treeObj.focusedRow.attr('id');
        var fromId = treeObj.lastMultiSelectedToId || focusedId;
        var id = row.attr('id');

        if (evt.ctrlKey) {
            treeObj.lastMultiSelectedFromId = null; // prevent shift+selection from expanding selection chain
            if (evt.shiftKey) {
                // Ctrl+Shift: Incrementally add spanned range of rows to current multiselection
                treeObj.addMultiSelectionBetween(fromId, id);
            }
            else {
                // Ctrl: Un/select a single row

                // Do we have any multiselection yet? If not, add the current focused id
                // in addition to the ctrl+clicked row
                if (treeObj.multiSelection.length == 0) {
                    // Don't support ctrl+clicking the currently focused row if nothing
                    // else is selected
                    if (focusedId == id) {
                        return;
                    }
                    // turn on selection of focused row
                    treeObj.toggleMultiSelectionSingle(focusedId);
                }
                // toggle selection ctrl+clicked row
                treeObj.toggleMultiSelectionSingle(id);
            }
            treeObj.lastMultiSelectedToId = id;
            return;
        }

        if (evt.shiftKey && fromId) {
            if (!treeObj.lastMultiSelectedFromId) {
                // if this isn't a continuation of a previous shift+select,
                // clear selection first
                treeObj.clearMultiSelection();
            }
            // select range of rows
            treeObj.addMultiSelectionBetween(fromId, id);
            treeObj.lastMultiSelectedFromId = fromId;
            treeObj.lastMultiSelectedToId = id;
            return;
        }
    },

    _rowDoubleClickHandler: function(evt) {
        if (evt.which != 1) {
            // not the left mouse button
            return;
        }

        if (evt.ctrlKey || evt.shiftKey) {
            // don't perform double click actions when ctrl/shift selecting
            return;
        }

        var $this = $(this);
        var treeObj = evt.data.treeObj;
        var row = treeObj.getParentRowNode($this);

        if (treeObj.hoveringRowButtons) {
            // we manage this state and manually check it here because jquery
            // doesn't really give us a way to only trigger a child-element's event handlers
            // without also triggering all container-element's handlers first
            return;
        }

        treeObj.hideTooltip();

        evt.data.row = row;
        evt.data.onDoubleClick(evt);
    },

    _rowButtonClickHandler: function(evt) {
        $('#ftSimpleTip').hide();
        evt.data.row = $(this).closest('li');
        evt.data.onClick(evt);
        evt.stopPropagation();
        return false;
    },


    ///////////////////////////////////////////////////////////
    // Multiselection
    ///////////////////////////////////////////////////////////

    toggleMultiSelectionSingle: function(id) {
        var row = ft.getRow(id);
        var index = this.multiSelection.indexOf(id);
        if (index > -1) {
            // already in selection so remove it
            this.multiSelection.splice(index, 1);
            this.removeSelectionEffect(row);

            if (this.multiSelection.length == 0) {
                this.clearMultiSelection();
            }
            return;
        }

        // add to selection
        this.multiSelection.push(id);
        this.addSelectionEffect(row);
        this.root.addClass('ftMultiselecting');
    },

    addMultiSelectionBetween: function(fromId, toId) {
        // if fromId and toId are the same, just do a single selection
        if (fromId == toId) {
            this.toggleMultiSelectionSingle(fromId);
            return;
        }


        var rows;
        if (this.filtering) {
            // when tree is filtered, only select pages which match the filter
            rows = this.root.find('.ftFilteredIn');
        }
        else {
            // select from all pages
            // TODO handle pages that are not visible due to
            // parent branch being collapsed
            rows = this.root.find('.ftRowNode');
        }

        // build a list of rowtypes which may be multiselected
        var multiselectableRowTypes = mapObjectProps(this.rowTypes, function(k, v) {
            return (v.multiselectable === false ? undefined : k);
        });

        // filter out non-multiselectable rows
        rows = rows.filter(function(i, e) {
            return (multiselectableRowTypes.indexOf(e.attributes.rowtype.value) >= 0);
        });

        // flatten the tree to get the ids in the visible page order disregarding nesting
        var flattened = rows.map(function(i, e) { return e.id; }).toArray();

        // find index of start and end tabs
        var start = flattened.indexOf(fromId);
        var end = flattened.indexOf(toId);

        if (start == -1 || end == -1) {
            throw new Error('Could not find both start and end indices ' + fromId + ', ' + toId);
        }

        // switch start and end around if start doesn't precede end
        if (start > end) {
            var swap = start;
            start = end;
            end = swap;
        }

        // get the list of ids between start and end inclusive
        var range = flattened.slice(start, end + 1);

        if (range.length == 0) {
            return;
        }

        // add these to multiSelection
        var thisObj = this;
        range.forEach(function(e) {
            if (thisObj.multiSelection.indexOf(e) == -1) {
                thisObj.multiSelection.push(e);
                thisObj.addSelectionEffect(thisObj.getRow(e));
            }
        });

        this.root.addClass('ftMultiselecting');

        return;
    },

    clearMultiSelection: function() {
        // remove visual selection effects
        var thisObj = this;
        this.multiSelection.forEach(function(e) {
            thisObj.removeSelectionEffect(thisObj.getRow(e));
        });
        this.root.removeClass('ftMultiselecting');

        // reset multiSelection variables
        this.multiSelection = [];
        this.lastMultiSelectedFromId = null;
        this.lastMultiSelectedToId = null;
    },

    addSelectionEffect: function(row)
    {
      row.addClass('ftSelected');
    },

    removeSelectionEffect: function(row)
    {
      row.removeClass('ftSelected');
    },


    ///////////////////////////////////////////////////////////
    // Tooltip control
    ///////////////////////////////////////////////////////////

    startTooltipTimer: function(row, evt, afterDelay) {
        // block tooltip from showing if permitTooltipHandler says so
        if (this.permitTooltipHandler && !this.permitTooltipHandler()) {
            return;
        }

        var treeObj = this;
        this.tooltipShowTimer = setTimeout(function() {
            // obtain and pass bodyWidth here due to some oddness where within showTooltip,
            // document.body.clientWidth always returns the body width as it was when
            // the FancyTree object was created, even if window has since been resized
            var bodyWidth = document.body.clientWidth;
            treeObj.showTooltip.call(treeObj, row, bodyWidth, evt);
        }, (afterDelay >= 0 ? afterDelay : ROW_TOOLTIP_SHOW_DELAY_MS));
    },

    handleHideTooltipEvent: function(evt) {
        var treeObj = evt.data.treeObj;
        treeObj.hideTooltip.call(treeObj);
    },

    hideTooltip: function() {
        $('#ftSimpleTip').hide();

        if (this.tooltip) {
            this.tooltip.remove();
            this.tooltip = null;
        }

        if (this.tooltipShowTimer) {
            clearTimeout(this.tooltipShowTimer);
            this.tooltipShowTimer = null;
        }
    },

    showTooltip: function(row, bodyWidth, evt) {
        // block tooltip from showing if permitTooltipHandler says so
        if (this.permitTooltipHandler && !this.permitTooltipHandler()) {
            return;
        }

        var rowType = row.attr('rowtype');
        var typeParams = this.rowTypes[rowType];
        var onFormatTooltip = typeParams.onFormatTooltip;
        var onResizeTooltip = typeParams.onResizeTooltip;
        var content = this.getItemRowContent(row);
        var pos = content.offset();

        // reset tooltip
        var tooltip = $('<div id="ftTooltip"/>').attr('rowtype', rowType).hide();
        this.tooltip = tooltip;

        $('body').append(tooltip);

        // load tooltip content via onFormatTooltip
        if (evt === undefined) {
            evt = {};
        }
        evt.data = {
            tooltip: tooltip,
            row: row,
            content: content,
            label: row.attr('label'),
            text: row.attr('text'),
            icon: row.attr('icon'),
            treeObj: this,
            rowTypeParams: typeParams
        };

        // append tooltip content
        tooltip.append(onFormatTooltip(evt));

        // adjust tooltip width
        var maxWidth = Math.min(typeParams.tooltipMaxWidthFixed || 9999,
            Math.floor(typeParams.tooltipMaxWidthPercent * window.innerWidth) || 9999);

        var width = tooltip.width();
        if (width > maxWidth) {
            tooltip.width(maxWidth);
            evt.data.width = maxWidth;
            width = maxWidth;
            if (onResizeTooltip) {
                onResizeTooltip(evt);
            }
        }

        // show tooltip
        tooltip.show();

        // position tooltip above the row
        var rightOverflow = -(bodyWidth - pos.left - width - 5);
        var newpos = {
            left: (rightOverflow <= 0 ? pos.left : Math.max(0, bodyWidth - width - 6)),
            top: pos.top - (tooltip.height() + this.tooltipTopOffset)
        };
        tooltip.offset(newpos);

        // if tooltip is now at least partly offscreen, move it to below the row instead
        if (!isScrolledIntoView(tooltip)) {
            // put below
            newpos.top = pos.top + this.tooltipTopOffset + content.height();
            tooltip.offset(newpos);
        }
    },


    ///////////////////////////////////////////////////////////
    // Row element and information retrieval functions
    ///////////////////////////////////////////////////////////

    getParentRowNode: function(elem) {
        return elem.closest('.ftRowNode');
    },

    getItemRowContent: function(elem) {
        return elem.children('.ftItemRow').children('.ftItemRowContent');
    },

    getInnerRow: function(elem) {
        return this.getItemRowContent(elem).children('.ftInnerRow');
    },

    getButtons: function(elem) {
        return this.getItemRowContent(elem).children('.ftButtons').children();
    },

    getChildrenContainer: function(elem) {
        return elem.children('.ftChildren');
    },

    getChildrenCount: function(elem) {
        return this.getChildrenContainer(elem).find('.ftRowNode').length;
    },

    getRowTypeParams: function(row) {
        return this.rowTypes[row.attr('rowtype')];
    },


    ///////////////////////////////////////////////////////////
    // Row HTML element construction
    ///////////////////////////////////////////////////////////

    // construct an empty HTML element for a given rowType
    buildRowTypeElem: function(rowType) {
        var params = this.rowTypes[rowType];

        // create elements
        var rowContainer = $('<li/>', { rowtype: rowType, class: 'ftRowNode' });
        var itemRow = $('<div/>', { class: 'ftItemRow' });
        var expander = $('<img/>', { class: 'ftIconButton ftTreeControl ftNode', src: '/images/x.gif' });
        var itemRowContent = $('<div/>', { class: 'ftItemRowContent' });
        var innerRow = $('<div/>', { class: 'ftInnerRow' });
        var icon = $('<img/>', { class: 'ftIconButton ftRowIcon', src: icon });
        var itemText = $('<div/>', { class: 'ftItemText' });
        var itemLabel = $('<span/>', { class: 'ftItemLabel' });
        var itemInnerTitle = $('<span/>', { class: 'ftItemTitle' });
        var buttons = $('<div/>', { class: 'ftButtons' });
        var children = $('<ul/>', { class: 'ftChildren' });

        // set iconerror handler
        if (params.onIconError) {
            icon.error({ treeObj: this }, function(evt) {
                evt.data.row = evt.data.treeObj.getParentRowNode($(this));
                params.onIconError(evt);
            });
        }

        // build buttons
        for (var i in params.buttons) {
            var buttonSpec = params.buttons[i];
            var button = $('<img>', {
                class: 'ftIconButton ftButton__' + rowType + '_' + i,
                src: buttonSpec.icon,
                tooltip: buttonSpec.tooltip
            });
            buttons.append(button);
        }

        // construction
        itemText
            .append(itemLabel)
            .append(itemInnerTitle);

        innerRow
            .append(icon)
            .append(itemText);

        itemRowContent
            .append(innerRow)
            .append(buttons);

        itemRow
            .append(expander)
            .append(itemRowContent);

        rowContainer
            .append(itemRow)
            .append(children);

        return rowContainer;
    },

    // clone a new rowType's baseElement and populate it with the provided arguments
    getNewRowElem: function(rowType, id, icon, label, text, extraAttributes, collapsed) {
        var rowTypeParams = this.rowTypes[rowType];
        var row = rowTypeParams.baseElement.clone(true, true);
        var innerRow = this.getInnerRow(row);
        var iconElem = innerRow.find('.ftRowIcon');

        row
            .attr('id', id)
            .attr('label', label)
            .attr('text', text)
            .attr('icon', icon);

        // set row's icon
        iconElem.attr('src', icon);

        // set collapsed state
        if (collapsed) {
            row.addClass('ftCollapsed');
        }

        // add extra attribs
        if (extraAttributes) {
            row.attr(extraAttributes);
        }

        // format title
        rowTypeParams.onFormatTitle(row, innerRow.children('.ftItemText'));

        // configure row button tooltips
        this.setRowButtonTooltips(row);

        return row;
    },


    ///////////////////////////////////////////////////////////
    // Row helper functions
    ///////////////////////////////////////////////////////////

    setRowButtonTooltips: function(row) {
        var rowType = row.attr('rowtype');
        var buttons = this.getButtons(row);

        buttons.each(function(i, e) {
            var $e = $(e);
            $e.attr('title', $e.attr('tooltip'));
        });

        buttons.tooltip(this.rowButtonTooltipParams);
    },

    updateRowExpander: function(row) {
        var cnt = row.find('.ftChildren').children().length;
        var expander = row.children('.ftItemRow').children('.ftTreeControl');

        if (cnt == 0) {
            expander.removeClass('ftExpander').addClass('ftNode');
            row.removeClass('ftCollapsed');
            return;
        }

        expander.removeClass('ftNode').addClass('ftExpander');
    },

    // Call rowType.onFormatTitle() on the given row and all its parent rows
    formatLineageTitles: function(row) {
        var thisObj = this;
        row.parents('.ftRowNode').add(row).each(function(i, e) {
            var $e = $(e);
            thisObj.getRowTypeParams($e).onFormatTitle($e);
        });
    },


    ///////////////////////////////////////////////////////////
    // Filter substring/subchar highlighting
    ///////////////////////////////////////////////////////////

    highlightMatches: function(elements, filter, words, advancedFilterUsed) {
        var thisObj = this;

        elements.each(function(i, e) {
            var $e = $(e);
            var $textElem = $e.find('.ftItemRow > .ftItemRowContent > .ftInnerRow > .ftItemText');

            if (advancedFilterUsed) {
                thisObj.highlightMatchChars.call(this, $textElem, filter);
            }
            else {
                thisObj.highlightMatchWords.call(this, $textElem, words);
            }

        });
    },

    highlightMatchChars: function(elem, filter) {
        var lastCharIndex = 0;

        elem.children().each(function(i, f) {
            var $f = $(f);
            var text = $f.text();
            var newHtml = '';

            // match individual chars
            if (lastCharIndex == filter.length) {
                // already all matched up
                newHtml = text;
            }
            else {
                for (var charIndex in text) {
                    if (filter[lastCharIndex].toLowerCase() == text[charIndex].toLowerCase()) {
                        // this character was part of the search
                        newHtml += '<span class="ftHighlightChar">' + text[charIndex] + '</span>';
                        lastCharIndex++;
                    }
                    else {
                        // this character was not part of the search
                        newHtml += text[charIndex];
                    }
                    if (lastCharIndex == filter.length) {
                        // filter chars have all been matched up, so just output
                        // the remainder of the text as is
                        newHtml += (text.slice(parseInt(charIndex) + 1));
                        break;
                    }
                }
            }
            $f.html(newHtml);
        });
    },

    highlightMatchWords: function(elem, words) {
        var lastWordIndex = 0;

        elem.children().each(function(i, f) {
            var $f = $(f);
            var text = $f.text();
            var newHtml = '';

            // match word-chunks
            for (var wordIndex = lastWordIndex; wordIndex < words.length; wordIndex++) {
                var word = words[wordIndex];
                var pos = text.toLowerCase().indexOf(word);
                if (pos > -1) {
                    // word found, add preceding text as plain and word as highlighted
                    newHtml += text.slice(0, pos)
                        + '<span class="ftHighlightChar">'
                        + text.slice(pos, pos + word.length)
                        + '</span>';
                    text = text.slice(pos + word.length); // remainder
                    lastWordIndex++;
                }
                else {
                    // word not found
                    break;
                }
            }

            // add any remaining text
            newHtml += text;

            $f.html(newHtml);
        });
    }

};
