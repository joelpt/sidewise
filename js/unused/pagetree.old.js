function placePageInTree(page)
{
  var referrer = page.attr('referrer');
  var historylength = page.attr('historylength');
  var tabId = page.attr('id');

  // if (historylength > 1)
  // {
  //   // This page was either duplicated from another page or was reopened via e.g. Ctrl-
  // }
  if (!referrer)
  {
    console.log('no referrer: appending page to top level children');
    // Tab was not opened from a link, but was opened from address bar, bookmarks, or duplicated
    // from a tab opened in one of these ways. Append the new tab to the top level children of our tree.
    tree.append(page);
    console.log('**** calling addPageRow without positional arguments');
    notifySidebar('modelRootPageAdded', { pageId: tabId });
    // executeInSidebar(function(sidebar) { sidebar.addPageRow(page); });
    return;
  }

  // Tab was opened from a link or in page JS event (has a referrer) or duplicated from such a tab.
  // Therefore the parent tab should exist. Append the new tab to the children of this parent tab.

  // If the currently selected tab has a url matching referrer, make it a child of that
  if (selectedTabId)
  {
    var selectedPage = getPageByTabId(selectedTabId);
    var selectedPageUrl = selectedPage.attr('url');
    if (selectedPageUrl == referrer)
    {
      selectedPage.append(page);
      underId = selectedPage.attr('id');
      console.log('**** calling addPageRow with selected-tab parent id ' + underId);
      notifySidebar('modelChildPageAdded', { pageId: tabId, parentPageId: underId });
      // executeInSidebar(function(sidebar) { sidebar.addPageRow(page, underId); });
      return;
    }
  }

  // Try to find the parent by matching parent's url to our referrer, but never ourselves
  var urlSelector = dropUrlHash(referrer).replace('"', '\\"');
  var parentPages = tree.find('page[url="' + urlSelector + '"]:not(#' + tabId + ')');

  // filter out of parentPage list any pages which have a PARENT of tabId -- we can't make this tabId
  // a child of a tab which is also a child of tabId
  parentPages = parentPages.filter(function(i) {
    return $(this).closest('page#' + tabId).length == 0; // returns true when matching parent page found
  });

  // get the lowest-id page from the list (prevents unnecessarily deep nesting of pages)
  parentPages = parentPages.sort(function(a, b) { return a.id - b.id; });
  var parentPage = parentPages.first();

  if (parentPage.length == 0)
  {
    tree.append(page);
    console.log('**** calling addPageRow without positional arguments');
    // executeInSidebar(function(sidebar) { sidebar.addPageRow(page); });
    notifySidebar('modelRootPageAdded', { pageId: tabId });
    // console.log('Did not find parent by parenturl-referrer match, trying versus host');
    // // Try to find the parent by matching parent's host to our referrer-host
    // // ** THIS IS NOT a good way to approach it: in this instance we should really try to match
    // // ** against the *currently selected* tab's url - trying to see if it is qualified to be our parent.
    // var parentPage = tree.find('page[host="' + splitUrl(referrer).host + '"]');
    // throw "Could not find expected parent page with url matching referrer: " + referrer;
  }
  else {
    console.log('Attaching to parent page #' + parentPage.attr('id'));
    parentPage.append(page);
    console.log('**** calling addPageRow with parent id ' + parentPage.attr('id'));
    notifySidebar('modelChildPageAdded', { pageId: tabId, parentPageId: parentPage.attr('id') });
    // executeInSidebar(function(sidebar) { sidebar.addPageRow(page, parentPage.attr('id')); });
  }
  // if (msg.historylength == 1)
  // {
  //   // Tab was created by opening a link from an existing tab into a new tab (we have referrer
  //   // and history length of 1), or was duplicated from such a tab.

  // }
}
