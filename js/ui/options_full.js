$(document).ready(function() {
    reportEvent('options', 'viewed_options');
    initOptionsPage();

    // hide this option on Macs, for which we ignore it anyway
    if (PLATFORM == 'Mac') {
        $('#allowAutoUnmaximize').parents('.optionsRow').first().hide();
    }

    showCard('optionsCard');

    if (settings.get('alwaysShowAdvancedOptions')) {
        showAdvancedOptions(false);
    }
    else {
        $(document).on('click', '#advancedOptionsExpander', function() {
            showAdvancedOptions(true);
        });
    }

    $(document)
        .on('click', '#closeButton', onCloseButtonClick)
        .on('click', '#resetButton', resetAllSettings)
        .on('click', '#detectMonitorsButton', detectMonitors)
        .on('click', '#donateLink', onDonateLinkClick);

    initPaneGrid();

    $('#version').text(getMessage('text_Version') + ' ' + getVersion());
    setMonitorCountInfo(settings.get('monitorMetrics').length, false);
    initGooglePlusElement();
});
