///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var LOGGING_ENABLED = false;
var YOUTUBE_PLAYER_STATES = {
    '-1': 'unstarted',
    '0': 'ended',
    '1': 'playing',
    '2': 'paused',
    '3': 'buffering',
    '5': 'video cued'
};


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

var port;
var notifyTimeout;

connectPort();
notifySidewise();

window.addEventListener('popstate', onLocationOrHistoryChanged);
window.addEventListener('DOMContentLoaded', onDOMContentLoaded);

function onDOMContentLoaded() {
    setUpTitleObserver();
    setUpYouTubeMonitor();
}

function setUpTitleObserver() {
    // set up an observer for the title element
    var target = document.querySelector('head');
    if (!target) {
        log('Page does not have head element');
        return;
    }
    var observer = new window.WebKitMutationObserver(function(mutations) {
        var first = mutations[0];
        if (first.type == 'attributes' && first.target.name == 'sidewise_event') {
            receivePageEvent(first.target);
            return;
        }
        notifySidewise();
    });
    observer.observe(target, { attributes: true, subtree: true, characterData: true, childList: true });
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
// In-page script injection and passed event handling
///////////////////////////////////////////////////////////

function injectPageScript(fn) {
    var code = '(' + fn + ')();';
    var script = document.createElement('script');
    script.textContent = code;
    (document.head||document.documentElement).appendChild(script);
    script.parentNode.removeChild(script);
}

function injectPageScriptSendEventFn() {
    injectPageScript(function() {
        window.sidewise_sendEvent = function(name, value) {
            var e = document.createElement('meta');
            e.setAttribute('name', 'sidewise_event');
            e.setAttribute('event-name', name);
            e.setAttribute('event-value', value);
            document.head.appendChild(e);
        };
    });
}

function receivePageEvent(eventElement) {
    var name = eventElement.getAttribute('event-name');
    var value = eventElement.getAttribute('event-value');
    eventElement.parentElement.removeChild(eventElement);

    switch (name) {
        case 'updateMediaState':
            var parts = value.split(',');
            chrome.extension.sendRequest({
                op: 'updateMediaState',
                state: YOUTUBE_PLAYER_STATES[parts[0]],
                time: parts[1]
            });
            break;
        default:
            throw new Error('Unrecognized event-name ' + name);
    }
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
    clearTimeout(notifyTimeout);
    notifyTimeout = setTimeout(function() {
        sendPageDetails({ action: 'store' });
    }, 20);
}

function sendPageDetails(details) {
    details.op = 'getPageDetails';
    details.title = document.title;
    details.referrer = document.referrer;
    details.historylength = history.length;
    details.sessionGuid = getSessionGuid();

    var faviconElem = document.querySelector('head > link[rel=icon], head > link[rel=favicon]');
    if (faviconElem) {
        details.favicon = faviconElem.href;
    }
    var detailsJSON = JSON.stringify(details);

    var lastDetails = sessionStorage['sidewiseLastDetailsSent'];
    if (lastDetails == detailsJSON) {
        // log('skipping notify message send because details have not changed from last time they were sent');
        return;
    }
    sessionStorage['sidewiseLastDetailsSent'] = detailsJSON;

    // console.log('pushing details via sendRequest', detailsJSON);
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
// Youtube
///////////////////////////////////////////////////////////

function setUpYouTubeMonitor() {
    if (!document.location.href.match('youtube.+/watch')) {
        return;
    }
    injectPageScriptSendEventFn();
    injectPageScript(youTubePageScript);
}

function youTubePageScript() {
    window.sidewise_onVideoPlayingTimer = null;

    window.onYouTubePlayerReady = function() {
        clearTimeout(window.sidewise_missedOnYoutubePlayerReadyTimer);
        window.sidewise_ytplayer = document.getElementById("movie_player");
        if (!window.sidewise_ytplayer) {
            window.sidewise_missedOnYouTubePlayerReadyTimer = setTimeout(window.onYouTubePlayerReady(), 5000);
            return;
        }
        window.sidewise_ytplayer.addEventListener('onStateChange', 'sidewise_onPlayerStateChange');
    };

    window.sidewise_missedOnYouTubePlayerReadyTimer = setTimeout(window.onYouTubePlayerReady(), 5000);

    window.sidewise_onPlayerStateChange = function(state) {
        if (state == 1) {
            // Report current time value periodically during playback
            window.sidewise_onVideoPlayingTimer = setInterval(function() {
                sidewise_sendYouTubeUpdateEvent(1);
            }, 500);
        }
        else {
            clearInterval(sidewise_onVideoPlayingTimer);
        }
        sidewise_sendYouTubeUpdateEvent(state);
    };

    window.sidewise_sendYouTubeUpdateEvent = function(state) {
        window.sidewise_sendEvent('updateMediaState', state + ',' + sidewise_ytplayer.getCurrentTime());
    };
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
