/**
  * @constructor
  * @extends PageTreeNode
  */
var WindowNode = function(win)
{
    WindowNode._base.call(this);
    this.elemType = 'window';
    this.id = 'w' + win.id;
    this.incognito = win.incognito;
    this.type = win.type;
};

WindowNode.extend(PageTreeNode);
