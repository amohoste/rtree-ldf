class Node {

    constructor(id, minX = Infinity, minY = Infinity, maxX = -Infinity, maxY = -Infinity) {
        this.id = id;
        this.minX = minX;
        this.minY = minY;
        this.maxX = maxX;
        this.maxY = maxY;
    }

}

module.exports = Node;