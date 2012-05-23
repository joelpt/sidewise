//var dragToChildSensitivityRatio = 0.65;
var dragToNextTolerance = 12;
var slideTitleSpeed = 5;
var slideTitleStartDelay = 2250;

var background;

var focusedTabId = null;
var scrollFast = false;
var scrollFastResetter = null;
var multiSelection = new Array();
var lastMultiSelectedTabId = null;
var lastMultiSelectedFromTabId = null;
var contextMenuShown = false;
var contextMenuTarget = null;
var dragging = false;
var draggingToNext = false;
var draggingOverPageRow = null;

var draggableParams = {
  cursorAt: { top: 40, left: -20 },
  distance: 5,
  delay: 50,
  helper: function(e, ui)
  {
    console.log('helper call');
    console.log(e);
    console.log(ui);
    console.log(this);
    var multiSelectionFakeLength = (multiSelection.length == 0 ? 1 : multiSelection.length);
    return '<div class="dragHelper"><b>Moving ' + multiSelectionFakeLength + ' tab' + (multiSelectionFakeLength == 1 ? '' : 's') + '</b></div>';
  },
  revert: 'invalid',
  opacity: 1,
  revertDuration: 300,
  scroll: true,
  start: function(e, ui) {
    dragging = true;
    if (multiSelection.length == 0 || !$(e.target).parent().hasClass('selected'))
    {
      console.log('resetting multiselection before dragging');
      var pageRow = $(e.target).closest('.pageRow');
      pageRowClicked(pageRow);
      clearMultiSelection();
      multiSelection.push(pageRow.attr('id'));
    }
  },
  stop: function(e, ui) {
    dragging = false;
    $('.dragToChild').removeClass('dragToChild');
    $('.dragToNext').removeClass('dragToNext');
    if (multiSelection.length == 1)
    {
      clearMultiSelection();
    }
  }
  // },
  // drag: function(e, ui) {
  //   var over = $(e.target);
  //   var overPageRow = over.closest('.pageRow');
  //   var rowHeight = overPageRow.height();
  //   var topDelta = e.pageY - overPageRow.position().top;

  //   console.log(topDelta > rowHeight / 2);
  //   console.log('should be over tab id ' + overPageRow.attr('id'));
  //   var isOnLowerHalf = (topDelta > rowHeight / 2);

  //   $('.dragToNext').removeClass('dragToNext');
  //   overPageRow.addClass('dragToNext');

  // }
};

var droppableParams = {
  accept: '.innerRow',
  tolerance: 'pointer',
  hoverClass: 'dragOver',
  drop: function(e, ui) {
    console.log('drop!');
    console.log(e.target);
    console.log(ui);
    console.log(multiSelection.length);
    console.log(draggingOverPageRow.attr('id'));
    console.log(draggingToNext);
    console.log('!pord');

    console.log('PERFORM DROP');

    var overTabId = draggingOverPageRow.attr('id');
    for (index in multiSelection)
    {
      var tabId = multiSelection[index];
      console.log('moving ' + tabId + ' draggingToNext ' + draggingToNext);
      if (draggingToNext)
      {
        var siblingPageRow = getPageRowByTabId(overTabId);
        var parentTabId = siblingPageRow.parents('.pageRow:first').attr('id');
        var afterSiblingTabId = overTabId;
        movePageRow(getPageRowByTabId(tabId), parentTabId, afterSiblingTabId);
      }
      else
      {
        movePageRow(getPageRowByTabId(tabId), overTabId, -1);
      }
    }

    // clearMultiSelection();
  },
  over: function(e, ui) {
    document.title = 'over ' + e.target.parentNode.id;
    console.log(e);
    console.log(ui);
  }
};

  // Defining a jQuery selector :icontains() which is a case-insensitive :contains()
$.expr[':'].icontains = function(obj, index, meta, stack){
return (obj.textContent || obj.innerText || jQuery(obj).text() || '').toLowerCase().indexOf(meta[3].toLowerCase()) >= 0;
};

$(document).ready(onLoad);

function onLoad()
{
  // local page event handlers
  $('div.innerRow').live('mousedown', onInnerRowMouseDown);
  $('div.innerRow').live('mouseup', onInnerRowMouseUp);
  $('div.innerRow').live('mousemove', onInnerRowMouseMove);

  // these two are used for sliding the page title on mousehover
  $('div.innerRow').live('mouseenter', onPageTitleMouseOver);
  $('div.innerRow').live('mouseleave', onPageTitleMouseOut);

  $('ins.treeDropDown').live('mousedown', onTreeDropDownClicked);
  $('input#pageFilter').keyup(onPageFilterModified);
  $('input#pageFilter').click(onPageFilterModified);
  $('ul#pageRowContextMenu a').click(onContextMenuItemClicked);
  $('div#outerContainer').click(onOuterContainerClicked);
  document.oncontextmenu=onContextMenu;
  window.onresize = function(evt) {
    chrome.extension.sendRequest( { op: 'windowResized' } );
  }

  // Set up the page DOM
  $('div#pageFilterStatus').hide();

  // Load the pages
  drawInitialPageList();

  // Set focus to current tab
  focusPageRow(chrome.extension.getBackgroundPage().selectedTabId);

  // Let everyone know we are ready for operation
  chrome.extension.getBackgroundPage().sidebarReady = true;
  chrome.extension.getBackgroundPage().sidebarDOMWindow = window;

  chrome.extension.onRequest.addListener(onRequest);

  // chrome.windows.get(tab.windowId, function(win) {
  //     //sidebarDOMWindow = chrome.extension.getViews({windowId: win.id})[0];
  //     sidebarWindow = win; // setting this signifies to the rest of the code logic that the sidebar win/tab is ready for operation
  //   });

}

function onRequest(request, sender, sendResponse)
{
  console.log('onRequest: ' + JSON.stringify(request));
  console.log(JSON.stringify(sender));
  switch (request.op)
  {
    case 'modelRootPageAdded':
      addPageRow(getPageFromModel(request.pageId));
      return;
    case 'modelChildPageAdded':
      addPageRow(getPageFromModel(request.pageId), request.parentPageId);
      return;
    case 'modelPageSelectionChanged':
      focusPageRow(request.pageId);
      return;
    case 'modelPageUpdated':
      updatePageRow(getPageFromModel(request.pageId));
      return;
    case 'modelPageRemoved':
      removePageRow(request.pageId);
      // executeInSidebar(function(sidebar) { sidebar.removePageRow(tabId); });
    default:
      throw 'Unrecognized onRequest op ' + request.op;
  }
}


function getPageFromModel(tabId)
{
  return background.tree.getPage(tabId);
}


var slideTargetTabId;
var slideTarget;
var slideTargetMaxWidth;
var slide_timer;
var slide_timer_reset;
var slide = function () {
  // console.log('sliding');
  if (!slideTarget)
  {
    return;
  }

  // console.log('sliding ' + slideTarget[0].className);
  // console.log(slideTarget.scrollLeft());
  var before = slideTarget.scrollLeft();
  slideTarget.scrollLeft(before + slideTitleSpeed);
  if (slideTarget.scrollLeft() > before) {
    // console.log('can still dos omethi' + slideTargetMaxWidth);
    clearTimeout(slide_timer);
    clearTimeout(slide_timer_reset);
    slide_timer = setTimeout(slide, 40);
  }
  else {
    // terminate sliding and reset
    // console.log('wtf');
    clearTimeout(slide_timer);
    slide_timer_reset = setTimeout(resetSliding, 1000);
  }
  // console.log('became ' + slideTarget.scrollLeft());
};

function onPageTitleMouseOver(e)
{
  // console.log('over');
  var innerRow = $(e.target).closest('div.innerRow');
  var pageRow = innerRow.parent();
  var tabId = pageRow.attr('id');

  if (tabId == slideTargetTabId)
  {
    return; // mouseover of a subelement of the page row already being slided
  }

  clearTimeout(slide_timer);
  clearTimeout(slide_timer_reset);
  resetSliding(); // reset existing sliding element before starting another

  slideTargetMaxWidth = pageRow.width();
  slideTargetTabId = tabId;
  slideTarget = innerRow;
  slide_timer = setTimeout(slide, slideTitleStartDelay);
}

function onPageTitleMouseOut(e)
{
  // if ($(e.target).hasClass('innerRow'))
  // {
    clearTimeout(slide_timer);
    clearTimeout(slide_timer_reset);
    resetSliding();
  // }
  // console.log('out');

}

function resetSliding()
{
  if (slideTarget)
  {
    slideTarget.scrollLeft(0);
    slideTarget = null;
    slideTargetMaxWidth = null;
    slideTargetTabId = null;
  }
}

function onInnerRowMouseMove(evt)
{
  if (!dragging)
  {
    return;
  }
  console.log(evt.target.className);
  var over = $(evt.target);
  var overPageRow = over.closest('li.pageRow');
  var rowHeight = overPageRow.height();
  var topDelta = evt.pageY - overPageRow.position().top;

  console.log(topDelta > rowHeight / 2);
  //console.log(evt.pageX + ', ' + evt.pageY + ' .. ');
  //console.log(overPageRow.attr('id'));
  //console.log(over.position().left + ', ' + over.position().top);
  // var isOnLowerHalf = ( (topDelta / rowHeight) > dragToChildSensitivityRatio );
  // draggingToNext = !isOnLowerHalf;
  draggingToNext = (rowHeight - topDelta < dragToNextTolerance);

  $('.dragToChild').removeClass('dragToChild');
  $('.dragToNext').removeClass('dragToNext');

  if (draggingToNext)
  {
    overPageRow.addClass('dragToNext');
  }
  else
  {
    overPageRow.addClass('dragToChild');
  }

  draggingOverPageRow = overPageRow;
}


function onOuterContainerClicked(evt)
{
  disableContextMenu();

  if (evt.target.id == 'outerContainer')
  {
    // clicked in the whitespace - clear multiselection
    clearMultiSelection();
    return false;
  }

  if (evt.shiftKey || evt.ctrlKey || multiSelection.length > 0)
  {
    // don't focus a new pagerow if this was a multiselection click
    return false;
  }

  //clearMultiselection();

  // // get the page hovered
  // var pageRow = $(evt.target).closest('.pageRow');

  // if (pageRow.length == 1)
  // {
  //   pageRowClicked(pageRow);
  //   //focusPageRow(pageRow.attr('id'));
  // }

  return false;
}

function onContextMenu(evt)
{
  console.log('context menu.');
  console.log(evt);

  if (contextMenuShown)
  {
    disableContextMenu();
    clearMultiSelection();
    return false;
  }

  // get the page hovered
  var pageRow = $(evt.target).closest('.pageRow');

  if (pageRow.length == 0) {
    // didn't click a pageRow
    return false;
  }

  var tabId = pageRow.attr('id');

  if (multiSelection.length == 0 // Unless we've multiselected some pageRows..
    || !pageRow.hasClass('selected')) // or the hovered pageRow isn't part of the multiselect
  {
    clearMultiSelection();
    focusPageRow(tabId);
    setSelectedChromeTab(tabId);
    // show apparent focus for the hovered pageRow
    // addSelectionEffect(pageRow);
  }

  enableContextMenu(evt.pageX, evt.pageY);
  contextMenuTarget = pageRow;

  return false;
}


// show context menu positioned at mouse click
function enableContextMenu(x, y)
{
  var menu = $('#pageRowContextMenu');
  menu.css({ top: y, left: x });
  menu.show();
  contextMenuShown = true;
}


function disableContextMenu()
{
  // hide context menu
  if (!contextMenuShown)
  {
    return false;
  }

  $('#pageRowContextMenu').hide();
  contextMenuShown = false;

  // // reset page focus
  // removeSelectionEffect(contextMenuTarget);
}


function onContextMenuItemClicked(evt)
{
  // hide the context menu
  disableContextMenu();

  var tabIds;
  if (multiSelection.length == 0)
  {
    tabIds = [contextMenuTarget.attr('id')];
  }
  else
  {
    tabIds = multiSelection;
  }
  console.log(evt.target.name);
  console.log(tabIds);
  switch(evt.target.name)
  {
    case 'close':
      // Close tab/s
      tabIds.forEach(function(tabId)
      {
        chrome.tabs.remove( parseInt(tabId) );
      });

      var closedPageRow = getPageRowByTabId(tabIds[0]);
      switchFocusForClosingPageRow(closedPageRow);

      clearMultiSelection(); // since every page in multiselection no longer exists
      break;
    case 'reload':
      // Reload tab/s
      for (var i in tabIds)
      {
        chrome.tabs.executeScript( parseInt(tabIds[i]), { code: "window.location.reload();" } );
      }
      break;

    default:
      throw 'Unrecognized context menu item ' + evt.target.name;
  }
}


function onPageFilterModified(e)
{
  if (e.keyCode == 27) // Esc key pressed
  {
    // Clear any existing filter
    e.target.value = '';
  }

  var filter = e.target.value;

  console.log('onPageFilterModified: ' + filter);
  if (filter.length == 0)
  {
    // no filter present
    $('#sidebarContent').removeClass('filtered');
    //$('#pageFilterStatus').removeClass('enabled');
    $('.pageRow.filterMatch').removeClass('filterMatch');
    //$('#pageFilterStatus').slideUp(200, function() { return; }); //addClass('enabled');
    $('#pageFilterStatus').hide();
  }
  else
  {
    // filter is present
    $('#sidebarContent').addClass('filtered');
    $('.pageRow.filterMatch').removeClass('filterMatch');
    //$('#pageFilterStatus').slideDown(200, function() { return; }); //addClass('enabled');
    $('#pageFilterStatus').show();
    $('#sidebarContent')
      .find('.pageTitle:icontains("' + filter + '")')
      .each(function(i, e) {
        $(e).closest('.pageRow').addClass('filterMatch');
      });
  }
}


function drawInitialPageList()
{
  background = chrome.extension.getBackgroundPage();
  base = $('#sidebarContent');
  background.tree.children().each(function(i, e) {
      base.append(getNewPageRowWithChildren(e));
  });
}


function onTreeDropDownClicked(e)
{
  var dropDown = $(e.target);
  dropDown.toggleClass('collapsed');

  var ul = dropDown.closest('li').children('ul');
  ul.slideToggle(100, function() { ul.toggleClass('collapsed'); });


}


function getPageRowByTabId(tabId)
{
  return $('#sidebarContent #' + tabId);
}


// Update pageRow with data from page. If pageRow is not provided
// we find it by page.id instead
function updatePageRow(page, pageRow)
{
  console.log('updatePageRow');
  console.log(page);
  console.log(pageRow);
  var tabId = page.attr('id');
  if (!pageRow) {
    pageRow = getPageRowByTabId(tabId);
    if (pageRow.length == 0)
    {
      console.log('updatePageRow: could not find existing pageRow with id ' + tabId);
      return;
    }
  }

  var innerRow = pageRow.children('.innerRow');
  var favicon = innerRow.children('.favicon');

  // update title
  // var titleText = tabId + ': ' + page.attr('title');
  var titleText = page.attr('title');
  innerRow.children('.pageTitle').text(titleText);

  // update favicon
  favicon.attr('src', page.attr('favicon'));

  console.log('favicon for #' + tabId + ' status ' + page.attr('status') + ' set to: ' + $('#' + tabId + ' > .innerRow > .favicon').attr('src'));
  console.log('input favicon was ' + page.attr('favicon'));


  // set favicon 'preloading' animation
  if (page.attr('status') == 'preload') {
    // favicon.attr('src', '/images/throbber1frame.png');
    favicon.removeClass('loading');
    favicon.addClass('preload');
    return;
  }

  // set favicon 'loading' animation
  if (page.attr('status') == 'loading') {
    // favicon.attr('src', '/images/trans16.png');
    // favicon.attr('src', '/images/throbber1frame.png');
    favicon.removeClass('preload');
    favicon.addClass('loading');

    if (focusedTabId != tabId) {
      // set rows in 'loading' state to 'unread', unless
      // the row is the currently focused one
      pageRow.addClass('unread');
    }
    return;
  }

  // remove any pre/loading animations
  favicon.removeClass('loading').removeClass('preload');
  return;
}


// TODO: debug this so it works as expected; could possibly take a slight refactor re: the concept of afterSiblingId
// pass -1 for afterSiblingId to make this the first page under parent
function movePageRow(pageRow, parentTabId, afterSiblingTabId)
{
  var currentParentRow = pageRow.parent().closest('li');
  var currentParentTabId;
  var parentPageRow = getPageRowByTabId(parentTabId);

  if (currentParentRow.length == 1) {
    currentParentTabId = currentParentRow.attr('id');
  }

  if (afterSiblingTabId == -1)
  {
      parentPageRow.children('ul').prepend(pageRow);
      adjustTreeControl(parentPageRow);
  }
  else if (afterSiblingTabId)
  {
    getPageRowByTabId(afterSiblingTabId).after(pageRow);
    adjustTreeControl(parentPageRow);
  }
  else if (parentTabId != currentParentTabId)
  {
    if (parentTabId)
    {
      parentPageRow.children('ul').append(pageRow);
      adjustTreeControl(parentPageRow);
    }
    else
    {
      $('#sidebarContent').append(pageRow);
    }
  }

 if (currentParentTabId)
  {
    adjustTreeControl(currentParentRow);
  }

  scrollToElem(pageRow);
}


function adjustTreeControl(pageRow)
{
  var ul = pageRow.children('ul');
  var control = pageRow.find('ins:first');

  if (ul.children().length == 0)
  {
    if (!control.hasClass('treeNode'))
    {
      control.removeClass();
      control.addClass('treeNode');
      ul.removeClass('collapsed');
    }
  }
  else
  {
    if (!control.hasClass('treeDropDown'))
    {
      control.removeClass();
      ul.removeClass('collapsed');
      control.addClass('treeDropDown');
    }
  }
}

function addPageRow(page, parentTabId, afterSiblingTabId)
{
  var existingPageRow = getPageRowByTabId(page.attr('id'));
  console.log('addPageRow');
  if (existingPageRow.length == 1) // page row already exists
  {
    movePageRow(existingPageRow, parentTabId, afterSiblingTabId);
    updatePageRow(page, existingPageRow);
    scrollToElem(existingPageRow[0]);
  }
  else
  {
    var newRow = getNewPageRow(page, false);
    updatePageRow(page, newRow);

    var parentRow = [];
    var parentUL = [];

    if (parentTabId) {
      parentRow = getPageRowByTabId(parentTabId);
      if (parentRow.length == 1)
      {
        parentUL = parentRow.children('ul')
      }
    }

    if (parentUL.length == 0)
    {
      parentUL = $('ul#sidebarContent:first');
    }

    if (afterSiblingTabId >= 0) {
      parentUL.children('#' + afterSiblingTabId)
        .after(newRow);
    }
    else {
      parentUL.append(newRow);
    }

    if (parentRow.length == 1)
    {
      adjustTreeControl(parentRow);
    }

  }
}


function getNewPageRow(page, hasChildren)
{
  var tabId = page.attr('id');
  var row = $('<li class="pageRow">').attr('id', tabId);

  var inner = $('<div class="innerRow">');

  // Make the row drag&droppable
  inner.draggable(draggableParams);
  inner.droppable(droppableParams);

  var dropdown = $('<ins>');
  if (hasChildren) {
    dropdown.addClass('treeDropDown');
  }
  else {
    dropdown.addClass('treeNode');
  }

  var favicon = $('<img class="favicon">')
    .attr('src', page.attr('favicon'));
  favicon.error(setFaviconOnError);

  //var titleText = tabId + ': ' + page.attr('title');
  var titleText = page.attr('title');
  var urlText = page.attr('url');
  var pageTitle = $('<div class="pageTitle">')
    .attr('title', urlText)
    .text(titleText);

  // var spanTitle = $('<span class="titleText">').text(titleText);
  // pageTitle.append(spanTitle);

  // var spanUrl = $('<span class="urlText">').text(urlText);
  // pageTitle.append(spanUrl);

  var closeButton = $('<ins class="closeButton"/>');

  row.append(dropdown);
  inner.append(favicon);
  //inner.append(closeButton);
  // TODO: implement a floating close button that
  //    (1) receives clicks above innerRow;
  //    (2) properly obscures the text underneath
  //        * if following chrome's pattern, use grey X on EVERY page which turns red on hover, and fade the right edge of the page title as it approaches the button
  //    for now we'll be content with right click->Close, or just the middle click
  inner.append(pageTitle);
  row.append(inner);

  // Container for potential future child pages
  row.append('<ul class="children">');

  return row
}


function getNewPageRowWithChildren(page)
{
  var p = $(page);
  // console.log(p);
  var has_kids = (p.children().length > 0);
  var row = getNewPageRow(p, has_kids);
  var ul = row.find('ul');
  p.children().each( function(i, e) {
    // console.log(i); //row.append(getNewPageRowWithChildren(e));
    ul.append(getNewPageRowWithChildren(e));
  });
  row.append(ul);
  return row;
}


function setFaviconOnError(e)
{
  var src = e.target.src;

  if (src == 'chrome://favicon')
  {
    // this should never happen; this is chrome's default favicon and should
    // never come back on error.
    return;
  }

  if (src.match('^chrome://favicon/.+'))
  {
    // got an error on a chrome://favicon url so just try to set it to the default favicon
    // (this should never happen)
    e.target.src = 'chrome://favicon';
    return;
  }

  // regular icon url probably returned a 404. try to use chrome's internal favicon
  // for the site instead
  e.target.src = 'chrome://favicon/' + src;
  console.log(e);

}


function onInnerRowMouseDown(evt)
{
  if (evt.which == 2) { // catch middle-mouse click event
    return false; // eat middle click event to avoid the autoscroll cursor
  }

  // if (evt.which == 3)
  // {
  //   // right click, show the context menu
  //   evt.stopPropagation();
  //   $('#pageRowContextMenu').show();
  //   return false;
  // }
}


function onInnerRowMouseUp(evt)
{
  if (contextMenuShown) {
    disableContextMenu();
    return;
  }

  if (dragging)
  {
    return;
  }

  // if (evt.which == 3) // right mouse button
  // {
  //   evt.stopPropagation();
  //   return false; // just eat it
  // }

  if (evt.which == 1) // left mouse button
  {
    // Page row clicked. We handle this in mouseup rather than mousedown
    // because if done in mousedown it causes the sidebar and main windows to
    // switch focus back and forth repeatedly.
    var pageRow = $(this).closest('li');
    var tabId = pageRow.attr('id');
    var fromTabId = (lastMultiSelectedTabId || focusedTabId); // takes first non-null

    if (evt.ctrlKey)
    {
      lastMultiSelectedFromTabId = null; // break shift+selection expanding selection chain

      if (evt.shiftKey)
      {
        // Ctrl+Shift: Incrementally add spans of rows to current multiselection
        addMultiSelectionBetween(fromTabId, tabId);
        console.log('betweening ctrl+shift');
      }
      else
      {
        // Ctrl: Un/select a single row
        // Do we have any multiselection yet? If not, add the current focused tabId
        // in addition to the clicked row
        if (multiSelection.length == 0)
        {
          toggleMultiSelectionSingle(focusedTabId);
          console.log('add focusedtabid to selection');
        }
        toggleMultiSelectionSingle(tabId);
        console.log('add new tab to selection ' + tabId);
      }
    }
    else if (evt.shiftKey && fromTabId)
    {
      // Shift: Start or expand a multiselection spanning multiple rows
      // alert(tabId);
      // alert(fromTabId);
      // alert(lastMultiSelectedTabId);
      // alert(lastMultiSelectedFromTabId);

      // Start a new selection
      if (!lastMultiSelectedFromTabId)
        clearMultiSelection();
      else
        fromTabId = lastMultiSelectedFromTabId;

      // focus other end of span-selection so we aren't indicating that a currently-focused page row
      // which is outside of our span is part of the multiselection
      pageRowClicked(getPageRowByTabId(fromTabId));
      addMultiSelectionBetween(tabId, fromTabId);
      lastMultiSelectedFromTabId = fromTabId;

      console.log('betweening plain shift (restarting list)');
    }
    else
    {
      // Regular click: clear any existing multiselection and switch to the page row
      clearMultiSelection();
      pageRowClicked(pageRow);
    }

    lastMultiSelectedTabId = tabId;

    if (multiSelection.length > 0)
    {
      $('#sidebarContent').addClass('multiselecting');
    }

    return false;
  }

  if (evt.which == 2) // middle mouse button closes the page which was middle-clicked
  {
    var pageRow = $(this).closest('li');
    var tabId = pageRow.attr('id');

    if (tabId == focusedTabId)
    {
      // Currently focused tab will be closed, use Sidewise magic to pick next focus
      switchFocusForClosingPageRow(pageRow);
    }
    else
    {
      // Ensure our focus remains on the tab we're already on (don't let Chrome take over)
      // TODO: refactor use of getBP.setSelectedTabId, setSelectedChromeTab, and focusPageRow with/within one another
      chrome.extension.getBackgroundPage().setSelectedTabId(tabId);
      setSelectedChromeTab(tabId);
    }

    chrome.tabs.remove( parseInt( tabId ) );

    return false; // eat middle click event
  }
}


function toggleMultiSelectionSingle(tabId)
{
  var pageRow = getPageRowByTabId(tabId);
  var index = multiSelection.indexOf(tabId);
  if (index > -1)
  {
    // already in selection so remove it
    multiSelection.splice(index, 1);
    removeSelectionEffect(pageRow);
  }
  else
  {
    // add to selection
    multiSelection.push(tabId);
    addSelectionEffect(pageRow);
  }
}


function addMultiSelectionBetween(fromTabId, toTabId)
{
  fromTabId = fromTabId.toString();
  toTabId = toTabId.toString();

  // if fromTabId and toTabId are the same, just do a single selection
  if (fromTabId == toTabId) {
    toggleMultiSelectionSingle(fromTabId);
    return;
  }

  // flatten the tree and get the ids in the visible page order disregarding nesting
  var flattened = [];
  if ($('#sidebarContent').hasClass('filtered')) {
    // when list is filtered, only select pages which match the filter
    $('.pageRow.filterMatch').forEach(function(i, e) { flattened.push(e.id); });
  }
  else {
    // all pages
    $('.pageRow').map(function(i, e) { flattened.push(e.id); });
  }

  // find index of start and end tabs
  var start = flattened.indexOf(fromTabId);
  var end = flattened.indexOf(toTabId);

  if (start == -1 || end == -1)
  {
    throw 'Could not find both start and end indices';
  }

  // switch start and end around if start doesn't precede end
  if (start > end)
  {
    var swap = start;
    start = end;
    end = swap;
  }

  // get the list of ids between start and end inclusive
  var range = flattened.slice(start, end + 1);

  // add these to multiSelection
  range.forEach(function(e) {
    if (multiSelection.indexOf(e) == -1) {
      multiSelection.push(e);
      addSelectionEffect(getPageRowByTabId(e));
    }
  });

  return;
}


function clearMultiSelection()
{
  if (multiSelection.length == 0) {
    return;
  }

  multiSelection.forEach(function(e) {
      removeSelectionEffect(getPageRowByTabId(e));
  });
  multiSelection = new Array();
  lastMultiSelectedTabId = null;
  lastMultiSelectedFromTabId = null;
  $('#sidebarContent').removeClass('multiselecting');
}



// Moves focus away from a pageRow which will be removed soon;
// we use some logic to make the new pageRow focused be
// reasonably 'smart' and sensical within the context
// of the tree based navigation: navigate to children,
// later siblings, earlier siblings, and parent in that order
function switchFocusForClosingPageRow(pageRow)
{
  // Tab-closing order (what shows after tab close):
  // if we have a child, focus it
  var focus = pageRow.children('ul').children().first();
  if (focus.length == 0) {
    // if we have a .next() sibling, focus it
    focus = pageRow.next();
    if (focus.length == 0) {
      // if we have a .prev() sibling, focus it
      focus = pageRow.prev();
      if (focus.length == 0) {
        // if we have a .parent() page, focus it
        focus = pageRow.parent().closest('li');

        // else we'll let chrome decide on its own
        // (probably no tabs are open by here)
      }
    }
  }

  // We found a favored focus target
  if (focus.length > 0) {
    focusPageRow(focus.attr('id'));
  }
  else
  {
    // Safety code: focus tree on whatever Chrome
    // chooses to focus on. This should only really
    // happen if we run out of pages in the tree
    // to focus on.
    chrome.tabs.getSelected(null, function(tab) {
      focusPageRow(tab.id);
    });
  }
}


function pageRowClicked(pageRow)
{
  console.log('pageRowClicked');
  var tabId = pageRow.attr('id');
  //focusPageRow(tabId);
  //chrome.extension.getBackgroundPage().setSelectedTabId(tabId);
  background.initiatedWindowFocusChange = true;
  setSelectedChromeTab(tabId);
}


function onPageSelectionChanged(tabId)
{
  focusPageRow(tabId);
}


function removePageRow(tabId)
{
  console.log('removePageRow');
  var pageRow = getPageRowByTabId(tabId);
  switchFocusForClosingPageRow(pageRow);
  var parent = pageRow.parent().closest('li');
  pageRow.replaceWith(pageRow.children('ul').children());
  if (parent) {
    adjustTreeControl(parent);
  }
}


function markPageRowAsUnread(tab)
{
  $('#' + tab.id).addClass('unread');
}


function focusPageRow(tabId)
{
  console.log('focusPageRow: tabId ' + tabId + ', focusedTabId ' + focusedTabId);

  // if (tabId == focusedTabId) return;
  if (focusedTabId) {
    lastFocus = $('#' + focusedTabId);

    if (lastFocus.length == 1)
    {
      lastFocus.removeClass('focused');
    }
  }

  try {
    focusedTabId = tabId.toString();
  }
  catch(e) {
    console.error(e.stack);
    throw 'Null tabId in focusPageRow';
  }

  focus = $('#' + tabId);
  focus.addClass('focused');
  focus.removeClass('unread');


  scrollToElem(focus);
}


function addSelectionEffect(pageRow)
{
  pageRow.addClass('selected');
}


function removeSelectionEffect(pageRow)
{
  pageRow.removeClass('selected');
}


function scrollToElem(e)
{
    y = e.offset().top;

    // is element above or below the visible page?
    if (y < window.pageYOffset || y > window.pageYOffset + window.innerHeight)
    {
      // autoscroll sidebar to the focused page
      if (scrollFast) {
        $.scrollTo(e, 1);
        clearTimeout(scrollFastResetter);
        console.log('scrollFast');
      }
      else {
        scrollFast = true;
        $.scrollTo(e, 150);
        console.log('scrollSlow');
      }
      scrollFastResetter = setTimeout(function() { scrollFast = false; }, 150);
    }
}


function setSelectedChromeTab(tabId)
{
  chrome.tabs.update(parseInt(tabId), { selected: true } );
}

