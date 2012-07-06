///////////////////////////////////////////////////////////
// FancyTree.effects.js
// Visual animations using jQuery
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var EFFECT_DURATION_BASE_MS = 150;


///////////////////////////////////////////////////////////
// Effects
///////////////////////////////////////////////////////////

// Slide out and shrink rows to hidden
FancyTree.prototype.slideOutAndShrink = function(rows, defaultRowHeight, onAfter) {
    var heights = [];
    rows.each(function(i, e) {
        var itemRow = $(e).children('.ftItemRow');
        var height = itemRow.height() || defaultRowHeight;
        heights.push(height);
        // console.log('slide out', 'was height', height, 'target', itemRow);
        itemRow.show().css('margin-left', '0px').css('width', '100%').css('height', height)
            .animate({ 'margin-left': '100%', 'width': '0' }, EFFECT_DURATION_BASE_MS, 'easeOutSine', function() {
                $(this).animate({ 'height': '0px' }, EFFECT_DURATION_BASE_MS, function() {
                    $(this).hide();
                    if (i == rows.length - 1 && onAfter)  {
                        setTimeout(function() { onAfter(heights); }, 20);
                    }
                });
           });
    });
    // if (onAfter) {
    //     setTimeout(function() { onAfter(heights); }, $.fx.off ? 20 : 2 * EFFECT_DURATION_BASE_MS + 50);
    // }
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
                $(this).animate({ 'margin-left': '0', 'width': '100%' }, EFFECT_DURATION_BASE_MS, 'easeOutCubic', function() {
                    if (i == rows.length - 1 && onAfter)  {
                        setTimeout(onAfter, 20);
                    }
                });
            });
    });
    // if (onAfter) {
    //     setTimeout(onAfter, $.fx.off ? 20 : 2 * EFFECT_DURATION_BASE_MS + 50);
    // }
};

