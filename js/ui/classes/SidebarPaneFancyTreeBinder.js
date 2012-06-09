var SidebarPaneFancyTreeBinder = function(fancyTree, backgroundPage) {

    this.fancyTree = fancyTree;
    this.backgroundPage = backgroundPage;
};

SidebarPaneFancyTreeBinder.prototype = {

    bind: function() {
        var binderObj = this;
        this.fancyTree.permitTooltipHandler = function() {
            return binderObj.permitTooltipHandler();
        };

        // Pass to backgroundPage.sidebarHandler.registerSidebarPane as the onChromeFocusChanged parameter
        this.chromeWindowFocusChangeHandler = function(chromeIsFocused, focusedWindowId) {
            binderObj.chromeWindowFocusChangeHandlerBody(chromeIsFocused, focusedWindowId);
        };
    },

    // Bound to fancyTree.permitTooltipHandler
    permitTooltipHandler: function() {
        // Return false if a Chrome window isn't currently focused
        // to block the tooltips from showing
        return this.backgroundPage.focusTracker.isChromeFocused();
    },

    chromeWindowFocusChangeHandlerBody: function(chromeIsFocused, focusedWindowId) {
        // Hide the FancyTree row tooltip whenever Chrome switches window focus
        // TODO consider ripping all this out and just listening to chrome.window.onWindowFocusChanged directly..LOLsocks
        // BENEFIT would simplify the code significantly
        // DOWNSIDE we would not have access to CWFT's chromeIsFocused, focusedWindowId vars
        //   which incorporate more logic than .onWindowFocusChanged; focusedWIndowId is actually
        //   last focused window id which conceibably to some sidebar pane might be valuable to utilize
        //   that being said it would definitely be a fuckton simpler to just trigger the event right here
        //   directly, which for the foreseeable future would be entirely adequate for our needs
        this.fancyTree.hideTooltip();
    }

};

