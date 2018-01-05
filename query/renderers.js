define([
    "jquery", "query/utils/poll", "moment",
    "query/utils/articlemodal", "query/valuerenderers", "pnotify", "query/api",
    "highcharts.core", "highcharts.data", "highcharts.heatmap", "highcharts.exporting",
    "papaparse"
], function ($, Poll, moment, articles_popup, value_renderers, PNotify, API) {
    "use strict";
    var renderers = {};
    API = API();

    function getXType(axis) {
        var intervals = ["year", "quarter", "month", "week", "day", "date"];
        return axis.startsWith("date_") ? "datetime" : "category";
    }

    function getYType(axis) {
        if (axis === "date" || axis === "medium" || axis === "term" || axis === "set" || axis === "total" || axis === "count") {
            return "Number of articles";
        }

        if (axis.startsWith("avg(") && axis.endsWith(")")) {
            return "Average";
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

    class Point {
        constructor(filters){
            this.filters = filters;
        }
    }

    class Renderer {
        constructor() {
        }

        render(formData, container, data) {

        }

        /**
         * Gather the filters necessary to show the article popup. If null is returned, no popup is shown.
         */
        getOnClickFilters(formData, clickEvent){
            return null;
        }

        onClick(formData, clickEvent){
            let filters = this.getOnClickFilters(formData, clickEvent);

            if(filters === null) return;

            console.log(filters);
            articles_popup().show(formData, filters);
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
        constructor(type) {
            super();
            this.type = (type === undefined) ? "column" : type;
        }

        getTooltipOptions() {
            const primary = this.formData.primary;
            const tooltipOptions = {shared: true};
            tooltipOptions.pointFormatter = function (default_format) {
                let point = $.extend({}, this);
                let date = "";
                if (getXType(primary) === "datetime") {
                    point.x = Highcharts.dateFormat("%Y-%m-%d", point.x);
                }
                return Highcharts.format(default_format, {point: point, series: point.series, formatted_date: date});
            };
            return tooltipOptions;
        }

        getChartOptions() {
            const tooltipOptions = this.getTooltipOptions();
            const chartOptions = {
                title: "",
                tooltip: tooltipOptions,
                chart: {
                    zoomType: 'xy',
                    type: this.type
                },
                xAxis: {
                    allowDecimals: false,
                    type: getXType(this.formData.primary)
                },
                yAxis: [
                    {
                        allowDecimals: false,
                        title: {
                            "text": getYType(this.formData.value1)
                        }
                    }
                ],
                series: [],
                plotOptions: {
                    series: {
                        events: {"click": (e) => this.onClick(this.formData, e) }
                    }
                }
            };

            return chartOptions;
        }

        getOnClickFilters(formData, clickEvent){
            const primary = formData.primary;
            const secondary = formData.secondary;
            const point = clickEvent.point;
            const filters = {};

            filters[primary] = getXType(primary) === "datetime"?  point.x : point.name;
            if(secondary) filters[secondary] = point.series.name;
            return filters;
        }

        render(formData, container, data) {
            this.formData = formData;
            const primary = formData.primary;
            const secondary = formData.secondary;
            const value1 = formData.value1;
            const value2 = formData.value2;


            if (getXType(primary) === "datetime") {
                data.forEach(function (point) {
                    point[0][0] = Date.parse(point[0][0]);
                });
            }

            const chartOptions = this.getChartOptions();


            if (primary && !secondary && value1 && !value2) {
                // 1 aggr + 1 value
                chartOptions.series.push({
                    name: primary,
                    data: $(data).map(function (i, point) {
                        return [[point[0][0].label || point[0][0], point[1][0]]];
                    })
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
                    series[sec_val.id || sec_val] = {
                        name: sec_val.label || sec_val,
                        data: []
                    };
                });

                data.forEach(function (point) {
                    prim_val = point[0][0];
                    sec_val = point[0][1];
                    val = point[1][0];
                    series[sec_val.id || sec_val].data.push([prim_val.label || prim_val, val]);
                });

                chartOptions.series = $.map(series, function (val) {
                    return val;
                });
            } else {
                // 1 aggr + 2 value

                // Add bars (first value)
                chartOptions.series.push({
                    name: $("#id_value1 [value='{v}']".format({v: value1})).text(),
                    data: $(data).map(function (i, point) {
                        if (point[1][0] === null) return null;
                        return [[point[0][0].label || point[0][0], point[1][0]]];
                    })
                });

                // Add line (second value)
                chartOptions.series.push({
                    name: $("#id_value2 [value='{v}']".format({v: value2})).text(),
                    yAxis: 1,
                    type: "scatter",
                    data: $(data).map(function (i, point) {
                        if (point[1][1] === null) return null;
                        return [[point[0][0].label || point[0][0], point[1][1]]];
                    })
                });

                // Add second y-axis
                chartOptions.yAxis.push({
                    title: {"text": getYType(value2)},
                    opposite: true
                });
            }

            container.append($("<div class='ht'></div>"));
            container.find(".ht").highcharts(chartOptions);


        }
    }

    class BarChartRenderer extends ChartRenderer{
        constructor(){
            super("column");
        }
    }

    class LineChartRenderer extends ChartRenderer{
        constructor(){
            super("line");
        }
    }

    class ScatterChartRenderer extends ChartRenderer{
        constructor(){
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
        render (form_data, container, matrix) {
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
                        if (value === null) return true;
                        value = (value % 1 === 0) ? value : value.toFixed(2);
                        row_element.find("td").eq(colnr * numberOfValues + valuenr).text(value);
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

        getOnClickFilters(formData, clickEvent){
            const primary = formData.primary;
            const secondary = formData.secondary;
            if (window.location.hash.slice(1) !== "aggregation") {
                new PNotify({
                    "type": "info",
                    "text": "Viewing articles / codings not yet supported in coding aggregations."
                });
                return null;
            }

            var td = $(clickEvent.target);
            if (td.prop("tagName") === "TD") {
                // Do not process empty cells
                if (!td.text()) {
                    return null;
                }

                var col = td.closest('table').find('thead th').eq(td.index());
                var row = td.parent().children().eq(0);

                var filters = {};
                filters[primary] = row.data('value');

                if (secondary) {
                    filters[secondary] = col.data('value');
                }

                return filters;
            }
            return null;
        }
    }

    class TableRenderer {
         render (form_data, container, table_data) {
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

    class ClustermapTableRenderer extends CSVTableRenderer{
        render (form_data, container, data) {
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

            console.log(data)
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

