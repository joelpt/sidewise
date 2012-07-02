///////////////////////////////////////////////////////////
// FancyTree.effects.js
// Visual animations using jQuery
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var EFFECT_DURATION_BASE_MS = 175;


///////////////////////////////////////////////////////////
// Effects
///////////////////////////////////////////////////////////

// Slide out and shrink rows to hidden
FancyTree.prototype.slideOutAndShrink = function(rows, onAfter) {
    var heights = [];
    rows.each(function(i, e) {
        var itemRow = $(e).children('.ftItemRow');
        var height = itemRow.height()
        heights.push(height);
        itemRow.show().css('margin-left', '0px').css('width', '100%').css('height', height)
            .animate({ 'margin-left': '100%', 'width': '0' }, EFFECT_DURATION_BASE_MS, function() {
                $(this).animate({ 'height': '0px' }, EFFECT_DURATION_BASE_MS, function() {
                    $(this).hide();
                });
           });
    });
    if (onAfter) {
        setTimeout(function() { onAfter(heights); }, $.fx.off ? 25 : 2 * EFFECT_DURATION_BASE_MS + 25);
    }
    return heights;
};

// Grow and slide in
FancyTree.prototype.growAndSlideIn = function(rows, newHeights, onAfter) {
    rows.each(function(i, e) {
        var itemRow = $(e).children('.ftItemRow');
        var height = newHeights[i];
        // itemRow.show().css('height', 40);
        // // itemRow.css('margin-left', 0);
        // itemRow.css('width', 200);
        // return;
        itemRow.show().css('margin-left', '100%').css('width', '0').css('height', 0)
            .animate({ 'height': height }, EFFECT_DURATION_BASE_MS, function() {
                $(this).animate({ 'margin-left': '0', 'width': '100%' }, EFFECT_DURATION_BASE_MS, 'easeOutCubic');
            });
    });
    if (onAfter) {
        setTimeout(onAfter, $.fx.off ? 25 : 2 * EFFECT_DURATION_BASE_MS + 25);
    }
};

