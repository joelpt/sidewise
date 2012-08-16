///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var LOGGING_ENABLED = false;


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

var port;
connectPort();
notifySidewise();

window.addEventListener('popstate', onLocationOrHistoryChanged);
window.addEventListener('DOMContentLoaded', onDOMContentLoaded);

function onDOMContentLoaded() {
    setUpTitleObserver();
}

function setUpTitleObserver() {
    // set up an observer for the title element
    var target = document.querySelector('head > title');
    if (!target) {
        log('Page does not have head > title element');
        return;
    }
    var observer = new window.WebKitMutationObserver(function(mutations) {
        var mutation = mutations[0];
        log('new page title:', mutation.target.textContent);
        notifySidewise();
    });
    observer.observe(target, { subtree: true, characterData: true, childList: true });
}


///////////////////////////////////////////////////////////
// Port connection
///////////////////////////////////////////////////////////

// Set up a port to pass messages between Sidewise and this page
function connectPort() {
    port = chrome.extension.connect({ name: 'content_script' });
    log('connection', port);

    port.onMessage.addListener(function(msg) {
        log('message', msg.op, msg.action, msg);
        switch (msg.op) {
            case 'getPageDetails':
                sendPageDetails(msg);
                break;
        }
    });

    port.onDisconnect.addListener(function() {
        log('disconnect', port);
    });
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onLocationOrHistoryChanged(evt) {
    log(evt.type, evt);
    notifySidewise();
}


///////////////////////////////////////////////////////////
// Background page communication
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

    log('pushing details via sendRequest', detailsJSON);
    chrome.extension.sendRequest(details);
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
