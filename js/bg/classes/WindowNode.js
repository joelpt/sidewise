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
    this.title = WINDOW_DEFAULT_TITLE;
    this.id = 'w' + this.UUID;

    if (win) {
        this.chromeId = win.id;
        this.incognito = win.incognito;
        this.type = win.type;
        return;
    }

    this.incognito = false;
    this.type = 'normal';
    this.hibernated = true;

    this.restored = false;
    this.restorable = false;
    this.old = false;
};

extendClass(WindowNode, PageTreeNode, {});