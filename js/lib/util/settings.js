function saveSetting(name, value) {
    if (value == null || value === undefined) {
        localStorage.removeItem(name);
        return;
    }
    localStorage[name] = JSON.stringify(value);
}

function loadSetting(name, defaultValue) {
    var value = localStorage[name];

    if (value) {
        return JSON.parse(value);
    }

    return defaultValue;
}