///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var WINDOW_DEFAULT_TITLE = getMessage('text_Window');


///////////////////////////////////////////////////////////
// WindowNode
///////////////////////////////////////////////////////////

/**
  * @constructor
  * @extends PageTreeNode
  */
var WindowNode = function(win)
{
    this.$base();

    this.elemType = 'window';
    this.id = 'w' + win.id;
    this.title = WINDOW_DEFAULT_TITLE;
    this.incognito = win.incognito;
    this.type = win.type;
};

extendClass(WindowNode, PageTreeNode, {});