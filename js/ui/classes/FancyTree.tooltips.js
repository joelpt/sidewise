///////////////////////////////////////////////////////////
// FancyTree.tooltips.js
// Tooltip manipulation
///////////////////////////////////////////////////////////

FancyTree.prototype.startTooltipTimer =  function(row, evt, afterDelay) {
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
};

FancyTree.prototype.handleHideTooltipEvent =  function(evt) {
    var treeObj = evt.data.treeObj;
    treeObj.hideTooltip.call(treeObj);
};

FancyTree.prototype.hideTooltip =  function(justRowTip) {
    if (!justRowTip) {
        $('#ftSimpleTip').hide();
    }

    if (this.tooltip) {
        this.tooltip.remove();
        this.tooltip = null;
    }

    if (this.tooltipShowTimer) {
        clearTimeout(this.tooltipShowTimer);
        this.tooltipShowTimer = null;
    }
};

FancyTree.prototype.showTooltip =  function(row, bodyWidth, evt) {
    // block tooltip from showing if permitTooltipHandler says so
    if (this.permitTooltipHandler && !this.permitTooltipHandler()) {
        return;
    }

    // don't show tooltip when context menu is visible
    if (this.contextMenuShown) {
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
    if (tooltip.offset().top < 0) {
        // put below
        newpos.top = pos.top + this.tooltipTopOffset + content.height();
        tooltip.offset(newpos);
    }
};