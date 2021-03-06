"use strict";

var WINDOW_UPDATE_CHECK_INTERVAL_SLOW_MS = 300;
var WINDOW_UPDATE_CHECK_INTERVAL_FAST_MS = 150;
var WINDOW_UPDATE_CHECK_INTERVAL_RATE_RESET_MS = 5000;
var WINDOW_REMOVE_SAVE_TREE_DELAY_MS = 10000;

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
    if (browserIsClosed) {
        log('about to reload background page');
        document.location.reload();
        return;
    }

    // Ignore Sidewise-created windows
    if ((win.type == 'popup' && sidebarHandler.creatingSidebar) || monitorInfo.isDetecting())
    {
        return;
    }

    // Ignore all panels and detached-panels, e.g. Hangouts windows
    if (win.type == 'panel' || win.type == 'detached-panel') {
        return;
    }

    log(win);

    var winElem = new WindowNode(win);
    tree.addNode(winElem);
}

function onWindowRemoved(windowId)
{
    log(windowId);
    if (windowId == sidebarHandler.windowId)
    {
        if (sidebarHandler.removeInProgress) {
            log('sidebar removeInProgress');
            // Already handling the window removal elsewhere, don't do it twice
            return;
        }
        log('removing sidebar window');
        sidebarHandler.removeInProgress = true;
        sidebarHandler.onRemoved();
        return;
    }
    if (windowId == monitorInfo.lastDetectionWindowId) {
        return;
    }

    focusTracker.remove(windowId);
    disallowSavingTreeForDuration(WINDOW_REMOVE_SAVE_TREE_DELAY_MS);

    // temporarily make tree.onModifiedDelayWaitMs larger to prevent
    // unwanted saving of the tree during a shutdown operation
    tree.onModifiedDelayedWaitMs = config.TREE_ONMODIFIED_SAVE_AFTER_WINDOW_CLOSE_MS;

    var node = tree.getNode(['chromeId', windowId]);
    if (node) {

        // If the window node of the window being removed still has some children,
        // convert the window node to a hibernated window node rather than
        // removing it
        if (node.children.length > 0) {
            tree.updateNode(node, {
                hibernated: true,
                restorable: false,
                title: getMessage('text_hibernatedWindow'),
                chromeId: null
            });
        }
        else {
            // window node is childless so just remove it
            tree.removeNode(node);
        }
    }

    if (sidebarHandler.sidebarExists()
        && sidebarHandler.dockState != 'undocked'
        && sidebarHandler.dockWindowId == windowId)
    {
        sidebarHandler.dockWindowId = null;
        focusTracker.getTopFocusableWindow(function(win) {
            if (!win) {
                return;
            }
            sidebarHandler.redock(win.id);
        });
    }

    chrome.windows.getAll(null, function(wins) {
        for (var i in wins) {
            if (wins[i].type == 'normal') {
                // at least one normal window still exists aside
                // from the one that was just removed
                focusCurrentTabInPageTree();
                return;
            }
        }
        // No normal windows are left in existence.
        // Therefore we want Chrome to close, so we'll close any remaining
        // "popup" windows (such as the sidebar or dev-tools windows)
        // which should cause Chrome to exit.
        log('chrome is shutting down');
        shutdownSidewise();
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

    // log(windowId);

    // Has a non-Chrome app just received focus?
    if (windowId == -1) {
        focusTracker.chromeHasFocus = false;
        // log('Chrome lost focus, some other app is now focused');
        return;
    }

    var wasFocused = focusTracker.chromeHasFocus;
    focusTracker.chromeHasFocus = true;
    focusTracker.setFocused(windowId);

    sidebarHandler.matchSidebarDockMinimizedStates(function(performedMinimizeOrRestore) {
        if (performedMinimizeOrRestore) {
            return;
        }

        // Did Chrome just get focus back from another app, and sidebar is present, and keepSidebarOnTop is true?
        if (!wasFocused && sidebarHandler.sidebarExists() && settings.get('keepSidebarOnTop')) {
            // Chrome was not focused and just became focused; do sidebar+dockwin force-on-top handling
            if (windowId == sidebarHandler.windowId) {
                var raiseWindowId;
                if (sidebarHandler.dockState == 'undocked') {
                    raiseWindowId = focusTracker.getFocused();
                }
                else {
                    raiseWindowId = sidebarHandler.dockWindowId;
                }
                // Sidebar has been focused; raise the dock window too then refocus sidebar
                chrome.windows.update(raiseWindowId, { focused: true }, function() {
                    chrome.windows.update(sidebarHandler.windowId, { focused: true });
                });
                return;
            }

            // Chrome window other than sidebar received the focus; raise the sidebar then refocus said window
            chrome.tabs.query({ windowId: windowId, active: true }, function(tabs) {
                var tab = tabs[0];
                if (!isScriptableUrl(tab.url)) {
                    // if tab doesn't have a scriptable url we assume that the tab will not be in HTML5
                    // fullscreen mode either here

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
                getIsFullScreen(tab);
            });
            return;
        }

        // Was the sidebar focused (or in the process of being created)?
        if (windowId == sidebarHandler.windowId || sidebarHandler.creatingSidebar) {
            return;
        }

        // Sidebar wasn't just focused and we don't need to force-raise either the sidebar or
        // the dock-window; so we just set the tracked focus to the now-focused window
        focusCurrentTabInPageTree();
    });
}

function onWindowUpdateCheckInterval() {
    if (sidebarHandler.resizingDockWindow || sidebarHandler.matchingMinimizedStates || sidebarHandler.removeInProgress) {
        return;
    }

    if (!sidebarHandler.sidebarExists()) {
        return;
    }

    if (sidebarHandler.dockState == 'undocked') {
        chrome.windows.get(sidebarHandler.windowId, function(sidebar) {
            if (!sidebar || sidebar.state == 'minimized') {
                return;
            }

            // Update stored metrics for undocked sidebar as needed
            if (sidebar.left != settings.get('undockedLeft')) {
                sidebarHandler.currentSidebarMetrics.left = sidebar.left;
                settings.set('undockedLeft', sidebar.left);
            }

            if (sidebar.top != settings.get('undockedTop')) {
                sidebarHandler.currentSidebarMetrics.top = sidebar.top;
                settings.set('undockedTop', sidebar.top);
            }

            if (sidebar.width != settings.get('sidebarTargetWidth')) {
                sidebarHandler.currentSidebarMetrics.width = sidebar.width;
                settings.set('sidebarTargetWidth', sidebar.width);
                sidebarHandler.targetWidth = sidebar.width;
            }

            if (sidebar.height != settings.get('undockedHeight')) {
                sidebarHandler.currentSidebarMetrics.height = sidebar.height;
                settings.set('undockedHeight', sidebar.height);
            }

            return;
        });
        return;
    }

    if (!sidebarHandler.dockWindowId) {
        return;
    }

    chrome.windows.get(sidebarHandler.dockWindowId, function(dock) {
        if (!dock) {
            // dock window appears to have been destroyed but we did not find out about it;
            // update docked window now
            log('Dock window has been destroyed; choose new dock window');
            focusTracker.remove(sidebarHandler.dockWindowId);
            sidebarHandler.redock(focusTracker.getFocused());
            return;
        }

        if (sidebarHandler.resizingDockWindow) {
            return;
        }

        var dockDims = sidebarHandler.currentDockWindowMetrics;
        var allowAutoUnmaximize = (PLATFORM == 'Mac' ? false : settings.get('allowAutoUnmaximize'));

        chrome.windows.get(sidebarHandler.windowId, function(sidebar) {
            if (!sidebar) {
                return;
            }

            // Handle sidebar getting maximized
            if (sidebar.state == 'maximized' && PLATFORM != 'Mac') {
                //make dock+sidebar completely fill the screen
                var newDockDims = {
                    left: sidebar.left + offset,
                    top: sidebar.top + offset,
                    width: sidebar.width - 2 * offset,
                    height: sidebar.height - 2 * offset
                };

                // discard remembered (pre-sidebar) dock metrics; we'll reinstate them
                // after redock
                var memory = clone(sidebarHandler.lastDockWindowMetrics);
                sidebarHandler.lastDockWindowMetrics = {};

                // unmaximize the dock window, then set its size to "the whole screen",
                // then do a sidebar redock to fit the sidebar in
                positionWindow(sidebar.id, { state: 'normal' }, function() {
                    positionWindow(dock.id, newDockDims, function() {
                        sidebarHandler.redock(dock.id, function() {
                            sidebarHandler.lastDockWindowMetrics = memory;
                        });
                    });
                });
                return;
            }
        });

        var offset = monitorInfo.maximizedOffset;
        if (dock.state == 'maximized' && allowAutoUnmaximize && PLATFORM != 'Mac') {
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

        if (dock.state == 'maximized' && PLATFORM != 'Mac') {
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
                // settings.set('sidebarTargetWidth', sidebarDims.width);
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
        settings.set('sidebarTargetWidth', sidebarDims.width);

        log('updating sidebar to new dimensions', newDims, sidebarHandler.resizingSidebar);

        // Resize/move sidebar
        sidebarHandler.resizingSidebar = true;
        positionWindow(sidebarHandler.windowId, newDims, function() {
            TimeoutManager.reset('resetResizingSidebar', onResetResizingSidebar, 500);
        });
        return;

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
