Rtree LDF
=====

Rtree-ldf is based on [rbush](https://github.com/mourner/rbush), a high-performance JavaScript library for 2D **spatial indexing** of points and rectangles. It is completely disk based and uses a nosql-database for storage and a lru-cache for improved performance. Please note that this implementation isn't optimal and an implementation in another language such as c++ will be much faster. Performance will also greatly depend on the cache size given to the tree.


## Install

Install with NPM (`npm install --save rtree-ldf`).

## Usage

### Creating a Tree

```js
const tree = new Rtree({
	dir: ./db,
	openExisting: true,
	cacheSize: 100000,
	maxEntries: 16,
});
```
- `dir`: Directory where the tree will be saved on disk
-  `openExisting` (Opt.): Open an existing tree located in dir (default: false)
-  `cacheSize` (Opt.): Amount of nodes that will can be cached (max 1.000.000, default: 100.000)
-  `maxEntries` (Opt.): defines the maximum number of entries in a tree node (default: 9)

### Closing a tree
If you want to make sure your tree is completely saved to the disk, make sure to call `tree.close()` when you are done.

### Adding Data

Insert an item:

```js
const item = {
    minX: 20, 
    minY: 40,
    maxX: 30,
    maxY: 50,
    "@id": "gtfs:station",
    foo: bar
};
tree.insert(item);
```
`minX`, `minY`, `maxX` and `maxY` are required. You can also add extra data properties.

### Removing Data

Remove a previously inserted item:

```js
tree.remove(item);
```

You can also pass a custom `equals` function.

```js
tree.remove(itemCopy, function (a, b) {
    return a.id === b.id;
});
```

Remove all items:

```js
tree.clear();
```

### Bulk-Inserting Data
Load an array of data into the tree.

```js
tree.load([item1, item2, ...]);
```

### Search

```js
var result = tree.search({
    minX: 40,
    minY: 20,
    maxX: 80,
    maxY: 70
});
```

Returns an array of data items (points or rectangles) that the given bounding box intersects.


```js
var allItems = tree.all();
```

Returns all items of the tree.

### Collisions

```js
var result = tree.collides({minX: 40, minY: 20, maxX: 80, maxY: 70});
```

Returns `true` if there are any items intersecting the given bounding box, otherwise `false`.


### Export to JSON

```js
// export data as JSON object
var treeData = tree.toJSON();
```

### Export to linked data fragments
```js
tree.toFragments({
	outDir: './fragments/', 
	treeDir: 'tree', 
	dataDir: 'data', 
	collection: 'stations' , 
	manages: 'http://vocab.gtfs.org/terms#station'
});

```

The tree will be exported into fragments conform to the [TreeOntology](https://github.com/pietercolpaert/TreeOntology). The fragments are formatted in JSON-LD and most will be around 500 kB which should give a fragment size of around 50 kB after compression. 

- `outDir`: base directory where the fragments will be exported to
- `collection`: name of the fragment describing the collection. This fragment will be placed in the out directory
- `manages`: type of data the collection manages
- `treeDir` (opt.): directory starting from outDir where the treeFragments will be exported to. The fragments are exported to the outDir by default. 
- `dataDir` (opt.): directory starting from outDir where the dataFragments will be exported to. The fragments are exported to the outDir by default. 

