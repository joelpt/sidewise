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

    if (win) {
        this.id = 'w' + win.id;
        this.incognito = win.incognito;
        this.type = win.type;
        return;
    }

    this.id = 'wH' + this.UUID;
    this.incognito = false;
    this.type = 'normal';
    this.hibernated = true;
};

extendClass(WindowNode, PageTreeNode, {});