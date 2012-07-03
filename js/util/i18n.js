// Populate each element's text on the page with an i18n attribute with
// the i18n message taken from _locales/xx/messages.json, where xx is
// the user's 2 char language code
function setI18NText() {
    var elems = $('[i18n]');
    elems.each(function(i, e) {
        e.innerHTML = getMessage(e.attributes.i18n.value);
    });
}

// Get an i18n message from _locales/xx/messages.json and transform it
function getMessage(key, placeholderValues) {
    var msg = (chrome.i18n || window.parent.chrome.i18n).getMessage(key, placeholderValues);
    if (key.match(/^prompt_/)) {
        return transformPromptMessage(msg);
    }
    if (msg.match(/^#/)) {
        // leading # tells us we want to do markdown syntax transformation
        return transformMessage(msg.slice(1));
    }
    if (msg.match(/^!#/)) {
        // leading # tells us we want to do markdown syntax transformation,
        // and leading ! is used to denote "warning" hints in options, so preserve
        // the ! after transformation
        return '!' + transformMessage(msg.slice(2));
    }
    // just return the message untransformed
    return msg;
}

// Transform a message using Markdown syntax translation after turning //'s into \n's
function transformMessage(msg) {
    msg = msg.replace(/:\/\//g, 'URL_PROTOCOL_SEPARATOR');
    msg = msg.replace(/\s*\/\/\s*/g, '\n');
    msg = msg.replace(/URL_PROTOCOL_SEPARATOR/g, '://');
    return marked(msg);
}

// Transform a prompt message, just turning //'s into \n\n
function transformPromptMessage(msg) {
    return msg.replace(/\s*\/\/\s*/g, '\n\n');
}