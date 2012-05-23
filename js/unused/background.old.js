var putSidebarOutside = false;
var sidebarTargetWidth = 400;

// TODO: change executeInSidebar() to use Chrome message passing instead, this will probably alleviate our weird errors we see with the current method
// and also is probably the "right way" to do it; it should let the background.js and sidebar.js execute fully asynchronously.

// TODO: attribute http://www.iconlet.com/info/87692_light-bulb_16x16

var targetWindow = null;
var tabCount = 0;

var sidebarHtmlUrl = chrome.extension.getURL('sidebar.html');
var sidebarReady = false;
var sidebarWindow = null;
var sidebarTab = null;
var sidebarDOMWindow = null;
var sidebarLeft = null;
var sidebarTop = null;
var sidebarWidth = null;
var sidebarHeight = null;
var sidebarAttachedWindow = null;
var refocusing = false;
var sidebarNeedsRefocus = false;
var lastFocusedWindowId = null;
var afterGetScreenCallback = null;
var sidebarRepositionTimer = null;
var sidebarResizeDeltaAccum = 0;
var initiatedWindowFocusChange = false;

var tree = PageTree();
var updateStack = DictStack();
var openedStack = DictStack();
var createdQueue = {};
var selectedTabId = null;
var closedTabs = {};

// We use the below ScriptBody values to inject content scripts into webpages. We use this approach rather than just
// a content_script.js because injected script can be run without reloading the webpage after installing the extension or reloading
// it; with use of content_script.js every page must be reloaded to pick it up.
var getPageDetailsScriptBody =
  "chrome.extension.sendRequest( { op: 'getPageDetails', referrer: document.referrer, historylength: window.history.length } );";
  //+ "document.body.onunload = function() { chrome.extension.sendRequest( { op: 'pageUnloading' } ) };";

var getScreenScriptBody =
  "chrome.extension.sendRequest( { op: 'getScreen', screen: screen } );";

$(function() { onLoad(); });

function onLoadDebug()
{
  chrome.tabs.onCreated.addListener(function(details) { console.log('onCreated: ' + JSON.stringify(details)) } );
  chrome.tabs.onUpdated.addListener(function(tabId, changeInfo) { console.log('onUpdated: ' + tabId + ', ' + JSON.stringify(changeInfo) ) } );
  chrome.experimental.webNavigation.onBeforeNavigate.addListener(function(details) { console.log('onBeforeNavigate: ' + JSON.stringify(details)) } );
  chrome.experimental.webNavigation.onBeforeRetarget.addListener(function(details) { console.log('onBeforeRetarget: ' + JSON.stringify(details)) } );
  chrome.experimental.webNavigation.onCommitted.addListener(function(details) { console.log('onCommitted: ' + JSON.stringify(details)) } );
  chrome.experimental.webNavigation.onCompleted.addListener(function(details) { console.log('onCompleted: ' + JSON.stringify(details)) } );
}

function onLoad()
{
  initSidebarVars();

  chrome.tabs.onCreated.addListener(tabCreated);
  chrome.tabs.onUpdated.addListener(tabUpdated);
  chrome.tabs.onRemoved.addListener(tabRemoved);
  chrome.tabs.onSelectionChanged.addListener(tabSelectionChanged);
  chrome.browserAction.onClicked.addListener(browserActionClicked);
  chrome.windows.onFocusChanged.addListener(windowFocusChanged);
  chrome.windows.onRemoved.addListener(windowRemoved);

  // chrome.experimental.webNavigation.onBeforeNavigate.addListener(function(details) { console.log(JSON.stringify(details)); });
  // chrome.experimental.webNavigation.onBeforeRetarget.addListener(function(details) { console.log(JSON.stringify(details)); });
  // chrome.experimental.webNavigation.onBeforeCommit.addListener(function(details) { console.log(JSON.stringify(details)); });
  // chrome.experimental.webNavigation.onBeforeRetarget.addListener(onBeforeRetarget);

  chrome.webNavigation.onCreatedNavigationTarget.addListener(onCreatedNavigatonTarget);
  chrome.webNavigation.onCommitted.addListener(function(details) { console.log('onCommitted: ' + JSON.stringify(details)) } );
  // chrome.extension.onRequest.addListener(onRequest);

  // chrome.extension.onConnect.addListener(function(port) {
  //   console.log('onConnect: ' + JSON.stringify(port));
  //   if (port.name == "pageLoad")
  //     port.onMessage.addListener(onPageLoadStartedMessage);
  //   else if (port.name == "pageLoading")
  //     port.onMessage.addListener(onGetPageDetailsMessage);
  // });

  populatePages();

  // Chrome is 'ready' when we can successfully call getCurrent
  chrome.windows.getCurrent(onChromeWindowsReady);
}

function onBeforeRetarget(details)
{
  console.log('>>>>>>>>>>>>>>> onBeforeRetarget >>>>>>>>>>>>>>>');
  console.log(JSON.stringify(details));
}

function onChromeWindowsReady(win)
{
  if (!win)
  {
    // not ready yet; try again shortly
    console.log('!!! onChromeWindowsReady not yet ready');
    setTimeout(function() {
      chrome.windows.getCurrent(onChromeWindowsReady);
    }, 100);
    return;
  }

  console.log('!!! onChromeWindowsReady EXECUTING');

  initFocusedWinTab();

  console.log('@@@ about to try and open the sidebar with the current window');
  chrome.windows.getCurrent(attachNewSidebar);

  // watch for window movement to detect window resize/move activity
  setInterval(onTimerWindowMoveCheck, 100);
}


function windowRemoved(win)
{
  if (sidebarWindow && win.id == sidebarWindow.id)
  {
    // removed sidebar window
    initSidebarVars();
    return;
  }

  if (sidebarWindow)
  {
    chrome.windows.getAll(null, function(windows) {
      var count = windows.length;

      if (count == 1)
      {
        // no windows left except the sidebar's window.
        // so close the sidebar so chrome may exit.
        chrome.windows.remove(sidebarWindow.id);
      }
    });
  }
}

function onRequest(request, sender, sendResponse)
{
  console.log('onRequest: ' + JSON.stringify(request));
  console.log(JSON.stringify(sender));
  switch (request.op)
  {
    case 'getPageDetails':
      onGetPageDetailsMessage(sender.tab, request);
      break;
    case 'pageLoadStarted':
      onPageLoadStartedMessage(sender.tab, request);
      break;
    case 'getScreen':
      onGetScreenMessage(sender.tab, request);
      break;
    case 'windowResized':
      onWindowResizedMessage(sender.tab, request);
      break;
    // case 'pageUnloading':
    //   onPageUnloadingMessage(sender.tab, request);
    //   break;
    default:
      throw 'Unrecognized onRequest op ' + request.op;
  }
}

function onWindowResizedMessage(tab, msg)
{
  if (sidebarTab && tab.id == sidebarTab.id)
  {
    // sidebar is being resized; reproportion attached window
    // and persistently remember new sidebar width
    chrome.windows.get(tab.windowId, function(win) {
      widthDelta = win.width - sidebarTargetWidth;
      sidebarResizeDeltaAccum += widthDelta;
      console.log(win.width);
      console.log(sidebarTargetWidth);
      console.log(widthDelta);
      sidebarTargetWidth = win.width;
      clearTimeout(sidebarRepositionTimer);
      sidebarRepositionTimer = setTimeout(function() {
        console.log('this happened');
        startingWidth = sidebarAttachedWindow.width;
        console.log(startingWidth);
        positionWindow(sidebarAttachedWindow.id,
          sidebarAttachedWindow.left,
          sidebarAttachedWindow.top,
          startingWidth - sidebarResizeDeltaAccum,
          sidebarAttachedWindow.height);
        sidebarResizeDeltaAccum = 0;
      }, 100);
    });
    return;
  }

  if (sidebarRepositionTimer)
  {
    // avoid doing any repositioning while sidebar is being resized and
    // an attached-window adjustment is pending
    return;
  }

  if (sidebarAttachedWindow && tab.windowId == sidebarAttachedWindow.id)
  {
    // sidebar's attached window is being resized and/or moved

    // update sidebarAttachedWindow object (evidently it is a snapshot of
    // the real object)
    chrome.windows.get(sidebarAttachedWindow.id, function(win) {
      sidebarAttachedWindow = win;
    });

    // move sidebar with it
    positionWindow(sidebarWindow.id,
      sidebarAttachedWindow.left + sidebarAttachedWindow.width, sidebarAttachedWindow.top,
      sidebarTargetWidth, sidebarAttachedWindow.height);
    return;
  }
  return;
}

function onTimerWindowMoveCheck()
{
  if (sidebarAttachedWindow)
  {
    chrome.windows.get(sidebarAttachedWindow.id, function(win) {
      if ( win.left != sidebarAttachedWindow.left
        || win.top != sidebarAttachedWindow.top
        || win.width != sidebarAttachedWindow.width
        || win.height != sidebarAttachedWindow.height)
      {
        sidebarAttachedWindow = win;
        // var dims = getClampedWindowDimensions(
        //   sidebarAttachedWindow.left + sidebarAttachedWindow.width, sidebarAttachedWindow.top,
        //   sidebarTargetWidth, sidebarAttachedWindow.height,
        //   0, 0, screen.availWidth, screen.availHeight);

        positionWindow(sidebarWindow.id,
          sidebarAttachedWindow.left + sidebarAttachedWindow.width, sidebarAttachedWindow.top,
          sidebarTargetWidth, sidebarAttachedWindow.height);
      }
    });
  }
}

function onGetScreenMessage(tab, msg)
{
  if (!afterGetScreenCallback)
  {
    throw 'No afterGetScreenCallback set in onGetScreenMessage';
  }

  afterGetScreenCallback(tab, msg.screen);
}

function initFocusedWinTab()
{
  // focus the first "normal" window
  // chrome.windows.getAll({populate: false}, function(wins) {
  //   lastFocusedWindowId = wins.filter(function(e) {
  //     return (e.type == 'normal');
  //   })[0].id;
  // });
  chrome.tabs.getSelected(undefined, function(tab) {
    lastFocusedWindowId = tab.windowId;
    selectedTabId = tab.id;
  });
}

function populatePages() {
  chrome.windows.getAll({ populate: true }, function(windows) {
    var numWindows = windows.length;
    s = '';

    for (var i = 0; i < numWindows; i++) {
      var win = windows[i];
      var numTabs = win.tabs.length;

      if (win.type != 'normal') {
        continue; // only want actual tab-windows
      }

      tabs = win.tabs.sort(function(a, b) { return (a.id > b.id) - (a.id < b.id); });

      for (var j = 0; j < numTabs; j++) {
        var tab = tabs[j];
        var page = newPage(tab);
        tree.append(page);
        executeGetPageDetailsContentScript(tab.url, tab.id);
      }
    }
  });
}

function executeGetPageDetailsContentScript(url, tabId)
{
  executeContentScript(url, tabId, getPageDetailsScriptBody);
}

function executeGetScreenContentScript(url, tabId, callback)
{
  afterGetScreenCallback = callback;
  executeContentScript(url, tabId, getScreenScriptBody);
}

function executeContentScript(url, tabId, scriptBody)
{
  if (isScriptableUrl(url))
  {
    console.log('execute content script to be executed post-page-load for tab id ' + tabId + ': ' + scriptBody);
    chrome.tabs.executeScript(tabId, { code: scriptBody });
  }
}

// function getPageByUrl(url)
// {
//   return tree.find('page[url="' + dropUrlHash(url).replace('"', '\\"') + '"]:first');
// }

function onGetPageDetailsMessage(tab, msg)
{
  var tabId = tab.id;
  var page = getPageByTabId(tabId);
  console.log("onGetPageDetailsMessage " + tabId + " " + JSON.stringify(msg));
  console.log(JSON.stringify(tab));
  if (page.length == 1)
  {
    msg.url = tab.url;
    msg.favIconUrl = tab.favIconUrl;
    setPageDetails(page, msg);
    console.log('onGetPageDetailsMessage: Updated url, referrer, historylength for (tab in tree) tab id ' + tabId);
    if (page.attr('placed') == '0') {
      console.log('onGetPageDetailsMessage: Page not yet placed, doing so now');
      placePageInTree(page);
      page.attr('placed', '1');
    }
  }

  // storeTabDetails(tab);
}

function onPageLoadStartedMessage(tab, msg)
{
  var tabId = tab.id;
  var page = getPageByTabId(tabId);
  console.log("onPageLoadStartedMessage " + tabId + " " + JSON.stringify(msg));

  // console.log(awaitingCreation);
  // console.log('onPageLoadStartedMessage: ' + JSON.stringify(msg));
  // var page = getPageByUrl(msg.url);

  if (page.length == 0)
  {
    throw 'Could not find page in tree';
    return;
  }

  // var tabId = page.attr('id');

  // remove the page from awaitingCreation since we've seen it now
  // awaitingCreation.remove('page#' + tabId);

  // update page with received details
  // console.log('about to update page with onload detail');
  // console.log(page);
  msg.url = tab.url;
  setPageDetails(page, msg);
  console.log('Updated url, referrer, historylength on newly created <page> with id ' + tabId);

  if (page.attr('placed') == '0') {
    console.log('onGetPageDetailsMessage: Page not yet placed, doing so now');
    placePageInTree(page);
    page.attr('placed', '1');
    }
  }


// function onPageUnloadingMessage(tab, msg)
// {
//   var tabId = tab.id;
//   var page = getPageByTabId(tabId);
//   console.log("onPageUnloadingMessage " + tabId + " " + JSON.stringify(msg));

//   // Set the page to preloading status, just in case we're reloading the page; if we're closing it
//   // the page will disappear shortly due to tabRemoved event so we won't see the change
//   page.attr('status', 'preload');
//   executeInSidebar(function(sidebar) { sidebar.updatePageRow(page); });
// }

function browserActionClicked(tab) {
  chrome.windows.getCurrent(toggleSidebar);
}

function storeTabDetails(tab)
{
  // Look for existing page in tree
  var page = getPageByTabId(tab.id);
  if (page.length == 0)
  {
    console.log('storeTabDetails: No <page> to storeTabDetails to yet for tab id ' + tab.id);
    return;
  }

  console.log('storeTabDetails: updated id ' + tab.id + ' title [' + tab.title + ']' + ' status ' + tab.status + ' favicon ' + tab.favIconUrl);

  // var parts = splitUrl(tab.url);
  // var host = parts.host;
  // var proto_domain = parts.protocol + '://www.' + parts.domain + '/';
  var url = dropUrlHash(tab.url);
  page
    .attr('url', url)
    // .attr('host', host)
    .attr('title', tab.title)
    .attr('status', tab.status);

  if (tab.favIconUrl)
    page.attr('favicon', tab.favIconUrl);

  // executeInSidebar(function(sidebar) { sidebar.updatePageRow(page); });
  notifySidebar('modelPageUpdated', { pageId: tab.id });

  if (tab.favIconUrl)
    return;

  // Try harder to set the favicon. Chrome is rather fickle with when tab.favIconUrl
  // is available, and when chrome://favicon/<url> will actually return the site favicon
  // rather than a 'globe' icon. The below approach works most of the time.
  chrome.tabs.get(tab.id, function(tab) {
      if (tab.favIconUrl) // && tab.status == 'complete')
      {
        // page.attr('favicon', 'chrome://favicon/' + tab.url);
        page.attr('favicon', tab.favIconUrl);
        return;
      }

      if (tab.status == 'complete' && tab.url && (!page.attr('favicon') || page.attr('favicon') == 'chrome://favicon/'))
      {
        page.attr('favicon', 'chrome://favicon/' + tab.url);
      }
      else if (!page.attr('favicon'))
      {
        page.attr('favicon', 'chrome://favicon/');
      }

      console.log('## FAVICON = ' + page.attr('favicon'));
      setTimeout(function() {
        notifySidebar('modelPageUpdated', { pageId: tab.id });
        // executeInSidebar(function(sidebar) { sidebar.updatePageRow(page); });
      }, 250);
  });

  // console.log(tree);
}

function setPageDetails(page, details)
{
  console.log('setPageDetails ' + page.attr('id') + "; " + JSON.stringify(details));
  page
    .attr('url', dropUrlHash(details.url))
    .attr('referrer', details.referrer)
    .attr('historylength', details.historylength);
    // .attr('favicon', details.favIconUrl || page.attr('favicon'));
  console.log('## FAVICON =' + page.attr('favicon'));
  notifySidebar('modelPageUpdated', { pageId: page.attr('id') });
  // executeInSidebar(function(sidebar) { sidebar.updatePageRow(page); });
}

function getClampedWindowDimensions(left, top, width, height, minLeft, minTop, maxWidth, maxHeight)
{
  left = clamp(left, minLeft, minLeft + maxWidth);
  top = clamp(top, minTop, minTop + maxHeight);
  width = clamp(width, 0, maxWidth);
  height = clamp(height, 0, maxHeight);
  r = {left: left, top: top, width: width, height: height};
  console.log(r);
  return r;
}

function destroySidebar()
{
  if (!sidebarWindow)
  {
    throw 'No sidebarWindow to destroy';
  }
  try {
    chrome.tabs.remove(sidebarTab.id);
  }
  catch(e)
  {
  }
  initSidebarVars();
}

function toggleSidebar(sourceWindow) {
  if (sidebarWindow)
  {
    destroySidebar();
  }
  attachNewSidebar(sourceWindow);
}

function attachNewSidebar(attachToWindow)
{
  console.log('@@@ attachNewSidebar to:');
  console.log(attachToWindow);
  sidebarAttachedWindow = attachToWindow;

  var callback = function(tab, screen) {
    console.log('@@@ create and position sidebar callback magic');
    console.log(screen);
    console.log(tab);

    var maxLeft = screen.availLeft;
    var maxTop = screen.availTop;

    var maxWidth;
    if (screen.availWidth - sidebarTargetWidth > sidebarAttachedWindow.left + sidebarAttachedWindow.width)
    {
      // do not need to shrink attach-to window in width because there is enough
      // free space for the sidebar to fit on this monitor without resizing attach-to
      maxWidth = screen.availWidth;
    }
    else
    {
      // require width of attach-to window to leave enough space on the monitor
      // to add the sidebar window
      maxWidth = screen.availWidth - sidebarTargetWidth;
    }

    var maxHeight = screen.availHeight;

    var dimensions = getClampedWindowDimensions(
      sidebarAttachedWindow.left, sidebarAttachedWindow.top,
      sidebarAttachedWindow.width, sidebarAttachedWindow.height,
      maxLeft, maxTop, maxWidth, maxHeight);

    positionWindow(sidebarAttachedWindow.id, dimensions.left, dimensions.top, dimensions.width, dimensions.height);

    // create and position sidebar
    sidebarLeft = dimensions.left + dimensions.width;
    sidebarTop = dimensions.top;
    sidebarWidth = sidebarTargetWidth;
    sidebarHeight = dimensions.height;
    var winSpec = { 'url': 'sidebar.html', 'left': sidebarLeft, 'top': sidebarTop, 'width': sidebarWidth, 'height': sidebarHeight, 'type': 'popup' };
    chrome.windows.create(winSpec, createdSidebar);

  };

  chrome.tabs.getSelected(sidebarAttachedWindow.id, function(tab) {
    // if currently selected tab in sidebarAttachedWindow is scriptable,
    // get its screen details
    if (isScriptableUrl(tab.url))
    {
      executeGetScreenContentScript(tab.url, tab.id, callback);
      return;
    }

    // just use screen object of background.html (in global scope), which may not
    // be on the actual monitor which sidebarAttachedWindow is on; this will only
    // present an issue for multimonitor users using different resolutions per monitor
    callback(null, screen);

    // TODO: remove below code, this was an attempt to circumvent the iscriptable-can't-
    // get-screen issue by using any tab in sidebarAttachedWindow that was scriptable,
    // but turns out this just returns the first monitor's screen dimensions.
    // In other words only the selected tab appears to return a correct screen object.

    // // look for any tab in sidebarAttachedWindow that is scriptable to get screen
    // chrome.windows.getAll({ populate: true }, function(wins) {
    //   var success = false;
    //   console.log(wins);
    //   for (var i in wins)
    //   {
    //     var win = wins[i];
    //     console.log('SCREEN SEEK: ' + win.id + ', ' + sidebarAttachedWindow.id);
    //     console.log(win);
    //     if (win.id == sidebarAttachedWindow.id)
    //     {
    //       for (var j in win.tabs)
    //       {
    //         var tab = tabs[j];
    //         console.log('SCREEN SEEK OF TAB: ' + tab.id + ': ' + tab.url + ': ' + isScriptableUrl(tab.url));
    //         if (isScriptableUrl(tab.url))
    //         {
    //           console.log('*******************GOAL');
    //           executeGetScreenContentScript(tab.url, tab.id, callback);
    //           success = true;
    //           break;
    //         }
    //       }
    //       break;
    //     }
    //   }
    //   if (!success)
    //   {
    //     // just use screen object of background.html (in global scope), which may not
    //     // be on the actual monitor which sidebarAttachedWindow is on
    //     callback(null, screen);
    //   }
    // });

  });

  return;

  // var maxWidth = screen.availWidth;
  // var maxHeight = screen.availHeight;

  // var totalwidth = screen.availWidth;
  // var totalheight = screen.availHeight;
  // var left = win.left;
  // var top = win.top;
  // var height = win.height;
  // var width = win.width;
  // var sbLeft;

  // sidebarAttachedWindow = win;

  // if (top < 0) // maximized Windows windows have a negative value here; remove that amount from both top and height
  // {
  //   height += top * 2;
  //   top = 0;
  // }

  // if (top + height > totalheight) // maximized Windows windows will ignore the taskbar; clamp at totalheight
  // {
  //   height = totalheight - top;
  // }


  // if (left < 0) // maximized Windows windows have a negative value here; remove that amount from both left and width
  // {
  //   width += left * 2;
  //   left = 0;
  // }

  // if (width > totalwidth) // clamp
  // {
  //   width = totalwidth;
  // }

  // if (sidebarWindow && width < sidebarTargetWidth + 100)
  // {
  //   // current window is too narrow to put sidebar "inside" reasonably, so switch to putting it on the outside
  //   putSidebarOutside = true;
  // }
  // else if (totalwidth - (left + width) > sidebarTargetWidth)
  // {
  //   // there appears to be enough room to fit the sidebar outside of the attached Chrome window on this monitor
  //   putSidebarOutside = true;
  // }
  // else
  // {
  //   putSidebarOutside = false;
  // }

  // if (sidebarWindow && !sidebarWindow.closed)
  // {
  //   var sbCurrentWidth = sidebarWindow.width;
  //   // close it
  //   chrome.tabs.remove(sidebarTab.id);
  //   //chrome.windows.remove(sidebarWindow.id);
  //   // sidebarWindow = null;
  //   // sidebarTab = null;
  //   // sidebarDOMWindow = null;
  //   // re-widen source window
  //   // if (!putSidebarOutside)
  //   // {
  //   //   var newWidth = width + sbCurrentWidth;
  //   //   if (newWidth > totalwidth)
  //   //   {
  //   //     newWidth = totalwidth;
  //   //   }
  //   //   positionWindow(win.id, left, top, newWidth, height);
  //   // }
  //   return;
  // }

  // if (putSidebarOutside)
  // {
  //   sbLeft = left + width;
  //   positionWindow(win.id, left, top, width, height);
  // }
  // else
  // {
  //   // narrow the associated window
  //   sbLeft = left + width - sidebarTargetWidth;
  //   positionWindow(win.id, left, top, width - sidebarTargetWidth, height);
  // }

  // // create sidebar
  // sidebarLeft = sbLeft;
  // sidebarTop = top;
  // sidebarWidth = sidebarTargetWidth;
  // sidebarHeight = height;
  // var win = { 'url': 'sidebar.html', 'left': sidebarLeft, 'top': sidebarTop, 'width': sidebarWidth, 'height': sidebarHeight, 'type': 'popup' };
  // chrome.windows.create(win, createdSidebar);
}

function positionWindow(winId, left, top, width, height)
{
  chrome.windows.update(winId, { 'left': left, 'top': top, 'height': height, 'width': width });
}

function createdSidebar(win) {
    // Re-size the sidebar after creation since Chrome recently seems to be mis-sizing on create
    positionWindow(win.id, sidebarLeft, sidebarTop, sidebarWidth, sidebarHeight);
}



  //chrome.windows.get(sidebarWindow.id, getSidebarTab);

// function getSidebarTab(win) {
//   chrome.windows.getAll({ populate: true }, getSidebarTab_getAll);
// }

// function getSidebarTab_getAll(windows) {
//   var numWindows = windows.length;

//   for (var i = 0; i < numWindows; i++) {
//     var win = windows[i];
//     if (sidebarWindow.id == win.id) {
//       // found the sidebar window
//       // alert(win.tabs[0]);
//       sidebarTab = win.tabs[0];
//       // alert(sidebarTab.id);
//       // chrome.tabs.executeScript(sidebarTab.id, {code: "setTimeout(function() { alert(123); }, 1000)"});
//       // alert(2);
//     }
//   }
// }

// function getTabs(tabs) {
//   tabCount = tabs.length;
//   chrome.windows.getAll({"populate" : true}, moveTabs);
// }

// function moveTabs(windows) {
//   var numWindows = windows.length;
//   var tabPosition = tabCount;

//   for (var i = 0; i < numWindows; i++) {
//     var win = windows[i];
//     if (targetWindow.id != win.id) {
//       var numTabs = win.tabs.length;

//       for (var j = 0; j < numTabs; j++) {
//         var tab = win.tabs[j];

//         // Move the tab into the window that triggered the browser action.
//         chrome.tabs.move(tab.id,
//           {"windowId": targetWindow.id, "index": tabPosition});

//         tabPosition++;
//       }
//     }
//   }
// }

function windowFocusChanged(windowId)
{
  console.log('windowFocusChanged windowId:' + windowId + ', sidebarWindow: ' + sidebarWindow + ', refocusing: ' + refocusing);

  if (refocusing)
  {
    console.log('currently refocusing; lastFocusedWindowId is currently ' + lastFocusedWindowId);
    return;
  }

  if (initiatedWindowFocusChange)
  {
    console.log('sidewise initiated this window focus change so doing nothing extra');
    initiatedWindowFocusChange = false;
    return;
  }

  if (!sidebarNeedsRefocus && (!sidebarWindow || sidebarWindow.id != windowId) && windowId != -1) {
    console.log('update currently selected tab due to window focus change');
    // update selected page in sidebar to current window's selected tab
    chrome.tabs.getSelected(windowId, function(tab) {
      setSelectedTabId(tab.id);
      lastFocusedWindowId = windowId;
    });
    return;
  }

  if (!sidebarWindow || sidebarWindow.closed)
  {
    console.log('no sidebar window to manage focus of');
    return;
  }

  if (windowId == -1) {
    // switched away from chrome window
    console.log('will need to refocus');
    sidebarNeedsRefocus = true;
    return;
  }

  if (!sidebarNeedsRefocus)
  {
    console.log('do not need to refocus now');
    return;
  }

  if (sidebarWindow.id != windowId)
  {
    console.log('focus sidebar tab then focus current selected tab immediately after');
    // switched to chrome window from another app
    chrome.tabs.getSelected(windowId, function(tab) {
      // focus sidebar tab then focus current selected tab immediately after
      sidebarNeedsRefocus = false;
      refocusing = true;
      lastFocusedWindowId = windowId;
      chrome.tabs.update(sidebarTab.id, { selected: true }, function() {
        chrome.tabs.update(tab.id, { selected: true }, function() {
          refocusing = false;
        })
      });
    });
    return;
  }

  // refocus last focused regular window
  console.log('focus last focused window\'s selected tab lastwinid ' + lastFocusedWindowId + ', then sidebar again immediately after');
  chrome.tabs.getSelected(lastFocusedWindowId, function(tab) {
    // console.log('inside getSelected callback');
    // focus last focused window's selected tab, then sidebar again immediately after
    sidebarNeedsRefocus = false;
    refocusing = true;
    chrome.tabs.update(tab.id, { selected: true }, function() {
      chrome.tabs.update(sidebarTab.id, { selected: true }, function() {
        refocusing = false;
      })
    });
  });
  return;
}

function initSidebarVars()
{
  // clear sidebar tracking variables
  sidebarWindow = null;
  sidebarTab = null;
  sidebarDOMWindow = null;
  sidebarAttachedWindow = null;
  sidebarLeft = null;
  sidebarTop = null;
  sidebarWidth = null;
  sidebarHeight = null;
  sidebarReady = false;
}

function tabRemoved(tabId)
{
  var callback = function(tab, screen) {
    console.log('destroying sidebar callback magic');
    console.log(screen);
    console.log(tab);

    var maxLeft = screen.availLeft;
    var maxTop = screen.availTop;
    var maxWidth = screen.availWidth;
    var maxHeight = screen.availHeight;

    if (sidebarAttachedWindow.width + sidebarTargetWidth < maxWidth)
    {
      // attached window appears to have not taken up the entirety of the monitor's available width
      // together with the now-removed sidebar. therefore don't try to rewiden the attached window.
      initSidebarVars();
      return;
    }

    var dimensions = getClampedWindowDimensions(
      sidebarAttachedWindow.left, sidebarAttachedWindow.top,
      sidebarAttachedWindow.width + sidebarTargetWidth, sidebarAttachedWindow.height,
      maxLeft, maxTop, maxWidth, maxHeight);

    positionWindow(sidebarAttachedWindow.id, dimensions.left, dimensions.top, dimensions.width, dimensions.height);
    initSidebarVars();
  };

  if (sidebarTab && parseInt(tabId) == parseInt(sidebarTab.id)) {
    console.log('closed sidebar');
    chrome.tabs.getSelected(sidebarAttachedWindow.id, function(tab) {
      if (isScriptableUrl(tab.url))
      {
        executeGetScreenContentScript(tab.url, tab.id, callback);
      }
      else
      {
        // just use background.html's screen object
        callback(tab, screen);
      }
    });
  }
  else {
    var page = getPageByTabId(tabId);
    if (page.length == 0)
    {
      throw "Could not find <page> to remove with tabId " + tabId;
    }
    page.replaceWith(page.children());
    // executeInSidebar(function(sidebar) { sidebar.removePageRow(tabId); });
    notifySidebar('modelPageRemoved', { pageId: tabId });
  }


}

function onCreatedNavigatonTarget(details)
{
  console.log('onCreatedNavigatonTarget ' + JSON.stringify(details));
  chrome.tabs.get(details.tabId, function(tab) { gotCreatedNavigationTarget(details, tab); });
}

function gotCreatedNavigationTarget(details, tab)
{
  console.log('gotCreatedNavigatonTarget ' + JSON.stringify(details));
  console.log('gotCreatedNavigatonTarget ' + JSON.stringify(tab));
  return
}

function tabCreated(tab)
{
  console.log('tabCreated ' + JSON.stringify(tab));

  /*if (!isScriptableUrl(tab.url))
  {
    console.log('tabCreated: non scriptable url, returning without creating anything');
    return;
  }*/
  if (tab.url == sidebarHtmlUrl) {
    // console.log('detected sidebar tab creation, doing nothing as we expected attachNewSidebar() to set sidebarTab/Window/DOMWindow for us');
    console.log('detected sidebar tab creation, setting sidebarTab/sidebarWindow');

    sidebarTab = tab;
    chrome.windows.get(tab.windowId, function(win) {
      sidebarWindow = win; // setting this signifies to the rest of the code logic that the sidebar win/tab is ready for operation
    });
    return; // ignore the sidebar tab itself
  }
  // chrome.tabs.executeScript(tab.id, { code: "alert('when is this')" });
  // add tabId/url to a list
  var page = newPage(tab, 'preload');

  if (selectedTabId) {
    var parentPage = getPageByTabId(selectedTabId);
    if (parentPage.length == 1) {
      parentPage.append(page);
      notifySidebar('modelChildPageAdded', { pageId: tab.id, parentPageId: selectedTabId });
      // executeInSidebar(function(sidebar) { sidebar.addPageRow(page, selectedTabId); });
    }
    else {
      tree.append(page);
      notifySidebar('modelRootPageAdded', { pageId: tab.id });
      // executeInSidebar(function(sidebar) { sidebar.addPageRow(page); });
    }
  }
  else
  {
    tree.append(page);
    notifySidebar('modelRootPageAdded', { pageId: tab.id });
    // executeInSidebar(function(sidebar) { sidebar.addPageRow(page); });
  }
  // alert('tabCreated ' + tab.url + ' with tabId ' + tab.id);
  executeGetPageDetailsContentScript(tab.url, tab.id);
  //chrome.tabs.executeScript(tab.id, { code: "postPageLoading('c', " + tab.windowId + ", " + tab.id + ")" });

  // CONSIDER: putting the tab directly into 'tree' instead of into 'waiting' as a child of the currently
  // selected tab, then move it if we later find it has e.g. no referrer. Pros: the instant a tab is created
  // we can show it in the visible tree. Cons: if we discover it has no referrer we have to then visibly move
  // the tab out of the children and to the top level children.

  // alert('AFTER tabCreated ' + tab.url + ' with tabId ' + tab.id);
  // alert(createdQueue.length);
  // alert(createdQueue[tab.id]);
  //
  // alert('tabCreated: ' + tab.title);
  // add new tab to page tree after currently focused tab
  // addPage(tab, focusedtabId);
  // this is insufficient because it only executes at document_idle
  // we want it to execute at document_start
  // chrome.tabs.executeScript(tab.id, {code:"alert(document.referrer)"});
}

// function executeInSidebar(fn)
// {
//   if (sidebarWindow && sidebarReady && sidebarDOMWindow)
//   {
//     console.log('>>> executeInSidebar: ' + fn.toString());
//     try {
//       fn(sidebarDOMWindow);
//     }
//     catch(e) {
//       console.warn('Could not execute the following method on sidebarDOMWindow: ' + fn.toString());
//       console.log(e);
//     }
//   }
// }

function tabUpdated(tabId, changeInfo, tab)
{
  chrome.tabs.get(tabId, function(tab) {
    console.log('tabUpdated ' + tabId + ' ' + JSON.stringify(changeInfo) + '; ' + JSON.stringify(tab));
    // // alert(tab.url);
    // if(changeInfo.status == "loading") {
    //   chrome.tabs.executeScript(tabId, { code: "postPageLoading('u', " + tab.windowId + ", " + tabId + ")" });
    // }
    if (sidebarTab && tabId == sidebarTab.id)
    {
      console.log('tabUpdated with sidebar tab, doing nothing');
      return;
    }

    storeTabDetails(tab);

    // Only try to get a referrer when the page is done loading since our getPageDetails request will only
    // execute once the page has fully loaded anyway
    if (changeInfo.status == 'complete')
    {
      console.log('tabUpdated to status of complete');
      executeGetPageDetailsContentScript(tab.url, tabId);
      //chrome.tabs.executeScript(tab.id, { code: "postPageLoading('c', " + tab.windowId + ", " + tab.id + ")" });
    }
  });
}


function tabSelectionChanged(tabId, selectInfo)
{
  console.log('tabSelectionChanged');

  if (sidebarTab && tabId == sidebarTab.id) {
    return; // ignore if switching to the sidebar tab
  }

  setSelectedTabId(tabId);
}


function setSelectedTabId(tabId)
{
  selectedTabId = tabId;
  notifySidebar('modelPageSelectionChanged', { pageId: tabId });
  // chrome.extension.sendRequest( { op: 'modelPageSelectionChanged', tabId: tabId } );
  // executeInSidebar(function(sidebar) { sidebar.pageSelectionChanged(tabId); });
}


function notifySidebar(op, details)
{
  if (!sidebarWindow || !sidebarReady)
    return;
  details.op = op;
  chrome.extension.sendRequest( details );
}

