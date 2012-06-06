/**
  * @constructor
  * @extends PageTreeElement
  */

var Window = function(win)
{
    Window._base.call(this);
    this.elemType = 'window';
    this.id = 'w' + win.id;
    this.incognito = win.incognito;
    this.type = win.type;
    log('Window', win, this);
};

Window.extend(PageTreeElement);
