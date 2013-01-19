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
    log('onDOMContentLoaded');
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

        window.sidewise_sendMediaUpdateEvent = function(state, time) {
            // console.log('updateMediaState', state + ',' + time);
            window.sidewise_sendEvent('updateMediaState', state + ',' + time);
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
                state: parts[0],
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
    var guid = Math.random().toString(36);
    return guid.substring(2, 6) + '-' + guid.substring(6, 15) + '-' + Math.random().toString(36).substring(2, 15);
}


///////////////////////////////////////////////////////////
// Youtube
///////////////////////////////////////////////////////////

function setUpYouTubeMonitor() {
    injectPageScriptSendEventFn();
    injectPageScript(jwplayerPageScript);

    // if (document.location.href.match('youtube.+/(user|watch)')) {
        injectPageScript(youTubePageScript);
        // return;
    // }
}

function youTubePageScript() {
    window.onYouTubePlayerReady = function(playerid) {
        // define onPlayerStateChange once it's needed
        window.sidewise_onPlayerStateChange = function(state) {
            // console.log('onPlayerStateChange', state);
            if (state == 1) {
                // Report current time value periodically during playback
                if (!window.sidewise_onVideoPlayingIntervalTimer) {
                    window.sidewise_onVideoPlayingIntervalTimer = setInterval(function() {
                        window.sidewise_sendMediaUpdateEvent(YOUTUBE_PLAYER_STATES[state], sidewise_ytplayer.getCurrentTime());
                    }, 500);
                }
            }
            else {
                clearInterval(window.sidewise_onVideoPlayingIntervalTimer);
                window.sidewise_onVideoPlayingIntervalTimer = null;
            }
            window.sidewise_sendMediaUpdateEvent(YOUTUBE_PLAYER_STATES[state], sidewise_ytplayer.getCurrentTime());
        };

        clearTimeout(window.sidewise_missedOnYoutubePlayerReadyTimer);
        if (window.sidewise_ytplayer) {
            return;
        }
        clearInterval(window.sidewise_onVideoPlayingIntervalTimer);
        window.sidewise_onVideoPlayingIntervalTimer = null;
        window.sidewise_missedOnYoutubePlayerReadyTimer = null;
        window.sidewise_ytplayer = document.getElementById("movie_player");
        if (!window.sidewise_ytplayer) {
            window.sidewise_ytplayer = document.getElementById("movie_player-flash");
        }
        if (!window.sidewise_ytplayer) {
            window.sidewise_missedOnYouTubePlayerReadyTimer = setTimeout(window.onYouTubePlayerReady, 5000);
            return;
        }
        window.sidewise_ytplayer.addEventListener('onStateChange', 'sidewise_onPlayerStateChange');
    };
}


function jwplayerPageScript() {
    if (typeof(jwplayer) != 'function') {
        return;
    }

    window.sidewise_onJwPlayerCheck = function() {
        var jw = jwplayer();
        if (!jw) {
            return;
        }
        var state = jw.getState();

        if (!state) {
            return;
        }

        state = state.toLowerCase();
        var time = jw.getPosition();

        if (state == 'playing' || state != window.sidewise_jwPlayerLastState) {
            // Report current time value periodically during playback
            window.sidewise_sendMediaUpdateEvent(state, time);
            window.sidewise_jwPlayerLastState = state;
        }
    };

    if (window.sidewise_onJwPlayerCheckInterval) {
        clearInterval(window.sidewise_onJwPlayerCheckInterval);
    }

    window.sidewise_onJwPlayerCheckInterval = setInterval(window.sidewise_onJwPlayerCheck, 500);
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
