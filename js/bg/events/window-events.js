function registerWindowEvents()
{
    chrome.windows.onCreated.addListener(onWindowCreated);
    chrome.windows.onRemoved.addListener(onWindowRemoved);
    chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
    setInterval(onWindowUpdateCheckInterval, 100);
}

function onWindowCreated(win)
{
    if ((win.type == 'popup' && sidebarHandler.creatingSidebar) || isDetectingMonitors())
    {
        return;
    }
    log(win);

    winElem = new Window(win);
    tree.add(winElem);
}

function onWindowRemoved(windowId)
{
    if (windowId == sidebarHandler.windowId)
    {
        if (sidebarHandler.removeInProgress) {
            // Already handling the window removal elsewhere, don't do it twice
            return;
        }
        sidebarHandler.onRemoved();
        return;
    }
    if (windowId == lastDetectionWindowId) {
        return;
    }
    log(windowId);
    tree.remove('w' + windowId);
    focusTracker.remove(windowId);
    if (sidebarHandler.sidebarExists())
    {
        chrome.windows.getAll(null, function(windows) {
            if (windows.length == 1)
            {
                // no windows left except the sidebar's window.
                // so close the sidebar so chrome may exit.
                sidebarHandler.remove();
            }
        });
    }
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
    if (isDetectingMonitors()) {
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
            // Sidebar has been focused; raise the dock window alongside it
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

var resetResizeFlagTimeout = null;

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
        var widthDelta = dock.width - dockDims.width;
        if (widthDelta == 0) {
            return;
        }

        var sidebarDims = sidebarHandler.currentSidebarMetrics;

        // dock window width has changed, adjust sidebar accordingly
        if (sidebarHandler.dockState == 'right') {
            // dock window common edge with right sidebar was adjusted
            sidebarDims.left += widthDelta;
            sidebarDims.width -= widthDelta;
        }
        else {
            // dock window common edge with left sidebar was adjusted
            sidebarDims.width -= widthDelta;
        }

        // Update stored metrics
        dockDims.width = dock.width;
        sidebarHandler.targetWidth = sidebarDims.width;
        saveSetting('sidebarTargetWidth', sidebarDims.width);

        // Resize sidebar
        sidebarHandler.resizingSidebar = true;
        positionWindow(sidebarHandler.windowId, {
            left: sidebarDims.left,
            width: sidebarDims.width
        }, function() {
            clearTimeout(resetResizeFlagTimeout);
            resetResizeFlagTimeout = setTimeout(function() {
                sidebarHandler.resizingSidebar = false;
            }, 500);
        });

    });
}
