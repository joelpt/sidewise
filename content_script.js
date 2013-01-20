///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var LOGGING_ENABLED = false;        // for development use
var MEDIA_PLAYER_STATE_ALIASES = {  // player state aliases for youtube player api only atm
    '-1': 'unstarted',
    '0': 'ended',
    '1': 'playing',
    '2': 'paused',
    '3': 'buffering',
    '5': 'video cued'
};
var MIN_WAIT_BETWEEN_NOTIFIES_MS = 20; // don't notify bg page more than this often


///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var port;
var notifyTimeout;


///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

connectPort();
notifySidewise();

window.addEventListener('popstate', onLocationOrHistoryChanged);
window.addEventListener('DOMContentLoaded', onDOMContentLoaded);

function onDOMContentLoaded() {
    log('onDOMContentLoaded');
    setUpTitleObserver();
    setUpMediaMonitors();
}

// set up an observer for the title element
function setUpTitleObserver() {
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
// Event handlers
///////////////////////////////////////////////////////////

// notify sidewise whenever location/history change is detected
function onLocationOrHistoryChanged(evt) {
    log(evt.type, evt);
    notifySidewise();
}


///////////////////////////////////////////////////////////
// Background page communication
///////////////////////////////////////////////////////////

// sends current page details to background page, rate limited
function notifySidewise() {
    clearTimeout(notifyTimeout);
    notifyTimeout = setTimeout(function() {
        sendPageDetails({ action: 'store' });
    }, MIN_WAIT_BETWEEN_NOTIFIES_MS);
}

// send a pack of page details to background page
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

// get session guid from sessionStorage, creating one first if needed
function getSessionGuid() {
   var guid = sessionStorage['sidewiseGuid'];
    if (!guid) {
        guid = generateGuid();
        sessionStorage['sidewiseGuid'] = guid;
    }
    return guid;
}

// generate a guid-like value
function generateGuid() {
    var guid = Math.random().toString(36);
    return guid.substring(2, 6) + '-' + guid.substring(6, 15) + '-' + Math.random().toString(36).substring(2, 15);
}


/////////////////////////////////////////////////////////////////////
// In-page script injection and page-to-content-script event passing
/////////////////////////////////////////////////////////////////////

// Inject the contents of the given Function fn into the running JS context
// of the page. This is needed for certain operations as the
// content script runs in its own JS context, so we cannot e.g. define
// 'function onYoutubePlayerReady() {...}' within the content script and
// expect the page's JS code to be able to see the function from its
// separate JS context.
function injectPageScript(fn) {
    var code = '(' + fn + ')();';
    var script = document.createElement('script');
    script.textContent = code;
    (document.head||document.documentElement).appendChild(script);
    script.parentNode.removeChild(script);
}

// Inject a couple utility functions into the page's JS context
// which enable us to send custom events from code running in the
// page's JS context to code running in the content-script's JS context.
// This allows us to pass information through this JS context chain:
//      page -> content-script -> background
//
function injectPageScriptSendEventFn() {
    injectPageScript(function() {

        // Send an event from page context to content script context.
        window.sidewise_sendEvent = function(name, value) {
            var e = document.createElement('meta');
            e.setAttribute('name', 'sidewise_event');
            e.setAttribute('event-name', name);
            e.setAttribute('event-value', value);
            document.head.appendChild(e);
        };

        // Send a media update type of event using sidewise_sendEvent.
        window.sidewise_sendMediaUpdateEvent = function(state, time) {
            // console.log('updateMediaState', state + ',' + time);
            window.sidewise_sendEvent('updateMediaState', state + ',' + time);
        };

    });
}

// Acts as the receiving end of <page context>.sidewise_sendEvent() messages
// into the content script's context
function receivePageEvent(eventElement) {
    var name = eventElement.getAttribute('event-name');
    var value = eventElement.getAttribute('event-value');
    eventElement.parentElement.removeChild(eventElement);

    switch (name) {
        case 'updateMediaState':
            var parts = value.split(',');
            // Send an updateMediaState request to the background page
            chrome.extension.sendRequest({
                op: 'updateMediaState',
                state: MEDIA_PLAYER_STATE_ALIASES[parts[0]] || parts[0],
                time: parts[1]
            });
            break;
        default:
            throw new Error('Unrecognized event-name ' + name);
    }
}


///////////////////////////////////////////////////////////
// Media state monitoring on e.g. youtube players
///////////////////////////////////////////////////////////

// Injects scripts into the page's context to do media state monitoring
function setUpMediaMonitors() {
    injectPageScriptSendEventFn();
    injectYouTubeMonitoring();
    injectPageScript(jwplayerPageScript);
}

// Do youtube page/embed monitoring if we detect any suitable existing youtube player
function injectYouTubeMonitoring() {
    var onYoutube = document.location.href.match(/https?:\/\/.+?youtube\..+?\//) !== null;
    var iframes = document.querySelectorAll('iframe[src*="youtube."]');

    if (!onYoutube && iframes.length == 0) {
        return;
    }

    injectPageScript(youTubeCommonScript);

    if (onYoutube) {
        injectPageScript(youTubePageScript);
        return;
    }

    injectPageScript(youTubeIframeScript);
}

// Common code for youtube player monitoring
function youTubeCommonScript() {
    clearTimeout(window.sidewise_missedOnYoutubePlayerReadyTimer);
    clearInterval(window.sidewise_onVideoPlayingIntervalTimer);

    window.sidewise_onPlayerStateChange = function(event) {
        console.log('CHANGE', event);
        var player, state;
        if (typeof(event) == 'number') {
            player = window.sidewise_ytplayer;
            state = event;
        }
        else {
            player = event.target;
            state = event.data;
        }

        console.log('onPlayerStateChange', state);
        if (state == 1) {
            // Report current time value periodically during playback
            if (!window.sidewise_onVideoPlayingIntervalTimer) {
                window.sidewise_onVideoPlayingIntervalTimer = setInterval(function() {
                    window.sidewise_sendMediaUpdateEvent(state, player.getCurrentTime());
                }, 500);
            }
        }
        else {
            clearInterval(window.sidewise_onVideoPlayingIntervalTimer);
            window.sidewise_onVideoPlayingIntervalTimer = null;
        }
        window.sidewise_sendMediaUpdateEvent(state, player.getCurrentTime());
    };
}


// Monitor youtube players on youtube.com pages
function youTubePageScript() {
    window.onYouTubePlayerReady = function(playerid) {
        if (window.sidewise_ytplayer) {
            return;
        }
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

// Monitor youtube players embedded on non-youtube.com sites
function youTubeIframeScript() {
    window.getFrameId = function(id){
        var elem = document.getElementById(id);
        if (elem) {
            if(/^iframe$/i.test(elem.tagName)) return id; //Frame, OK
            // else: Look for frame
            var elems = elem.getElementsByTagName("iframe");
            if (!elems.length) return null; //No iframe found, FAILURE
            for (var i=0; i<elems.length; i++) {
               if (/^https?:\/\/(?:www\.)?youtube(?:-nocookie)?\.com(\/|$)/i.test(elems[i].src)) break;
            }
            elem = elems[i]; //The only, or the best iFrame
            if (elem.id) return elem.id; //Existing ID, return it
            // else: Create a new ID
            do { //Keep postfixing `-frame` until the ID is unique
                id += "-frame";
            } while (document.getElementById(id));
            elem.id = id;
            return id;
        }
        // If no element, return null.
        return null;
    };

    // Handles initial preparation for the API bridge.
    var sidewise_onYouTubeIframesReady = (function(){
        var onReady_funcs = [], api_isReady = false;
        /* @param func function     Function to execute on ready
         * @param func Boolean      If true, all qeued functions are executed
         * @param b_before Boolean  If true, the func will added to the first
                                     position in the queue*/
        return function(func, b_before){
            if (func === true) {
                api_isReady = true;
                for (var i=0; i<onReady_funcs.length; i++){
                    // Removes the first func from the array, and execute func
                    onReady_funcs.shift()();
                }
            }
            else if(typeof func == "function") {
                if (api_isReady) func();
                else onReady_funcs[b_before?"unshift":"push"](func);
            }
        }
    })();

    // This function will be called when the API is fully loaded
    window.onYouTubePlayerAPIReady = function() {
        sidewise_onYouTubeIframesReady(true);
    };

    // Find all viable youtube iframes
    window.sidewise_youtubeIframes = document.querySelectorAll('iframe[src*="youtube."]');
    if (window.sidewise_youtubeIframes.length == 0) {
        return;
    }

    // Load YouTube Frame API
    (function(){ //Closure, to not leak to the scope
      var s = document.createElement("script");
      s.src = "http://www.youtube.com/player_api";  // Load Player API
      var before = document.getElementsByTagName("script")[0];
      before.parentNode.insertBefore(s, before);
    })();

    var players = {};

    // Executed when the API is ready to add onStateChange listeners
    // to all iframe-embedded youtube players found on the page
    // TODO look within iframes for other iframes too, e.g. for /r/videos
    sidewise_onYouTubeIframesReady(function(){
        for (var i = 0; i < window.sidewise_youtubeIframes.length; i++) {
            var iframe = window.sidewise_youtubeIframes[i];
            if (!iframe.id) {
                // make sure the iframe has an id so we can work with it
                iframe.id = Math.random().toString(26);
            }
            var frameId = getFrameId(iframe.id);
            if (frameId) { //If the frame exists
                players[frameId] = new YT.Player(frameId, {
                    events: {
                        "onStateChange": sidewise_onPlayerStateChange
                    }
                });
            }
        }
        return;
    });
}

// Monitor jwplayer players
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
