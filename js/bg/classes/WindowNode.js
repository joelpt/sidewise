/**
  * @constructor
  * @extends PageTreeNode
  */
var WindowNode = function(win)
{
    this.$base();

    this.elemType = 'window';
    this.id = 'w' + win.id;
    this.incognito = win.incognito;
    this.type = win.type;
};

extendClass(WindowNode, PageTreeNode, {});