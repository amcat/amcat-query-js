define([
    "jquery", "query/utils/poll", "moment",
    "query/utils/articlemodal", "query/valuerenderers", "pnotify", "query/api",
    "query/utils/i18n",
    "highcharts.core", "highcharts.data", "highcharts.heatmap", "highcharts.exporting", "highcharts.drilldown",
    "papaparse"
], function ($, Poll, moment, articles_popup, value_renderers, PNotify, API, i18n, Highcharts, Highcharts_data, Highcharts_heatmap, Highcharts_exporting, Highcharts_drilldown) {
    "use strict";
    Highcharts_drilldown(Highcharts);
    Highcharts_exporting(Highcharts);
    Highcharts_heatmap(Highcharts);
    Highcharts_data(Highcharts);

    var renderers = {};
    API = API();

    const _ = i18n.gettext;

    moment.locale(i18n.languageCode);

    const highchartsLang = Object.assign({},
        {
            months: moment.months(),
            shortMonths: moment.monthsShort(),
            weekdays: moment.weekdays()
        },
        i18n.highchartsLang
    );


    Highcharts.setOptions({
        lang: highchartsLang,
    });

    const AxisType = {
        category: "category",
        numeric: "numeric",
        datetime: "datetime"
    };

    function getXType(axis) {
        var intervals = ["year", "quarter", "month", "week", "day", "date"];
        const numericTypes = ["int", "num"];
        if (axis.startsWith("date_") || intervals.indexOf(axis) >= 0) {
            return AxisType.datetime;
        }
        if (axis.indexOf("_") >= 0) {
            let nameparts = axis.split("_");
            let typename = nameparts[1];
            if (typename === "date") {
                return AxisType.datetime;
            }
            if (numericTypes.indexOf(typename) >= 0) {
                return AxisType.numeric;
            }
        }
        return AxisType.category;
    }

    const labelReplacements = {
        count: [/Article count|Number of articles/, () => _("Number of articles")],
        avg: [/^Average (.*)$/, (fulltext, label) => Highcharts.format(_("Average of {label}"), {label})]
    };

    function getOptionLabel(optionVal, idx){
        const funcMatch = optionVal.match(/(\w+)\((\w+)\)/);
        if(funcMatch !== null){
            const [text, func, param] = funcMatch;
            const option = $(`#id_value${idx+1} [value=${CSS.escape(text)}]`);
            const label = option.text();
            if(label.length > 0){
                return label.replace(...labelReplacements[func]);
            }
        }
        return null;
    }

    function getYLabel(axis, idx) {
        const optionLabel = getOptionLabel(axis, idx);
        if(optionLabel != null){
            return optionLabel;
        }

        if (axis === "date" || axis === "medium" || axis === "term" || axis === "set" || axis === "total" || axis.startsWith("count")) {
            return _("Number of articles");
        }

        if (axis.startsWith("avg(") && axis.endsWith(")")) {
            return _("Average");
        }

        return axis;
    }

    function bottom(callback) {
        $(window).scroll(function () {
            if ($(window).scrollTop() + $(window).height() == $(document).height()) {
                $(window).off("scroll");
                callback();
            }
        });
    }

    function get_accepted_mimetypes() {
        return $.map(renderers, function (_, mimetype) {
            return mimetype;
        });
    }

    function load_extra_summary() {
        var result = $("#result");
        result.find(".loading").show();
        var data = result.find(".row.summary").data("form");
        data["aggregations"] = false;
        data["offset"] = result.find(".articles > li").length;

        var articles = $(".articles > li", result);
        if (articles.length < parseInt(data["size"])) {
            result.find(".loading").hide();
            return;
        }

        var url = API.getActionUrl(
            "summary", $("#query-screen").data("project"),
            data.codingjobs, data.articlesets);

        $.ajax({
            type: "POST", dataType: "json",
            url: url,
            data: data,
            headers: {"X-Available-Renderers": get_accepted_mimetypes().join(",")},
            traditional: true
        }).done(function (data) {
            // Form accepted, we've been given a task uuid
            Poll(data.uuid).result(function (data) {
                result.find(".loading").hide();
                var articles = $(".articles > li", $(data));
                if (articles.length === 0) return;
                result.find(".articles").append(articles);
                bottom(load_extra_summary);
            });
        })

    }

    function intersectFilters(...filterSets) {
        let filters = {};
        for (let filterSet of filterSets) {
            for (let [k, vs] of Object.entries(filterSet)) {
                if (!(vs instanceof Array)) {
                    vs = [vs];
                }
                if (k in filters) {
                    filters[k] = filters[k].filter(v => vs.indexOf(v) >= 0);
                }
                else {
                    filters[k] = vs;
                }
            }
        }
        return filters;
    }


    class Renderer {
        constructor() {
        }

        render(formData, container, data) {

        }

        /**
         * Gather the filters necessary to show the article popup. If null is returned, no popup is shown.
         */
        getOnClickFilters(formData, clickEvent) {
            const filters = [];

            if(formData.articlesets.length > 0){
                filters.push({sets: formData.articlesets});
            }
            
            if(formData.filters.startsWith('{')) {
                filters.push(JSON.parse(formData.filters));
            }

            return intersectFilters(...filters);
        }

        onClick(formData, clickEvent) {
            let filters = this.getOnClickFilters(formData, clickEvent);

            if (filters === null) return;

            articles_popup().show(formData, filters);


            const primary = formData.primary;
            const secondary = formData.secondary;
            const value1 = formData.value1;
            const value2 = formData.value2;

            if (primary && secondary && value1 && value2){
                throw "HACK: prevent onClick from activating drilldown."
            }
        }
    }

    class JsonRenderer extends Renderer {
        render(formData, container, data) {
            let text = JSON.stringify(data, null, "  ");
            let code = $("<code class='json'>").text(text);
            $(container).append($('<pre style="background-color:#f8f8ff;">').append(code));
        }
    }

    class ChartRenderer extends Renderer {
        constructor(type, options) {
            super();
            options = options === undefined ? {} : options;
            this.secondSeriesType = options.hasOwnProperty('secondSeriesType') ? options.secondSeriesType : null;
            this.type = (type === undefined) ? "column" : type;
        }

        getTooltipOptions() {
            const primary = this.formData.primary;
            const tooltipOptions = {shared: true, dateTimeLabelFormats: i18n.dateTimeLabelFormats};
            tooltipOptions.pointFormatter = function (default_format) {
                let point = $.extend({}, this);
                let date = "";
                if (getXType(primary) === "datetime") {
                    point.x = Highcharts.dateFormat("%Y-%m-%d", point.x);
                }

                const decimals = point.series.options.tooltip.valueDecimals;
                if (typeof point.y === "number" && decimals != null){
                    point.y = point.y.toFixed(decimals);
                }

                return Highcharts.format(default_format, {point: point, series: point.series, formatted_date: date});
            };
            return tooltipOptions;
        }

        getChartOptions() {
            const tooltipOptions = this.getTooltipOptions();
            const primary = this.formData.primary;
            const secondary = this.formData.secondary;
            const chartOptions = {
                title: "",
                tooltip: tooltipOptions,
                chart: {
                    zoomType: 'xy',
                    type: this.type,
                    events: {}
                },
                xAxis: {
                    allowDecimals: false,
                    type: getXType(this.formData.primary),
                    labels: {
                        formatter: function () {
                            if(typeof(this.value) === "string") return this.value;
                            const renderer = value_renderers.getRenderer(primary);
                            let val = renderer(this.value);
                            return `${val}`;
                        }
                    }
                },
                yAxis: [
                    {
                        allowDecimals: false,
                        title: {
                            "text": getYLabel(this.formData.value1, 0)
                        }
                    }
                ],
                series: [],
                plotOptions: {
                    series: {
                        events: {
                            "click": (e) => this.onClick(this.formData, e),
                        }
                    }
                }
            };

            return chartOptions;
        }

        getOnClickFilters(formData, clickEvent) {
            if(clickEvent.point.ids instanceof Array && clickEvent.point.ids.length > 0){
                return {"ids": clickEvent.point.ids.join(",")};
            }
            return intersectFilters(super.getOnClickFilters(formData, clickEvent), clickEvent.point.pointFilters);
        }

        getFilter(axis, point){
            if(!point){
                return null;
            }
            let type = getXType(axis);
            if(axis === "term"){
                return {"q": point.query};
            }
            if(axis === "articleset"){
                axis = "sets";
            }
            return {[axis]: point.id ? point.id : point.label ? point.label : point};
        }

        getPointData(point, series){
            const primary = this.formData.primary;
            const secondary = this.formData.secondary;
            series = series === undefined ? 0 : series;
            const pointData = {y: point[1][series]};
            if(pointData.y.length == 2){
                pointData.ids = pointData.y[1];
                pointData.y = pointData.y[0];
            }
            if(point[0][0].label) {
                pointData.name = point[0][0].label;
            }
            else if(isNaN(parseFloat(point[0][0]))) {
                pointData.name = point[0][0];
            }
            else{
                pointData.x = point[0][0];
            }
            pointData.pointFilters = {
                ...this.getFilter(primary, point[0][0]),
                ...this.getFilter(secondary, point[0][1])
            };
            return pointData;
        }

        render(formData, container, data) {
            this.formData = formData;
            const primary = formData.primary;
            const secondary = formData.secondary;
            const value1 = formData.value1;
            const value2 = formData.value2;

            if (getXType(primary) === AxisType.datetime) {
                data.forEach(function (point) {
                    let p = point[0][0];
                    if(p.match(/^\d{4}-\d\d-\d\dT\d\d:\d\d:\d\d$/)){ // Add UTC timezone to prevent off-by-one errors
                        p += "+0000";
                    }
                    point[0][0] = Date.parse(p);
                });
            }

            container.append($("<div class='ht'></div>"));

            const chartOptions = this.getChartOptions();

            if (primary && secondary && value1 && value2){
                // 2 aggrs + 2 values
                container.find(".ht").after(
                    $("<br/><center><i>This is a multi-level chart. Click on a label directly under a " +
                    "bar to drilldown a level.</i></center>")
                );

                // STEP 1: Add pre-drilldown data: 1 aggregation + 2 values. This almost the same as the routine used
                // for 1 aggregation and 2 values.

                // Add bars (first value)
                chartOptions.series.push({
                    name: getOptionLabel(value1, 0),
                    data: $(data).map((i, point) => {
                        if (point.value[1][0] === null) return null;
                        var pointData = this.getPointData(point.value, 0);
                        pointData.drilldown = pointData.name;
                        return [pointData];
                    })
                });

                // Add line (second value)
                chartOptions.series.push({
                    name: getOptionLabel(value2, 1),
                    yAxis: 1,
                    type: this.secondSeriesType === null ? "scatter" : this.secondSeriesType,
                    data: $(data).map((i, point) => {
                        if (point.value[1][1] === null) return null;
                        var pointData = this.getPointData(point.value, 1);
                        pointData.drilldown = pointData.name;
                        return [pointData];
                    })
                });

                // Add second y-axis
                chartOptions.yAxis.push({
                    title: {"text": getYLabel(value2, 1)},
                    opposite: true
                });

                chartOptions.drilldown = {
                    series: []
                }

                // Add drilldown bars (first value)
                data.forEach(point => {
                    var drilldownName = this.getPointData(point.value, 0).name;
                    chartOptions.drilldown.series.push({
                        name: drilldownName,
                        id: drilldownName,
                        data: $(point.drilldown).map((i, pointd) => {
                            var pointdd = this.getPointData(pointd, 0);
                            pointdd.name = pointd[0][1].label;
                            return [pointdd];
                        })
                    });
                });

                // Add drilldown line (second value)
                data.forEach(point => {
                    var drilldownName = this.getPointData(point.value, 0).name;
                    chartOptions.drilldown.series.push({
                        // TODO: Figure out how to fix this with CSS rules?
                        marker: {
                            fillColor: "black",
                        },
                        yAxis: 1,
                        name: drilldownName,
                        id: drilldownName,
                        type: this.secondSeriesType === null ? "scatter" : this.secondSeriesType,
                        data: $(point.drilldown).map((i, pointd) => {
                            var pointdd = this.getPointData(pointd, 1);
                            pointdd.name = pointd[0][1].label;
                            return [pointdd];
                        })
                    });
                });

                // Work-around bug in Highcharts causing it to not pickup a second drilldown series on a
                // secondary axis. The code below manually adds the series.
                chartOptions.chart.events.drilldown = function(e){
                    e.preventDefault();

                    var chart = this;
                    var drilldowns = drilldowns = chart.userOptions.drilldown.series;

                    Highcharts.each(drilldowns, function(p, i) {
                        if (p.id.includes(e.point.name)) {
                            chart.addSingleSeriesAsDrilldown(e.point, p);
                        }
                    });

                    chart.applyDrilldown();
                }
            } else if (primary && !secondary && value1 && !value2) {
                // 1 aggr + 1 value
                chartOptions.series.push({
                    name: primary,
                    data: $(data).map((i, point) => this.getPointData(point))
                });

                chartOptions.legend = {
                    enabled: false
                };
            } else if (primary && secondary) {
                // 2 aggr + 1 value
                var series = {};
                var prim_val, sec_val, val;

                data.forEach(function (point) {
                    sec_val = point[0][1];
                    series[sec_val.id || sec_val.label || sec_val] = {
                        name: sec_val.label || sec_val,
                        data: []
                    };
                });

                data.forEach((point) => {
                    prim_val = point[0][0];
                    sec_val = point[0][1];
                    val = point[1][0];
                    let pointData = this.getPointData(point);
                    series[sec_val.id || sec_val.label || sec_val].data.push(pointData);
                });

                chartOptions.series = Array.from(Object.values(series));
            } else {
                // 1 aggr + 2 values
                // Add bars (first value)
                chartOptions.series.push({
                    name: getOptionLabel(value1, 0),
                    data: $(data).map((i, point) => {
                        if (point[1][0] === null) return null;
                        return [this.getPointData(point, 0)];
                    })
                });

                // Add line (second value)
                chartOptions.series.push({
                    name: getOptionLabel(value2, 1),
                    yAxis: 1,
                    type: this.secondSeriesType === null ? "scatter" : this.secondSeriesType,
                    data: $(data).map((i, point) => {
                        if (point[1][1] === null) return null;
                        return [this.getPointData(point, 1)];
                    })
                });

                // Add second y-axis
                chartOptions.yAxis.push({
                    title: {"text": getYLabel(value2, 1)},
                    opposite: true
                });
            }

            return container.find(".ht").highcharts(chartOptions).highcharts();
        }
    }

    class BarChartRenderer extends ChartRenderer {
        constructor() {
            super("column");
        }
    }

    class LineChartRenderer extends ChartRenderer {
        constructor() {
            super("line", {secondSeriesType: "line"});
        }
    }

    class ScatterChartRenderer extends ChartRenderer {
        constructor() {
            super("scatter");
        }
    }

    /**
     * Renders aggregation data. It expects a slightly different format than the
     * other render functions. It expects a matrix in the following manner:
     *
     *      {
     *          rows: ["A1", "A2"]
     *          columns: ["B1", "B2"]
     *          data: [
     *              [1, 2],
     *              [3, 4]
     *          ]
     *      }
     *
     * It can handle situations with multiple values as well, rendering subcolumns
     * where needed.
     */
    class AggregationTableRenderer extends Renderer {
        render(form_data, container, matrix) {
            const thead = $("<thead>").append($("<th>"));
            const tbody = $("<tbody>");
            const table = $("<table>").addClass("aggregation dataTable table table-striped");
            var row_template, renderer;

            var primary = form_data.primary;
            var secondary = form_data.secondary;
            var value1 = form_data.value1;
            var value2 = form_data.value2;

            var value1type = $("#id_value1 [value='{v}']".format({v: value1})).text();
            var value2type = $("#id_value2 [value='{v}']".format({v: value2})).text();

            if (!secondary && !value2) {
                // Only one column needed, which is of type 'value1'
                thead.append($("<th>").text(value1type));
            } else if (!secondary) {
                // Two columns needed, but both are simple value types
                thead.append($("<th>").text(value1type));
                thead.append($("<th>").text(value2type));
            } else if (!value2) {
                // N columns needed, all of the same type
                renderer = value_renderers.getRenderer(secondary);
                $.map(matrix.columns, function (column) {
                    thead.append($("<th>").text(renderer(column)).data("value", column));
                });
            } else {
                // Complex column (N columns + 2 values per column) needed
                renderer = value_renderers.getRenderer(secondary);

                // Add first header row
                thead.html("<tr><th rowspan='2'></th></tr>");
                $.map(matrix.columns, function (column) {
                    var th = $("<th>");
                    th.text(renderer(column));
                    th.attr("colspan", 2);
                    th.data("value", column);
                    thead.find("tr").append(th);
                });

                // Add second header row
                var tr = $("<tr>");
                $.map(matrix.columns, function (_) {
                    tr.append($("<th>").text(value1type));
                    tr.append($("<th>").text(value2type));
                });
                thead.append(tr);
            }

            // Exploit (abuse?) javascript's coercing..
            var numberOfValues = !!value1 + !!value2;

            // Adding rows. Using row templates to prevent lots of small inserts
            row_template = (new Array(matrix.columns.length * numberOfValues + 1)).join("<td></td>");
            row_template = "<tr><th></th>" + row_template + "</tr>";

            renderer = value_renderers.getRenderer(primary);

            $.each(matrix.data, function (rownr, rowdata) {
                // Set th elements text- and value property
                var row = matrix.rows[rownr];
                var row_element = $(row_template);
                row_element.find("th").text(renderer(row)).data("value", row);

                $.each(rowdata, function (colnr, values) {
                    $.each(values, function (valuenr, value) {
                        // Check for float / integer. And wtf javascript, why no float type?!
                        let ids = null;
                        if(value instanceof Array) {
                            ids = value[1];
                            value = value[0];
                        }
                        if (value === null) return true;
                        value = ((value | 0) === value) ? value : value.toFixed(2);
                        row_element.find("td").eq(colnr * numberOfValues + valuenr).text(value).attr('data-ids', ids);
                    });
                });

                tbody.append(row_element);
            });

            // Putting it together
            table.append(thead).append(tbody);
            container.html(table);

            // Register click event (on table)
            table.click(e => this.onClick(form_data, e));
        }

        getOnClickFilters(formData, clickEvent) {
            const formFilters = super.getOnClickFilters(formData, clickEvent);
            const primary = formData.primary;
            const secondary = formData.secondary;
            var td = $(clickEvent.target);

            if (window.location.hash.slice(1) !== "aggregation") {
                const ids = td.data('ids');
                return {"ids": ids};
            }

            if (td.prop("tagName") === "TD") {
                // Do not process empty cells
                if (!td.text()) {
                    return null;
                }

                var col = td.closest('table').find('thead th').eq(td.index());
                var row = td.parent().children().eq(0);

                var filters = {};
                let data = row.data('value');
                filters[primary] = data.query || data.label || data;

                if (secondary) {
                    data = col.data('value');
                    filters[secondary] =  data.query || data.label || data;
                }

                return intersectFilters(filters, formFilters);
            }
            return formFilters;
        }
    }

    class TableRenderer {
        render(form_data, container, table_data) {
            var thead = $("<thead>").append(
                $.map(table_data[0], function (label) {
                    return $("<th>").text(label);
                })
            );

            var tbody = $("<tbody>").append(
                $.map(table_data.slice(1), function (row) {
                    return $("<tr>").append(
                        $.map(row, function (value) {
                            return $("<td>").text(value);
                        })
                    )
                })
            );


            var table = $("<table class='table table-striped'>").append([thead, tbody]);
            container.append(table);
            return table;
        }
    }

    class CSVTableRenderer extends TableRenderer {
        render(form_data, container, data) {
            var table_data = Papa.parse(data, {skipEmptyLines: true}).data;
            return super.render(form_data, container, table_data);
        }
    }

    class ClustermapTableRenderer extends CSVTableRenderer {
        render(form_data, container, data) {
            var table = super.render(form_data, container, data.csv);
            table.addClass("table-hover");

            $("tr", table).click(function (event) {
                // Find column indices of relevant queries
                var columns = [];
                var tds = $("td", $(event.currentTarget)).toArray();
                tds.pop();

                $.each(tds, function (i, td) {
                    if ($(td).text() == "1") {
                        columns.push(i);
                    }
                });

                // Resolve queries
                var queries = $.map(columns, function (column) {
                    var query = $($("thead > th", table)[column]).text();
                    return data.queries[query];
                });

                articles_popup().show(form_data, {
                    query: "(" + queries.join(") AND (") + ")"
                });
            }).css("cursor", "pointer");
        }
    }

    return $.extend(renderers, {
        "application/json+debug": (formData, container, data) => new JsonRenderer().render(formData, container, data),
        "application/json+clustermap+table": (formData, container, data) => new ClustermapTableRenderer().render(formData, container, data),
        "text/csv+table": (formData, container, data) => CSVTableRenderer().render(formData, container, data),
        "application/json+tables": function (form_data, container, data) {
            $.map(data, function (table) {
                var table_name = table[0];
                var table_data = table[1];
                var table_container = $("<div>");
                renderers["application/json+table"](form_data, table_container, table_data);
                $(table_container).prepend($("<h1>").text(table_name));
                $(container).append(table_container);
            });

            return container;
        },
        "application/json+table": (f, c, d) => new TableRenderer().render(f, c, d),
        "application/json+crosstables": function (form_data, container, data) {
            renderers["application/json+tables"](form_data, container, data);
            $("tr td:first-child", container).css("font-weight", "bold");
        },
        "application/json+clustermap": function (form_data, container, data) {
            var img = $("<img class='img-responsive'>")
                .attr("src", "data:image/png;base64," + data.image)
                .attr("usemap", "#clustermap");

            var map = $("<map>").attr("name", "clustermap");

            // Store for each clickable coordinate its article id
            var area;
            $.map(data.coords, function (coord) {
                area = $("<area>");
                area.attr("shape", "rect");
                area.attr("coords", coord.coords.join(","));
                area.attr("article_id", coord.article_id);
                area.data("article_id", coord.article_id);
                map.append(area);
            });

            // Add query for cluster each article is in
            $.each(data.clusters, function (_, cluster) {
                $.each(cluster.articles, function (_, article_id) {
                    map.find("[article_id=" + article_id + "]").data("query", cluster.query);
                });
            });

            // Register click event for each article
            $("area", map).click(function (event) {
                articles_popup().show(form_data, {
                    term: {
                        label: $(event.currentTarget).data("query")
                    }
                })
            });

            container.append(img).append(map);
        },
        "application/json+image+svg+multiple": function (form_data, container, data) {
            $.map(data, function (table) {
                var table_container = $("<div>");
                renderers["image/svg"](form_data, table_container, table[1]);
                $(table_container).prepend($("<h1>").text(table[0]));
                $(container).append(table_container);
            });

            return container;
        },
        "image/svg": function (form_data, container, data) {
            return container.html(data);
        },
        "image/png+base64": function (form_data, container, data) {
            container.append($("<img class='img-responsive'>").attr("src", "data:image/png;base64," + data));
        },
        /**
         * Inserts given html into container, without processing it further.
         */
        "text/html": function (form_data, container, data) {
            return container.html(data);
        },
        "text/html+summary": function (form_data, container, data) {
            renderers["text/html"](form_data, container, data);

            bottom(load_extra_summary);
        },

        /**
         * Renders aggregation as stacked column chart
         *   http://www.highcharts.com/demo/heatmap
         */
        "text/json+aggregation+heatmap": function (form_data, container, data) {
            alert("Heatmap disabled for now..");

            var aggregation = Aggregation(data);
            var heatmap_data = [];

            data.forEach(function (row, rowIdx) {
                var rowFields = row[1];
                rowFields.forEach(function (field) {
                    var fieldData = field[0];
                    var fieldValue = field[1];
                    var fieldIdx = aggregation.columns.findIndex(function (item) {
                        return item.id == fieldData.id;
                    });

                    heatmap_data.push([rowIdx, fieldIdx, fieldValue])
                });
            });
            var x_renderer = value_renderers.getRenderer(form_data["x_axis"]);
            var y_renderer = value_renderers.getRenderer(form_data["y_axis"]);

            container.highcharts({
                title: "",
                chart: {type: 'heatmap'},
                colorAxis: {
                    min: 0,
                    minColor: '#FFFFFF',
                    maxColor: Highcharts.getOptions().colors[0]
                },
                xAxis: {
                    allowDecimals: false,
                    categories: $.map(aggregation.rows, x_renderer)
                },
                yAxis: {
                    allowDecimals: false,
                    categories: $.map(aggregation.columns, y_renderer)
                },
                series: [{
                    name: "x",
                    data: heatmap_data
                }]
            });
        },

        "text/json+aggregation+line": (form_data, container, data) => new LineChartRenderer().render(form_data, container, data),

        "text/json+aggregation+scatter": (form_data, container, data) => new ScatterChartRenderer().render(form_data, container, data),

        "text/json+aggregation+barplot": (form_data, container, data) => new BarChartRenderer().render(form_data, container, data),

        "text/json+aggregation+table": (formData, container, matrix) => new AggregationTableRenderer().render(formData, container, matrix)
    });
});

