var NOTEPAD_AUTOSAVE_DELAY_MS = 1000;
var TAB_INSERT_STRING = '  ';

initSidebarPane();

$(document).ready(() => {
    // this call is wrapped in a fn closure because jQuery ready() doesn't like
    // being passed async fns
    onReady(); 
});

async function onReady() {
    setI18NText();

    var notepadData = await settings.loadData('notepadContent', '');

    if (notepadData === '') {
        // If notepad data was previously stored in localStorage, migrate it now
        var oldData = settings.get('notepadContent', '');

        if (oldData !== '') {
            await settings.saveData('notepadContent', oldData);
            settings.set('notepadContent', undefined);
            notepadData = oldData;
            console.log('Migrated notepad data to chrome.storage.local');
        }
    }

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

async function saveNotepad() {
    await settings.saveData('notepadContent', $('#notepad').val());

    var dateVal = Date.now();
    settings.set('notepadSavedAt', dateVal);

    setLastSavedText(dateVal);
}

function setLastSavedText(dateVal) {
    var dateText = new Date(dateVal).toString().replace(/ GMT.+/, '');
    $('#lastSavedAt').text(dateText);
}
