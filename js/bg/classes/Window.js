/**
  * @constructor
  * @extends PageTreeElement
  */
var Window = function(win)
{
    this.elemType = 'window';
    this.id = 'w' + win.id;
    this.incognito = win.incognito;
    this.type = win.type;

    PageTreeElement.call(this);

    log('Window', win, this);
};

extend(Window, PageTreeElement);