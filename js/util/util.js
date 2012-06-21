var URL_FAVICON_REPLACEMENTS = {
    'chrome://chrome/extensions': '/images/favicon/extensions.png',  // Chrome 19 and earlier
    'chrome://chrome/extensions/': '/images/favicon/extensions.png', // Chrome 20 early versions
    'chrome://extensions/': '/images/favicon/extensions.png',        // Chrome 20 later versions+
    'chrome://chrome/settings/': '/images/favicon/settings.png',     // Chrome 19 & 20 early versions
    'chrome://settings/': '/images/favicon/settings.png',            // Chrome 20 later versions
    'chrome://downloads/': '/images/favicon/downloads.png',
    'chrome://bookmarks/': '/images/favicon/bookmarks.png',
    'chrome://chrome/history/': '/images/favicon/history.png',
    'chrome://history/': '/images/favicon/history.png',
    'chrome://newtab/': '/images/favicon/newtab.png'
};

URL_FAVICON_REPLACEMENTS[chrome.extension.getURL('/options.html')] = '/images/sidewise_icon_16.png';

var URL_TITLE_REPLACEMENTS = {
    'chrome://chrome/extensions': getMessage('tabTitle_Extensions'),
    'chrome://chrome/extensions/': getMessage('tabTitle_Extensions'),
    'chrome://extensions/': getMessage('tabTitle_Extensions'),
    'chrome://chrome/settings/': getMessage('tabTitle_Settings'),
    'chrome://settings/': getMessage('tabTitle_Settings'),
    'chrome://downloads/': getMessage('tabTitle_Downloads'),
    'chrome://bookmarks/': getMessage('tabTitle_BookmarkManager'),
    'chrome://chrome/history/': getMessage('tabTitle_History'),
    'chrome://history/': getMessage('tabTitle_History'),
    'chrome://newtab/': getMessage('tabTitle_NewTab')
};


function getBestFavIconUrl(favIconUrl, url) {
    var replacedFavicon = URL_FAVICON_REPLACEMENTS[url];

    if (replacedFavicon) {
        return replacedFavicon;
    }

    if (favIconUrl && favIconUrl != '') {
        return favIconUrl;
    }

    return 'chrome://favicon/';
}

function getChromeFavIconUrl(url) {
    return 'chrome://favicon/' + dropUrlHash(url);
}

function isStaticFavIconUrl(favIconUrl) {
    if (!favIconUrl) {
        return false;
    }
    if (favIconUrl == '') {
        return false;
    }
    if (favIconUrl.indexOf('chrome://favicon') == 0) {
        return false;
    }
    return true;
};

function getBestPageTitle(title, url) {
    var replacedTitle = URL_TITLE_REPLACEMENTS[url];

    if (replacedTitle) {
        return replacedTitle;
    }

    if (title && title != '') {
        return title;
    }

    return url;
}

function injectContentScriptInExistingTabs(url)
{
    readFile(url, injectScriptInExistingTabs);
}

function injectScriptInExistingTabs(script)
{
    chrome.tabs.query({}, function(tabs) {
        for (var i in tabs) {
            var tab = tabs[i];
            log('Injecting script into tab', tab.id, tab.url);
            executeContentScript(tab.url, tab.id, script);
        }
    });
}

function readFile(url, callback)
{
    var xhr = new XMLHttpRequest();
    try {
        xhr.onreadystatechange = function(){
            if (xhr.readyState != 4) {
                return;
            }

            if (xhr.responseText) {
                callback(xhr.responseText);
            }
            else {
                throw new Error('No data returned for readFile: ' + url);
            }
        }

        xhr.onerror = function(error) {
            console.error(error);
        }

        xhr.open("GET", url, true);
        xhr.send(null);
    } catch(e) {
        console.error(e);
    }
}

function isScriptableUrl(url)
{
    // log(url);
    return !(url == ''
        || url.match('^(about|file|view-source|chrome.*):')
        || url.match('^https?://chrome.google.com/webstore')
    );
}

function isExtensionUrl(url)
{
    return url.indexOf('chrome-extension://') == 0;
}

function getNumericId(id)
{
    return parseInt(id.slice(1));
}

function executeContentScript(url, tabId, scriptBody)
{
    if (isScriptableUrl(url))
    {
        log_brief(tabId, scriptBody);
        chrome.tabs.executeScript(tabId, { code: scriptBody });
    }
}

function splitUrl(url)
{
    var r = {};
    var m = url.match(/(?:()(www\.[^\s\/?#]+\.[^\s\/?#]+)|([^\s:\/?#]+):\/\/([^\s\/?#]*))([^\s?#]*)(?:\?([^\s#]*))?(?:#(\S*))?/);

    if (m)
    {
        r.protocol = m[3];
        r.host = m[4];
        r.path = m[5];
        r.query = m[6];
        r.hash = m[7];
        var m = r.host.match(/([^\.]+\.(org|com|net|info|[a-z]{2,3}(\.[a-z]{2,3})?))$/);
        r.domain = m ? m[0] : r.host;
        return r;
    }

    // that didn't work, try about:foo format
    m = url.match(/(.+):(.+)/)
    {
        r.protocol = 'about';
        r.host = 'memory';
        return r;
    }


}

function dropUrlHash(url)
{
    return url.replace(/#.*$/, '');
}

function getClampedWindowDimensions(left, top, width, height, minLeft, minTop, maxWidth, maxHeight)
{
    left = clamp(left, minLeft, minLeft + maxWidth);
    top = clamp(top, minTop, minTop + maxHeight);
    width = clamp(width, 0, maxWidth);
    height = clamp(height, 0, maxHeight);
    r = {left: left, top: top, width: width, height: height};
    return r;
}

function clone(obj) {
    // Handle the 3 simple types, and null or undefined
    if (null == obj || "object" != typeof obj) return obj;

    // Handle Date
    if (obj instanceof Date) {
        var copy = new Date();
        copy.setTime(obj.getTime());
        return copy;
    }

    // Handle Array
    if (obj instanceof Array) {
        var copy = [];
        var len = obj.length;
        for (var i = 0; i < len; ++i) {
            copy[i] = clone(obj[i]);
        }
        return copy;
    }

    // Handle Object
    if (obj instanceof Object) {
        var copy = {};
        for (var attr in obj) {
            if (obj.hasOwnProperty(attr)) copy[attr] = clone(obj[attr]);
        }
        return copy;
    }

    throw new Error("Unable to copy obj! Its type isn't supported.");
}

// Array Remove - By John Resig (MIT Licensed)
function remove(array, from, to) {
    var rest = array.slice((to || from) + 1 || array.length);
    array.length = from < 0 ? array.length + from : from;
    return array.push.apply(array, rest);
}

function first(array, matchFn) {
    for (var i = 0; i < array.length; i++) {
        if (matchFn(array[i])) {
            return array[i];
        }
    }
}

function clamp(value, min, max)
{
    value = value < min ? min : value;
    value = value > max ? max : value;
    return value;
}

Function.prototype.extend = function(baseClass, withPrototype) {
    function inheritance() {}
    inheritance.prototype = baseClass.prototype;

    this.prototype = new inheritance();
    this.prototype.constructor = this;
    this._base = baseClass;
    this._super = baseClass.prototype;

    if (withPrototype === undefined) {
        return;
    }

    for (var attrname in withPrototype) {
        this.prototype[attrname] = withPrototype[attrname];
    }
}

function extendClass(subClass, superClass, prototype) {
    if (!superClass) {
        superClass = Object;
    }
    subClass.prototype = Object.create(superClass.prototype);
    subClass.prototype.constructor = subClass;
    for (var x in prototype) {
        if (prototype.hasOwnProperty(x)) {
            subClass.prototype[x] = prototype[x];
        }
    }
    subClass.prototype.$super = function (propName) {
        var prop = superClass.prototype[propName];
        if (typeof prop !== "function") {
            return prop;
        }
        var self = this;
        return function (/*arg1, arg2, ...*/) {
            var selfProto = self.__proto__;
            self.__proto__ = superClass.prototype;
            try {
                return prop.apply(self, arguments);
            }
            finally {
                self.__proto__ = selfProto;
            }
        };
    };
    subClass.prototype.$superClass = superClass;
    subClass.prototype.$base = function() {
        this.$super('constructor').apply(this, arguments);
    }
}

function extendClassOld(subClass, superClass, withPrototype) {
    function inheritance() {
        this.base = getExtendBase;
        this.super = getExtendSuper;
    }
    inheritance.prototype = superClass.prototype;

    subClass.prototype = new inheritance();
    subClass.prototype.constructor = subClass;
    subClass._base = superClass;
    subClass._super = superClass.prototype;

    if (withPrototype === undefined) {
        return;
    }

    for (var attrname in withPrototype) {
        subClass.prototype[attrname] = withPrototype[attrname];
    }
}

function getExtendBase() {
    return this.constructor._base;
}

function getExtendSuper() {
    return this.constructor._super;
}

function castObject(object, toClass) {
    // pseudocast: doesn't actually change the object's type, but
    // will cause instanceof to report correct prototype inheritance
    object.__proto__ = toClass.prototype;
}

// Iterates through the properties of object, calling mapFn(key, value) on each one.
// To conveniently use as a filter, make mapFn() return undefined for those properties to not output.
// @returns An array of the return values of the mapFn calls.
function mapObjectProps(object, mapFn) {
    var ary = [];
    for (var k in object) {
        var r = mapFn(k, object[k]);
        if (r !== undefined) {
            ary.push(r);
        }
    }
    return ary;
}

function onDocumentReady(fn) {
    if (document.readyState == 'complete') {
        fn();
    }
    window.onload = fn;
}

function generateGuid() {
    var S4 = function() {
       return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
    };
    return (S4()+S4()+"-"+S4()+"-"+S4()+"-"+S4()+"-"+S4()+S4()+S4());
}
