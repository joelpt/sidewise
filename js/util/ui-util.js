function isScrolledIntoView(elem)
{
    var $window = $(window);
    var $elem = $(elem);

    var docViewTop = $window.scrollTop();
    var docViewBottom = docViewTop + $window.height();

    var elemTop = $elem.offset().top;
    var elemBottom = elemTop + $elem.height();

    return ((elemBottom >= docViewTop) && (elemTop <= docViewBottom)
      && (elemBottom <= docViewBottom) &&  (elemTop >= docViewTop) );
}

function copyTextToClipboard(text) {
    var copyFrom = $('<textarea/>', {
        style: 'height: 0px; width: 0px; position: fixed; left: -10000px; top: -10000px;',
        id: 'copyFrom',
        cols: 60,
        rows: 5
    });
    copyFrom.text(text);
    $('body').append(copyFrom);
    copyFrom.select();
    document.execCommand('copy');
    copyFrom.remove();
}