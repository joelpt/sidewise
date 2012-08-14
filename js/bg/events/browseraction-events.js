function registerBrowserActionEvents()
{
    chrome.browserAction.onClicked.addListener(onBrowserActionClicked);
}

function onBrowserActionClicked()
{
    var action = settings.get('browserActionButtonBehavior');
    log('browser action button clicked', 'configured action:', action);

    if (sidebarHandler.sidebarExists()) {
        if (action == 'toggle') {
            // sidebar exists, so remove it
            sidebarHandler.remove();
            return;
        }

        // sidebar exists, is it undocked?
        if (sidebarHandler.dockState == 'undocked') {
            // it's undocked so just raise it
            chrome.windows.update(sidebarHandler.windowId, { focused: true });
            return;
        }

        // sidebar exists, are we changing its dock target?
        if (sidebarHandler.dockWindowId != focusTracker.getFocused()) {
            // changing dock target
            sidebarHandler.redock(focusTracker.getFocused());
            return;
        }

        // sidebar exists and it's docked to the current focused window, so just raise the sidebar
        chrome.windows.update(sidebarHandler.windowId, { focused: true });
        return;
    }

    // sidebar doesn't exist so create it with user's choice of docking mode from settings
    sidebarHandler.createWithDockState(settings.get('dockState'));
}
