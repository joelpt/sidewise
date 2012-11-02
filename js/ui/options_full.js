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
        .on('click', '#submitBugReportButton', submitBugReport)
        .on('click', '#exportButton', exportState)
        .on('click', '#importButton', importState)
        .on('click', '#donateLink', onDonateLinkClick)
        .on('click', '#loggingEnabled', onLoggingEnabledClick)
        .on('click', '#panePickerExpander', showPanePicker);

    $('#panePickerContainer').hide();
    setSubmitBugReportButtonDisabledState();

    $('#version').text(getMessage('text_Version') + ' ' + getVersion());
    setMonitorCountInfo(settings.get('monitorMetrics').length, false);
    initGooglePlusElement();
});


function onLoggingEnabledClick(evt) {
    setSubmitBugReportButtonDisabledState();
}

function setSubmitBugReportButtonDisabledState() {
    var $button = $('#submitBugReportButton');
    var disabled = !$('#loggingEnabled').is(':checked');
    $button
        .attr('disabled', disabled)
        .attr('title', disabled ? 'To send diagnostic reports, check the "Enable diagnostics" checkbox option above. Reproduce the problem you were having, then click this button to send a report.' : '');
}