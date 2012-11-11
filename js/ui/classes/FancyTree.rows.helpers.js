///////////////////////////////////////////////////////////
// FancyTree.rows.helpers.js
// Row helper functions
///////////////////////////////////////////////////////////

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

FancyTree.prototype.formatRowTitle = function(row) {
    var rowTypeParams = this.getRowTypeParams(row);
    if (rowTypeParams && rowTypeParams.onFormatTitle) {
        rowTypeParams.onFormatTitle(row);
    }
};

// Call rowType.onFormatTitle() on the given row and all its parent rows
FancyTree.prototype.formatLineageTitles = function(row) {
    var self = this;
    row.parents('.ftRowNode').add(row).each(function(i, e) {
        var $e = $(e);
        self.formatRowTitle.call(self, $e);
    });
};

FancyTree.prototype.formatAllRowTitles = function() {
    var self = this;
    this.root.find('.ftRowNode').each(function(i, e) {
        self.formatRowTitle.call(self, $(e));
    });
};
