///////////////////////////////////////////////////////////
// Multiple-monitor metrics detection
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Initialization of MonitorInfo class
///////////////////////////////////////////////////////////

var MonitorInfo = function() {
    this.monitors = settings.get('monitorMetrics') || [];
    this.maximizedOffset = settings.get('maximizedOffset') || 0;
    this.detectOnComplete = null;
    this.detectingMonitors = false;
    this.lastDetectionWindowId = null;
    this.detectionDOMWindow = null;
}

MonitorInfo.prototype = {

    ///////////////////////////////////////////////////////////
    // Status getters
    ///////////////////////////////////////////////////////////

    isKnown: function() {
        return (this.monitors.length > 0);
    },

    isDetecting: function() {
        return this.detectingMonitors;
    },


    ///////////////////////////////////////////////////////////
    // Utility functions
    ///////////////////////////////////////////////////////////

    getMonitorFromLeftCoord: function(left) {
        for (var i = 0; i < this.monitors.length; i++) {
            var monitor = this.monitors[i];
            if (left < monitor.left + monitor.width - 1) {
                return monitor;
            }
        }
        console.error('getMonitorFromLeftCoord failed, returning fallback value of the first monitor');
        return this.monitors[0];
    },

    ///////////////////////////////////////////////////////////
    // Main UI entry point for monitor detection routine
    ///////////////////////////////////////////////////////////

    retrieveMonitorMetrics: function(callback) {
        var monitors;
        var maximizedOffset;
        var os = window.navigator.platform;
        var self = this;

        alert(getMessage('prompt_DetectMonitors'));

        // Detect multiple monitors
        log('Detecting multiple monitors');
        this.detectingMonitors = true;
        this.detectAllMonitorMetrics(function(monitors, maximizedOffset) {
            self.detectingMonitors = false;
            // alert(getMessage('prompt_DetectMonitors_complete'));
            callback(monitors, maximizedOffset);
        });
    },


    ///////////////////////////////////////////////////////////
    // Detection routines
    ///////////////////////////////////////////////////////////

    // Perform detection routines to find maximized offset and all monitors' metrics
    detectAllMonitorMetrics: function(onComplete) {
        this.monitors = [];
        this.detectOnComplete = onComplete;

        var mon = this.getPrimaryMonitorMetrics();
        this.monitors.push(mon);

        var self = this;
        this.detectMaximizedOffset.call(self, function() {
            self.detectRightMonitors.call(self, mon.left + mon.width, mon.top, function() {
                self.detectLeftMonitors.call(self, mon.left, mon.top, function() {
                    onComplete();
                });
            });
        });
    },

    // Detect how much the OS causes windows to hang over the edge when they're maximized
    detectMaximizedOffset: function(callback) {
        if (PLATFORM == 'Mac') {
            this.maximizedOffset = 0;
            callback();
            return;
        }

        var self = this;
        this.createDetectionWindow(screen.availLeft, screen.availTop, function() {
            var winId = self.lastDetectionWindowId;
            chrome.windows.update(winId, { state: 'normal' }, function(winBefore) {
                var topBefore = winBefore.top;
                chrome.windows.update(winId, { state: 'maximized' }, function(winAfter) {
                    var topAfter = winAfter.top;
                    self.destroyDetectionWindow.call(self, function() {
                        self.maximizedOffset = topBefore - topAfter;
                        callback();
                    });
                });
            });
        });
    },

    // Detect monitor at (left, top) and any monitors further to the right of that
    detectRightMonitors: function(left, top, callback) {
        var self = this;
        this.createDetectionWindow(left + 10, top + 10, function(win) {
            var exists = false;
            var mon;
            if (win.left > left) {
                // monitor exists at given left position
                var exists = true;
                var dom = self.detectionDOMWindow;
                var s = dom.screen;
                mon = self.buildMetricsFromScreen.call(self, s, left, top);
                self.monitors.push(mon);
            }
            self.destroyDetectionWindow.call(self, function() {
                if (exists) {
                    // look for monitors further to the right
                    self.detectRightMonitors.call(self, left + mon.width, top, callback);
                    return;
                }
                // monitor was not found at given left position; we're done here
                callback();
            });
        });
    },

    // Detect all monitors to the left of the monitor at (left, top)
    detectLeftMonitors: function(left, top, callback) {
        var self = this;
        this.createDetectionWindow(left - 510, top + 10, function(win) {
            var exists = false;
            var mon;
            if (win.left < left) {
                // monitor exists at given left position
                var exists = true;
                var dom = self.detectionDOMWindow;
                var s = dom.screen;
                mon = self.buildMetricsFromScreen.call(self, s, left - s.width, top);
                self.monitors.push(mon);
            }
            self.destroyDetectionWindow.call(self, function() {
                if (exists) {
                    // look for monitors further to the left
                    self.detectLeftMonitors.call(self, left - mon.width, top, callback);
                    return;
                }
                // monitor was not found at given left position; we're done here
                callback();
            });
        });
    },


    ///////////////////////////////////////////////////////////
    // Detection window creation and destruction
    ///////////////////////////////////////////////////////////

    // Create window used for monitor metric detection
    createDetectionWindow: function(left, top, callback)  {
        var self = this;
        this.detectingMonitors = true;
        chrome.windows.create(
            { url: '/detect-monitor.html', type: 'popup', left: left, top: top, width: 500, height: 200 },
            function(win) {
                setTimeout(function() {
                    log('Created detection window', win.id);
                    self.lastDetectionWindowId = win.id;
                    var views = chrome.extension.getViews();
                    var domWindow = views.filter(function(e) {
                        return e.location.pathname == '/detect-monitor.html';
                    })[0];
                    self.detectionDOMWindow = domWindow;
                    callback(win);
                }, 200);
            }
        );
    },

    // Destroy detection window
    destroyDetectionWindow: function(callback) {
        var self = this;
        chrome.windows.remove(this.lastDetectionWindowId, function() {
            self.detectionDOMWindow = null;
            self.detectingMonitors = false;
            callback();
        });
    },


    ///////////////////////////////////////////////////////////
    // Metrics object construction
    ///////////////////////////////////////////////////////////

    // Ascertain the primary monitor's metrics using background page's DOM window
    getPrimaryMonitorMetrics: function() {
        var mon = this.buildMetricsFromDOMWindow(window);
        mon.primaryMonitor = true;
        return mon;
    },

    // Build metrics object from a given Screen object and provided left/top values
    buildMetricsFromScreen: function(screenObject, left, top) {
        return {
            left: left,
            top: top,
            width: screenObject.width,
            height: screenObject.height,
            availWidth: screenObject.availWidth,
            availHeight: screenObject.availHeight,
            marginLeft: screenObject.availLeft - left,
            marginRight: left + screenObject.width - screenObject.availWidth - screenObject.availLeft
        };
    },

    // Build metrics object from a given Window (DOM window) object
    buildMetricsFromDOMWindow: function(domWindow) {
        return this.buildMetricsFromScreen(domWindow.screen, domWindow.screenLeft, domWindow.screenTop);
    },


    ///////////////////////////////////////////////////////////
    // Settings-saving helper
    ///////////////////////////////////////////////////////////

    // Persist this.(monitors,maximizedOffset) to settings
    saveToSettings: function() {
        log(this.monitors, this.maximizedOffset);
        settings.set('monitorMetrics', this.monitors);
        settings.set('maximizedOffset', this.maximizedOffset);
    }
};