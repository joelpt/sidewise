function registerOmniboxEvents() {
    chrome.omnibox.onInputChanged.addListener(onOmniboxInputChanged);
    chrome.omnibox.onInputEntered.addListener(onOmniboxInputEntered);
    chrome.omnibox.setDefaultSuggestion({ description: getMessage('omniboxDefaultSuggestion') });
}

function onOmniboxInputChanged(text, suggest) {
    // console.log('inputChanged: ' + text);
    var matches = tree.filter(function(e) {
        return e.elemType == 'page' && e.title && e.title.toLowerCase().indexOf(text) == 0;
    });

    matches = matches.concat(tree.filter(function(e) {
        if (e.elemType != 'page') {
            return false;
        }

        var match = false;
        if (e.title && e.title.toLowerCase().indexOf(text) > 0) {
            match = true;
        }
        else if (e.label && e.label.toLowerCase().indexOf(text) > -1) {
            match = true;
        }

        if (match) {
            if (matches.indexOf(e) == -1) {
                return true;
            }
        }

        return false;
    }));

    var re = new RegExp('(' + text + ')', 'i');

    var suggestions = matches.map(function(e) {
        if (e.label) {
            var label = escapeOmniboxText(e.label) + ': ';
        }
        else {
            var label = '';
        }
        var url = escapeOmniboxText(e.url);
        var title = escapeOmniboxText(e.title);

        label = label.replace(re, '<match>$1</match>');
        title = title.replace(re, '<match>$1</match>');

        var description =
            '<url>' + getMessage('omniboxSuggestionPrefix') + '</url> '
            + label
            + (e.hibernated ? '<dim>(' + getMessage('text_hibernated') + ')</dim> ' : '')
            + title
            + ' <dim> - ' + url + '</dim>';

        return { content: e.id, description: description };
    });

    suggest(suggestions);
}

function escapeOmniboxText(text) {
    return text.replace(/;/g, '&#59;')
        .replace(/&(?!#59;)/g, '&amp;');
}

// This event is fired with the user accepts the input in the omnibox.
function onOmniboxInputEntered(text) {
    var page = tree.getNode(text);
    if (page.hibernated) {
        tree.awakenPages([page], true);
        return;
    }
    chrome.tabs.update(page.chromeId, { active: true });
}
