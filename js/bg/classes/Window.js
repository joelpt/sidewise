/**
  * @constructor
  * @extends PageTreeElement
  */
var Window = function(win)
{
    PageTreeElement.call(this);
    this.elemType = 'window';
    this.id = 'w' + win.id;
    this.incognito = win.incognito;
    this.type = win.type;
    log('Window', win, this);
};

extend(Window, PageTreeElement);