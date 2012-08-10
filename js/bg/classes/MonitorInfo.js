var MonitorInfo = function() {
    this.monitors = settings.get('monitorMetrics') || [];
    this.maximizedOffset = settings.get('maximizedOffset') || 0;
    this.detectOnComplete = null;
    this.detectingMonitors = false;
    this.lastDetectionWindowId = null;
    this.detectionDOMWindow = null;
}

MonitorInfo.prototype = {

    isKnown: function() {
        return (this.monitors.length > 0);
    },

    retrieveMonitorMetrics: function(callback) {
        var monitors;
        var maximizedOffset;
        var os = window.navigator.platform;
        var self = this;

        // if (os.indexOf('Win') != 0) {
        //     alert(getMessage('prompt_DetectMonitors_beta'));

        //     // Make assumptions for Mac/Linux boxes
        //     log('Detecting single monitor');
        //     this.monitors = [this.getPrimaryMonitorMetrics()];
        //     this.maximizedOffset = 0;
        //     callback(this.monitors, this.maximizedOffset);
        //     return;
        // }

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

    saveToSettings: function() {
        log(this.monitors, this.maximizedOffset);
        settings.set('monitorMetrics', this.monitors);
        settings.set('maximizedOffset', this.maximizedOffset);
    },

    isDetecting: function() {
        return this.detectingMonitors;
    },

    getPrimaryMonitorMetrics: function() {
        // ascertain the primary monitor's metrics using background page screen object
        var mon = this.buildMetricsFromDOMWindow(window);
        mon.primaryMonitor = true;
        return mon;
    },

    // build metrics object from a given Screen object and provided left/top values
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

    buildMetricsFromDOMWindow: function(domWindow) {
        return this.buildMetricsFromScreen(domWindow.screen, domWindow.screenLeft, domWindow.screenTop);
    },

    // create window used for monitor metric detection
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

    // destroy detection window
    destroyDetectionWindow: function(callback) {
        var self = this;
        chrome.windows.remove(this.lastDetectionWindowId, function() {
            self.detectionDOMWindow = null;
            self.detectingMonitors = false;
            callback();
        });
    },

    // detect how much the OS causes windows to hang over the edge when they're maximized
    detectMaximizedOffset: function(callback) {
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
                    // look for monitors further to the right
                    self.detectLeftMonitors.call(self, left - mon.width, top, callback);
                    return;
                }
                // monitor was not found at given left position; we're done here
                callback();
            });
        });
    },

    detectMonitorMetrics: function(winId, atLeft, callback) {
        chrome.windows.update(winId, { state: 'normal', left: atLeft, top: 0, width: 500, height: 200 },
            function(w) {
                chrome.windows.update(winId, { state: 'maximized' }, function(w) {
                    callback(winId, atLeft, w.left, w.top, w.width, w.height);
                });
            }
        );
    },

    onDetectingMonitorToRight: function(winId, testedAtLeft, left, top, width, height) {
        // do we already know about this monitor?
        // if so it actually means there are no more monitors to the right to be found
        var self = this;
        var matching = this.monitors.filter(function(m) {
            return m.detectedLeft == left + self.maximizedOffset;
        });

        if (matching.length == 0) {
            // don't know about this monitor yet, record it
            var mon = {
                detectedLeft: left + this.maximizedOffset,
                availWidth: width - 2 * this.maximizedOffset,
                marginLeft: left - testedAtLeft + this.maximizedOffset,
                marginRight: 0, // TODO figure out a way to actually determine this
                left: testedAtLeft,
                top: top,
                height: height,
                availHeight: height
            };
            mon.width = mon.marginLeft + mon.availWidth + mon.marginRight;

            this.monitors.push(mon);

            // and continue looking for monitors to the right
            this.detectMonitorMetrics(winId, testedAtLeft + mon.width, function() {
                self.onDetectingMonitorToRight.apply(self, arguments);
            });
            return;
        }

        // TODO MAC OSX
        // if returned value for left is less than testedAtLeft, we did not succeed in finding
        // another monitor (Chrome put the test window back onto the same monitor)

        // now try to detect monitors to the left of the first one
        this.detectMonitorMetrics(winId, -600, function() {
            self.onDetectingMonitorToLeft.apply(self, arguments);
        });
    },

    onDetectingMonitorToLeft: function(winId, testedAtLeft, left, top, width, height) {
        // do we already know about this monitor?
        // if so it actually means there are no more monitors to the left to be found
        var self = this;
        var matching = this.monitors.filter(function(m) {
            return m.detectedLeft >= left + self.maximizedOffset;
        });
        if (matching.length == 0) {
            // don't know about this monitor yet, record it
            var mon = {
                detectedLeft: left + this.maximizedOffset,
                availWidth: width - 2 * this.maximizedOffset,
                marginLeft: 0, // TODO puzzle out a way to get these values
                marginRight: 0,
                left: left + this.maximizedOffset,
                top: top,
                height: height,
                availHeight: height
            };
            mon.width = mon.marginLeft + mon.availWidth + mon.marginRight;

            this.monitors.splice(0, 0, mon);

            // and continue looking for monitors to the left
            this.detectMonitorMetrics(winId, mon.left - 600, function() {
                self.onDetectingMonitorToLeft.apply(self, arguments);
            });
            return;
        }

        // all done, close the detection window
        chrome.windows.remove(winId, function() {
            self.detectOnComplete(self.monitors, self.maximizedOffset);
        });
    }

};