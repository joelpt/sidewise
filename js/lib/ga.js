///////////////////////////////////////////////////////////
// ga.js
// Google Analytics integration
///////////////////////////////////////////////////////////

///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

// respect the user
if (localStorage['reportUsageStatistics'] != 'false') {
    var _gaq = _gaq || [];
    initGA();
    reportPageView();
}

function initGA() {
    // initialize google analytics object
    _gaq.push(['_setAccount', 'UA-33231974-1']);
    // _gaq.push(['_setDomainName', 'www.sidewise.info']);
    // _gaq.push(['_setAllowLinker', true]);

    (function() {
        var ga = document.createElement('script'); ga.type = 'text/javascript';
        ga.async = true;
        ga.src = 'https://ssl.google-analytics.com/ga.js';
        var s = document.getElementsByTagName('script')[0];
        s.parentNode.insertBefore(ga, s);
    })();
}


///////////////////////////////////////////////////////////
// Functions
///////////////////////////////////////////////////////////

// Report an event with the given details to Google Analytics.
function reportEvent(category, action, label, intValue, nonInteraction) {
    if (localStorage['reportUsageStatistics'] != 'true') {
        // respect the user
        return;
    }

    if (localStorage['loggingEnabled'] == 'true') {
        // log it
        console.log('reporting event', category, action, label, intValue, nonInteraction);
    }

    // send it
    _gaq.push(['_trackEvent', category, action, label, intValue, nonInteraction || false]);
}

// Report a page view to Google Analytics.
function reportPageView(url) {
    if (localStorage['reportUsageStatistics'] != 'true') {
        // respect the user
        return;
    }

    url = url || location.pathname;

    if (localStorage['loggingEnabled'] == 'true') {
        console.log('reporting page view', url);
    }

    _gaq.push(['_trackPageview', url]);
}