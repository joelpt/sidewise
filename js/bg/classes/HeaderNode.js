/**
  * @constructor
  * @extends PageTreeNode
  */
var HeaderNode = function(label)
{
    this.$base();

    this.elemType = 'header';
    this.id = 'h' + this.UUID;

    this.label = label;
};

HeaderNode.prototype = {
};

extendClass(HeaderNode, PageTreeNode, HeaderNode.prototype);
