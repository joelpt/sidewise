# sidewise
Persistent sidebar extension for Chrome featuring tree style tabs and tab hibernation.

This is the initial commit to github of the Sidewise codebase, in preparation for making it public.

## Todos: go public

* remove donation flow
* revisit core files for basic correctness and comprehensibility
* strip out any dead code from content-script.js re: now-defunct video player tracking support
* revisit grunt config and make sure it is clean
* reset license to plain MIT
* remove specialized super() behavior

## Todos: top known issues

* In some cases, Sidewise can get 'out of sync' between Chrome's tab bar and Sidewise's tree. This may be connected to a problem in onTabCreated() where an error accessing tab.id, tab.windowId, or tab.openerTabId.
* The MonitorInfo class and 'detect-monitor.html' file exist solely to workaround a deficiency Chrome had with regard to providing accurate multiple-monitor metrics data when this was implemented (ca. 2012). It is probable (but untested) that this code is no longer necessary; see https://developer.chrome.com/docs/extensions/reference/system_display/
* The ChromeWindowFocusTracker class exhibits problematic behavior on some Linux window managers. This most likely is related to the particular sequence of window events raised on Windows vs Linux.
* The right-click menu within Sidewise does not work properly on MacOS: the menu closes immediately upon mouse release. Most likely related to the particular sequence of mouse events raised on Windows vs MacOS.
