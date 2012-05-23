function registerRequestEvents()
{
    chrome.extension.onRequest.addListener(onRequest);
}


function onRequest(request, sender, sendResponse)
{
    log(request, sender);

    switch (request.op)
    {
        case 'getPageDetails':
            onGetPageDetailsMessage(sender.tab, request);
            break;
        case 'getScreen':
            onGetScreenMessage(sender.tab, request);
            break;
        case 'windowResized':
            onWindowResizedMessage(sender.tab, request);
            break;
        case 'detectMonitorMetrics':
            console.log(sender.tab, request);
            break;
        default:
            throw 'Unrecognized onRequest op ' + request.op;
    }
}
