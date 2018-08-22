module.exports = {
    stringify: function(obj) {
        return JSON.stringify(obj, function(key, value) {
            if (value === Infinity) {
                return "Infinity";
            } else if (value === -Infinity) {
                return "-Infinity";
            } else {
                return value;
            }
        });
    },
    deStringify: function(str) {
        return JSON.parse(str, function (key, value) {
            if (value === "Infinity") {
                return Infinity;
            } else if (value === "-Infinity") {
                return -Infinity;
            } else {
                return value;
            }
        });
    }
};

