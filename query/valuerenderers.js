define(["moment"], function(moment){
    var renderers = {
        "medium": function(medium){
            return medium.id + " - " + medium.label;
        },
        "articleset": function(articleset){
            return articleset.id + " - " + articleset.label;
        },
        "schemafield": function(schemafield){
            return schemafield.id + " - " + schemafield.label;
        },
        "date": function(date){
            return moment(date).format("DD-MM-YYYY");
        },
        "total": function(total){
            return "Total";
        },
        "term": function(term){
            return term.id;
        },
        "getRenderer": function(name, dflt){
            var renderer = renderers[name];
            if (renderer !== undefined){
                return renderer;
            }

            if (name.indexOf("schemafield_") === 0){
                return renderers.schemafield;
            }

            var intervals = ["day", "week", "month", "quarter", "year"];
            if (intervals.indexOf(name) !== -1){
                return renderers.date;
            }

            if (dflt){
                return dflt;
            }

            throw "Could not find renderer '" + name + "'";
        }
    };

    return renderers;
});