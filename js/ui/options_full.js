$(document).ready(function() {
    reportEvent('options', 'viewed_options');
    initOptionsPage();

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

    $('#version').text(getMessage('text_Version') + ' ' + getVersion());
    setMonitorCountInfo(settings.get('monitorMetrics').length, false);
    initGooglePlusElement();
});
