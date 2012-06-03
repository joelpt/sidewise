/**
  * @constructor
  * @param appendToElem The root DOM element to append the FancyTree under.
  * @param options A dictionary of options, all optional:
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
  *              onClick: Function(evt),         // left click event handler
  *              onMiddleClick: Function(evt),   // middle click event handler
  *              onIconError: Function(evt),     // row icon onerror event handler
  *              onFormatTooltip: Function(evt), // called to obtain the body for a row tip for display
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
  *
  *       All rowTypes' event handlers are passed the hosting FancyTree object in evt.data.treeObj, and the
  *       involved row's <li> jQuery element in evt.data.row.
  *
  */
var FancyTree = function(appendToElem, options) {
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
        filterElem.append(
            $('<div/>', { class: 'ftFilterStatus' })
                .text(options.filterActiveText || 'Matches shown, click x or hit Esc to clear')
        );

        // put filter box before tree element
        rootNode.before(filterElem);
        this.filterElem = filterElem;
    }

    // configure tree initial state
    this.root = rootNode;

    this.permitTooltipHandler = options.permitTooltipHandler;
    this.focusedRow = null;
    this.hoveringRowButtons = false;
    this.tooltipTopOffset = options.tooltipTopOffset || 12;
    this.tooltip = null;
    this.simpletip = $('<div id="ftSimpleTip"/>').hide();
    $('body').append(this.simpletip);
    this.tooltipShowTimer = null;

    // configure row types
    this.rowTypes = {};
    var rowTypes = options.rowTypes || {'row': {}};
    for (var rowType in rowTypes) {
        this.addRowType(rowType, rowTypes[rowType]);
    }

    // configure tree's event handlers
    var treeObj = this;
    var data = { treeObj: treeObj };
    $(document).on('mouseenter', '.ftItemRowContent', data, this.onItemRowContentMouseEnter);
    $(document).on('mouseleave', '.ftItemRowContent', data, this.onItemRowContentMouseLeave);
    $(document).on('mouseover', '#ftTooltip', data, this.handleHideTooltipEvent);
    $(document).on('click', '.ftExpander', data, this.onExpanderClick);
    $(document).on('mouseenter', '.ftButtons', data, this.onMouseEnterButtons);
    $(document).on('mouseleave', '.ftButtons', data, this.onMouseLeaveButtons);
    $(document).on('resize', 'window', data, this.onWindowResize);

    if (options.showFilterBox != false) {
        // add event handlers for filter box
        $(document).on('click', this.filterElem, data, this.onFilterBoxModified);
        $(document).on('keyup', this.filterElem, data, this.onFilterBoxModified);
        $(document).keydown(data, this.onKeypress);
    }

    console.log('FancyTree initialized');
}

FancyTree.prototype = {

    onKeypress: function(evt) {
        if (evt.keyCode == 70 && evt.ctrlKey) { // Ctrl+F
            evt.data.treeObj.filterElem.children('.ftFilterInput').focus();
            evt.stopPropagation();
            return false;
        }
        return true;
    },

    onFilterBoxModified: function(evt) {
        if (evt.keyCode == 27) // Esc key pressed
        {
            // Clear any existing filter
            evt.target.value = '';
        }

        var filter = evt.target.value || '';
        console.log('onFilterBoxModified to: ' + filter);

        var treeObj = evt.data.treeObj;

        // reset which rows are filtered in before applying new filter rule
        treeObj.root.find('.ftRowNode.ftFilteredIn').removeClass('ftFilteredIn');

        if (filter.length == 0)
        {
            // no filter now present
            treeObj.root.removeClass('ftFiltering');

            // hide filter status message
            treeObj.filterElem.children('.ftFilterStatus').hide();
        }
        else
        {
            // filter out non matching entries
            var escapedFilter = filter.replace('"', '\\"'); // escape embedded double quotes
            var selector = '.ftItemText:icontains("' + escapedFilter + '")';
            var matches = treeObj.root.find(selector).closest('.ftRowNode');

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

            // apply filtering css classes to matched rows
            matches.each(function(i, e) {
                  $(e).addClass('ftFilteredIn');
                }
            );

            // apply filtering css styling
            treeObj.root.addClass('ftFiltering');

            // show filter status message
            treeObj.filterElem.children('.ftFilterStatus').show();

        }
    },

    onWindowResize: function(evt) {
        evt.data.treeObj.handleHideTooltipEvent();
    },

    onTooltipMouseOver: function(evt) {
        $(this).hide();
    },

    onMouseEnterButtons: function(evt) {
        evt.data.treeObj.hoveringRowButtons = true;
        evt.data.treeObj.handleHideTooltipEvent(evt);
    },

    onMouseLeaveButtons: function(evt) {
        var row = evt.data.treeObj.getParentRowNode($(this));
        evt.data.treeObj.hoveringRowButtons = false;
        evt.data.treeObj.startTooltipTimer(row, evt);
    },

    onItemRowContentMouseEnter: function(evt) {
        var $this = $(this);
        var treeObj = evt.data.treeObj;

        $this.closest('.ftItemRowContent').find(".ftButtons").show();

        var row = evt.data.treeObj.getParentRowNode($this);
        treeObj.startTooltipTimer.call(treeObj, row, evt);
    },

    onItemRowContentMouseLeave: function(evt) {
        $(this).closest('.ftItemRowContent').find(".ftButtons").hide();
        evt.data.treeObj.handleHideTooltipEvent(evt);
    },

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
        }, (afterDelay || 1000));
    },

    handleHideTooltipEvent: function(evt) {
        var treeObj = evt.data.treeObj;
        treeObj.hideTooltip.call(treeObj);
    },

    hideTooltip: function() {
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
            label: content.find('.ftItemLabel').text(),
            title: content.find('.ftItemTitle').text(),
            icon: content.find('.ftRowIcon').attr('src'),
            treeObj: this
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

    onExpanderClick: function(evt) {
        var expander = $(this);
        var parentLI = expander.closest('li');
        evt.data.treeObj.toggleExpandElem(parentLI);
        evt.stopPropagation();
    },

    /**
      * @param name     The name of the row type used for referencing it elsewhere.
      * @param params   The row type's parameters; see FancyTree class header for details
      */
    addRowType: function(name, params) {
        this.rowTypes[name] = params;

        var data = { treeObj: this, onClick: params.onClick, onMiddleClick: params.onMiddleClick };
        var mouseDownHandler = function(evt) {
            if (evt.data.onMiddleClick && evt.which == 2) {
                // middle click
                return false; // eat middle click event to avoid the autoscroll cursor
            }
        };

        var mouseUpHandler = function(evt) {
            var $this = $(this);
            var treeObj = evt.data.treeObj;
            var row = treeObj.getParentRowNode($this);

            if (treeObj.hoveringRowButtons) {
                // we manage this state and manually check it here because jquery
                // doesn't really give us a way to only trigger a child-element's event handlers
                // without also triggering all container-element's handlers first
                return;
            }

            $('#ftSimpleTip').hide();
            treeObj.hideTooltip();

            evt.data.row = row;

            if (evt.which == 1 && evt.data.onClick) {
                // handle left click
                evt.data.onClick(evt);
                return;
            }

            if (evt.which == 2 && evt.data.onMiddleClick) {
                // handle middle click
                evt.data.onMiddleClick(evt);
                return;
            }
        };

        $(document).on('mousedown',
            '.ftRowNode[rowtype=' + name + '] > .ftItemRow > .ftItemRowContent',
            data, mouseDownHandler);
        $(document).on('mouseup',
            '.ftRowNode[rowtype=' + name + '] > .ftItemRow > .ftItemRowContent',
            data, mouseUpHandler);

        for (var i in params.buttons)
        {
            var buttonClass = '.ftButton__' + name + '_' + i;
            var buttonData = { treeObj: this, onClick: params.buttons[i].onClick };
            $(document).on('click', buttonClass, buttonData, function(evt) {
                $('#ftSimpleTip').hide();
                evt.data.row = $(this).closest('li');
                evt.data.onClick(evt);
                evt.stopPropagation();
            });
        }
    },

    addElem: function(elem, parentId) {
        if (!parentId) {
            // When parentId is missing just add elem to the root level children
            this.root.children('.ftChildren').append(elem);
            return;
        }
        var parent = this.getElem(parentId);
        parent.children('.ftChildren').append(elem);
        this.updateRowExpander(parent);
    },

    removeElem: function(id) {
        var elem = this.getElem(id);
        var parent = elem.parent().parent();

        // ensure button tooltips don't popup after the row is removed, after the tips' predelay
        this.getButtons(elem)
            .each(function(i, e) { $(e).data('tooltip').onShow(function() { this.hide(); } ); })

        elem.replaceWith(elem.children('.ftChildren').children());
        this.updateRowExpander(parent);
        this.hideTooltip();
    },

    moveElem: function(id, newParentId, beforeSiblingId) {
        var elem = this.getElem(id);
        var oldParent = elem.parent().parent();

        var newParent;
        if (!newParentId) {
            newParent = this.root;
        }
        else {
            newParent = this.getElem(newParentId);
        }

        if (!beforeSiblingId && oldParent.get(0).id == newParent.get(0).id) {
            return;
        }

        this.removeElem(id); // prevents possible DOM_HIERARCHY exceptions

        var children = this.getChildrenContainer(newParent);
        if (beforeSiblingId) {
            var sibling = children.children('#' + beforeSiblingId);
            if (sibling.length == 0) {
                throw 'Could not find sibling with id ' + beforeSiblingId;
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
    },

    updateElem: function(id, icon, label, text, extraAttributes) {
        var elem = this.getElem(id);
        var innerRow = this.getInnerRow(elem);

        if (icon != null && icon !== undefined) {
            innerRow.children('.ftRowIcon').attr('src', icon);
        }

        if (label != null && label !== undefined) {
            if (label == '') {
                innerRow.children('.ftItemText').children('.ftItemLabel').text('');
            }
            else {
                innerRow.children('.ftItemText').children('.ftItemLabel').text(label + (text ? ': ' : ''));
            }
        }

        if (text != null && text !== undefined) {
            innerRow.children('.ftItemText').children('.ftItemTitle').text(text);
        }

        if (extraAttributes) {
            elem.attr(extraAttributes);
        }

    },

    focusElem: function(id) {
        var elem = this.getElem(id);

        if (this.focusedRow) {
            this.focusedRow.removeClass('focused');
        }

        this.focusedRow = elem;
        elem.addClass('focused');

        if (!isScrolledIntoView(elem)) {
            $.scrollTo(elem, 150);
        }
    },

    expandElem: function(id) {
        var elem = this.getElem(id);
        if (elem.hasClass('collapsed')) {
            var children = this.getChildrenContainer(elem);
            children.slideToggle(100, function() { elem.removeClass('collapsed'); });
        }
    },

    collapseElem: function(id) {
        var elem = this.getElem(id);
        if (!elem.hasClass('collapsed')) {
            var children = this.getChildrenContainer(elem);
            children.slideToggle(100, function() { elem.addClass('collapsed'); });
        }
    },

    /**
      * @returns true if element is now expanded, false if now collapsed
      */
    toggleExpandElem: function(id) {
        var elem = this.getElem(id);
        if (elem.hasClass('collapsed')) {
            this.expandElem(id);
            return true;
        }
        this.collapseElem(id);
        return false;
    },

    getElem: function(idOrElem) {
        if (idOrElem instanceof jQuery) {
            return idOrElem;
        }

        var elem = $('#' + idOrElem);
        // var elem = this.root.find('#' + idOrElem); // this method is ~5x slower

        if (elem.length == 0) {
            throw 'Could not find element with id ' + idOrElem;
        }

        return elem;
    },

    updateRowExpander: function(elem) {
        var cnt = elem.find('.ftChildren').children().length;
        var expander = elem.children('.ftItemRow').children('.ftTreeControl');

        if (cnt == 0) {
            expander.removeClass('ftExpander').addClass('ftNode');
            return;
        }

        expander.removeClass('ftNode').addClass('ftExpander');
    },

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

    setRowButtonTooltips: function(elem) {
        var rowType = elem.attr('rowtype');
        var buttons = this.getButtons(elem);

        buttons.each(function(i, e) {
            var $e = $(e);
            $e.attr('title', $e.attr('tooltip'));
        });

        var treeObj = this;
        buttons.tooltip({
            tip: '#ftSimpleTip',
            predelay: 600,
            position: 'top left',
            offset: [-10, 10],
            onShow: function(evt) {
                if (treeObj.permitTooltipHandler && !treeObj.permitTooltipHandler()) {
                    this.hide();
                }
            }
        });
    },

    getNewElem: function(rowType, id, icon, label, text, extraAttributes, collapsed, cssClasses) {
        var params = this.rowTypes[rowType];
        var li = $('<li>', { id: id, rowtype: rowType })
            .addClass(cssClasses)
            .addClass('ftRowNode');

        if (collapsed) {
            li.addClass('collapsed');
        }

        if (extraAttributes) {
            li.attr(extraAttributes);
        }

        var itemRow = $('<div class="ftItemRow">');

        var expander = $('<img/>', { class: 'ftIconButton ftTreeControl ftNode', src: '/images/x.gif' });

        var itemRowContent = $('<div class="ftItemRowContent">');
        itemRow.append(itemRowContent);

        var innerRow = $('<div class="ftInnerRow">');

        var icon = $('<img/>', { class: 'ftIconButton ftRowIcon', src: icon });
        if (params.onIconError) {
            icon.error({ treeObj: this, row: li }, params.onIconError);
        }

        var itemTitle = $('<div class="ftItemText">');

        var itemLabel = $('<span class="ftItemLabel">');
        if (label) {
            itemLabel.text(label + (text ? ': ' : ''));
        }

        var itemInnerTitle = $('<span class="ftItemTitle">').text(text);
        itemTitle.append(itemLabel);
        itemTitle.append(itemInnerTitle);

        var buttons = $('<div class="ftButtons">');

        for (var i in params.buttons) {
            var buttonSpec = params.buttons[i];
            var button = $('<img>', {
                class: 'ftIconButton ftButton__' + rowType + '_' + i,
                src: buttonSpec.icon,
                tooltip: buttonSpec.tooltip
            });
            buttons.append(button);
        }

        innerRow
            .append(icon)
            .append(itemTitle);

        itemRowContent
            .append(innerRow)
            .append(buttons);

        itemRow.append(expander)
            .append(itemRowContent);

        li.append(itemRow);

        var children = $('<ul class="ftChildren">');
        li.append(children);
        this.setRowButtonTooltips(li);
        return li;
    }

};
