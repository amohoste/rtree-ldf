const { getNonIdProperties } = require('../propertiesFilters');
const Node = require('./Node');

class TreeNode extends Node {

    constructor(obj) {
        super(obj.id, obj.minX, obj.minY, obj.maxX, obj.maxY);
        this.children = obj.children;
        if (obj.height === undefined) {
            this.height = 1;
        } else {
            this.height = obj.height;
        }

        if (obj.leaf === undefined) {
            this.leaf = true;
        } else {
            this.leaf = obj.leaf;
        }
    }

    isLeaf() {
        return this.height === 1;
    }

    extend(b) {
        this.minX = Math.min(this.minX, b.minX);
        this.minY = Math.min(this.minY, b.minY);
        this.maxX = Math.max(this.maxX, b.maxX);
        this.maxY = Math.max(this.maxY, b.maxY);
        return this;
    }

    convertJSON() {
        return getNonIdProperties(this);
    }

    convertFrag(fragment) {
        let result = {};
        result["@type"] = "tree:Node";
        result["@id"] = `${fragment}#${this.id}`;
        result["dcterms:identifier"] = this.id;
        result["value"] = `POLYGON ((${this.maxX} ${this.minY}, ${this.maxX} ${this.maxY}, ${this.minX} ${this.maxY}, ${this.minX} ${this.minY}))`;
        result["rtree:children"] = this.children;
        result["rtree:height"] = this.height;
        result["tree:hasChildRelation"] = [];
        return result;
    }
}

module.exports = TreeNode;