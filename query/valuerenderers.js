"use strict";
define(["moment", "query/utils/i18n"], function (moment, i18n) {

    const _ = i18n.gettext;

    const defaultOptions = Object.freeze({
        neverShowId: false
    });

    // simple renderers
    function renderIdAndLabel(obj) {
        return obj.id + " - " + obj.label;
    }

    function renderLabel(obj) {
        return obj.label;
    }

    function renderAsString(obj) {
        return obj.toString();
    }

    function renderLiteral(literal) {
        return () => literal;
    }

    class ValueRenderFnFactory {
        getRenderFn(match) {
            // not implemented
        }
    }


    // date rendering


    const date_fmts = {
        "day": "YYYY-MM-DD",
        "week": "YYYY-[W]WW",
        "month": "YYYY-MM",
        "quarter": "YYYY-[Q]Q",
        "year": "YYYY",
    };

    class DateRenderFnFactory extends ValueRenderFnFactory {
        getRenderFn(match) {
            let fmt = date_fmts[match[2]];
            fmt = fmt === undefined ? "YYYY-MM-DD" : fmt;
            return (str => moment(str).format(fmt));
        }
    }


    class ValueRenderer {
        /**
         * Constructs the ValueRenderer instance.
         * @param pattern    The pattern the fieldname has to match
         * @param renderfn   The renderfn can be either a function that takes the field value as input and returns a
         * string, or a ValueRenderFnFactory type. The ValueRenderFnFactory can return a render function that depends
         * on the field name.
         */
        constructor(pattern, renderfn) {
            this.pattern = pattern;
            this.renderfn = renderfn;
        }

        getRenderFn(match, options) {
            let renderer;
            if (this.renderfn instanceof ValueRenderFnFactory) {
                renderer = this.renderfn.getRenderFn(match);
            }
            else {
                renderer = this.renderfn;
            }

            if(options.neverShowId && renderer === renderIdAndLabel){
                renderer = renderLabel;
            }
            return renderer;
        }

        match(name) {
            return name.match(this.pattern);
        }
    }


    const renderers = [
        new ValueRenderer(/^codingschemafield/, renderIdAndLabel),
        new ValueRenderer(/^articleset$/, renderIdAndLabel),
        new ValueRenderer(/^schemafield/, renderIdAndLabel),
        new ValueRenderer(/^term$/, renderLabel),
        new ValueRenderer(/^total$/, renderLiteral(_("Total"))),
        new ValueRenderer(/^(date_)?(day|week|month|quarter|year)$/, new DateRenderFnFactory()),
        new ValueRenderer(/_(str|int|num|url|id|tag)$/, renderAsString),
        new ValueRenderer(/_date$/, new DateRenderFnFactory())
    ];

    function getRenderer(name, deflt, options) {
        options = {...defaultOptions, ...options};
        for (let renderer of renderers) {
            let match = renderer.match(name);
            if (match !== null) {
                return renderer.getRenderFn(match, options);
            }
        }
        if (deflt != null) {
            return deflt;
        }
        throw new Error("Could not find value renderer '" + name + "'");
    }

    return {getRenderer: getRenderer};
});
