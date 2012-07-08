var bg;
var settings;

$(document).ready(function() {
    bg = chrome.extension.getBackgroundPage();
    settings = bg.settings;

    setI18NText();
    transformInputElements();
    loadSettings();
    setCloudPlayState();

    $('#version').text(getMessage('text_Version') + ' ' + getVersion());
    setMonitorCountInfo(settings.get('monitorMetrics').length, false);

    $(document)
        .on('change', 'input[type=text], select', onSettingModified)
        .on('click', 'input[type=checkbox]', onSettingModified)
        .on('click', '#closeButton', onCloseButtonClick)
        .on('click', '#resetButton', resetAllSettings)
        .on('click', '#detectMonitorsButton', detectMonitors)
        .on('click', 'a', function(evt) {
            var $this = $(this);
            if ($this.attr('href').match(/^chrome:\/\/.*settings/)) {
                chrome.tabs.create({ url: 'chrome://settings', active: true });
                return;
            }
            if ($this.attr('href') == '#') {
                return true;
            }
            $this.attr('target', '_blank');
            // alert(evt);
        });

    if (settings.get('alwaysShowAdvancedOptions')) {
        showAdvancedOptions(false);
    }
    else {
        $(document).on('click', '#advancedOptionsExpander', function() {
            showAdvancedOptions(true);
        });
    }

    setTimeout(function() {
        // delay to avoid F5 (reload) spuriously triggering this
        $(document).on('keyup', 'input[type=text]', onSettingModified);
    }, 250);
});

function transformInputElements() {
    var elems = $('input, select');
    elems.each(function(i, e) {
        var $e = $(e);
        var name = e.attributes.name.value;
        var type = $e.attr('type') || e.tagName.toLowerCase();
        var msgName = 'option_' + name;
        var label = getMessage(msgName);
        var labelElem = $('<div class="optionsLabel">')
            .append($('<label/>', { for: name }).text(label));

        var units = getMessage(msgName + '_units');
        if (units) {
            var unitsElem = $('<span class="optionsUnits"/>').text(units);
        }
        else {
            var unitsElem = $('');
        }

        var hint = getMessage(msgName + '_hint');
        if (hint) {
            var hintClass = 'hintIcon';
            if (hint[0] == '!') {
                hint = hint.slice(1);
                hintClass = 'warningIcon';
            }
            var hintElem = $('<div/>', { class: hintClass, title: hint })
                .tooltip({ position: 'top right', delay: 50, offset: [8, 0] }).dynamic();
        }
        else {
            var hintElem = $('');
        }

        var inputElem = $e.clone();
        inputElem.attr('id', name);

        var inputBox = $('<div class="optionsInputBox"/>');

        var rep = $('<div class="optionsRow"/>');
        switch (type) {
            case 'text':
                inputBox.append(inputElem).append(unitsElem);
                rep.append(labelElem).append(inputBox).append(hintElem);
                break;
            case 'checkbox':
                labelElem.addClass('optionsWideLabel').append(hintElem);
                inputBox.append(inputElem).append(labelElem);
                rep.append(inputBox);
                break;
            case 'button':
                inputElem.val(label);
                rep.append(inputElem);
                break;
            case 'select':
                inputBox.append(inputElem).append(hintElem);
                rep.append(labelElem).append(inputBox);
                break;
            default:
                throw new Error('Unsupported input element type, cannot transform: ' + type);
        }

        $e.replaceWith(rep);
    });
}

function loadSettings() {
    var elems = $('input, select');
    elems.each(function(i, e) {
        var $e = $(e);
        var type = $e.attr('type') || e.tagName.toLowerCase();
        var name = $e.attr('name');
        var value = settings.get(name);

        switch (type) {
            case 'button':
                return;
                break;

            case 'checkbox':
                e.checked = value;
                break;

            default:
                $e.val(value);
                break;
        }
    });
}

function saveOneSetting(e) {
    var $e = $(e);
    var name = $e.attr('name');
    var value = e.value;
    var type = $e.attr('type') || e.tagName.toLowerCase();
    var datatype = $e.attr('datatype');
    var storeValue;

    // validate
    var valid = true;

    switch (type) {
        case 'button':
            // ignore for purposes of saving settings
            return;
            break;

        case 'text':
            switch (datatype) {
                case 'int':
                    storeValue = parseInt(value);
                    if (storeValue.toString() != value) {
                        valid = false;
                        break;
                    }
                    break;

                default:
                    storeValue = value;
                    break;
            }
            break;

        case 'checkbox':
            storeValue = e.checked;
            break;

        default:
            storeValue = value;
            break;
    }

    if (!valid) {
        return false;
    }

    settings.set(name, storeValue);
    reportEvent('set_option', name, storeValue.toString(), undefined, true);
    return true;
}

function onSettingModified(evt) {
    var target = evt.target;
    var $target = $(target);
    if (saveOneSetting(target)) {
        $target.removeClass('invalid');
        showStatusMessage(getMessage('optionsSuccessSavingSetting'));
        settings.updateStateFromSettings();
        setCloudPlayState();
        return;
    }

    $target.addClass('invalid');
    showErrorMessage(getMessage('optionsErrorSavingSetting'));
}

function setCloudPlayState() {
    $('#clouds > div').css('-webkit-animation-play-state', settings.get('animationEnabled') ? 'running' : 'paused');
}

function onCloseButtonClick() {
    window.close();
}

function resetAllSettings(evt) {
    if (!confirm(getMessage('prompt_confirmResetOptions'))) {
        return;
    }

    initializeDefaultSettings(true);
    loadSettings();
    updateStateFromSettings();
    showStatusMessage(getMessage('optionsResetAllSettings'));
}

function showStatusMessage(msg) {
    $('#statusBar').addClass('statusOK').removeClass('statusError')
        .highlight({ start_color: '#c2d2e3', end_color: '#e7edf4', delay: 2000 });
    $('#statusMessage')
        // .stop().animate({opacity:'100'})
        .text(msg)
        .show(); //.fadeOut(2000);
}

function showErrorMessage(msg) {
    $('#statusBar').removeClass('statusOK').addClass('statusError')
        .highlight({ start_color: '#edd', end_color: '#fee', delay: 2000 });
    // $('#statusMessage').stop().animate({opacity:'100'});
    $('#statusMessage').text(msg).show();
}

function detectMonitors() {
    bg.monitorInfo.retrieveMonitorMetrics(function(monitors, maxOffset) {
        bg.monitorInfo.saveToSettings();
        updateStateFromSettings();
        setMonitorCountInfo(monitors.length, true);
        showStatusMessage(getMessage('prompt_detectMonitors_complete'));
    });
}

function setMonitorCountInfo(count, highlight) {
    var elem = $('#infoMonitorsOnYourSystem');
    elem.html(
        getMessage('optionsInfoMonitorsOnYourSystem',
            [count,
                (count == 1 ? getMessage('text_monitor') : getMessage('text_monitors'))
            ]
        )
    );
    if (highlight) {
        elem.highlight({ start_color: 'yellow', end_color: '#fff', delay: 2000 });
    }
}

function showAdvancedOptions(highlight) {
    $('#advancedOptionsExpander').hide();
    var $advOpts = $('.advancedOptions');
    $advOpts.show()
    if (highlight) {
        $advOpts.css('background-color', 'hsl(60, 60%, 88%)');
    }
};
