function SidebarHandler()
{

    // Initialize state
    this.init = function() {
        log('Initialized SidebarHandler');
        this.windowId = null;
        this.tabId = null;
        this.exists = false;
        this.dockState = 'undocked'; // 'undocked', 'left', 'right'
        this.dockWindowId = null;
        this.targetWidth = 400;
        this.monitorMetrics = null;
        this.maximizedMonitorOffset = 0;
        this.dockRememberedWidth = null;
        this.dockRememberedLeft = null;
        this.dockRememberedState = null;
        this.creatingSidebar = false;
        this.sidebarPanes = {};
    };

    // Always initialize state when SidebarHandler is instantiated
    this.init();
    this.sidebarUrl = chrome.extension.getURL('sidebar.html');

    // Reset sidebar-specific state variables for e.g. when sidebar is destroyed
    this.reset = function() {
        this.windowId = null;
        this.tabId = null;
        this.exists = false;
        this.dockWindowId = null;
        this.dockRememberedWidth = null;
        this.dockRememberedLeft = null;
        this.dockRememberedState = null;
        this.creatingSidebar = false;
        this.sidebarPanes = {};
    };


    // TODO make into .prototype style


    this.registerSidebarPane = function(paneName, paneWindow) {
        this.sidebarPanes[paneName] = paneWindow;
    }

    // create the sidebar window
    this.create = function() {
        if (this.sidebarExists()) {
            throw 'Cannot create() a new sidebar when one currently exists';
        }
        log('Creating sidebar window/tab');
        this.creatingSidebar = true;
        var handler = this;
        if (this.dockState == 'undocked') {
            chrome.windows.get(focusTracker.getFocused(), function(focusWin) {
                var winSpec = {
                    url: 'sidebar.html',
                    type: 'popup',
                    width: handler.targetWidth,
                    height: Math.min(600, focusWin.height - 100),
                    left: focusWin.left + 100,
                    top: focusWin.top + 100
                };
                chrome.windows.create(winSpec, function(win) {
                    handler.onCreatedSidebarWindow.call(handler, win);
                });
            });
        }
        else {
            if (!this.dockWindowId) {
                throw 'No dockWindowId assigned for docking';
            }
            chrome.windows.get(handler.dockWindowId, function(win) {
                win = handler.fixMaximizedWinMetrics(win);
                var metrics = handler.getDockMetrics(win, handler.dockState, handler.targetWidth);
                log(metrics);
                var winSpec = { url: 'sidebar.html', type: 'popup',
                    left: metrics.sidebarLeft,
                    top: win.top,
                    width: handler.targetWidth,
                    height: win.height };
                positionWindow(handler.dockWindowId, 'normal',
                    metrics.dockWinLeft, win.top, metrics.dockWinWidth, win.height);
                handler.dockRememberedLeft = win.left;
                handler.dockRememberedWidth = win.width;
                handler.dockRememberedState = win.state;
                log(winSpec);
                chrome.windows.create(winSpec, function(win) { handler.onCreatedSidebarWindow.call(handler, win); } );
            });
        }
    };

    this.createDockedToCurrentWin = function() {
        this.dockWindowId = focusTracker.getFocused();
        this.create();
    }

    this.createWithDockState = function(dockState) {
        if (this.sidebarExists()) {
            throw 'Cannot createWithDockState() when sidebar already exists';
        }

        this.dockState = dockState;
        if (dockState == 'undocked') {
            this.create();
            return;
        }

        this.createDockedToCurrentWin();
    }

    this.sidebarExists = function() {
        return this.tabId > 0;
    }

    this.remove = function(callback) {
        if (!this.sidebarExists()) {
            throw 'Cannot remove sidebar it does not exist';
        }

        var handler = this;
        chrome.tabs.remove(this.tabId, function() {
            handler.onRemoved(callback);
        });
    }

    // called by .remove() after sidebar has been removed
    this.onRemoved = function(callback) {
        if (this.dockRememberedLeft != null && this.dockRememberedWidth != null) {
            positionWindow(this.dockWindowId, this.dockRememberedState, this.dockRememberedLeft, null, this.dockRememberedWidth, null);
        }
        this.reset();
        if (callback) {
            callback();
        }
    };

    // this.forgetDockWinRememberedMetrics = function() {
    //     this.dockRememberedWidth = null;
    //     this.dockRememberedLeft = null;
    //     this.dockRememberedState = null;
    // }

    // redock the sidebar window to a different window
    this.redock = function(windowId) {
        if (!this.sidebarExists()) {
            throw 'Cannot redock a nonexistent sidebar';
        };
        var handler = this;
        this.remove(function() {
            handler.dockWindowId = windowId;
            handler.create();
        });
    };

    // adjust the window metrics of a window which is maximized
    // (has its edges going off the edge of the screen)
    this.fixMaximizedWinMetrics = function(win)
    {
        if (win.state == 'maximized') {
            // The dock-to window will be unmaximized after this process.
            // Therefore adjust its dimensions here for what we expect them to be unmaxed.
            win.left += this.maximizedMonitorOffset;
            win.top += this.maximizedMonitorOffset;
            win.width -= 2 * this.maximizedMonitorOffset;
            win.height -= 2 * this.maximizedMonitorOffset;
        }
        return win;
    }

    this.getDockMetrics = function(win, side, sidebarWidth)
    {
        var monitors = this.monitorMetrics;

        // Monitors to the left of the primary monitor will have negative left values
        // for screen.availLeft and win.left. Determine how much that offset is.
        primaryLeftOffset = monitors.reduce(
            function(last, elem) { return (elem.left < 0 ? last - elem.left : last) },
            0);
        log(primaryLeftOffset);

        var winLeft = win.left;
        var winWidth = win.width;
        var winTop = win.top;
        var winHeight = win.height;

        // Deduce which monitor we're on.
        var currentMonitorLeftOffset = 0;
        var currentMonitor = 0;
        var currentMonitorWidth;
        var accumOffset = 0;
        for (var i in monitors) {
            accumOffset += monitors[i].width;
            currentMonitor = parseInt(i);
            currentMonitorWidth = monitors[i].width;
            if (winLeft + primaryLeftOffset < accumOffset) {
                // Window must be on this monitor
                break;
            }
            // Window must be on a monitor further to the right
            currentMonitorLeftOffset += monitors[i].width;
        }

        var leftSysTaskbarWidth = monitors[currentMonitor].marginLeft;
        var rightSysTaskbarWidth = monitors[currentMonitor].marginRight;

        console.log('beliefs about monitors:');
        console.log(monitors);
        console.log('current one', currentMonitor);
        console.log('current one', monitors[currentMonitor]);
        console.log('currentMonitorWidth', currentMonitorWidth);
        console.log('primaryLeftOffset', primaryLeftOffset);

        // Calculate free space on the current monitor to the left/right of the dock-to window.
        var freeOnLeft = winLeft + primaryLeftOffset - currentMonitorLeftOffset - leftSysTaskbarWidth;
        var freeOnRight = Math.max(0,
            currentMonitorWidth - winWidth - freeOnLeft - leftSysTaskbarWidth - rightSysTaskbarWidth);
        log('free on left ' + freeOnLeft);
        log('free on right ' + freeOnRight);

        var effectiveLeft = winLeft + primaryLeftOffset - currentMonitorLeftOffset - leftSysTaskbarWidth;
        var effectiveRight = effectiveLeft + winWidth;
        var effectiveMonitorWidth = currentMonitorWidth - leftSysTaskbarWidth - rightSysTaskbarWidth;

        log('effectiveLeft ' + effectiveLeft);
        log('effectiveRight ' + effectiveRight);
        log('effectiveMonitorWidth ' + effectiveMonitorWidth);

        // Work out how much the dock window should be left-shifted and width-shrunk
        // to ensure the new sidebar will fit on the available space on this monitor
        var newLeft = effectiveLeft;
        var newRight = effectiveRight;

        if (side == 'left') {
            if (freeOnLeft < sidebarWidth) {
                // sidebar won't fit in free space on left. shift dock win right to make room.
                newLeft += sidebarWidth - freeOnLeft;
                newRight += sidebarWidth - freeOnLeft;
                if (newRight > effectiveMonitorWidth) {
                    // after shift dock win will go over right monitor edge. fix that.
                    newRight = effectiveMonitorWidth;
                }
            }
        }
        else if (side == 'right') {
            if (freeOnRight < sidebarWidth) {
                // sidebar won't fit in free space on right. shift dock win left to make room.
                newLeft -= sidebarWidth - freeOnRight;
                newRight -= sidebarWidth - freeOnRight;
                if (newLeft < 0) {
                    // after shift dock win will go over left monitor edge. fix that.
                    newLeft = 0;
                }
            }
        }
        else {
            throw 'Unrecognized side parameter: ' + side;
        }

        log('newLeft ' + newLeft);
        log('newRight ' + newRight);

        var adjustWinLeft = newLeft - effectiveLeft;
        var adjustWinWidth = newRight - (effectiveRight + adjustWinLeft);

        log('adjustWinLeft ' + adjustWinLeft);
        log('adjustWinWidth ' + adjustWinWidth);

        var newWidth = winWidth + adjustWinWidth;
        log('winWidth  ' + winWidth);
        log('newWidth ' + newWidth);

        var sidebarLeft;
        if (side == 'left') {
            sidebarLeft = newLeft - sidebarWidth;
        }
        else {
            sidebarLeft = newRight;
        }

        return {
            sidebarLeft: sidebarLeft + leftSysTaskbarWidth + currentMonitorLeftOffset - primaryLeftOffset,
            dockWinLeft: newLeft + leftSysTaskbarWidth + currentMonitorLeftOffset - primaryLeftOffset,
            dockWinWidth: newWidth
        };
    };

    // called after creating the sidebar window
    this.onCreatedSidebarWindow = function(win) {
        log(win);

        // Store state info about newly created sidebar
        this.windowId = win.id;
        this.tabId = win.tabs[0].id;
        this.creatingSidebar = false;
    };
}
