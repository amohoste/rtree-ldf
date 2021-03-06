const { getNonIdProperties, getNonBBoxProperties } = require('../propertiesFilters');
const Node = require('./Node');

class DataNode extends Node {

    constructor(obj) {
        super(obj.id, obj.minX, obj.minY, obj.maxX, obj.maxY);

        // Add non BBox properties to node
        getNonBBoxProperties(obj).forEach((key) => {
            this[key] = obj[key];
        });
    }

    convertJSON() {
        return getNonIdProperties(this);
    }

    convertFrag(fragment) {
        let result = {};

        let nonBbox = getNonBBoxProperties(this);
        if (nonBbox.length > 0) {
            nonBbox.forEach((key) => {
                result[key] = this[key];
            })
        }

        result["@id"] =`${fragment}#${this.id}`;
        result["geo:lat"] = this.minY;
        result["geo:long"] = this.minX;

        return result;
    }

}

module.exports = DataNode;