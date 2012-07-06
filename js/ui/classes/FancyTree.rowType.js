///////////////////////////////////////////////////////////
// FancyTree.rowType.js
// Row type creation and retrieval
///////////////////////////////////////////////////////////

FancyTree.prototype.getRowTypeParams = function(row) {
    return this.rowTypes[row.attr('rowtype')];
};

/**
  * Adds a new rowtype.
  * @param name     The name of the row type used for referencing it elsewhere.
  * @param params   The row type's parameters; see FancyTree class header for details
  */
FancyTree.prototype.addRowType = function(name, params) {
    var self = this;
    this.rowTypes[name] = params;

    // configure params
    params.allowAtTopLevel = (params.allowAtTopLevel === undefined ? true : params.allowAtTopLevel);
    params.allowAtChildLevel = (params.allowAtChildLevel === undefined ? true : params.allowAtChildLevel);

    // configure title formatting handler
    var onFormatTitle = params.onFormatTitle || this.defaultFormatTitleHandler;
    params.onFormatTitle = function(row) {
        onFormatTitle.call(self, row, self.getInnerRow(row).children('.ftItemText'));
    }

    // configure event handling
    var selector = '.ftRowNode[rowtype=' + name + '] > .ftItemRow > .ftItemRowContent';
    var data = params;
    data.treeObj = this;
    $(document)
        .on('mousedown', selector, data, this.rowMouseDownHandler)
        .on('mouseup', selector, data, this.rowMouseUpHandler)
        .on('dblclick', selector, data, this.rowDoubleClickHandler);

    // configure row button event handling
    for (var i in params.buttons)
    {
        var buttonClass = '.ftButton__' + name + '_' + i;
        var buttonData = { treeObj: this, onClick: params.buttons[i].onClick };
        $(document).on('mouseup', buttonClass, buttonData, this.rowButtonClickHandler);
    }

    // construct empty HTML element for this rowtype
    params.baseElement = this.buildRowTypeElem(name);

    if (!params.allowedDropTargets || params.allowedDropTargets.length == 0) {
        return;
    }

    // configure draggable and droppable parameters
    params.draggableParams = this.getDraggableParams();
    params.droppableParams = this.getDroppableParams(params.allowedDropTargets);
};
