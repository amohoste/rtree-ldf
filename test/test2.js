var Rtree = require('..');

function someData(n) {
    var data = [];

    for (var i = 0; i < n; i++) {
        data.push({minX: i, minY: i, maxX: i, maxY: i, station: `station${i}` });
    }
    return data;
}

var tree = new Rtree({ dir: "./out/a"}).load(someData(1000000));

tree.toFragments({outDir: '/Users/amoryhoste/Desktop/out/', treeDir: 'tree', dataDir: 'data', collection: 'stations' , manages: 'http://vocab.gtfs.org/terms#station'});
tree.close();