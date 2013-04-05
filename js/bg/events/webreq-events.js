///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

function registerWebRequestEvents()
{
    // chrome.webRequest.onBeforeRequest.addListener(onBeforeRequest, {urls: ["<all_urls>"]});
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onBeforeRequest(details)
{
    if (details.frameId > 0)
    {
        // we don't care about activity occurring within a subframe of a tab
        return;
    }
    if (monitorInfo.isDetecting()) {
        return;
    }

    log('REQUEST', details.tabId);

    return;
}
