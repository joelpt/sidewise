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
        this.dockState = 'undocked'; // 'undocked', 'left', 'right'
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
            chrome.windows.get(getFocusedChromeWindowId(), function(focusWin) {
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
        this.dockWindowId = getFocusedChromeWindowId();
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
            handler.onRemoved();
            if (callback) {
                callback();
            }
        });
    }

    // should be called after sidebar has been removed
    this.onRemoved = function() {
        if (this.dockRememberedLeft != null && this.dockRememberedWidth != null) {
            positionWindow(this.dockWindowId, this.dockRememberedState, this.dockRememberedLeft, null, this.dockRememberedWidth, null);
        }
        this.reset();
    };

    this.forgetDockWinRememberedMetrics = function() {
        this.dockRememberedWidth = null;
        this.dockRememberedLeft = null;
        this.dockRememberedState = null;
    }

    // dock the sidebar window to an existing window
    // win: window to dock to
    // side: either 'left' or 'right'
    this.dockTo = function(win, side) {
        this.dockTargetWin = win;
        this.dockState = side;
    };

    // undock the sidebar window
    this.undock = function() {
        this.dockTargetWin = null;
        this.dockState = 'undocked';
    };

    // to dock the sidebar we need to...
    // get max screen dimensions
    // figure out if our sidebar can fit on the current screen without overflowing
    //      if not we must adjust dockto.left and/or dockto.width:
    //      if docking on left:
    //          maxLeft+dockTo.width+targetwidth must be less than screen total width
    //          if too large:
    //              first try to make things fit by shifting dockTo to the right
    //              if that is inadequate, reduce width of dockTo
    //      if docking on right:
    //          maxLeft+dockTo.width+targetwidth must be less than screen total width
    //          if too large:
    //              first try to make things fit by shifting dockTo to the left
    //              if that is inadequate, reduce width of dockTo
    // set width of sidebar to its target width
    // set top of sidebar to dockto.top
    // set height of sidebar to dockto.height
    // if docking on left:
    //     set sidebar.left at current dockto.left-targetwidth
    //     move dockto win to right by sidebar's target width
    // if docking on right:
    //     place sidebar at dockto.left+width
    // all done?

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



    this.dock = function(windowId, side) {
        var handler = this;

        // retrieve a fresh Window object for windowId
        chrome.windows.get(windowId, function(win) {
            // retrieve the active tab in the dock target window
            chrome.tabs.query({windowId: win.id, active: true}, function(tabs) {
                var tab = tabs[0];
                // retrieve that tab's screen metrics if we can
                getScreen(tab, function(tab, screen) {
                    var winLeft = win.left, winWidth = win.width, winTop = win.top, winHeight = win.height;
                    var maximizedBorderPadding = 8; // arbitrary, accurate on Windows
                    if (win.state == 'maximized') {
                        // The dock-to window will be unmaximized after this process.
                        // Therefore adjust its dimensions here for what we expect them to be unmaxed.
                        winWidth += maximizedBorderPadding;
                        winLeft += maximizedBorderPadding;
                        winHeight += maximizedBorderPadding;
                        winTop += maximizedBorderPadding;
                    }




                    var totalWidth = handler.targetWidth + winLeft + winWidth + screen.availLeft;
                    var shift = 0, shrinkage = 0;
                    // TODO see what availLeft is after i put the wintaskbar on the left, right
                    // TODO rework this logic:
                    // single mon mode: populate width array as [screen.availWidth]
                    // multi mon mode populate from options: [1920, 1024]
                    // adjust for maxed window by -8 from win.l/t/w/h (config in options)
                    // infer which monitor we're on:
                    //      absoluteLeftChecOffset
                    //      on_mon = undefined
                    //      for (var i in mon_widths) {
                    //          absoluteLeftCheck += mon_width[i]
                    //          if (win.left < absoluteLeftOffset
                    //              on_mon = i;
                    //              absoluteAvailWidth = mon_width[i];
                    //              break;
                    //      }
                    //      if (on_mon === undefined)
                    //          on_mon = mon_widths.length - 1 // rightmost mon
                    //          absoluteAvailWidth = mon_width[i];
                //          absoluteLeftCheck -= absoluteAvailWidth;
                    //  absoluteLeftCheck is now this mon's offset for Offset
                    //  e.g. for determining freeOnLeft
                    //  leftSysTaskbarWidth = screen.availLeft - absoluteLeftOffset
                    //  freeOnLeft = winLeft - absoluteLeftOffset - leftSysTaskbarWidth
                    //  freeOnRight = absoluteAvailableWidth - winLeft - winWidth - leftSysTaskbarWidth
                    // determine how much free space is to the left and right of the dock win
                    // if want to dock on left:
                    //   if sidebar fits in free left, yay
                    //   if not:
                    //       shift dockwin to the right by (targetWidth - freeOnLeft)
                    //       if dockwin.left+dockwin.width+availLeft+shift > availWidth:
                    //          shrink dockwin width by the amount it's overflowing
                    // if want to dock on right:
                    //   if sidebar fits in free right, yay
                    //   if not:
                    //       shift dockwin to the left by (targetWidth - freeOnRight)
                    //       if dockwin.left - availLeft - shift < 0:
                    //         shrink dockwin width by the amount it is under 0
                    if (totalWidth > screen.availWidth) {
                        // not enough space to do this without adjusting dockTarget winLeft/.width
                        // first try to shift dockTargetWin's horizontal placement to make room
                        if (side == 'left') {
                            // try to shift dockTargetWin to the right
                            var freeOnRight = screen.availWidth - (winLeft + winWidth);
                            shift = Math.min(freeOnRight, handler.targetWidth);
                        }
                        else {
                            // try to shift dockTargetWin to the left
                            var freeOnLeft = winLeft - screen.availLeft;
                            shift = -Math.min(freeOnLeft, handler.targetWidth);
                        }

                        // was that enough to fit the sidebar onto the screen?
                        if (Math.abs(shift) < handler.targetWidth) {
                            // Not enough, need to reduce the width of dockTo as well
                            shrinkage = handler.targetWidth - Math.abs(shift); // make up the difference
                        }

                        // ensure we didn't shrink too far
                        if (winWidth - shrinkage < 100) {
                            shrinkage = winWidth - 100;
                        }

                        // we're now confident that we can fit everything, assuming there  is enough
                        // space on the screen to fit everything
                    }

                    // Position dock-to window
                    positionWindow(win.id, winLeft + shift, winTop, winWidth - shrinkage, winHeight);

                    // Position sidebar window
                    if (side == 'left') {
                        positionWindow(handler.windowId, winLeft + shift - handler.targetWidth, winTop, handler.targetWidth, winHeight);
                    }
                    else {
                        positionWindow(handler.windowId, winLeft + shift + winWidth - shrinkage, winTop, handler.targetWidth, winHeight);
                    }
                });
            });
        });
    };

    //                 screen.availLeft
    //                 1400

    //             // configure max clamping values
    //             var maxLeft = screen.availLeft;
    //             var maxTop = screen.availTop;
    //             var maxHeight = screen.availHeight;
    //             var maxWidth;
    //             if (screen.availWidth - this.targetWidth > win.left + win.width) {
    //                 // will not need to shrink dockTo window in width because there is enough
    //                 // free space for the sidebar to fit on this monitor without shrinkage
    //                 maxWidth = screen.availWidth;
    //             }
    //             else {
    //                 // require width of dockTo window to leave enough space on the monitor
    //                 // to add the sidebar window at its targetWidth
    //                 maxWidth = screen.availWidth - this.targetWidth;
    //             }

    //             // clamp dockTo window's dimensions to its target maximum dimensions
    //             var dimensions = getClampedWindowDimensions(
    //                 win.left, win.top, win.width, win.height,
    //                 maxLeft, maxTop, maxWidth, maxHeight);

    //             // return results to callback
    //             callback(dimensions);
    //         });
    //     });
    // };

    // called after creating the sidebar window
    this.onCreatedSidebarWindow = function(win) {
        log(win);

        // Store state info about newly created sidebar
        this.windowId = win.id;
        this.tabId = win.tabs[0].id;
        this.creatingSidebar = false;
    };
}


function positionWindow(winId, state, left, top, width, height)
{
    var metrics = {};
    if (state != null)
        metrics.state = state;
    if (left != null)
        metrics.left = left;
    if (top != null)
        metrics.top = top;
    if (width != null)
        metrics.width = width;
    if (height != null)
        metrics.height = height;

    chrome.windows.update(winId, metrics);
}
