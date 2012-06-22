///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

// Set up a port to pass messages between Sidewise and this page
var port = chrome.extension.connect(chrome.i18n.getMessage('@@extension_id'), { name: 'content_script' });
// console.log('connection', port);

port.onMessage.addListener(function(msg) {
    // console.log('message', msg);
    switch (msg.op) {
        case 'getPageDetails':
            sendPageDetails(msg);
            break;
    }
});

// Set up event listenter that fires whenever this page's location (URL) changes.
window.addEventListener('popstate', onPopState);

// Fire "location changed" event immediately to notify the extension.
onPopState();


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onPopState(evt) {
    // console.log('event handling', evt);
    notifySidewise();

    // Try again repeatedly in the near future because sometimes
    // a page's JS changes the page title shortly after loading
    // and we want to catch this. The repeated attempts are needed
    // during times of heavy browser load, i.e. during session restore.
    //
    // Chrome should fire onTabUpdated when the page title is changed
    // in this way but it does not.
    setTimeout(notifySidewise, 500);
    setTimeout(notifySidewise, 1500);
    setTimeout(notifySidewise, 5000);
    setTimeout(notifySidewise, 12000);
}


///////////////////////////////////////////////////////////
// Extension communication functions
///////////////////////////////////////////////////////////

function notifySidewise() {
    sendPageDetails({ action: 'store' });
}

function sendPageDetails(details) {
    details.op = 'getPageDetails';
    details.title = document.title;
    details.referrer = document.referrer;
    details.historylength = history.length;
    details.sessionGuid = getSessionGuid();

    var detailsJSON = JSON.stringify(details);

    var lastDetails = sessionStorage['sidewiseLastDetailsSent'];
    if (lastDetails == detailsJSON) {
        // console.log('skipping notify message send because details have not changed from last time they were sent');
        return;
    }
    sessionStorage['sidewiseLastDetailsSent'] = detailsJSON;

    // console.log('pushing these details', details);
    port.postMessage(details);
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
