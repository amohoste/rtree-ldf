const fs = require('fs-extra');
const leveldown = require('nosql-leveldb');
const LRU = require('lru-cache');
const path = require('path');
const { findItem, bboxArea, bboxMargin, enlargedArea, intersectionArea, contains, intersects } = require('./treeHelpers');
const { stringify, deStringify } = require('./database(De)Serialisers');
const { createDataFragment, createTreeFragment, createGeospatiallyContainsRelation, stringSize, createCollectionDescription } = require('./fragmentHelpers');
const TreeNode = require('./Node/TreeNode');
const DataNode = require('./Node/DataNode');

// Constants
const NO_ID = 'NO_ID';
const TREE_INFO = 'TREE_INFO';

class Rtree {

    constructor(ob) {

        // Make copy of object
        let obj = Object.assign({}, ob);

        if (!obj.dir) {
            throw "Please provide a directory";
        }

        // Default parameters
        obj.openExisting = obj.openExisting !== undefined;
        obj.cacheSize = obj.cacheSize === undefined ? 100000 : obj.cacheSize;

        // Create out directory if non existent
        this.out_dir = obj.dir;
        fs.ensureDirSync(this.out_dir);

        // Setup level database
        this.leveldown = new leveldown(this.out_dir);
        try {
            this.leveldown.open({
                errorIfExists   : false
                , createIfMissing : true
                , cacheSize       : 8 * 1024 * 1024
                , writeBufferSize : 8 * 1024 * 1024
            });
        } catch(e) {
            throw e;
        }

        // Check if directory contains a database
        if (obj.openExisting && this.leveldown.get(TREE_INFO) === undefined) {
            obj.openExisting = false;
        }

        let root_id;
        if (obj.openExisting) {
            // Get config from database
            let config = deStringify(this.leveldown.get(TREE_INFO));
            this._maxEntries = config.maxEntries;
            this._minEntries = config.minEntries;
            this.cacheSize = config.cacheSize > 1000000 ? 1000000 : config.cacheSize;
            this.idCounter = config.idCounter;
            this.totalItems = config.totalItems;
            root_id = config.root_id;
        } else {
            // max entries in a node is 9 by default; min node fill is 40% for best performance
            this._maxEntries = Math.max(4, obj.maxEntries || 9);
            this._minEntries = Math.max(2, Math.ceil(this._maxEntries * 0.4));
            this.cacheSize = obj.cacheSize;
            this.idCounter = 0;
            this.totalItems = 0;
        }

        // Setup LRU cache
        const me = this;
        let options = { max: this.cacheSize,
            length: function () { return 1 },
            dispose: function (key, n) { me.leveldown.put(key, stringify(n)) },
            maxAge: 1000 * 60 * 60,
            stale: true,
            noDisposeOnSet: true
        };
        this.cache = LRU(options);

        // Set root
        if (root_id !== undefined) {
            let root = this.getNode(root_id);
            this.root = root !== undefined ? root : this.createTreeNode([]) ;
        } else {
            this.root = this.createTreeNode([]);
        }
    }

    // Write all tree data to database
    close() {
        // Save al tree data
        this.leveldown.put(TREE_INFO, JSON.stringify({
            maxEntries: this._maxEntries,
            minEntries: this._minEntries,
            idCounter: this.idCounter,
            totalItems: this.totalItems,
            cacheSize: this.cacheSize,
            root_id: this.root.id
        }));

        // Save cache
        this.cache.dump().forEach((el) => {
            this.leveldown.put(el.k, stringify(el.v))
        });

        // Close database
        this.leveldown.close();
    }

    // Write a node to the database
    save(node) {
        if (this.cache.get(node.id) === undefined) {
            this.leveldown.put(node.id, stringify(node));
        }
    }

    createTreeNode(children, minX, minY, maxX, maxY) {
        let id = this.idCounter++;
        let node = new TreeNode({ id: id, children: children, minX: minX, minY: minY, maxX: maxX, maxY: maxY });
        this.cache.set(id, node);
        return node;
    }

    createDataNode(obj) {
        let id = this.idCounter++;
        let newObj = Object.assign({ id: id }, obj);
        let node = new DataNode(newObj);
        this.cache.set(id, node);
        return node;
    }

    getNode(id) {
        let result = this.cache.get(id);

        // Node not in cache
        if (result === undefined) {
            try {
                result = deStringify(this.leveldown.get(id));
            } catch (err) {
                throw err;
            }

            if (result.children !== undefined) {
                result = new TreeNode(result);
            } else {
                result = new DataNode(result);
            }
        }

        return result;
    }

    // Remove a node from the database
    removeNode(id) {
        if (this.cache.get(id) === undefined) {
            this.leveldown.del(id);
        } else {
            this.cache.del(id);
        }
    }

    all() {
        return this._all(this.root, []);
    }

    search(bbox) {

        let node = this.root,
            result = [];

        if (!intersects(bbox, node)) return result;

        let nodesToSearch = [];

        while (node) {

            node.children.forEach((child_id) => {
                let child = this.getNode(child_id);
                let childBBox = child;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf) result.push(child);
                    else if (contains(bbox, childBBox)) this._all(child, result);
                    else nodesToSearch.push(child);
                }
            });

            node = nodesToSearch.pop();
        }

        return result;
    }

    collides(bbox) {

        let node = this.root;

        if (!intersects(bbox, node)) return false;

        let nodesToSearch = [];

        while (node) {

            for (let i = 0, len = node.children.length; i < len; i++) {

                let child = this.getNode(node.children[i]);
                let childBBox = child;

                if (intersects(bbox, childBBox)) {
                    if (node.leaf || contains(bbox, childBBox)) return true;
                    nodesToSearch.push(child);
                }
            }

            node = nodesToSearch.pop();
        }

        return false;
    }

    load(data) {
        if (!(data && data.length)) return this;

        data.forEach((item) => { this.insert(item) });
        return this;
    }


    insert(item) {
        if (item) this._insert(this.createDataNode(item), this.root.height - 1);
        this.totalItems++;
        return this;
    }

    remove(item, equalsFn) {

        if (item) {
            let obj = Object.assign({ id: NO_ID }, item);
            this._remove(new DataNode(obj), equalsFn);
        }

        return this;
    }

    _remove(item, equalsFn) {

        let node = this.root,
            bbox = item,
            path = [],
            indexes = [],
            i, parent, index, goingUp;

        // depth-first iterative tree traversal
        while (node || path.length) {

            if (!node) { // go up
                node = path.pop();
                parent = path[path.length - 1];
                i = indexes.pop();
                goingUp = true;
            }

            if (node.leaf) { // check current node
                let children = node.children.map((child) => this.getNode(child));
                index = findItem(item, children, equalsFn);

                if (index !== -1) {
                    // item found, remove the item and condense tree upwards
                    this.removeNode(node.children[index]);
                    node.children.splice(index, 1);
                    this.save(node);
                    path.push(node);
                    this._condense(path);
                    return this;
                }
            }

            if (!goingUp && !node.leaf && contains(node, bbox)) { // go down
                path.push(node);
                indexes.push(i);
                i = 0;
                parent = node;
                node = this.getNode(node.children[0]);

            } else if (parent) { // go right
                i++;
                let child_id = parent.children[i];
                if (child_id === undefined) {
                    node = null;
                } else {
                    node = this.getNode(parent.children[i]);
                }
                goingUp = false;

            } else node = null; // nothing found
        }
    }

    compareMinX(a, b) { return a.minX - b.minX; }
    compareMinY(a, b) { return a.minY - b.minY; }

    toJSON() {
        let result = this.root.convertJSON();
        let stack = [];
        stack.push(result);

        while(stack.length > 0) {
            let current = stack.pop();

            current.children = current.children.map((child_id) => this.getNode(child_id).convertJSON());

            for (let i = 0; i < current.children.length; i++) {
                if (!current.leaf) {
                    stack.push(current.children[i]);
                }
            }

        }
        return result;
    }

    _all(node, result) {
        let nodesToSearch = [];
        while (node) {
            let children = node.children.map((child_id) => this.getNode(child_id));
            if (node.leaf) result.push.apply(result, children);
            else nodesToSearch.push.apply(nodesToSearch, children);

            node = nodesToSearch.pop();
        }
        return result;
    }

    _chooseSubtree(bbox, node, level, path) {

        let targetNode, area, enlargement, minArea, minEnlargement;

        path.push(node);

        while (!(node.leaf || path.length - 1 === level)) {

            minArea = minEnlargement = Infinity;

            node.children.forEach((child_id) => {
                let child = this.getNode(child_id);
                area = bboxArea(child);
                enlargement = enlargedArea(bbox, child) - area;

                // choose entry with the least area enlargement
                if (enlargement < minEnlargement) {
                    minEnlargement = enlargement;
                    minArea = area < minArea ? area : minArea;
                    targetNode = child;

                } else if (enlargement === minEnlargement) {
                    // otherwise choose one with the smallest area
                    if (area < minArea) {
                        minArea = area;
                        targetNode = child;
                    }
                }
            });

            node = targetNode || this.getNode(node.children[0]);
            path.push(node);
        }

        return node;
    }

    _insert(item, level) {

        let bbox = item,
            insertPath = [];

        // find the best node for accommodating the item, saving all nodes along the path too
        let node = this._chooseSubtree(bbox, this.root, level, insertPath);

        // put the item into the node
        node.children.push(item.id); // Data node
        node.extend(bbox);
        this.save(node);

        // split on node overflow; propagate upwards if necessary
        while (level >= 0 && insertPath[level].children.length > this._maxEntries) {
            if (insertPath[level].children.length > this._maxEntries) {
                this._split(insertPath, level);
                level--;
            }
        }

        // adjust bboxes along the insertion path
        this._adjustParentBBoxes(bbox, insertPath, level);
    }

    // split overflowed node into two
    _split(insertPath, level) {

        let node = insertPath[level],
            M = node.children.length,
            m = this._minEntries;

        this._chooseSplitAxis(node, m, M);

        let splitIndex = this._chooseSplitIndex(node, m, M);

        let newNode = this.createTreeNode(node.children.splice(splitIndex, node.children.length - splitIndex));

        newNode.height = node.height;
        newNode.leaf = node.leaf;
        this.save(newNode);

        this.calcBBox(node);
        this.calcBBox(newNode);

        if (level) {
            insertPath[level - 1].children.push(newNode.id);
            this.save(insertPath[level -1]);
        } else {
            this._splitRoot(node, newNode);
        }
    }

    _splitRoot(node, newNode) {
        // split root node
        this.root = this.createTreeNode([node.id, newNode.id]);
        this.root.height = node.height + 1;
        this.root.leaf = false;
        this.calcBBox(this.root);
    }

    _chooseSplitIndex(node, m, M) {

        let index;
        let minOverlap = Infinity;
        let minArea = Infinity;

        for (let i = m; i <= M - m; i++) {
            let bbox1 = this.distBBox(node, 0, i);
            let bbox2 = this.distBBox(node, i, M);

            let overlap = intersectionArea(bbox1, bbox2);
            let area = bboxArea(bbox1) + bboxArea(bbox2);

            // choose distribution with minimum overlap
            if (overlap < minOverlap) {
                minOverlap = overlap;
                index = i;

                minArea = area < minArea ? area : minArea;

            } else if (overlap === minOverlap) {
                // otherwise choose distribution with minimum area
                if (area < minArea) {
                    minArea = area;
                    index = i;
                }
            }
        }

        return index;
    }

    sortChildren(node, compare) {
        let children = node.children.map((child_id) => this.getNode(child_id));
        children.sort(compare);
        node.children = children.map((child) => child.id);
        this.save(node);
    }

    // sorts node children by the best axis for split
    _chooseSplitAxis(node, m, M) {

        let compareMinX = this.compareMinX,
            compareMinY = this.compareMinY,
            xMargin = this._allDistMargin(node, m, M, compareMinX),
            yMargin = this._allDistMargin(node, m, M, compareMinY);

        // if total distributions margin value is minimal for x, sort by minX,
        // otherwise it's already sorted by minY
        if (xMargin < yMargin) this.sortChildren(node, compareMinX)
    }

    // total margin of all possible split distributions where each node is at least m full
    _allDistMargin(node, m, M, compare) {

        this.sortChildren(node, compare);

        let leftBBox = this.distBBox(node, 0, m),
            rightBBox = this.distBBox(node, M - m, M),
            margin = bboxMargin(leftBBox) + bboxMargin(rightBBox),
            child;

        for (let i = m; i < M - m; i++) {
            child = this.getNode(node.children[i]);
            leftBBox.extend(child);
            margin += bboxMargin(leftBBox);
        }

        for (let i = M - m - 1; i >= m; i--) {
            child = this.getNode(node.children[i]);
            rightBBox.extend(child);
            margin += bboxMargin(rightBBox);
        }

        return margin;
    }

    _adjustParentBBoxes(bbox, path, level) {
        // adjust bboxes along the given tree path
        for (let i = level; i >= 0; i--) {
            path[i].extend(bbox);
            this.save(path[i]);
        }
    }

    _condense(path) {
        // go through the path, removing empty nodes and updating bboxes
        for (let i = path.length - 1, siblings; i >= 0; i--) {
            if (path[i].children.length === 0) {
                if (i > 0) {
                    siblings = path[i - 1].children;
                    siblings.splice(siblings.indexOf(path[i].id), 1);
                    this.save(path[i-1]);

                } else this.clear();

            } else this.calcBBox(path[i]);
        }
    }

    clear() {
        this.root = this.createTreeNode([]);
        return this;
    }

    // calculate node's bbox from bboxes of its children
    calcBBox(node) {
        this.distBBox(node, 0, node.children.length, node);
    }

    // min bounding rectangle of node children from k to p-1
    distBBox(node, k, p, destNode) {
        let is_new = false;
        if (!destNode) {
            destNode = new TreeNode({ id: NO_ID, children: []});
            is_new = true;
        }
        destNode.minX = Infinity;
        destNode.minY = Infinity;
        destNode.maxX = -Infinity;
        destNode.maxY = -Infinity;

        for (let i = k; i < p; i++) {
            let child = this.getNode(node.children[i]);
            destNode.extend(child);
        }

        if (!is_new) {
            this.save(destNode);
        }

        return destNode;
    }

    toFragments(obj) {
        let startTreePage = 0;
        let startDataPage = 0;
        let goalSize = 500000;
        let maxSize = 1000000;

        // Create necessary directories
        fs.ensureDirSync(obj.outDir);

        if (obj.treeDir) {
            fs.ensureDirSync(path.join(obj.outDir, obj.treeDir));
        } else {
            obj.treeDir = "";
        }

        if (obj.dataDir) {
            fs.ensureDirSync(path.join(obj.outDir, obj.dataDir));
        } else {
            obj.dataDir = "";
        }

        // Create fragment describing the collection
        fs.writeFileSync(path.join(obj.outDir, obj.collection), JSON.stringify(createCollectionDescription(obj.collection, obj.manages, this.totalItems, path.join(obj.treeDir, `t${startTreePage}.jsonld#${this.root.id}`))));

        // Calculate optimal height
        let optheight = this.getOptimalHeight(goalSize, maxSize);

        // Convert tree to fragments
        this._toFragments(this.root.convertFrag(`t${startTreePage}.jsonld`), this.root.height, optheight - 1, this.getStartCut(this.root.height, optheight), [startTreePage, startDataPage], goalSize, obj.outDir, obj.dataDir, obj.treeDir);
    }


    _toFragments(root, startHeight, maxHeight, startCut, [pageId, dataId], goalSize, outDir, dataDir, treeDir) {
        // Page counters
        let treePage = pageId;
        let dataPage = dataId;
        let rootPage;

        // Create fragments
        let dataFrag = createDataFragment();
        let dataSize = 0;

        let treeFrag = createTreeFragment();
        treeFrag["@graph"].push(root);

        // Nodes left to iterate over
        let stack = [];
        stack.push(root);

        while(stack.length > 0) {
            let current = stack.pop();

            // Check if we should start a new fragment
            if (startHeight - current["rtree:height"] < maxHeight && current["rtree:height"] !== startCut) {

                if (current["rtree:height"] !== 1) {
                    // Convert children to JSON_LD
                    let childRelation = createGeospatiallyContainsRelation();
                    childRelation["tree:child"] = current["rtree:children"].map((child_id) => this.getNode(child_id).convertFrag(`t${treePage}.jsonld`));
                    current["tree:hasChildRelation"].push(childRelation);

                    // Clear unnecessary properties
                    delete current["rtree:height"];
                    delete current["rtree:children"];

                    // Add new childs to stack for further conversion
                    for (let i = 0; i < current["tree:hasChildRelation"][0]["tree:child"].length; i++) {
                        stack.push(childRelation["tree:child"][i]);
                    }

                } else if (current["rtree:height"] === 1){
                    // Add data to data fragment
                    dataFrag["@graph"] = dataFrag["@graph"].concat(current["rtree:children"].map((child_id) => {
                        let frag = this.getNode(child_id).convertFrag(`d${dataPage}.jsonld`);
                        dataSize += stringSize(JSON.stringify(frag));
                        return frag;
                    }));

                    // Create references to data
                    current["hydra:member"] = current["rtree:children"].map((child_id) => {
                        let obj =  { "@id": path.join('/', dataDir, `d${dataPage}.jsonld#${child_id}`) };

                        let type = this.getNode(child_id).type;
                        if (type !== undefined) {
                            obj["@type"] = type;
                        }
                        return obj;
                    });

                    // Clear unnecessary properties
                    delete current["rtree:children"];
                    delete current["rtree:height"];
                    delete current["tree:hasChildRelation"];

                    if (dataSize > goalSize && stack.length !== 0) {
                        // Write data fragment
                        fs.writeFileSync(path.join(path.join(outDir, dataDir), `d${dataPage}.jsonld`), JSON.stringify(dataFrag));
                        dataFrag = createDataFragment();
                        dataSize = 0;
                        dataPage++;
                    }

                    if (stack.length === 0) {
                        // Write tree fragment
                        fs.writeFileSync(path.join(path.join(outDir, treeDir), `t${treePage}.jsonld`), JSON.stringify(treeFrag));
                        treePage++;

                        // Write data fragment
                        fs.writeFileSync(path.join(path.join(outDir, dataDir), `d${dataPage}.jsonld`), JSON.stringify(dataFrag));
                        dataPage++;
                    }
                }
            } else {
                // We should start a new fragment if necessary

                if (current["rtree:height"] === 1) {

                    // Add data to data fragment
                    dataFrag["@graph"] = dataFrag["@graph"].concat(current["rtree:children"].map((child_id) => {
                        let frag = this.getNode(child_id).convertFrag(`d${dataPage}.jsonld`);
                        dataSize += stringSize(JSON.stringify(frag));
                        return frag;
                    }));

                    // Create references to data
                    current["hydra:member"] = current["rtree:children"].map((child_id, i) => {
                        let obj =  { "@id": path.join('/', dataDir, `d${dataPage}.jsonld#${child_id}`) };

                        let type = this.getNode(child_id).type;
                        if (type !== undefined) {
                            obj["@type"] = type;
                        }
                        return obj;
                    });

                    // Clear unnecessary properties
                    delete current["rtree:children"];
                    delete current["rtree:height"];
                    delete current["tree:hasChildRelation"];

                    if (dataSize > goalSize && stack.length !== 0) {
                        // Write data fragment
                        fs.writeFileSync(path.join(path.join(outDir, dataDir), `d${dataPage}.jsonld`), JSON.stringify(dataFrag));
                        dataFrag = createDataFragment();
                        dataSize = 0;
                        dataPage++;
                    } else if (stack.length === 0) {
                        fs.writeFileSync(path.join(path.join(outDir, dataDir), `d${dataPage}.jsonld`), JSON.stringify(dataFrag));
                        dataPage++;
                    }

                } else {
                    // Save page for writing after recursion
                    if (rootPage === undefined) {
                        rootPage = treePage;
                        treePage++;
                    }
                    // Create references to next tree nodes
                    let childRelation = createGeospatiallyContainsRelation();
                    current["rtree:children"].forEach((child_id, i) => {
                        childRelation["tree:child"][i] = { "@id": path.join('/', treeDir, `t${treePage}.jsonld#${child_id}`), "@type": "tree:Node" };
                        let node = this.getNode(child_id).convertFrag(`t${treePage}.jsonld`);
                        [treePage, dataPage] = this._toFragments(node, node["rtree:height"], maxHeight, startCut, [treePage, dataPage], goalSize, outDir, dataDir, treeDir);
                    });
                    current["tree:hasChildRelation"].push(childRelation);

                    // Clear unnecessary properties
                    delete current["rtree:height"];
                    delete current["rtree:children"];
                }

                if (stack.length === 0) {
                    // Write tree fragment
                    if (rootPage !== undefined) {
                        fs.writeFileSync(path.join(path.join(outDir, treeDir), `t${rootPage}.jsonld`), JSON.stringify(treeFrag));
                    } else {
                        fs.writeFileSync(path.join(path.join(outDir, treeDir), `t${treePage}.jsonld`), JSON.stringify(treeFrag));
                        treePage++;
                    }
                }
            }
        }

        return [treePage, dataPage];
    }

    // Determines a cutoff point so that all following fragments are of the same height
    getStartCut(height, optheight) {
        return height - ((height - 1) % optheight);
    }

    // Determines the optimal height to get fragments of size around goalSize
    getOptimalHeight(goalSize, maxSize) {
        let height = 0;
        let size = 0;
        let path = [];
        let node = this.root;
        path.push(node);

        while (!node.leaf) {
            node = this.getNode(node.children[0]);
            path.push(node);
        }

        while (size < goalSize && path.length > 0) {
            node = path.pop();
            size = stringSize(JSON.stringify(this.getSubFragtree(node)));
            height ++;
        }

        if (size > maxSize) {
            return height - 1;
        } else {
            return height;
        }
    }

    getSubFragtree(node) {
        let result = node.convertFrag('t0.jsonld');
        let stack = [];
        stack.push(result);

        while(stack.length > 0) {
            let current = stack.pop();

            if (current["rtree:height"] !== 1) {
                // Convert children to JSON_LD
                let childRelation = createGeospatiallyContainsRelation();
                childRelation["tree:child"] = current["rtree:children"].map((child_id) => this.getNode(child_id).convertFrag(`t0.jsonld`));
                current["tree:hasChildRelation"].push(childRelation);

                for (let i = 0; i < current["rtree:children"].length; i++) {
                    stack.push(childRelation["tree:child"][i]);
                }

                // Clear unnecessary properties
                delete current["rtree:height"];
                delete current["rtree:children"];

            } else {
                // Create references to data
                current["hydra:member"] = current["rtree:children"].map((child_id) => {
                    let obj =  { "@id": path.join('/', "test", `d0.jsonld#${child_id}`) };

                    let type = this.getNode(child_id).type;
                    if (type !== undefined) {
                        obj["@type"] = type;
                    }
                    return obj;
                });

                // Clear unnecessary properties
                delete current["rtree:children"];
                delete current["rtree:height"];
                delete current["tree:hasChildRelation"];
            }
        }
        return result;
    }
}

module.exports = Rtree;