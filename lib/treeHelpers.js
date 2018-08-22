
module.exports = {
    findItem: function(item, items, equalsFn) {
        if (!equalsFn) equalsFn = isEquivalent;

        for (let i = 0; i < items.length; i++) {
            if (equalsFn(item, items[i])) return i;
        }

        return -1;
    },
    bboxArea: function(a) { return (a.maxX - a.minX) * (a.maxY - a.minY); },
    bboxMargin: function(a) { return (a.maxX - a.minX) + (a.maxY - a.minY); },
    enlargedArea: function(a, b) {
        return (Math.max(b.maxX, a.maxX) - Math.min(b.minX, a.minX)) *
            (Math.max(b.maxY, a.maxY) - Math.min(b.minY, a.minY));
    },
    intersectionArea: function(a, b) {
        let minX = Math.max(a.minX, b.minX),
            minY = Math.max(a.minY, b.minY),
            maxX = Math.min(a.maxX, b.maxX),
            maxY = Math.min(a.maxY, b.maxY);

        return Math.max(0, maxX - minX) *
            Math.max(0, maxY - minY);
    },
    contains: function (a, b) {
        return a.minX <= b.minX &&
            a.minY <= b.minY &&
            b.maxX <= a.maxX &&
            b.maxY <= a.maxY;
    },
    intersects: function (a, b) {
        return b.minX <= a.maxX &&
            b.minY <= a.maxY &&
            b.maxX >= a.minX &&
            b.maxY >= a.minY;
    }
};


function isEquivalent(a, b) {
    let aProps = Object.getOwnPropertyNames(a);
    let bProps = Object.getOwnPropertyNames(b);

    if (aProps.length !== bProps.length) {
        return false;
    }

    for (let i = 0; i < aProps.length; i++) {
        let propName = aProps[i];

        if (propName !== 'id' && a[propName] !== b[propName]) {
            return false;
        }
    }

    return true;
}