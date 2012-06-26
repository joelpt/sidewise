///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var LOGGING_ENABLED = true;


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

var port;
var portIsSafe;

window.addEventListener('popstate', onPopState);

connectPort();
notifySidewiseMultiple();


///////////////////////////////////////////////////////////
// Port connection
///////////////////////////////////////////////////////////

// Set up a port to pass messages between Sidewise and this page
function connectPort() {
    port = chrome.extension.connect({ name: 'content_script' });
    portIsSafe = true;
    log('connection', port);

    port.onMessage.addListener(function(msg) {
        log('message', msg.op, msg.action, msg);
        portIsSafe = true;
        switch (msg.op) {
            case 'getPageDetails':
                sendPageDetails(msg);
                break;
        }
    });

    port.onDisconnect.addListener(function() {
        log('disconnect', port);
        portIsSafe = false;
    });
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onPopState(evt) {
    log('--onPopState--', evt);
    // Port can sometimes be silently disconnected by pages that
    // manipulate the browser's history state to simulate back/forward
    // navigation without performing a page reload, e.g. mail.google.com.
    portIsSafe = false;
    notifySidewiseMultiple();
}

function notifySidewiseMultiple() {
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
        // log('skipping notify message send because details have not changed from last time they were sent');
        return;
    }
    sessionStorage['sidewiseLastDetailsSent'] = detailsJSON;

    if (portIsSafe) {
        log('pushing details via port', detailsJSON);
        port.postMessage(details);
    }
    else {
        log('pushing details via sendRequest', detailsJSON);
        chrome.extension.sendRequest(details);
    }
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


///////////////////////////////////////////////////////////
// Logging
///////////////////////////////////////////////////////////

function log() {
    if (!LOGGING_ENABLED) {
        return;
    }
    console.log.apply(console, arguments);
}
