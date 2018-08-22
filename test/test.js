'use strict';

/*eslint key-spacing: 0, comma-spacing: 0 */

var Rtree = require('..'),
    t = require('tape');

function removeIds(arr) {
    let cloned = JSON.parse(JSON.stringify(arr, function(key, value) {
        if (value === Infinity) {
            return "Infinity";
        } else if (value === -Infinity) {
            return "-Infinity";
        } else {
            return value;
        }
    }), function (key, value) {
        if (value === "Infinity") {
            return Infinity;
        } else if (value === "-Infinity") {
            return -Infinity;
        } else {
            return value;
        }
    });
    cloned.forEach((el) => {
        return delete el.id;
    });
    return cloned;
}

function sortedEqual(t, a, b, compare) {
    compare = compare || defaultCompare;
    t.same(a.slice().sort(compare), b.slice().sort(compare));
}

function defaultCompare(a, b) {
    return (a.minX - b.minX) || (a.minY - b.minY) || (a.maxX - b.maxX) || (a.maxY - b.maxY);
}

function someData(n) {
    var data = [];

    for (var i = 0; i < n; i++) {
        data.push({minX: i, minY: i, maxX: i, maxY: i});
    }
    return data;
}

function arrToBBox(arr) {
    return {
        minX: arr[0],
        minY: arr[1],
        maxX: arr[2],
        maxY: arr[3]
    };
}

var data = [[0,0,0,0],[10,10,10,10],[20,20,20,20],[25,0,25,0],[35,10,35,10],[45,20,45,20],[0,25,0,25],[10,35,10,35],
    [20,45,20,45],[25,25,25,25],[35,35,35,35],[45,45,45,45],[50,0,50,0],[60,10,60,10],[70,20,70,20],[75,0,75,0],
    [85,10,85,10],[95,20,95,20],[50,25,50,25],[60,35,60,35],[70,45,70,45],[75,25,75,25],[85,35,85,35],[95,45,95,45],
    [0,50,0,50],[10,60,10,60],[20,70,20,70],[25,50,25,50],[35,60,35,60],[45,70,45,70],[0,75,0,75],[10,85,10,85],
    [20,95,20,95],[25,75,25,75],[35,85,35,85],[45,95,45,95],[50,50,50,50],[60,60,60,60],[70,70,70,70],[75,50,75,50],
    [85,60,85,60],[95,70,95,70],[50,75,50,75],[60,85,60,85],[70,95,70,95],[75,75,75,75],[85,85,85,85],[95,95,95,95]]
    .map(arrToBBox);

var emptyData = [[-Infinity, -Infinity, Infinity, Infinity],[-Infinity, -Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, Infinity, Infinity],[-Infinity, -Infinity, Infinity, Infinity],
    [-Infinity, -Infinity, Infinity, Infinity],[-Infinity, -Infinity, Infinity, Infinity]].map(arrToBBox);

t('constructor uses 9 max entries by default', function (t) {
    var tree = new Rtree({ dir: "./out/a" }).load(someData(9));
    t.equal(tree.toJSON().height, 1);

    var tree2 = new Rtree({ dir: "./out/b" }).load(someData(10));
    t.equal(tree2.toJSON().height, 2);

    tree.close();
    tree2.close();
    t.end();
});

t('#load bulk-loads the given data given max node entries and forms a proper search tree', function (t) {

    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    sortedEqual(t, removeIds(tree.all()), data);

    tree.close();
    t.end();
});

t('#load uses standard insertion when given a low number of items', function (t) {

    var tree = new Rtree({ dir: "./out/a", maxEntries: 8 })
        .load(data)
        .load(data.slice(0, 3));

    var tree2 = new Rtree({ dir: "./out/b", maxEntries: 8 })
        .load(data)
        .insert(data[0])
        .insert(data[1])
        .insert(data[2]);

    t.same(tree.toJSON(), tree2.toJSON());

    tree.close();
    tree2.close();
    t.end();
});

t('#load does nothing if loading empty data', function (t) {
    var tree = new Rtree({ dir: "./out/a" }).load([]);
    var tree2 = new Rtree({ dir: "./out/b" });

    t.same(tree.toJSON(), tree2.toJSON());

    tree.close();
    tree2.close();
    t.end();
});

t('#load handles the insertion of maxEntries + 2 empty bboxes', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 })
        .load(emptyData);

    t.equal(tree.toJSON().height, 2);
    sortedEqual(t, removeIds(tree.all()), emptyData);

    tree.close();
    t.end();
});

t('#insert handles the insertion of maxEntries + 2 empty bboxes', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 });

    emptyData.forEach(function (datum) {
        tree.insert(datum);
    });

    t.equal(tree.toJSON().height, 2);
    sortedEqual(t, removeIds(tree.all()), emptyData);

    tree.close();
    t.end();
});

t('#load properly splits tree root when merging trees of the same height', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 })
        .load(data)
        .load(data);

    t.equal(tree.toJSON().height, 4);
    sortedEqual(t, removeIds(tree.all()), data.concat(data));

    tree.close();
    t.end();
});


t('#load properly merges data of smaller or bigger tree heights', function (t) {
    var smaller = someData(10);

    var tree1 = new Rtree({ dir: "./out/a", maxEntries: 4 })
        .load(data)
        .load(smaller);

    var tree2 = new Rtree({ dir: "./out/b", maxEntries: 4 })
        .load(smaller)
        .load(data);

    t.equal(tree1.toJSON().height, tree2.toJSON().height);

    sortedEqual(t, removeIds(tree1.all()), data.concat(smaller));
    sortedEqual(t, removeIds(tree2.all()), data.concat(smaller));

    tree1.close();
    tree2.close();
    t.end();
});


t('#search finds matching points in the tree given a bbox', function (t) {

    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    var result = removeIds(tree.search({minX: 40, minY: 20, maxX: 80, maxY: 70}));
    sortedEqual(t, result, [
        [70,20,70,20],[75,25,75,25],[45,45,45,45],[50,50,50,50],[60,60,60,60],[70,70,70,70],
        [45,20,45,20],[45,70,45,70],[75,50,75,50],[50,25,50,25],[60,35,60,35],[70,45,70,45]
    ].map(arrToBBox));

    tree.close();
    t.end();
});

t('#collides returns true when search finds matching points', function (t) {

    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    var result = tree.collides({minX: 40, minY: 20, maxX: 80, maxY: 70});

    t.same(result, true);

    tree.close();
    t.end();
});

t('#search returns an empty array if nothing found', function (t) {
    let tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    var result = tree.search([200, 200, 210, 210]);

    t.same(result, []);

    tree.close();
    t.end();
});

t('#collides returns false if nothing found', function (t) {
    let tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    var result = tree.collides([200, 200, 210, 210]);

    t.same(result, false);

    tree.close();
    t.end();
});

t('#all returns all points in the tree', function (t) {

    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    var result = removeIds(tree.all());

    sortedEqual(t, result, data);
    sortedEqual(t, removeIds(tree.search({minX: 0, minY: 0, maxX: 100, maxY: 100})), data);

    tree.close();
    t.end();
});

t('#insert adds an item to an existing tree correctly', function (t) {
    var items = [
        [0, 0, 0, 0],
        [1, 1, 1, 1],
        [2, 2, 2, 2],
        [3, 3, 3, 3],
        [1, 1, 2, 2]
    ].map(arrToBBox);

    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(items.slice(0, 3));

    tree.insert(items[3]);
    t.equal(tree.toJSON().height, 1);
    sortedEqual(t, removeIds(tree.all()), items.slice(0, 4));

    tree.insert(items[4]);
    t.equal(tree.toJSON().height, 2);
    sortedEqual(t, removeIds(tree.all()), items);

    tree.close();
    t.end();
});

t('#insert does nothing if given undefined', function (t) {
    let tree1 = new Rtree({ dir: "./out/a" }).load(data);
    let tree2 = new Rtree({ dir: "./out/b" }).load(data).insert();
    t.same(
        tree1.toJSON(),
        tree2.toJSON());

    tree1.close();
    tree2.close();
    t.end();
});

t('#insert forms a valid tree if items are inserted one by one', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxentries: 4});

    for (var i = 0; i < data.length; i++) {
        tree.insert(data[i]);
    }

    var tree2 = new Rtree({dir: "./out/b", maxEntries: 4 }).load(data);

    t.ok(tree.toJSON().height - tree2.toJSON().height <= 1);

    sortedEqual(t, removeIds(tree.all()), removeIds(tree2.all()));

    tree.close();
    tree2.close();
    t.end();
});

t('#remove removes items correctly', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);

    var len = data.length;

    tree.remove(data[0]);
    tree.remove(data[1]);
    tree.remove(data[2]);

    tree.remove(data[len - 1]);
    tree.remove(data[len - 2]);
    tree.remove(data[len - 3]);

    sortedEqual(t,
        data.slice(3, len - 3),
        removeIds(tree.all()));

    tree.close();
    t.end();
});
t('#remove does nothing if nothing found', function (t) {
    var tree = new Rtree({ dir: "./out/a" }).load(data);
    var tree2 = new Rtree({ dir: "./out/b" }).load(data).remove([13, 13, 13, 13]);
    t.same(
        tree.toJSON(),
        tree2.toJSON());

    tree.close();
    tree2.close();
    t.end();
});
t('#remove does nothing if given undefined', function (t) {
    var tree = new Rtree({ dir: "./out/a" }).load(data);
    var tree2 = new Rtree({ dir: "./out/b" }).load(data).remove();
    t.same(
        tree.toJSON(),
        tree2.toJSON());

    tree.close();
    tree2.close();
    t.end();
});
t('#remove brings the tree to a clear state when removing everything one by one', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data);
    var tree2 = new Rtree({ dir: "./out/b", maxEntries: 4});

    for (var i = 0; i < data.length; i++) {
        tree.remove(data[i]);
    }

    t.same(tree.toJSON(), tree2.toJSON());

    tree.close();
    tree2.close();
    t.end();
});
t('#remove accepts an equals function', function (t) {
    var tree = new Rtree({ dir: "./out/a", maxEntries: 4}).load(data);

    var item = {minX: 20, minY: 70, maxX: 20, maxY: 70, foo: 'bar'};

    tree.insert(item);
    tree.remove(JSON.parse(JSON.stringify(item)), function (a, b) {
        return a.foo === b.foo;
    });

    sortedEqual(t, removeIds(tree.all()), data);
    tree.close();
    t.end();
});

t('#clear should clear all the data in the tree', function (t) {
    var tree =new Rtree({ dir: "./out/a", maxEntries: 4 }).load(data).clear();
    var tree2 = new Rtree({ dir: "./out/b", maxEntries: 4});
    t.same(
        tree.toJSON(),
        tree2.toJSON());

    tree.close();
    tree2.close();
    t.end();
});

t('should have chainable API', function (t) {
    var tree = new Rtree({ dir: "./out/a" });
    t.doesNotThrow(function () {
        tree
            .load(data)
            .insert(data[0])
            .remove(data[0]);
    });

    tree.close();
    t.end();
});
