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

        chrome.windows.onFocusChanged.addListener(function(windowId) {
            console.log('I DID ME');
            binderObj.onChromeWindowFocusChanged(windowId);
        });
    },

    // Bound to fancyTree.permitTooltipHandler
    permitTooltipHandler: function() {
        // Return false if a Chrome window isn't currently focused
        // to block the tooltips from showing
        return this.backgroundPage.focusTracker.isChromeFocused();
    },

    onChromeWindowFocusChanged: function(windowId) {
        console.log('I DID THIS');
        // Hide the FancyTree row tooltip whenever Chrome switches window focus
        this.fancyTree.hideTooltip();
    }

};

