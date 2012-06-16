///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

// Set up a port to pass messages between Sidewise and this page
var port = chrome.extension.connect('gimdgohlhgfhfafpobendnlkpjbbnfjd', { name: 'content_script' });
console.log('connection', port);

port.onMessage.addListener(function(msg) {
    console.log('message', msg);
    switch (msg.op) {
        case 'getPageDetails':
            sendPageDetails(msg);
            break;
    }
});

port.onDisconnect.addListener(function(msg) {
    console.log('disconnect', msg);
});

// Set up event listenter that fires whenever this page's location (URL) changes.
window.addEventListener('popstate', onPopState);

// Fire "location changed" event immediately to give extension our details immediately.
onPopState();


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onPopState(evt) {
    console.log('event', evt);
    notifySidewise();
    // try again repeatedly in future because sometimes a page's JS changes the page title
    // shortly after loading and we want to know about this
    // TODO determine why onTabUpdated does not inform us of such title changes
    setTimeout(notifySidewise, 1000);
    setTimeout(notifySidewise, 5000);
    setTimeout(notifySidewise, 12000);
}


///////////////////////////////////////////////////////////
// Extension communication functions
///////////////////////////////////////////////////////////

function notifySidewise() {
    var details = { op: 'getPageDetails', action: 'store', referrer: document.referrer, historylength: history.length, guid: getSessionGuid() };
    var detailsJSON = JSON.stringify(details);

    var lastDetails = sessionStorage['sidewiseLastDetailsSent'];
    if (lastDetails == detailsJSON) {
        console.log('skipping notify message send because details have not changed from last time they were sent');
        return;
    }
    sessionStorage['sidewiseLastDetailsSent'] = detailsJSON;

    console.log('sending details', JSON.stringify(details));
    sendPageDetails(details);
}

function sendPageDetails(params) {
    params.op = 'getPageDetails';
    params.title = document.title;
    params.referrer = document.referrer;
    params.historylength = history.length;
    params.sessionGuid = getSessionGuid();
    port.postMessage(params);
}


///////////////////////////////////////////////////////////
// Session GUID generation and acquisition
///////////////////////////////////////////////////////////

function getSessionGuid() {
   var guid = sessionStorage['sidewiseGuid'];
    if (!guid) {
        guid = generateGuid();
        sessionStorage['sidewiseGuid'] = guid;
    }
    return guid;
}

function generateGuid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}
