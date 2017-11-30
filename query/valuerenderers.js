"use strict";
define(["moment"], function(moment){

    class Renderer{
        constructor(pattern, renderfn){
            this.pattern = pattern;
            this.renderfn = renderfn;
        }

        matches(name){
            return name.match(this.pattern) !== null;
        }
    }

    function renderDate(dateStr){
        return moment(dateStr).format("DD-MM-YYYY");
    }
    function renderIdAndName(obj){
        return obj.id + " - " + obj.label;
    }
    function renderAsString(obj){
        return obj.toString();
    }

    const renderers = [
        new Renderer(/^articleset$/, renderIdAndName),
        new Renderer(/^schemafield$/, renderIdAndName),
        new Renderer(/^term$/, term => term.id),
        new Renderer(/^total$/, _ => 'Total'),
        new Renderer(/^date_(day|week|month|quarter|year)$/, renderDate),
        new Renderer(/_(str|int|num|url|id|tag)$/, renderAsString),
        new Renderer(/_date$/, renderDate)
    ];

    function getRenderer(name, deflt){
        for(let renderer of renderers){
            if(!renderer.matches(name)){
                continue;
            }
            return renderer.renderfn;
        }
        if(deflt){
            return deflt;
        }
        throw "Could not find renderer '" + name + "'";
    }

    return {getRenderer: getRenderer};
});
