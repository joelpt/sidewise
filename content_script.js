notifySidewise();

window.addEventListener('popstate', onPopState);

var port = chrome.extension.connect('gimdgohlhgfhfafpobendnlkpjbbnfjd', { name: 'content_script' });

console.log('connection', port);

port.onMessage.addListener(function(msg) {
    console.log('message', msg);
});

port.onDisconnect.addListener(function(msg) {
    console.log('disconnect', msg);
});

port.postMessage({ value: 'hello world' });


function generateGuid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}

function onPopState(evt) {
    console.log('event', evt);
    notifySidewise();
    setTimeout(notifySidewise, 1000);
    setTimeout(notifySidewise, 5000);
    setTimeout(notifySidewise, 12000);
}

function notifySidewise() {
    var guid = sessionStorage['sidewiseGuid'];
    if (!guid) {
        guid = generateGuid();
        sessionStorage['sidewiseGuid'] = guid;
    }

    var details = { op: 'getPageDetails', action: 'store', referrer: document.referrer, historylength: history.length, guid: guid };
    var detailsJSON = JSON.stringify(details);

    var lastDetails = sessionStorage['sidewiseLastDetailsSent'];
    if (lastDetails == detailsJSON) {
        console.log('skipped updating event');
        return;
    }
    chrome.extension.sendRequest(details);
    sessionStorage['sidewiseLastDetailsSent'] = detailsJSON;

    console.log('fired updating event', JSON.stringify(details));
}
