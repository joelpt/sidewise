/**
  * @constructor
  * @extends PageTreeNode
  */
var FolderNode = function(label)
{
    this.$base();

    this.elemType = 'folder';
    this.id = 'f' + this.UUID;
    this.title = '';
    this.label = label;
};

extendClass(FolderNode, PageTreeNode, {});

