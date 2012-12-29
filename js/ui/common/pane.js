///////////////////////////////////////////////////////////
// pane.js
// Initialize some globals and settings to some standard
// values, commonly used in sidebar panes
///////////////////////////////////////////////////////////


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var bg;
var settings;


///////////////////////////////////////////////////////////
// Sidebar pane "standard context" initialization
///////////////////////////////////////////////////////////

function initSidebarPane() {
    if (chrome.extension === undefined) {
        // borrow the chrome object of our iframe-parent
        chrome = window.parent.chrome;
    }
    bg = chrome.extension.getBackgroundPage();
    settings = bg.settings;

    if ($ && $.fx) {
        $.fx.off = !settings.get('animationEnabled');
    }
}