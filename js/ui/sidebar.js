//////////////////////////////////////////
// Initialization
//////////////////////////////////////////

var sidebars = [
    { id: 'pages', url: 'sidebars/pages.html', label: getMessage('sidebarLabel_Pages'), icon: 'images/nav/pages.png' },
    { id: 'notepad', url: 'sidebars/notepad.html', label: getMessage('sidebarLabel_Notepad'), icon: 'images/nav/notepad.png' },
    { id: 'reddit', url: 'sidebars/external-site.html#http://i.reddit.com', label: getMessage('sidebarLabel_Reddit'), icon: 'images/nav/reddit.png' }//,
    // { id: 'tribunal', url: 'sidebars/external-site.html#https://tribunal.herokuapp.com/', label: 'Tribunal', icon: 'images/nav/tribunal.png' },
    // { id: 'twitter', url: 'sidebars/external-site.html#http://mobile.twitter.com', label: 'Twitter', icon: 'http://twitter.com/favicon.ico' },
];

var manager;
var bg;
var settings;

$(document).ready(onReady);

function onReady() {
    bg = chrome.extension.getBackgroundPage();
    settings = bg.settings;

    $.fx.off = !settings.get('animationEnabled');

    manager = new SidebarNavManager($('ul#sidebarButtons'), $('tr#sidebars'),
        $('table#main'), $('body'), 'td');
    manager.addSidebarPanes(sidebars);

    // Set initial sidebar position
    var initialSidebar = settings.get('lastSidebarPaneId', sidebars[0].id);
    manager.showSidebarPane(initialSidebar);

    // Defeat Chrome's possible attempt to set its own scroll position when sidebar is refreshed
    $(window).load(function() {
        setTimeout(function() {
            manager.scrollToCurrentSidebarPane(true);
        }, 0);
    });

    $(document)
        .keydown(onDocumentKeyDown)
        .scroll(onDocumentScroll);
    $(window).resize(onWindowResize);

    $('#optionsButton')
        .attr('title', getMessage('sidebars_optionsButtonTooltip'))
        .tooltip({ position: 'bottom center', predelay: 400, offset: [15, -15]})
        .click(onClickOptionsButton)
        .mousedown(onMouseDownOptionsButton)
        .mouseup(onMouseUpOptionsButton)
        .mouseover(onMouseOverOptionsButton)
        .mouseout(onMouseUpOptionsButton);

    setI18NText();

    bg.sidebarHandler.registerSidebarPane('sidebarHost', window);

}


//////////////////////////////////////////
// Event handlers
//////////////////////////////////////////

function onDocumentKeyDown(evt) {
    if (evt.keyCode == 27
        || (evt.ctrlKey && evt.keyCode == 70)
        || (!evt.ctrlKey && !evt.altKey && evt.keyCode >= 48 && evt.keyCode <= 90))
    {
        try {
            // transmit keydown events to the sidebar pane via jQuery.trigger()
            // TODO make this work with vanilla JS if possible so non-$-using panes can receive our communique
            var $iframe =$('#sidebarContainer__' + manager.currentSidebarId).children('iframe').get(0).contentWindow;
            var $iframeJQuery = $iframe.jQuery($iframe.document);
            $iframeJQuery.trigger(evt);
            return false;
        }
        catch(ex) { }
    }

    return true;
}

function onDocumentScroll() {
    if (manager.scrolling) {
        return;
    }
    // prevent user scrolling of sidebar panes through e.g. drag-selecting some text
    // and moving the mouse off the edge of the sidebar window
    manager.scrollToCurrentSidebarPane(true);
}

function onWindowResize() {

    // perform resize work, e.g. resizing an attached dock window
    bg.sidebarHandler.onResize();

    // prevent width-resizing of sidebar from showing part of another sidebar pane
    manager.scrollToCurrentSidebarPane(true);
}

function onClickOptionsButton() {
    var optionsUrl = chrome.extension.getURL('/options.html');
    chrome.tabs.query({ url: optionsUrl }, function(tabs) {
        if (tabs.length == 0) {
            chrome.tabs.create({ url: optionsUrl });
            return;
        }
        chrome.tabs.update(tabs[0].id, { active: true });
    });
}

function onMouseDownOptionsButton(evt) {
    var $target = $(evt.target.id == 'optionsButtonIcon' ? evt.target.parentElement : evt.target);
    $target.addClass('mousedown');
    evt.stopPropagation();
}

function onMouseUpOptionsButton(evt) {
    var $target = $(evt.target.id == 'optionsButtonIcon' ? evt.target.parentElement : evt.target);
    $target.removeClass('mousedown');
    evt.stopPropagation();
}

function onMouseOverOptionsButton(evt) {
    if (evt.which == 1) {
        onMouseDownOptionsButton(evt);
    }
    evt.stopPropagation();
}
