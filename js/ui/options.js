///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var CARD_SLIDE_DURATION_MS = 450;
var DONATION_LINK_VARIETIES = 6;
var DONATION_PAGE_VARIETIES = 5;

///////////////////////////////////////////////////////////
// Globals
///////////////////////////////////////////////////////////

var bg;
var settings;
var currentCardId;
var donationLinkNumber;
var donationPageNumber;

///////////////////////////////////////////////////////////
// Initialization
///////////////////////////////////////////////////////////

function initOptionsPage() {
    bg = chrome.extension.getBackgroundPage();
    settings = bg.settings;

    if (!bg || !settings) {
        // background page not ready yet, try again in a bit
        setTimeout(initOptionsPage, 2000);
        return;
    }

    setI18NText();
    transformInputElements();
    initDonateElements();
    loadSettings();
    setCloudPlayState();
    $.fx.off = !settings.get('animationEnabled');

    $(document)
        .on('change', 'input[type=text], select', onSettingModified)
        .on('click', 'input[type=checkbox]', onSettingModified)
        .on('click', 'a', onLinkClick)
        .on('click', '.slideCard', onSlideCardClick);

    setTimeout(function() {
        // delay to avoid F5 (reload) spuriously triggering keyup
        $(document).on('keyup', 'input[type=text]', onSettingModified);
    }, 250);
}

function onDonateLinkClick(evt) {
    reportEvent('donate', 'donate_link_clicked', 'donate_link_' + donationLinkNumber);
    reportEvent('donate', 'donate_page_viewed', 'donate_page_' + donationPageNumber);
}

function initDonateElements() {
    // var whichPage = Math.floor(1 + Math.random() * DONATION_PAGE_VARIETIES);
    var whichPage = 1;
    var whichLink;

    if (location.pathname == '/options_install.html') {
        whichLink = 'install';
    }
    else {
        whichLink = Math.floor(1 + Math.random() * DONATION_LINK_VARIETIES);
    }

    $('#donateLink').html(getMessage('donateLink_' + whichLink));

    var iframeUrl = 'http://www.sidewise.info/pay/?embed=1&which=' + whichPage + '&whichLink=' + whichLink;
    $('#donatePage').attr('src', iframeUrl);

    donationLinkNumber = whichLink;
    donationPageNumber = whichPage;

    reportEvent('donate', 'donate_link_shown', 'donate_link_' + donationLinkNumber, null, true);
    reportEvent('donate', 'donate_page_chosen', 'donate_page_' + donationPageNumber, null, true);
}

function initGooglePlusElement() {
    var po = document.createElement('script');
    po.type = 'text/javascript';
    po.async = true;
    po.src = 'https://apis.google.com/js/plusone.js';
    var s = document.getElementsByTagName('script')[0]; s.parentNode.insertBefore(po, s);
}

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
                if (! $e.hasClass('toolButton')) {
                    rep.append(inputElem);
                }
                else {
                    rep = inputElem;
                }
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

function setCloudPlayState() {
    $('#clouds > div').css('-webkit-animation-play-state', settings.get('animationEnabled') ? 'running' : 'paused');
}


///////////////////////////////////////////////////////////
// Event handlers
///////////////////////////////////////////////////////////

function onSettingModified(evt) {
    var target = evt.target;
    var $target = $(target);

    var $gp = $target.parent().parent();
    if ($gp.is('[role=row]')) {
        // pane picker checkbox clicked
        var id = parseInt($gp.attr('id'));
        var data = $('#panePicker').jqGrid('getRowData', id);
        var enabled = (data.enabled == 'Yes');
        var pane = getPaneByPickerRowId(id);

        if (enabled && !pane.enabled) {
            // user enabled a disabled pane
            pane.enabled = true;
            bg.paneCatalog.saveState();
            if (bg.sidebarHandler.sidebarExists()) {
                var manager = bg.sidebarHandler.sidebarPanes.sidebarHost.manager;
                manager.enableSidebarPane(pane.id);
            }
        }
        else if (!enabled && pane.enabled) {
            // user disabled an enabled pane
            pane.enabled = false;
            bg.paneCatalog.saveState();
            if (bg.sidebarHandler.sidebarExists()) {
                var manager = bg.sidebarHandler.sidebarPanes.sidebarHost.manager;
                manager.disableSidebarPane(pane.id);
            }
        }
    }

    if ($target.is('[type=checkbox]')) {
        updateExpansionGroup($target.attr('id'), false);
    }

    if (saveOneSetting(target)) {
        $target.removeClass('invalid');
        showStatusMessage(getMessage('optionsSuccessSavingSetting'));
        settings.updateStateFromSettings();
        setCloudPlayState();
        $.fx.off = !settings.get('animationEnabled');
        return;
    }

    $target.addClass('invalid');
    showErrorMessage(getMessage('optionsErrorSavingSetting'));
}

function onCloseButtonClick() {
    window.close();
}

function onSlideCardClick(evt) {
    var newCardId = $(this).attr('to');
    slideCard(newCardId);
}

function onLinkClick(evt) {
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
}


///////////////////////////////////////////////////////////
// Pane picker
///////////////////////////////////////////////////////////

function initPaneGrid() {
    // configure pane picker
    var $picker = $('#panePicker');
    $picker.jqGrid({
        datatype: "local",
        colModel: [
            {name:'paneid', hidden: true },
            {sortable: false, name:'enabled', index:'enabled', width: 40, formatter: 'checkbox', formatoptions: { disabled: false }, align: 'center' },
            {sortable: false, name:'label', index:'label', width: 200}
        ],
        onSelectRow: onPanePickerSelectRow
    });

    $picker.jqGrid('sortableRows', {
        update: onPanePickerReorderedRow
    });

    // remove picker's column header
    $picker.parents("div.ui-jqgrid-view").children("div.ui-jqgrid-hdiv").remove();

    // populate grid with panes data
    var panes = bg.paneCatalog.panes.map(function(e) {
        return {
            paneid: e.id,
            enabled: e.enabled,
            label: '<img class="panePickerRowIcon" width="16" height="16" src="' + e.icon + '">&nbsp;' + e.label
        };
    });

    for(var i=0; i <= panes.length; i++) {
        $picker.jqGrid('addRowData', i+1, panes[i]);
    }

    // remove 'title' attributes from all pane picker grid cells, since it is redundant
    $picker.find('[role=gridcell]').attr('title', '');
}

function showPanePicker(evt) {
    $(evt.target).hide();
    initPaneGrid();
    $('#panePickerContainer').slideDown();
}

function onPanePickerReorderedRow(evt, ui) {
    var $row = $(ui.item);
    var newIndex = $row.index() - 1;
    var pane = getPaneByPickerRowId($row.attr('id'));

    bg.paneCatalog.reorderPane(pane.id, newIndex);

    if (!bg.sidebarHandler.sidebarExists()) {
        return;
    }
    var manager = bg.sidebarHandler.sidebarPanes.sidebarHost.manager;
    manager.reorderSidebarPane(pane.id, newIndex);
    bg.paneCatalog.saveState();
}

function onPanePickerSelectRow(rowid, status, e) {
    if (!bg.sidebarHandler.sidebarExists()) {
        return;
    }
    var pane = getPaneByPickerRowId(rowid);
    log('select pane ' + rowid + ' ' + pane.id);
    if (!pane.enabled) {
        return;
    }
    var manager = bg.sidebarHandler.sidebarPanes.sidebarHost.manager;
    manager.showSidebarPane(pane.id);
}

function getPaneByPickerRowId(rowid) {
    var data = $('#panePicker').jqGrid('getRowData', rowid);
    var pane = bg.paneCatalog.getPane(data.paneid);
    if (pane) {
        return pane;
    }
    throw new Error('Unable to find correct pane in catalog by id');
}


///////////////////////////////////////////////////////////
// Card display
///////////////////////////////////////////////////////////

function showCard(id, pageTitle) {
    $('#' + id).show();
    currentCardId = id;

    if (pageTitle) {
        window.document.title = pageTitle;
    }
}

function slideCard(newCardId) {
    var docWidth = $(document).width();

    var currentCard = $('#' + currentCardId);
    var currentCardLeft = currentCard.position().left;
    var currentCardIndex = currentCard.index();

    var newCard = $('#' + newCardId);
    var newCardIndex = newCard.index();

    var cardWidth = currentCard.width();
    var padding = 100;

    // ensure left property is actually set on current card prior to sliding it
    currentCard.css('left', currentCardLeft);

    if (currentCardIndex < newCardIndex) {
        // current card is to the left of the new card, so slide cards to the left
        currentCard.animate({ left: -cardWidth - padding }, CARD_SLIDE_DURATION_MS, function() {
            currentCard.hide();
        });

        newCard.css('left', docWidth + padding);
        newCard.show();
        newCard.animate({ left: currentCardLeft }, CARD_SLIDE_DURATION_MS);
    }
    else {
        // current card is to the right of the new card, so slide cards to the right
        currentCard.animate({ left: docWidth + padding }, CARD_SLIDE_DURATION_MS, function() {
            currentCard.hide();
        });

        newCard.css('left', -cardWidth - padding);
        newCard.show();
        newCard.animate({ left: currentCardLeft }, CARD_SLIDE_DURATION_MS);
    }

    currentCardId = newCardId;
}

///////////////////////////////////////////////////////////
// Settings loading and saving
///////////////////////////////////////////////////////////

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
                updateExpansionGroup($e.attr('id'), true);
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

function resetAllSettings(evt) {
    if (!confirm(getMessage('prompt_confirmResetOptions'))) {
        return;
    }

    settings.initializeDefaults(true);
    loadSettings();
    settings.updateStateFromSettings();
    showStatusMessage(getMessage('optionsResetAllSettings'));
}


///////////////////////////////////////////////////////////
// Status bar
///////////////////////////////////////////////////////////

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


///////////////////////////////////////////////////////////
// Monitor detection
///////////////////////////////////////////////////////////

function detectMonitors() {
    bg.monitorInfo.retrieveMonitorMetrics(function() {
        bg.monitorInfo.saveToSettings();
        settings.updateStateFromSettings();
        setMonitorCountInfo(bg.monitorInfo.monitors.length, true);
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


///////////////////////////////////////////////////////////
// Option revealers
///////////////////////////////////////////////////////////

function showAdvancedOptions(revealing) {
    var $advOpts = $('.advancedOptions');
    if (revealing) {
        $('#advancedOptionsExpander').slideUp();
        $advOpts.slideDown(400, function() {
            $advOpts.css('background-color', 'hsl(60, 60%, 88%)');
        });
    }
    else {
        $('#advancedOptionsExpander').hide();
        $advOpts.show();
    }
}

function updateExpansionGroup(forId, instant) {
    var isTrue = $('#' + forId).is(':checked');
    var $group = $('.trueExpansionGroup[for=' + forId + ']');
    if ($group.length == 0) {
        return;
    }
    if (isTrue) {
        if (instant) {
            $group.show();
            return;
        }
        $group.slideDown(150);
        return;
    }
    if (instant) {
        $group.hide();
        return;
    }
    $group.slideUp(150);
}



///////////////////////////////////////////////////////////
// Bug submitter
///////////////////////////////////////////////////////////

function submitBugReport() {
    var desc = prompt('Please describe the problem below.');
    if (!desc) {
        alert('Bug report cancelled.');
        return;
    }

    // bg.log(bg.tree);
    bg.log(bg.tree.dump());
    bg.log(bg.tree.dumpTabIndexes());

    var data = getVersion() + ' - ' + Date() + '\n' + desc + '\n\n' + bg.runningLog;
    // alert(data.length);
    $.post('http://www.sidewise.info/submit_error/index.php', { 'desc': desc, 'data': data }, function(data, textStatus, jqXHR) {
        alert('Bug report submitted. Thank you for the report.');
    });
}


///////////////////////////////////////////////////////////
// Import/export
///////////////////////////////////////////////////////////

function exportState() {
    bg.savePageTreeToLocalStorage(bg.tree, 'pageTree', true);
    copyTextToClipboard(JSON.stringify(bg.localStorage));
    alert('Sidewise\'s configuration and state data has been exported and copied to your clipboard.\n\nPaste this into a text file to save it.');
}

function importState() {
    var html = 'Paste the previously exported Sidewise data into the box below:<br/><textarea rows="8" cols="30" id="importBox" name="data"></textarea>';
    var importPrompt = $.prompt(html, { prefix: 'cleanblue', buttons: { 'OK': true, 'Cancel': false }, callback: doImportState });
    importPrompt.bind('promptloaded', function(e) {
        $('#importBox').focus();
    });
}

function doImportState(e,v,m,f) {
    if (!v) {
        // user hit Cancel
        return;
    }

    var data = f.data;
    if (!data) {
        alert('No data pasted. Import aborted.');
        return;
    }

    try {
        data = JSON.parse(data);
    }
    catch (ex) {
        alert('There was a problem importing the data. No changes have been made.\n\n' + ex.message);
        return;
    }

    try {
        for (var k in data) {
            if (k == 'lastInitializedVersion') {
                continue;
            }
            bg.settings.set(k, JSON.parse(data[k]));
        }
    }
    catch (ex) {
        alert('There was a problem importing a setting. No changes have been made.\n\n' + ex.message + '\n' + 'Setting name: ' + k);
        return;
    }
    alert('Import successful!\nSidewise will now be restarted.');

    var afterFn = function() {
        bg.document.location.reload();
        setTimeout(function() { document.location.reload(); }, 2000);
    };

    if (bg.sidebarHandler.sidebarExists()) {
        bg.sidebarHandler.remove(afterFn);
    }
    else {
        afterFn();
    }
}