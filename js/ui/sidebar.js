"use strict";

//////////////////////////////////////////
// Initialization
//////////////////////////////////////////

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
    manager.addSidebarPanes(bg.paneCatalog.items);

    // Set initial sidebar position
    var initialSidebar = settings.get('lastSidebarPaneId');
    if (initialSidebar === undefined || bg.paneCatalog.getPaneIds().indexOf(initialSidebar) == -1) {
        initialSidebar = bg.paneCatalog.items[0].id;
    }
    manager.showSidebarPane(initialSidebar);

    // Defeat Chrome's possible attempt to set its own scroll position when sidebar is refreshed
    $(window).load(function() {
        setTimeout(function() { manager.scrollToCurrentSidebarPane(true); }, 0);
        setTimeout(function() { manager.scrollToCurrentSidebarPane(true); }, 100);
    });

    $(document)
        .keydown(onDocumentKeyDown)
        .scroll(onDocumentScroll)
        .mouseover(onDocumentMouseOver);
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
    if (evt.keyCode == 27 // esc
        || (evt.ctrlKey && evt.keyCode == 70) // ctrl-f
        || (!evt.ctrlKey && !evt.altKey && evt.keyCode >= 48 && evt.keyCode <= 90) // non modified printable
        || (evt.ctrlKey && evt.keyCode == 86) // ctrl-w
        || (evt.ctrlKey && evt.keyCode == 115)) // ctrl-f4
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

function onDocumentMouseOver() {
    if (!settings.get('focusSidebarOnHover')) {
        return;
    }
    bg.sidebarHandler.focus();
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
