module.exports = {
    createDataFragment: function() {
        return {
            "@context": {
                "geo": "http://www.w3.org/2003/01/geo/wgs84_pos#",
                "dcterms": "http://dublincore.org/2012/06/14/dcterms"
            },
            "@graph": [

            ]
        };
    },
    createTreeFragment: function() {
        return {
            "@context": {
                "tree": "https://w3id.org/tree#",
                "value": {
                    "@id": "tree:value",
                    "@type": "http://www.opengis.net/ont/geosparql#wktLiteral"
                },
                "dcterms": "http://dublincore.org/2012/06/14/dcterms",
                "hydra": "http://www.w3.org/ns/hydra/core#"
            },
            "@graph": [

            ]
        };
    },
    createGeospatiallyContainsRelation: function() {
        return {
            "@type": "tree:GeospatiallyContainsRelation",
            "tree:child": [

            ]
        }
    },
    createCollectionDescription: function(collection_url, manages, totalItems, view) {
        return {
            "@context": {
                "hydra": "http://www.w3.org/ns/hydra/core#",
                "tree": "https://w3id.org/tree#"
            },
            "@graph": [
                {
                    "@id": collection_url,
                    "@type": "hydra:Collection",
                    "hydra:manages": manages,
                    "hydra:totalItems": totalItems,
                    "hydra:view": {
                        "@id": view,
                        "@type": "tree:Node"
                    }
                }
            ]
        }
    },
    stringSize: function(str) {
        return str.length;
    }
};

