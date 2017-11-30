"use strict";
define(["moment"], function(moment){

    class RenderFnFactory{
        getRenderFn(match){
            // not implemented
        }
    }

    class Renderer{
        constructor(pattern, renderfn){
            this.pattern = pattern;
            this.renderfn = renderfn;
        }

        getRenderFn(match){
            if(this.renderfn instanceof RenderFnFactory){
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

    class DateRenderFnFactory extends RenderFnFactory {
        getRenderFn(match){
            let fmt = date_fmts[match[1]];
            fmt = fmt === undefined ? "YYYY-MM-DD" : fmt;
            return (str => moment(str).format(fmt));
        }
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
        new Renderer(/^date_(day|week|month|quarter|year)$/, new DateRenderFnFactory()),
        new Renderer(/_(str|int|num|url|id|tag)$/, renderAsString),
        new Renderer(/_date$/, new DateRenderFnFactory())
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
        throw "Could not find renderer '" + name + "'";
    }

    return {getRenderer: getRenderer};
});
