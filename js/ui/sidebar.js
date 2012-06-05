var sidebars = [
    { id: 'pages', url: 'sidebars/pages.html', label: 'Pages', icon: 'images/nav/pages.png' },
    { id: 'reddit', url: 'sidebars/external-site.html#http://i.reddit.com', label: 'Reddit', icon: 'images/nav/reddit.png' },
    { id: 'tribunal', url: 'sidebars/external-site.html#https://tribunal.herokuapp.com/', label: 'Tribunal', icon: 'images/nav/tribunal.png' },
    { id: 'twitter', url: 'sidebars/external-site.html#http://mobile.twitter.com', label: 'Twitter', icon: 'http://twitter.com/favicon.ico' },
    { id: 'p404', url: 'sidebars/404.html', label: '404&nbsp;test', icon: 'images/nav/pages.png' }
];

var initialSidebar = 'pages';
var manager;
var bg;

function onReady() {
    bg = chrome.extension.getBackgroundPage();
    manager = new SidebarNavManager($('ul#sidebarButtons'), $('tr#sidebars'),
        $('table#main'), $('body'), 'td');
    // manager.createSidebarButtons();
    // manager.createSidebarContainers();
    manager.addSidebarPanels(sidebars);

    // Aggressively try to reset the scroll position properly
    setTimeout(function() { $.scrollTo(0); }, 0);
    setTimeout(function() { $.scrollTo(0); }, 50);
    setTimeout(function() { manager.showSidebarPanel(initialSidebar); }, 100);

    $(document).keydown({manager: manager}, function(evt) {
        if (evt.keyCode == 70 && evt.ctrlKey) {
            var iframe = $(
                $('#' + evt.data.manager.currentSidebar).children('iframe').get(0).contentWindow.document
            );
            var filterBox = iframe.find('#pageFilter');
            if (filterBox.length == 0) {
                filterBox.focus();
            }
            evt.stopPropagation();
            return false;
        }
        return true;
    });

    $(window).resize(onResize);

    $('#optionsButton')
        .attr('title', getMessage('sidebars_optionsButtonTooltip'))
        .tooltip({ position: 'bottom center', predelay: 400, offset: [15, -15]})
        .click(onClickOptionsButton);

    setI18NText();
}

function onClickOptionsButton() {
    chrome.tabs.query({ url: chrome.extension.getURL('/options.html') }, function(tabs) {
        if (tabs.length == 0) {
            window.open('options.html');
            return;
        }
        chrome.tabs.update(tabs[0].id, { active: true });
    });
}

function onResize() {
    bg.sidebarHandler.onResize();
}