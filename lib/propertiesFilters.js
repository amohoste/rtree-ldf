module.exports = {
    getNonBBoxProperties: function(raw) {
        const notAllowed = ['minX', 'minY', 'maxX', 'maxY', 'id'];

        return Object.keys(raw).filter(key => ! notAllowed.includes(key));
    },
    getNonIdProperties: function(raw) {
        const notAllowed = ['id'];

        return Object.keys(raw)
            .filter(key => ! notAllowed.includes(key))
            .reduce((obj, key) => {
                obj[key] = raw[key];
                return obj;
            }, {});
    }
};

