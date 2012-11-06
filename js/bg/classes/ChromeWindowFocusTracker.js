/**
  * @constructor
  */
var ChromeWindowFocusTracker = function(onInitialized)
{
    this.init(onInitialized);
};

ChromeWindowFocusTracker.prototype = {

    init: function(onInitialized) {
        this.windowIds = [];
        this.chromeHasFocus = false;

        var self = this;
        chrome.windows.getAll(null, function(wins) {
            if (!wins) {
                // try again in a bit
                setTimeout(function() { self.init(onInitialized); }, 5000);
                return;
            }

            // collect all existing windows
            for (var i in wins) {
                self.windowIds.push(wins[i].id);
            }

            // set currently focused window
            chrome.windows.getLastFocused(null, function(win) {
                if (!win) {
                    // try again in a bit
                    setTimeout(function() { self.init(onInitialized); }, 5000);
                    return;
                }
                self.setFocused(win.id);
                self.chromeHasFocus = true;
                if (onInitialized) {
                    onInitialized(win);
                }
            });
        });
    },

    getFocused: function(topIndex) {
        if (this.windowIds.length == 0) {
            return null;
        }
        topIndex = topIndex || 0;
        var index = Math.max(0, this.windowIds.length - topIndex - 1);
        // log(this.windowIds[index], this.windowIds);
        return this.windowIds[index];
    },

    setFocused: function(windowId) {
        if (windowId == sidebarHandler.windowId) {
            return;
        }
        this.remove(windowId);
        this.windowIds.push(windowId);
        // log(windowId, this.windowIds);
        return true;
    },

    remove: function(windowId) {
        var index = this.windowIds.indexOf(windowId);
        if (index == -1) {
            log('Did not find windowId to remove', windowId, this.windowIds);
            return false;
        }
        this.windowIds.splice(index, 1);
        // log('Removed windowId', windowId, this.windowIds);
        return true;
    },

    getTopFocusableWindow: function(callback, topIndex) {
        var length = this.windowIds.length;

        if (length == 0 || topIndex >= length) {
            callback(null);
            return;
        }

        topIndex = topIndex || 0;
        var index = length - topIndex - 1;
        var windowId = this.windowIds[index];
        var tracker = this;
        chrome.windows.get(windowId, function(win) {
            if (win.state != 'minimized') {
                callback(win); // found a focusable window
                return;
            }
            tracker.getTopFocusableWindow(callback, topIndex + 1);
        });
    }
}