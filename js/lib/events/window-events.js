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

    // some Chrome window is focused
    setChromeWindowIsFocused(true);

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

