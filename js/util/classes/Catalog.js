// Manages an ordered array of items, each of which should be an Object
// with a unique .id property (and other properties as desired)

var Catalog = function(items) {
    this.items = items || [];
};

Catalog.prototype = {

    // Get the catalog item with the given id or undefined if not found.
    getItem: function(id) {
        return firstElem(this.items, function(e) { return e.id == id; });
    },

    // Returns an ordered array of the ids of the items in the catalog.
    getIds: function() {
        return this.items.map(function(e) { return e.id; });
    },

    // Append a new item to the catalog.
    appendItem: function(item) {
        var existing = this.getItem(item.id);
        if (existing) {
            throw new Error('Item already exists in catalog with id ' + item.id);
        }
        this.items.push(item);
        return item;
    },

    // Remove the item from the catalog with the given id.
    removeItem: function(id) {
        var found = first(this.items, function(e) { return e.id == id; });
        if (!found) {
            throw new Error('Could not find item to remove with id ' + id);
        }
        this.items.splice(found[0], 1);
    },

    // Reorder the item with the given id to have index newIndex in the item array
    reorderItem: function(id, newIndex) {
        var index, item;
        for (var i = 0; i < this.items.length; i++) {
            item = this.items[i];
            if (item.id == id) {
                index = i;
                break;
            }
        }

        if (index === undefined) {
            throw new Error('Could not find item by id ' + id);
        }
        this.items.splice(index, 1);
        this.items.splice(newIndex, 0, item);
    },

    // Load catalog from local setting with the provided settingName.
    // Will populate instead with defaultItems if provided and setting is empty.
    loadState: function(settingName, defaultItems) {
        this.items = settings.get(settingName, defaultItems || []);
    },

    // Save the contents of the catalog to the local setting with the provided settingName.
    saveState: function(settingName) {
        var state = [];

        for (var i = 0; i < this.items.length; i++) {
            state.push({ id: this.items[i].id, enabled: this.items[i].enabled });
        }

        settings.set(settingName, state);
    }

};

