/**
  * @constructor
  * @param rootElem The root DOM element to attach the FancyTree to.
  */
var FancyTree = function(rootElem, permitTooltipHandler) {
    var rootNode = $('<li class="ftRoot">');
    var rootUL = $('<ul class="ftChildren">');
    rootNode.append(rootUL);
    $(rootElem).append(rootNode);

    this.root = rootNode;
    this.rowTypes = {};
    this.focusedRow = null;
    this.lastFocusedWinId = null; // TODO don't do this here
    this.permitTooltipHandler = permitTooltipHandler;
    this.tooltipTopOffset = 12;
    this.hoveringRowButtons = false;

    this.tooltip = null;
    this.simpletip = $('<div id="ftSimpleTip"/>').hide();
    $('body').append(this.simpletip);
    this.tooltipShowTimer = null;

    var treeObj = this;
    var data = { treeObj: treeObj };

    $(document).on('mouseenter', '.ftItemRowContent', data, this.onItemRowContentMouseEnter);
    $(document).on('mouseleave', '.ftItemRowContent', data, this.onItemRowContentMouseLeave);
    $(document).on('mouseover', '#ftTooltip', data, this.handleHideTooltipEvent);
    $(document).on('click', '.ftExpander', data, this.onExpanderClick);
    $(document).on('mouseenter', '.ftButtons', data, this.onMouseEnterButtons);
    $(document).on('mouseleave', '.ftButtons', data, this.onMouseLeaveButtons);
    $(document).on('resize', 'window', data, this.onWindowResize);

    // TODO decide whether this should really be here or should instead be
    // outside of it somehow; to abstract it we might want to pass in a function
    // named permitTooltipHandler which is called and declines to show the tip
    // if that function returns false.

    var treeObj = this;
    chrome.windows.onFocusChanged.addListener(function(winId) {
        treeObj.lastFocusedWinId = winId;
    });

    console.log('Initted FancyTree');

    var buttonsHoverTimer;
}

FancyTree.prototype = {

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

    // onHideUntilHoverMouseEnter: function(evt) {
    //     $(this).closest('.ftInnerRow').data('tooltip').hide();
    // },

    /**
      * @param name     The name of the row type used for referencing it elsewhere.
      * @param params   A dictionary consisting of:
      *                 {
      *                     onClick: Function(Event),         // called when row is left-clicked
      *                     onMiddleClick: Function(Event),   // called when row is middle-clicked
      *                     onFormatTooltip: Function(Event), // called to obtain row's tooltip html content
      *                     onResizeTooltip: Function(Event), // called when tooltip must be width-resized
      *                     tooltipMaxWidthPercent: number,   // expects 0.0 - 1.0
      *                     tooltipMaxWidthFixed: number,     // expects an integer
      *                     buttons: [
      *                         { icon: 'url', tooltip: 'tooltip message', onClick: Function(evt) },
      *                         ...
      *                     ]
      *                 }
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
            var buttonClass = '.ftButton__' + name + '__' + i;
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

        var elem = this.root.find('#' + idOrElem);

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
                class: 'ftIconButton',
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


                // <li class="selected collapsed">
                //     <div class="ftItemRow">
                //         <img class="ftIconButton ftExpander" src="/images/x.gif"/>
                //         <div class="ftInnerRow">
                //             <img class="ftIconButton" src="/images/sidewise_icon_16.png"/>
                //             <div class="ftItemText"><span class="ftItemLabel">Label: </span>this is a little bit this is a little bit this is a little bit this is a little bit</div>
                //             <div class="hideUntilHover">
                //                 <img class="ftIconButton" src="/images/reload.png"/><img class="ftIconButton" src="/images/close.png"/>
                //             </div>
                //         </div>
                //     </div>
                //     <ul class="ftChildren">
