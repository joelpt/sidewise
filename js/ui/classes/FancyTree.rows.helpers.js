///////////////////////////////////////////////////////////
// FancyTree.rows.helpers.js
// Row helper functions
///////////////////////////////////////////////////////////

var TITLE_FORMAT_START_DELAY_MS = 20;

FancyTree.prototype.setRowButtonTooltips = function(row) {
    var rowType = row.attr('rowtype');
    var buttons = this.getButtons(row);
    var self = this;

    buttons.each(function(i, e) {
        var $e = $(e);
        if ($e.data('tooltip')) {
            return;
        }
        $e.attr('title', $e.attr('tooltip'));
        $e.tooltip(self.rowButtonTooltipParams);
    });
};

FancyTree.prototype.updateRowExpander = function(row) {
    var cnt = row.find('.ftChildren').children().length;
    var expander = row.children('.ftItemRow').children('.ftTreeControl');

    if (cnt == 0) {
        expander.removeClass('ftExpander').addClass('ftNode');
        row.removeClass('ftCollapsed');
        return;
    }

    expander.removeClass('ftNode').addClass('ftExpander');
};

FancyTree.prototype.formatRowTitle = function($rows) {
    var self = this;
    $rows.each(function(i, e) {
        var $row = $(e);
        var id = $row.attr('id');
        if (!id) return;
        self.formatTitleQueue[id] = $row;
    });

    if (!this.formatTitleTimer) {
        this.formatTitleTimer = setTimeout(function() {
            self.processTitleFormatQueue.call(self);
        }, TITLE_FORMAT_START_DELAY_MS);
    }
};

FancyTree.prototype.processTitleFormatQueue = function() {
    clearTimeout(this.formatTitleTimer);
    this.formatTitleTimer = null;

    for (var id in this.formatTitleQueue) {
        var row = this.formatTitleQueue[id];
        var rowTypeParams = this.getRowTypeParams(row);
        if (rowTypeParams && rowTypeParams.onFormatTitle) {
            rowTypeParams.onFormatTitle(row);
        }
    }

    this.formatTitleQueue = {};
};

// Call rowType.onFormatTitle() on the given rows and all its parent rows
FancyTree.prototype.formatLineageTitles = function($rows) {
    this.formatRowTitle($rows.parents('.ftRowNode').add($rows));
};

// Format all row titles
// @param matcher Function() When defined, only rows for which this returns true
//                are formatted; use $(this) in the function to reference a $row
FancyTree.prototype.formatAllRowTitles = function(matcher) {
    var $rows = this.root.find('.ftRowNode');
    if (matcher) {
        $rows = $rows.filter(matcher);
    }
    this.formatRowTitle($rows);
};
