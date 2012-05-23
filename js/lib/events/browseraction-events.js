function registerBrowserActionEvents()
{
    chrome.browserAction.onClicked.addListener(onBrowserActionClicked);
}

function onBrowserActionClicked()
{
    // var currentSide = sidebarHandler.dockState;
    // var newSide = (sidebarHandler.dockState == 'right' ? 'left' : 'right');

    // // If sidebar already exists, remove it then recreate it
    // if (sidebarHandler.sidebarExists()) {
    //     sidebarHandler.remove(function() {
    //         sidebarHandler.createDockedToCurrentWin(newSide);
    //     });
    //     return;
    // }

    // // No sidebar exists so just create it now
    // sidebarHandler.createDockedToCurrentWin(newSide);
    if (sidebarHandler.sidebarExists()) {
        sidebarHandler.remove();
        return;
    }
    sidebarHandler.createWithDockState(loadSetting('dockState', 'right'));
}


