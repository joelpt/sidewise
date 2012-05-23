function registerWindowEvents()
{
    chrome.windows.onCreated.addListener(onWindowCreated);
    chrome.windows.onRemoved.addListener(onWindowRemoved);
    chrome.windows.onFocusChanged.addListener(onWindowFocusChanged);
}

function onWindowCreated(win)
{
    log(win);
    if ((win.type == 'popup' && sidebarHandler.creatingSidebar) || isDetectingMonitors())
    {
        return;
    }

    winElem = new Window(win);
    tree.add(winElem);
}

function onWindowRemoved(windowId)
{
    if (windowId == sidebarHandler.windowId)
    {
        sidebarHandler.onRemoved();
        return;
    }
    if (isDetectingMonitors()) {
        return;
    }
    log(windowId);
    tree.remove('w' + windowId);
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
    log(windowId);

    if (isDetectingMonitors()) {
        return;
    }

    if (windowId == -1) {
        // focus has moved to a non Chrome window
        setChromeWindowIsFocused(false);
        return;
    }

    var wasFocused = isChromeWindowFocused();
    setChromeWindowIsFocused(true); // some Chrome window is now in focus

    if (!wasFocused && sidebarHandler.sidebarExists() && sidebarHandler.dockWindowId && loadSetting('keepSidebarOnTop', false)) {
        // Chrome was not focused and just became focused; do sidebar+dockwin force-on-top handling
        if (windowId == sidebarHandler.windowId) {
            // Sidebar has been focused; raise the dock window alongside it
            chrome.windows.update(sidebarHandler.dockWindowId, { focused: true }, function() {
                chrome.windows.update(sidebarHandler.windowId, { focused: true });
            });
            return;
        }

        // Chrome window other than sidebar received the focus; raise the sidebar then refocus
        // said window
        setFocusedChromeWindowId(windowId);
        chrome.tabs.query({ windowId: windowId, active: true }, function(tabs) {
            var tab = tabs[0];
            if (!isScriptableUrl(tab.url)) {
                // if tab doesn't have a scriptable url we assume it will not be in HTML5
                // fullscreen mode either

                // focus the sidebar window ...
                chrome.windows.update(sidebarHandler.windowId, { focused: true }, function() {
                    // ... then focus the window that should have focus.
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

    if (windowId == sidebarHandler.windowId || sidebarHandler.creatingSidebar)
    {
        // sidebar was focused

        chrome.windows.get(getFocusedChromeWindowId(), function(win) {
            if (win.state != 'minimized') {
                // this was just a normal window focus switch, do nothing
                return;
            }

            // see if we want to refocus the previously focused window
            chrome.windows.get(getLastFocusedChromeWindowId(), function(lastWin) {
                if (lastWin.state == 'minimized') {
                    // don't unminimize a window the user previously minimized
                    return;
                }
                log('set focus to previously focused window tab');
                // focusCurrentTabInPageTree(true);
                chrome.windows.update(lastWin.id, { focused: true });
            });
        });
        return;
    }

    setFocusedChromeWindowId(windowId);
    log('set focus to currently focused window tab');
    focusCurrentTabInPageTree();
}

