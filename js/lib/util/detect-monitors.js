var detectedMonitors = null;
var maximizedMonitorOffset = 0;
var detectOnComplete = null;
var detectingMonitors = false;

function isDetectingMonitors() {
    return detectingMonitors;
}

function detectAllMonitorMetrics(onComplete) {
    detectedMonitors = [];
    detectOnComplete = onComplete;
    detectingMonitors = true;

    // ascertain the primary monitor's metrics using background page screen object
    var mon = {
        detectedLeft: screen.availLeft,
        availWidth: screen.availWidth,
        marginLeft: screen.availLeft,
        marginRight: screen.width - screen.availWidth - screen.availLeft,
        left: 0,
        width: screen.width
    };

    detectedMonitors.push(mon);

    // create out testing window
    chrome.windows.create(
        { url: 'detect-monitor.html', left: screen.availLeft, top: screen.availTop,
            width: 500, height: 200 },
        function(win) {
            console.log('detection window id', win.id);
            // ascertain maximizedMonitorOffset
            detectMonitorMetrics(win.id, 0, function(winId, testedAtLeft, left, top, width, height) {
                // TODO MAKE THIS WORK RIGHT
                maximizedMonitorOffset = screen.availTop - top;

                // detect additional monitors to the right
                detectMonitorMetrics(win.id, mon.width, onDetectingMonitorToRight);
            });
        }
    );

}

function detectMonitorMetrics(winId, atLeft, callback) {
    chrome.windows.update(winId, { state: 'normal', left: atLeft, top: 0, width: 500, height: 200 },
        function(w) {
            chrome.windows.update(winId, { state: 'maximized' }, function(w) {
                callback(winId, atLeft, w.left, w.top, w.width, w.height);
            });
        }
    );
}

function onDetectingMonitorToRight(winId, testedAtLeft, left, top, width, height) {
    // do we already know about this monitor?
    // if so it actually means there are no more monitors to the right to be found
    var matching = detectedMonitors.filter(function(m) { return m.detectedLeft == left + maximizedMonitorOffset; });
    if (matching.length == 0) {
        // don't know about this monitor yet, record it
        var mon = {
            detectedLeft: left + maximizedMonitorOffset,
            availWidth: width - 2 * maximizedMonitorOffset,
            marginLeft: left - testedAtLeft + maximizedMonitorOffset,
            marginRight: 0, // TODO figure out a way to actually determine this
            left: testedAtLeft
        };
        mon.width = mon.marginLeft + mon.availWidth + mon.marginRight;

        detectedMonitors.push(mon);

        // and continue looking for monitors to the right
        detectMonitorMetrics(winId, testedAtLeft + mon.width, onDetectingMonitorToRight);
        return;
    }

    // TODO MAC OSX
    // if returned value for left is less than testedAtLeft, we did not succeed in finding
    // another monitor (Chrome put the test window back onto the same monitor)

    // now try to detect monitors to the left of the first one
    detectMonitorMetrics(winId, -600, onDetectingMonitorToLeft);
}

function onDetectingMonitorToLeft(winId, testedAtLeft, left, top, width, height) {
    // do we already know about this monitor?
    // if so it actually means there are no more monitors to the left to be found
    var matching = detectedMonitors.filter(function(m) { return m.detectedLeft == left + maximizedMonitorOffset; });
    if (matching.length == 0) {
        // don't know about this monitor yet, record it
        var mon = {
            detectedLeft: left + maximizedMonitorOffset,
            availWidth: width - 2 * maximizedMonitorOffset,
            marginLeft: 0, // TODO puzzle out a way to get these values
            marginRight: 0,
            left: left + maximizedMonitorOffset
        };
        mon.width = mon.marginLeft + mon.availWidth + mon.marginRight;

        detectedMonitors.splice(0, 0, mon);

        // and continue looking for monitors to the left
        detectMonitorMetrics(winId, mon.left - 600, onDetectingMonitorToLeft);
        return;
    }

    // all done, close the detection window
    chrome.windows.remove(winId);
    detectingMonitors = false;
    detectOnComplete(detectedMonitors, maximizedMonitorOffset);
}
