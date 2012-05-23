var getPageDetailsScriptBody = "chrome.extension.sendRequest( { op: 'getPageDetails', referrer: document.referrer } );";

function getPageDetails(tab)
{
    executeContentScript(tab.url, tab.id, getPageDetailsScriptBody);
}

function onGetPageDetailsMessage(tab, msg)
{
    var tabId = tab.id;
    var windowId = tab.windowId;
    var page = tree.getPage(tabId);
    log(tabId, msg.referrer, page);
    if (page === undefined)
    {
        // page entry doesn't exist anymore
        throw 'pagedetails could not find page ' + tab.id + ' in the tree?!';
    }
    // look for an existing tab whose url matches our tab's referrer
    chrome.tabs.query({ 'windowId': windowId, 'url': dropUrlHash(msg.referrer) }, function(tabs) {
        tree.updatePage(tabId, { placed: true });  // tab's proper tree location is now 'known'
        if (tabs.length == 0)
            return;  // no apparent parent tab, so it belongs where it is under a window
        // TODO handle these cases:
        //      parent tab == child tab
        //      parent tab is already a descendant of the tab with tabId
        log('making ' + tabId + ' a child of ' + tabs[0].id);
        tree.move('p' + tabId, 'p' + tabs[0].id);
        tree.updatePage(tabId, { placed: true });
    });
}
