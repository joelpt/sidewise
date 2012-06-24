var WINDOW_UPDATE_CHECK_INTERVAL_SLOW_MS = 333;
var WINDOW_UPDATE_CHECK_INTERVAL_FAST_MS = 50;
var WINDOW_UPDATE_CHECK_INTERVAL_RATE_RESET_MS = 5000;

var windowUpdateCheckInterval = null;

function registerWindowEvents()
{
    chrome.windows.onCreated.addListener(onWindowCreated);
    chrome.windows.onRemoved.addListener(onWindowRemoved);
    chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
    setSlowWindowUpdateCheckRate();
}

function onWindowCreated(win)
{
    if ((win.type == 'popup' && sidebarHandler.creatingSidebar) || monitorInfo.isDetecting())
    {
        return;
    }
    log(win);

    winElem = new WindowNode(win);
    tree.addNode(winElem);
}

function onWindowRemoved(windowId)
{
    log(windowId);
    if (windowId == sidebarHandler.windowId)
    {
        if (sidebarHandler.removeInProgress) {
            // Already handling the window removal elsewhere, don't do it twice
            return;
        }
        savePageTreeToLocalStorage();
        sidebarHandler.onRemoved();
        return;
    }
    if (windowId == monitorInfo.lastDetectionWindowId) {
        return;
    }

    focusTracker.remove(windowId);
    tree.removeNode('w' + windowId);

    chrome.windows.getAll(null, function(wins) {
        log('shutdown attempt', wins);
        for (var i in wins) {
            if (wins[i].type == 'normal') {
                // at least one normal window still exists aside
                // from the one that was just removed
                log('cancel shutdown', wins[i].type);
                focusCurrentTabInPageTree();
                return;
            }
        }
        // No normal windows are left in existence.
        // Therefore we want Chrome to close, so we'll close any remaining
        // "popup" windows (such as the sidebar or dev-tools windows)
        // which should cause Chrome to exit.
        log('do shutdown');
        // Prevent page tree from being saved from this point forward
        TimeoutManager.clear('onPageTreeModified');
        tree.onModifiedDelayed = undefined;

        // Prevent onWindowUpdateCheckInterval from firing
        clearInterval(windowUpdateCheckInterval);

        // Close any remaining (popup) windows
        sidebarHandler.remove();

        for (var i in wins) {
            chrome.windows.remove(wins[i].id);
        }
    });

}

// TODO address Linux case where we get windowId==-1's in between switching between
// Chrome windows; the fix is basically to perform the functions of onWindowFocusChanged
// in a short-duration timeout, verifying after the timeout is done that the windowId
// hasn't changed back to a Chrome window; for regular use it is reasonable to expect
// that if somebody switches away from a chrome window they will do so for a significant
// amount of time so the only question is how quickly the onWindowFocusChanged events
// will fire in sequence when switching between Chrome windows
//
// like this:
//      if windowId == -1:
//          waitingToSeeIfChromeWindowGetsFocusBack = true
//          setTimeout(100,
//              if waitingToSeeIfChromeWindowGetsFocusBack == true:
//                  we are still waiting after the timeout, therefore we assume that
//                  some non Chrome window is now focused intentionally by the user;
//                  setChromeWindowIsFocused(false).
//                  waitingToSeeIfChromeWindowGetsFocusBack = false.
//          )
//          return
//      if waitingToSeeIfChromeWindowGetsFocusBack == true:
//          it did so, therefore perform functions as per a normal switch
//          to a different chrome window
//          waitingToSeeIfChromeWindowGetsFocusBack == false

function onWindowFocusChanged(windowId)
{
    if (monitorInfo.isDetecting()) {
        return;
    }

    log(windowId);

    // Has a non-Chrome app just received focus?
    if (windowId == -1) {
        focusTracker.chromeHasFocus = false;
        log('Chrome lost focus, some other app is now focused');
        return;
    }

    var wasFocused = focusTracker.chromeHasFocus;
    focusTracker.chromeHasFocus = true;

    // Did Chrome just get focus back from another app, and sidebar is present, and keepSidebarOnTop is true?
    if (!wasFocused && sidebarHandler.sidebarExists() && loadSetting('keepSidebarOnTop', false)) {
        // Chrome was not focused and just became focused; do sidebar+dockwin force-on-top handling
        if (windowId == sidebarHandler.windowId && sidebarHandler.dockState != 'undocked') {
            // Sidebar has been focused; raise the dock window too then refocus sidebar
            log('Sidebar has been focused; raising its dock window alongside it');
            chrome.windows.update(sidebarHandler.dockWindowId, { focused: true }, function() {
                chrome.windows.update(sidebarHandler.windowId, { focused: true });
            });
            return;
        }

        // Chrome window other than sidebar received the focus; raise the sidebar then refocus
        // said window
        focusTracker.setFocused(windowId);
        chrome.tabs.query({ windowId: windowId, active: true }, function(tabs) {
            var tab = tabs[0];
            if (!isScriptableUrl(tab.url)) {
                // if tab doesn't have a scriptable url we assume that the tab will not be in HTML5
                // fullscreen mode either here
                log('Non-sidebar Chrome window got focused; its current tab is non scriptable so raising sidebar now');
                // focus the sidebar window ...
                chrome.windows.update(sidebarHandler.windowId, { focused: true }, function() {
                    // ... then focus the window that the user really focused.
                    chrome.windows.update(windowId, { focused: true });
                });

                // update focused tab in sidebar
                focusCurrentTabInPageTree();
                return;
            }
            // tab's url is scriptable, so ask it whether it is in HTML5 fullscreen mode;
            // in onGetIsFullScreenMessage() if we discover it is not in fullscreen we'll
            // raise the sidebar window (focus it) then refocus the window that brought us
            // here.
            log('Non-sidebar Chrome window got focused; check its fullscreen state and possibly raise the sidebar after');
            getIsFullScreen(tab);
        });
        return;
    }

    // Was the sidebar focused (or in the process of being created)?
    if (windowId == sidebarHandler.windowId || sidebarHandler.creatingSidebar)
    {
        // sidebar has been focused; check if the last regular Chrome window that was focused
        // is non-minimized
        chrome.windows.get(focusTracker.getFocused(), function(win) {
            if (win.state != 'minimized') {
                // this was just a normal window focus switch from a regular window to the sidebar
                // -- do nothing
                log('Sidebar received focus and previously focused window is not minimized; doing nothing');
                return;
            }

            // last regular Chrome window that had focus is now minimized meaning we assume
            // the reason the sidebar has received focus is because of that minimization;
            // find the next-most-recently-focused Chrome window that isn't currently minimized
            // and focus that instead of the sidebar
            focusTracker.getTopFocusableWindow(function(focusableWin) {
                if (!focusableWin) {
                    // there is no other non-sidebar Chrome window that isn't minimized, so
                    // we leave the focus with the sidebar
                    log('No window other than sidebar we can focus due to last-win being minimized');
                    return;
                }

                log('Set focus to most recently focused non-minimized window', focusableWin.id);
                chrome.windows.update(focusableWin.id, { focused: true });
            });
        });
        return;
    }

    // Sidebar wasn't just focused and we don't need to force-raise either the sidebar or
    // the dock-window; so we just set the tracked focus to the now-focused window
    log('Recording focus as the now-focused window tab', windowId);
    focusTracker.setFocused(windowId);
    focusCurrentTabInPageTree();
}

function onWindowUpdateCheckInterval() {
    if (sidebarHandler.resizingDockWindow) {
        return;
    }

    if (!sidebarHandler.sidebarExists() || sidebarHandler.dockState == 'undocked') {
        return;
    }

    chrome.windows.get(sidebarHandler.dockWindowId, function(dock) {
        if (sidebarHandler.resizingDockWindow) {
            return;
        }

        var dockDims = sidebarHandler.currentDockWindowMetrics;
        var allowAutoUnmaximize = loadSetting('allowAutoUnmaximize');

        // TODO remember last dock window minimized state and only do sidebar un/minimization
        // when the state changes; this would permit sidebar to be minimized independently
        // of the dock window though arguably we should not support that
        //
        // Ensure sidebar minimized state is the same as the dock window's.
        chrome.windows.get(sidebarHandler.windowId, function(sidebar) {
            if (sidebar.state == 'minimized' && dock.state != 'minimized') {
                chrome.windows.update(sidebar.id, { state: 'normal' }, function() {
                    chrome.windows.update(dock.id, { focused: true });
                });
                return;
            }
            if (sidebar.state != 'minimized' && dock.state == 'minimized') {
                chrome.windows.update(sidebar.id, { state: 'minimized' });
                return;
            }
        });

        // TODO add an option to let sidewise unmaximize dock window
        var offset = monitorInfo.maximizedOffset;
        if (dock.state == 'maximized' && allowAutoUnmaximize) {
            // compute the dimensions we want the dock window to have
            // after unmaximizing it
            var newDockDims = {
                left: dock.left + offset,
                top: dock.top + offset,
                width: dock.width - 2 * offset,
                height: dock.height - 2 * offset
            };

            // discard remembered (pre-sidebar) dock metrics; we'll reinstate them
            // after redock
            var memory = clone(sidebarHandler.lastDockWindowMetrics);
            sidebarHandler.lastDockWindowMetrics = {};

            // unmaximize the dock window, then set its size to "the whole screen",
            // then do a sidebar redock to fit the sidebar in
            positionWindow(dock.id, { state: 'normal' }, function() {
                positionWindow(dock.id, newDockDims, function() {
                    sidebarHandler.redock(dock.id, function() {
                        sidebarHandler.lastDockWindowMetrics = memory;
                    });
                });
            });
            return;
        }

        var widthDelta = dock.width - dockDims.width;
        var leftDelta = dock.left - dockDims.left;
        var topDelta = dock.top - dockDims.top;
        var heightDelta = dock.height - dockDims.height;
        var sidebarDims = sidebarHandler.currentSidebarMetrics;
        var newDims = {};
        var needAdjustment = false;

        if (dock.state == 'maximized') {
            // dock window is currently maximized, so ensure sidebar is next to it
            // (presumably onto a second monitor)
            if (sidebarDims.left != dock.left + dock.width - offset) {
                newDims.left = dock.left + dock.width - offset;
                newDims.top = dock.top + offset;
                newDims.height = dock.height - offset * 2;

                // also raise sidebar as it often winds up under some window on
                // the other monitor in this scenario
                chrome.windows.update(sidebarHandler.windowId, { focused: true }, function() {
                    chrome.windows.update(dock.id, { focused: true });
                });

                needAdjustment = true;
            }
        }
        else {
            if (heightDelta != 0 || leftDelta != 0 || widthDelta != 0) {
                // dock window has changed height, set sidebar to same height
                // also do this whenever dock width/height change just to make sure
                // things stay consistent
                newDims.height = dock.height;
                needAdjustment = true;
            }

            if (topDelta != 0 || leftDelta != 0 || widthDelta != 0) {
                // dock window's top edge has moved, set sidebar's top to match
                // also do this whenever dock width/height change just to make sure
                // things stay consistent
                newDims.top = dock.top;
                needAdjustment = true;
            }

            if (widthDelta != 0) {
                // dock window width has changed, adjust sidebar accordingly
                if (sidebarHandler.dockState == 'right' && leftDelta == 0) {
                    // dock window common edge with right sidebar was adjusted
                    newDims.left = dock.left + dock.width;
                    needAdjustment = true;
                    // sidebarDims.left += widthDelta;
                    // sidebarDims.width -= widthDelta;
                }
                else if (sidebarHandler.dockState == 'left' && leftDelta != 0) {
                    // sidebar is docked to the left and the left edge of the
                    // dock window moved in addition to changing width;
                    // make sidebar stick with that left edge
                    // sidebarDims.left += leftDelta;
                    newDims.left = dock.left - sidebarDims.width;
                    needAdjustment = true;
                }
                // sidebarHandler.targetWidth = sidebarDims.width;
                // saveSetting('sidebarTargetWidth', sidebarDims.width);
            }
            else if (leftDelta != 0) {
                // dock window's left edge has moved without also changing width;
                // move dock window's left edge to track the movement
                if (sidebarHandler.dockState == 'right') {
                    newDims.left = dock.left + dock.width;
                }
                else {
                    newDims.left = dock.left - sidebarDims.width;
                }
                needAdjustment = true;
            }
            else if (sidebarHandler.dockState == 'right') {
                if (sidebarDims.left != dock.left + dock.width) {
                    newDims.left = dock.left + dock.width;
                    needAdjustment = true;
                }
            }
            else if (sidebarHandler.dockState == 'left') {
                if (sidebarDims.left != dock.left - sidebarDims.width) {
                    newDims.left = dock.left - sidebarDims.width;
                    needAdjustment = true;
                }
            }
        }

        // Update stored dock metrics
        dockDims.width = dock.width;
        dockDims.left = dock.left;
        dockDims.top = dock.top;
        dockDims.height = dock.height;
        dockDims.state = dock.state;

        if (!needAdjustment) {
            return;
        }

        // dock window has been moved or resized by the user, so the
        // original (pre-sidebar) remembered dock metrics can no longer
        // be considered valid
        sidebarHandler.lastDockWindowMetrics = {};

        // Increase rate of onWindowUpdateCheckInterval calls for a while
        setFastWindowUpdateCheckRate();

        // Update stored sidebar metrics
        for (var dim in newDims) {
            sidebarDims[dim] = newDims[dim];
        }
        sidebarHandler.targetWidth = sidebarDims.width;
        saveSetting('sidebarTargetWidth', sidebarDims.width);

        log('updating sidebar to new dimensions', newDims, sidebarHandler.resizingSidebar);

        // Resize/move sidebar
        sidebarHandler.resizingSidebar = true;
        positionWindow(sidebarHandler.windowId, newDims, function() {
            TimeoutManager.reset('resetResizingSidebar', onResetResizingSidebar, 500);
        });
        return;

        // else if (dock.left != dockDims.left || dock.top != dockDims.top) {
        //     // dock window is being moved; keep sidebar with it
        //     sidebarDims.left += (dock.left - dockDims.left);
        //     sidebarDims.top += (dock.top - dockDims.top);
        // }

        // Update stored metrics
        // dockDims = { left: dock.left, top: dock.top, width: dock.width, height: dock.height, state: dock.state };
        // dockDims.width = dock.width;
        // dockDims.width = dock.width;

        // Resize sidebar
        // sidebarHandler.resizingSidebar = true;
        // positionWindow(sidebarHandler.windowId, {
        //     left: sidebarDims.left,
        //     top: sidebarDims.top,
        //     width: sidebarDims.width,
        //     height: sidebarDims.height
        // }, function() {
        //     TimeoutManager.reset('resetResizingSidebar', onResetResizingSidebar, 500);
        // });
    });
}

function onResetResizingSidebar() {
    sidebarHandler.resizingSidebar = false;
}

function setSlowWindowUpdateCheckRate() {
    log('switching to slow window update check rate');
    clearInterval(windowUpdateCheckInterval);
    windowUpdateCheckInterval = setInterval(onWindowUpdateCheckInterval,
        WINDOW_UPDATE_CHECK_INTERVAL_SLOW_MS);
}

function setFastWindowUpdateCheckRate() {
    if (!onWindowUpdateCheckInterval) {
        return;
    }
    log('switching to fast window update check rate');
    TimeoutManager.reset('resetWindowUpdateCheckRate',
        resetWindowUpdateCheckRate, WINDOW_UPDATE_CHECK_INTERVAL_RATE_RESET_MS);

    clearInterval(windowUpdateCheckInterval);
    windowUpdateCheckInterval = setInterval(onWindowUpdateCheckInterval,
        WINDOW_UPDATE_CHECK_INTERVAL_FAST_MS);
}

function resetWindowUpdateCheckRate() {
    if (!onWindowUpdateCheckInterval) {
        return;
    }
    setSlowWindowUpdateCheckRate();
}
