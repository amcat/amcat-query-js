"use strict";
define(["moment"], function(moment){

    class ValueRenderFnFactory{
        getRenderFn(match){
            // not implemented
        }
    }
    
    class DateRenderFnFactory extends ValueRenderFnFactory {
        getRenderFn(match){
            let fmt = date_fmts[match[1]];
            fmt = fmt === undefined ? "YYYY-MM-DD" : fmt;
            return (str => moment(str).format(fmt));
        }
    }

    class ValueRenderer{
        constructor(pattern, renderfn){
            this.pattern = pattern;
            this.renderfn = renderfn;
        }

        getRenderFn(match){
            if(this.renderfn instanceof ValueRenderFnFactory){
                return this.renderfn.getRenderFn(match);
            }
            return this.renderfn;
        }

        match(name){
            return name.match(this.pattern);
        }
    }

    const date_fmts = {
        "day": "YYYY-MM-DD",
        "week": "YYYY-[W]WW",
        "month": "YYYY-MM",
        "quarter": "YYYY-[Q]Q",
        "year": "YYYY",
    };


    function renderIdAndName(obj){
        return obj.id + " - " + obj.label;
    }
    function renderAsString(obj){
        return obj.toString();
    }

    const renderers = [
        new ValueRenderer(/^articleset$/, renderIdAndName),
        new ValueRenderer(/^schemafield$/, renderIdAndName),
        new ValueRenderer(/^term$/, term => term.id),
        new ValueRenderer(/^total$/, _ => 'Total'),
        new ValueRenderer(/^date_(day|week|month|quarter|year)$/, new DateRenderFnFactory()),
        new ValueRenderer(/_(str|int|num|url|id|tag)$/, renderAsString),
        new ValueRenderer(/_date$/, new DateRenderFnFactory())
    ];

    function getRenderer(name, deflt){
        for(let renderer of renderers){
            let match = renderer.match(name);
            if(match === null){
                continue;
            }
            const fn = renderer.getRenderFn(match);
            console.log(fn);
            return fn;
        }
        if(deflt){
            return deflt;
        }
        throw "Could not find value renderer '" + name + "'";
    }

    return {getRenderer: getRenderer};
});
