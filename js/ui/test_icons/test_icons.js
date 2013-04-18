var bg;

$(document).ready(function() {
    bg = chrome.extension.getBackgroundPage();
    bg.sidebarHandler.registerSidebarPane('test_icons', window);
});

function testIcon(url) {
    var $icon = $('<img>', { width: 16, height: 16, src: url });
    $('body').append($icon);
}
