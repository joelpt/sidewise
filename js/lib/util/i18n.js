// Populate each element's text on the page with an i18n attribute with
// the i18n message taken from _locales/xx/messages.json, where xx is
// the user's 2 char language code
function setI18NText() {
    var elems = $('[i18n]');
    elems.each(function(i, e) {
        e.innerText = getMessage(e.attributes.i18n.value);
    });
}

// Get an i18n message from _locales/xx/messages.json
function getMessage(key) {
    return chrome.i18n.getMessage(key);
}