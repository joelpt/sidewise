///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var IS_SCRIPTABLE_URL_REGEX = new RegExp(/^((about|file|view-source|chrome.*):|https?:\/\/chrome.google.com\/webstore)/);

///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

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

URL_FAVICON_REPLACEMENTS[(chrome.extension || window.parent.chrome.extension).getURL('/options.html')] = '/images/sidewise_icon_16.png';

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


///////////////////////////////////////////////////////////
// URL related functions
///////////////////////////////////////////////////////////

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

function isScriptableUrl(url)
{
    return !(url == '' || IS_SCRIPTABLE_URL_REGEX.test(url));
}

function isExtensionUrl(url)
{
    return url.indexOf('chrome-extension://') == 0;
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


///////////////////////////////////////////////////////////
// Script injection
///////////////////////////////////////////////////////////

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

function executeContentScript(url, tabId, scriptBody)
{
    if (isScriptableUrl(url))
    {
        log_brief(tabId, scriptBody);
        chrome.tabs.executeScript(tabId, { code: scriptBody });
    }
}


///////////////////////////////////////////////////////////
// File/script reading
///////////////////////////////////////////////////////////

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

// Adds a includeScripts method which loads the specified
// scripts in order and executes them
// Requires jQuery
function includeScripts(scriptUrls) {
    $.ajaxSetup({async: false});
    scriptUrls.forEach(function(e) {
        $.getScript(e);
    });
    $.ajaxSetup({async: true});
}


///////////////////////////////////////////////////////////
// PageTree related
///////////////////////////////////////////////////////////

function getNumericId(id)
{
    return parseInt(id.slice(1));
}


///////////////////////////////////////////////////////////
// Javascript object manipulation
///////////////////////////////////////////////////////////

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


///////////////////////////////////////////////////////////
// Javascript object subclassing
///////////////////////////////////////////////////////////

// extendClass won't create surrogate child functions for these function names.
var EXTEND_CLASS_BANNED_SURROGATE_NAMES =
    ['constructor', '$base', '$super', '$parent'];

// Inherit superClass's prototype onto subClass.
// Adds properties of prototype argument to subClass's prototype.
//
// Adds the following additional prototype properties to subClass:
//
// $super: function to call parent functions, e.g.
//      this.$super('parentFunctionName')(arg1, arg2, ...);
//      This will use the correct prototype functions of the parent within
//          the called super-function, so we don't have a parent trying to
//          call the child's functions of the same name.
// $base: function to call parent's constructor, e.g.
//      this.$base(constructorArg1, ...);
// $parent: equals the superClass object.
//
// For functions that exist on the superClass which are not explicitly
// overriden in the subClass, a surrogate function is generated of the
// same name and stored in the subClass's prototype which calls $super()
// for the given function. This ensures that for non-overriden functions,
// the parent function always gets executed with the proper parent-prototype
// context, as described above w.r.t. $super.
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
    for (var x in superClass.prototype) {
        if (EXTEND_CLASS_BANNED_SURROGATE_NAMES.indexOf(x) >= 0) {
            // skip banned surrogate function names
            continue;
        }
        if (!subClass.prototype.hasOwnProperty(x)) {
            // subClass didn't override this superClass function,
            // so create a surrogate function for it
            subClass.prototype[x] = getExtendClassSurrogateFunction(x);
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
    subClass.prototype.$parent = superClass;
    subClass.prototype.$base = function() {
        this.$super('constructor').apply(this, arguments);
    }
}

// Factory method to get a surrogate function for a child object
// to call $super on its parent object. Used when a parent object
// has a certain prototype function but child has not overriden it;
// by setting up surrogate functions on the child's prototype for these
// non-overriden functions we ensure the parent functions always get
// called with the parent's prototype context.
function getExtendClassSurrogateFunction(functionName) {
    return function() {
        return this.$super(functionName).apply(this, arguments);
    };
}


///////////////////////////////////////////////////////////
// Javascript Array manipulation
///////////////////////////////////////////////////////////

// Array Remove - By John Resig (MIT Licensed)
function remove(array, from, to) {
    var rest = array.slice((to || from) + 1 || array.length);
    array.length = from < 0 ? array.length + from : from;
    return array.push.apply(array, rest);
}

function first(array, matchFn) {
    for (var i = 0; i < array.length; i++) {
        if (matchFn(array[i])) {
            return [i, array[i]];
        }
    }
}

function mostFrequent(arr) {
    var uniqs = {};

    for(var i = 0; i < arr.length; i++) {
        uniqs[arr[i]] = (uniqs[arr[i]] || 0) + 1;
    }

    var max = { val: arr[0], count: 1 };
    for(var u in uniqs) {
        if(max.count < uniqs[u]) { max = { val: u, count: uniqs[u] }; }
    }

    return max;
}

///////////////////////////////////////////////////////////
// Numeric related
///////////////////////////////////////////////////////////

function clamp(value, min, max)
{
    value = value < min ? min : value;
    value = value > max ? max : value;
    return value;
}


///////////////////////////////////////////////////////////
// GUID generation
///////////////////////////////////////////////////////////

function generateGuid() {
    return (guidS4()+guidS4()+"-"+guidS4()+"-"+guidS4()+"-"+guidS4()+"-"+guidS4()+guidS4()+guidS4());
}

function guidS4() {
    return (((1+Math.random())*0x10000)|0).toString(16).substring(1);
}
