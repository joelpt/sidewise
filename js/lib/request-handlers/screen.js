var getScreenScriptBody = "console.log(screen); chrome.extension.sendRequest( { op: 'getScreen', screen: screen } );";
var afterGetScreenCallback = null;

// Fetch the screen object for the given tab, if possible
// If impossible, just return the background page's screen object
// This approach is not threadsafe - only call getScreen once and then
// wait for callback to be called before doing another
//
// screen object is passed to callback with definition Function(tab, screen)
function getScreen(tab, callback)
{
    if (afterGetScreenCallback)
    {
        throw 'getScreen() is not threadsafe; called when waiting for return from last getScreen() call';
    }

    if (isScriptableUrl(tab.url))
    {
        afterGetScreenCallback = callback;
        executeContentScript(tab.url, tab.id, getScreenScriptBody);
        return;
    }

    // just use background.html's screen object
    callback(tab, screen);
}

function onGetScreenMessage(tab, msg)
{
    if (!afterGetScreenCallback)
    {
        throw 'No afterGetScreenCallback set in onGetScreenMessage';
    }
    afterGetScreenCallback(tab, msg.screen);
    afterGetScreenCallback = null;
}
