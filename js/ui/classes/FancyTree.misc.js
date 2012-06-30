///////////////////////////////////////////////////////////
// FancyTree.misc.js
// Helper functions
///////////////////////////////////////////////////////////

FancyTree.prototype.scrollDistanceRequired = function(elem, withinElem, scrollTargetElem) {
    var $window = $(window);
    var $elem = $(elem);

    var viewTop = 0;
    var parents = $elem.parents();
    var scrolledParent;

    for (var i = 0; i < parents.length; i++) {
        scrolledParent = parents[i];

        if ($(scrolledParent).is(scrollTargetElem)) {
            viewTop = scrolledParent.scrollTop;
            break;
        }
    }

    var viewBottom = viewTop + scrolledParent.offsetHeight;
    var withinElemMarginTop = withinElem.offset().top + viewTop;

    var elemHeight = $elem.height();
    var elemTop = $elem.offset().top - withinElemMarginTop;
    var elemBottom = elemTop + elemHeight;

    if (elemTop < 0) {
        // top edge is not visible
        return elemTop;
    }
    if (elemBottom + viewTop > viewBottom) {
        // bottom edge is not visible
        return (elemTop + viewTop) - viewBottom + elemHeight;
    }
    return 0;
};
