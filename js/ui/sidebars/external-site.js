var IFRAME_LOAD_TIMEOUT_MS = 12000;

// Hide our parent iframe from any possible access by external iframe
// since it can get at the extension's JS context
window.parent = undefined;

window.onload = onLoad;

function onLoad() {
    document.getElementById('contentFrame').onload=onLoadIframe;
    setIframeSrc();
}

function onLoadIframe() {
    document.getElementById('loadingHint').style.display = 'none';
    TimeoutManager.clear('iframeLoad');
}

function setIframeSrc() {
    var src = location.hash.slice(1);
    document.getElementById('loadingHint').style.display = 'block';
    document.getElementById('loadingURL').innerText = src;
    document.getElementById('contentFrame').src = src;
    TimeoutManager.set('iframeLoad', onIframeLoadTimeout, IFRAME_LOAD_TIMEOUT_MS);
}

function onIframeLoadTimeout() {
    this.document.getElementById('loadingError').innerHTML =
        'This content is taking a long time to load.<br/><br/>Many sites block being loaded in an IFRAME. ' +
        'This may be the case here. If the content never loads, you are probably out of luck. Sorry!';
}
