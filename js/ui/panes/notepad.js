var NOTEPAD_AUTOSAVE_DELAY_MS = 1000;
var TAB_INSERT_STRING = '  ';

initSidebarPane();

$(document).ready(onReady);

function onReady() {
    setI18NText();

    $('#notepad')
        .keyup(onNotepadKeyUp)
        .keydown(onNotepadKeyDown)
        .val(settings.get('notepadContent', ''))
        .focus();

    var lastSavedDateVal = settings.get('notepadSavedAt');
    if (lastSavedDateVal) {
        setLastSavedText(lastSavedDateVal);
    }
}

function onNotepadKeyUp(evt) {
    TimeoutManager.reset('saveNotepad', saveNotepad, NOTEPAD_AUTOSAVE_DELAY_MS);
}

function onNotepadKeyDown(evt) {
    if (evt.keyCode == 9) {
        evt.stopPropagation();
        $('#notepad').insertAtCaret(TAB_INSERT_STRING);
        return false;
    }

    if (evt.keyCode == 83 && evt.ctrlKey) {
        saveNotepad();
        evt.stopPropagation();
        return false;
    }
}

function saveNotepad() {
    settings.set('notepadContent', $('#notepad').val());

    var dateVal = Date.now();
    settings.set('notepadSavedAt', dateVal);

    setLastSavedText(dateVal);
}

function setLastSavedText(dateVal) {
    var dateText = new Date(dateVal).toString().replace(/ GMT.+/, '');
    $('#lastSavedAt').text(dateText);
}
