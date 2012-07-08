var _gaq = _gaq || [];
_gaq.push(['_setAccount', 'UA-33231974-1']);
_gaq.push(['_trackPageview']);

function reportPageView() {
    if (localStorage['reportUsageStatistics'] != 'true') {
        // respect the user
        return;
    }

    (function() {
    var ga = document.createElement('script'); ga.type = 'text/javascript'; ga.async = true;
    ga.src = 'https://ssl' + '.google-analytics.com/ga.js';
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(ga, s);
    })();
}

function reportEvent(category, action, label, intValue, nonInteraction) {
    if (localStorage['reportUsageStatistics'] != 'true') {
        // respect the user
        return;
    }
    _gaq.push(['_trackEvent', category, action, label, intValue, nonInteraction || false]);
}

reportPageView();