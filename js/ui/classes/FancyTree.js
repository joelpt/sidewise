///////////////////////////////////////////////////////////
// Constants
///////////////////////////////////////////////////////////

var ROW_TOOLTIP_SHOW_DELAY_MS = 1000;


///////////////////////////////////////////////////////////
// FancyTree
///////////////////////////////////////////////////////////

/**
  * @class
  * @constructor
  * @param treeReplaceElem The DOM element to replace with the treeview.
  * @param filterBoxReplaceElem The root DOM element to replace with the filter box.
  * @param options A dictionary of options, all optional:
  *        <pre>
  *        {
  *          scrollTargetElem: jQueryElem,       // the tree parent element that can scroll
  *          onContextMenuShow: Function(rows),  // passed a list of rows that are currently selected, this
  *                                              // should return an array of context menu items to show
  *          onDragDrop: Function(moves)         // called when some rows have been moved as a result of drag & drop
  *                                              // moves contains the movements performed as jQuery objects:
  *                                              //     [{ movedRow, movedToParent, movedToBeforeSibling }, ...]
  *          showFilterBox: Boolean,             // if set to false, hide type-in filtering box above tree
  *          filterPlaceholderText: String,      // text to show in filter box when otherwise empty
  *          filterActiveText: String,           // text to show below filter box when filtering is active
  *          useAdvancedFiltering: Boolean,      // if true, use nonadjacent char matching when filtering
  *          permitTooltipHandler: Function(),   // if this function returns false, block showing a row tip
  *          tooltipTopOffset: Integer,          // offset row tip from row by this much pixel spacing
  *          rowTypes:
  *          {
  *            identifier:                       // identifying string for each type of row to support
  *            {
  *              allowAtTopLevel: Boolean,       // allow row at top (root) level, default=true
  *              allowAtChildLevel: Boolean,     // allow row as child of another row, default=true
  *              autofocusOnClick: Boolean,      // if true (default), set focus to row when clicked
  *              multiselectable: Boolean,       // if true (default), row can be in ctrl/shift selections
  *              allowedDropTargets: Array,      // if provided, a row of this type will be permitted to be
  *                                              // drag-dropped into the given rowtypes; pass the allowed row
  *                                              // type identifiers as strings, and pass the special
  *                                              // identifier 'ROOT' to permit dropping onto the root level
  *                                              // of the tree, e.g. ['bookmark', 'folder', 'ROOT']
  *              autoselectChildrenOnDrag: Bool  // if true, when staring a drag with no selection, auto-
  *                                              // select the children of the dragged row
  *              onClick: Function(evt),         // left single click event handler
  *              onDoubleClick: Function(evt),   // left double click event handler
  *              onMiddleClick: Function(evt),   // middle click event handler
  *              onExpanderClick: function(evt), // called when a row's branch expander arrow is clicked
  *              onIconError: Function(evt),     // row icon onerror event handler
  *              onFormatTitle: Function(row, itemTextElement), // called whenever row title might need updating
  *              onFormatTooltip: Function(evt), // called to obtain HTML for a row's tip before showing it
  *              onResizeTooltip: Function(evt), // called if a row tip is forcibly resized by FancyTree
  *              filterByExtraParams: [String],  // additional parameter(s) to examine when filtering
  *              tooltipMaxWidthFixed: Integer,  // max width of row tip, as number of pixels
  *              tooltipMaxWidthPercent: Float,  // max width or row tip, as % of parent width (0.0-1.0)
  *              buttons:                        // array of show-on-row-hover row action buttons
  *              [
  *                {
  *                  icon: String,               // URL string of icon for button
  *                  tooltip: String,            // tooltip text of button shown on extended hover
  *                  onClick: Function(evt)      // left click event handler for button
  *                },
  *                ...
  *              ]
  *            },
  *            ...
  *          }
  *       }
  *       </pre>
  *
  *       All rowTypes' event handlers are passed the hosting FancyTree object in evt.data.treeObj, and the
  *       involved row's <li> jQuery element in evt.data.row.
  *
  */
var FancyTree = function(treeReplaceElem, filterBoxReplaceElem, options) {
    this.init(treeReplaceElem, filterBoxReplaceElem, options);
}
