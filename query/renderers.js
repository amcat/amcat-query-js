define([
    "jquery", "renderjson", "query/utils/poll", "moment",
    "query/utils/articlemodal", "query/valuerenderers", "pnotify", "query/api",
    "highcharts.core", "highcharts.data", "highcharts.heatmap", "highcharts.exporting",
    "papaparse"
], function($, renderjson, Poll, moment, articles_popup, value_renderers, PNotify, API){
    "use strict";
    var renderers = {};
    API = API();

    function getXType(axis){
        var intervals = ["year", "quarter", "month", "week", "day", "date"];
        return (intervals.indexOf(axis) === -1) ? "category" : "datetime";
    }

    function getYType(axis){
        if(axis === "date" || axis === "medium" || axis === "term" || axis === "set" || axis === "total" || axis === "count"){
            return "Number of articles";
        }

        if (axis.startsWith("avg(") && axis.endsWith(")")){
            return "Average";
        }

        return axis;
    }

    function bottom(callback){
        $(window).scroll(function(){
            if($(window).scrollTop() + $(window).height() == $(document).height()){
                $(window).off("scroll");
                callback();
            }
        });
    }

    function get_accepted_mimetypes(){
        return $.map(renderers, function(_, mimetype){
            return mimetype;
        });
    }

    function load_extra_summary(){
        var result = $("#result");
        result.find(".loading").show();
        var data = result.find(".row.summary").data("form");
        data["aggregations"] = false;
        data["offset"] = result.find(".articles > li").length;

        var url = API.getActionUrl(
            "summary", $("#query-screen").data("project"),
            data.codingjobs, data.articlesets);

        $.ajax({
            type: "POST", dataType: "json",
            url: url,
            data: data,
            headers: { "X-Available-Renderers": get_accepted_mimetypes().join(",") },
            traditional: true
        }).done(function(data){
            // Form accepted, we've been given a task uuid
            Poll(data.uuid).result(function(data){
                result.find(".loading").hide();
                var articles = $(".articles > li", $(data));
                if(articles.length === 0) return;
                result.find(".articles").append(articles);
                bottom(load_extra_summary);
            });
        })

    }

    return $.extend(renderers, {
        "application/json+debug": function(form_data, container, data){
            renderjson.set_icons('', '');
            renderjson.set_show_to_level("all");
            var text = $(renderjson(data)).text().replace(/{...}|\[ ... \]/g, "");
            var code = $("<code class='json'>").text(text);
            $(container).append($('<pre style="background-color:#f8f8ff;">').append(code));
            hljs.highlightBlock($("pre", container).get(0));
        },
        "application/json+clustermap+table": function(form_data, container, data){
            var table = renderers["text/csv+table"](container, data.csv);
            table.addClass("table-hover");

            $("tr", table).click(function(event){
                // Find column indices of relevant queries
                var columns = [];
                var tds = $("td", $(event.currentTarget)).toArray();
                tds.pop();

                $.each(tds, function(i, td){
                    if($(td).text() == "1"){
                        columns.push(i);
                    }
                });

                // Resolve queries
                var queries = $.map(columns, function(column){
                    var query = $($("thead > th", table)[column]).text();
                    return data.queries[query];
                });

                articles_popup().show(form_data, {
                    query: "(" + queries.join(") AND (") + ")"
                });
            }).css("cursor", "pointer");
        },
        "text/csv+table": function(form_data, container, data){
            var table_data = Papa.parse(data, { skipEmptyLines: true }).data;
            return renderers["application/json+table"](form_data, container, table_data);
        },
        "application/json+tables": function(form_data, container, data){
            $.map(data, function(table){
                var table_name = table[0];
                var table_data = table[1];
                var table_container = $("<div>");
                renderers["application/json+table"](form_data, table_container, table_data);
                $(table_container).prepend($("<h1>").text(table_name));
                $(container).append(table_container);
            });

            return container;
        },
        "application/json+table": function(form_data, container, table_data){
            var thead = $("<thead>").append(
                $.map(table_data[0], function(label){
                    return $("<th>").text(label);
                })
            );

            var tbody = $("<tbody>").append(
                $.map(table_data.slice(1), function(row){
                    return $("<tr>").append(
                        $.map(row, function(value){
                            return $("<td>").text(value);
                        })
                    )
                })
            );

            var table = $("<table class='table table-striped'>").append([thead, tbody]);
            container.append(table);
            return table;
        },
        "application/json+crosstables": function(form_data, container, data){
            renderers["application/json+tables"](form_data, container, data);
            $("tr td:first-child", container).css("font-weight", "bold");
        },
        "application/json+clustermap": function(form_data, container, data){
            var img = $("<img class='img-responsive'>")
                .attr("src", "data:image/png;base64," + data.image)
                .attr("usemap", "#clustermap");

            var map = $("<map>").attr("name", "clustermap");

            // Store for each clickable coordinate its article id
            var area;
            $.map(data.coords, function(coord){
                area = $("<area>");
                area.attr("shape", "rect");
                area.attr("coords", coord.coords.join(","));
                area.attr("article_id", coord.article_id);
                area.data("article_id", coord.article_id);
                map.append(area);
            });

            // Add query for cluster each article is in
            $.each(data.clusters, function(_, cluster){
                $.each(cluster.articles, function(_, article_id){
                    map.find("[article_id=" + article_id + "]").data("query", cluster.query);
                });
            });

            // Register click event for each article
            $("area", map).click(function(event){
                articles_popup().show(form_data, {
                    term: {
                        label: $(event.currentTarget).data("query")
                    }
                })
            });

            container.append(img).append(map);
        },
        "application/json+image+svg+multiple": function(form_data, container, data){
            $.map(data, function(table){
                var table_container = $("<div>");
                renderers["image/svg"](form_data, table_container, table[1]);
                $(table_container).prepend($("<h1>").text(table[0]));
                $(container).append(table_container);
            });

            return container;
        },
        "image/svg": function(form_data, container, data){
            return container.html(data);
        },
        "image/png+base64": function(form_data, container, data){
            container.append($("<img class='img-responsive'>").attr("src", "data:image/png;base64," + data));
        },
        /**
         * Inserts given html into container, without processing it further.
         */
        "text/html": function(form_data, container, data){
            return container.html(data);
        },
        "text/html+summary": function(form_data, container, data){
            renderers["text/html"](form_data, container, data);
            bottom(load_extra_summary);
        },

        /**
         * Renders aggregation as stacked column chart
         *   http://www.highcharts.com/demo/heatmap
         */
        "text/json+aggregation+heatmap": function(form_data, container, data){
            alert("Heatmap disabled for now..");

            var aggregation = Aggregation(data);
            var heatmap_data = [];

            data.forEach(function(row, rowIdx){
                var rowFields = row[1];
                rowFields.forEach(function(field){
                    var fieldData = field[0];
                    var fieldValue = field[1];
                    var fieldIdx = aggregation.columns.findIndex(function(item){
                        return item.id == fieldData.id;
                    });

                    heatmap_data.push([rowIdx, fieldIdx, fieldValue])
                });
            });
            var x_renderer = value_renderers.getRenderer(form_data["x_axis"]);
            var y_renderer = value_renderers.getRenderer(form_data["y_axis"]);

            container.highcharts({
                title: "",
                chart: { type: 'heatmap' },
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

        "text/json+aggregation+line": function(form_data, container, data){
            return renderers["text/json+aggregation+barplot"](form_data, container, data, "line");
        },


        "text/json+aggregation+scatter": function(form_data, container, data){
            return renderers["text/json+aggregation+barplot"](form_data, container, data, "scatter");
        },

        "text/json+aggregation+barplot": function(form_data, container, data, type){
            type = (type === undefined) ? "column" : type;

            var primary = form_data.primary;
            var secondary = form_data.secondary;
            var value1 = form_data.value1;
            var value2 = form_data.value2;

            var chart = {
                title: "",
                tooltip: {
                    shared: true
                },
                chart: {
                    zoomType: 'xy',
                    type: type
                },
                xAxis: {
                    allowDecimals: false,
                    type: getXType(primary)
                },
                yAxis: [
                    {
                        allowDecimals: false,
                        title: {
                            "text": getYType(value1)
                        }
                    }
                ],
                series: [],
                plotOptions: {
                    series: {
                        events: {
                            click: function(event){
                                // Do things :)
                            }
                        }
                    }
                }
            };

            if(primary && !secondary && value1 && !value2){
                // 1 aggr + 1 value
                chart.series.push({
                    name: primary,
                    data: $(data).map(function(i, point){
                        return [[point[0][0].label || point[0][0], point[1][0]]];
                    })
                });

                chart.legend = {
                    enabled: false
                };
            } else if(primary && secondary){
                // 2 aggr + 1 value
                var series = {};
                var prim_val, sec_val, val;

                data.forEach(function(point){
                    sec_val = point[0][1];
                    series[sec_val.id || sec_val] = {
                        name: sec_val.label || sec_val,
                        data: []
                    };
                });

                data.forEach(function(point){
                    prim_val = point[0][0];
                    sec_val = point[0][1];
                    val = point[1][0];
                    series[sec_val.id || sec_val].data.push([prim_val.label || prim_val, val]);
                });

                chart.series = $.map(series, function(val){
                    return val;
                });
            } else{
                // 1 aggr + 2 value

                // Add bars (first value)
                chart.series.push({
                    name: $("#id_value1 [value='{v}']".format({v: value1})).text(),
                    data: $(data).map(function(i, point){
                        if(point[1][0] === null) return null;
                        return [[point[0][0].label || point[0][0], point[1][0]]];
                    })
                });

                // Add line (second value)
                chart.series.push({
                    name: $("#id_value2 [value='{v}']".format({v: value2})).text(),
                    yAxis: 1,
                    type: "spline",
                    data: $(data).map(function(i, point){
                        if(point[1][1] === null) return null;
                        return [[point[0][0].label || point[0][0], point[1][1]]];
                    })
                });

                // Add second y-axis
                chart.yAxis.push({
                    title: { "text": getYType(value2)},
                    opposite: true
                });
            }

            container.append($("<div class='ht'></div>"));
            container.find(".ht").highcharts(chart);
        },

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
        "text/json+aggregation+table": function(form_data, container, matrix){
            var row_template, table, thead, tbody, renderer;

            var primary = form_data.primary;
            var secondary = form_data.secondary;
            var value1 = form_data.value1;
            var value2 = form_data.value2;

            var value1type = $("#id_value1 [value='{v}']".format({v: value1})).text();
            var value2type = $("#id_value2 [value='{v}']".format({v: value2})).text();

            thead = $("<thead>").append($("<th>"));
            if (!secondary && !value2){
                // Only one column needed, which is of type 'value1'
                thead.append($("<th>").text(value1type));
            } else if (!secondary) {
                // Two columns needed, but both are simple value types
                thead.append($("<th>").text(value1type));
                thead.append($("<th>").text(value2type));
            } else if (!value2) {
                // N columns needed, all of the same type
                renderer = value_renderers.getRenderer(secondary);
                $.map(matrix.columns, function(column){
                    thead.append($("<th>").text(renderer(column)).data("value", column));
                });
            } else {
                // Complex column (N columns + 2 values per column) needed
                renderer = value_renderers.getRenderer(secondary);

                // Add first header row
                thead.html("<tr><th rowspan='2'></th></tr>");
                $.map(matrix.columns, function(column){
                    var th = $("<th>");
                    th.text(renderer(column));
                    th.attr("colspan", 2);
                    th.data("value", column);
                    thead.find("tr").append(th);
                });

                // Add second header row
                var tr = $("<tr>");
                $.map(matrix.columns, function(_){
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

            tbody = $("<tbody>");
            renderer = value_renderers.getRenderer(primary);

            $.each(matrix.data, function(rownr, rowdata){
                // Set th elements text- and value property
                var row = matrix.rows[rownr];
                var row_element = $(row_template);
                row_element.find("th").text(renderer(row)).data("value", row);

                $.each(rowdata, function(colnr, values){
                    $.each(values, function(valuenr, value){
                        // Check for float / integer. And wtf javascript, why no float type?!
                        if (value === null) return true;
                        value = (value % 1 === 0) ? value : value.toFixed(2);
                        row_element.find("td").eq(colnr*numberOfValues + valuenr).text(value);
                    });
                });

                tbody.append(row_element);
            });

            // Putting it together
            table = $("<table class='aggregation dataTable table table-striped'>");
            table.append(thead).append(tbody);
            container.html(table);

            // Register click event (on table)
            table.click(function(event){
                if (window.location.hash.slice(1) !== "aggregation"){
                    return new PNotify({
                        "type": "info",
                        "text": "Viewing articles / codings not yet supported in coding aggregations."
                    });
                }

                var td = $(event.target);
                if(td.prop("tagName") === "TD"){
                    // Do not process empty cells
                    if (!td.text()){
                        return;
                    }

                    var col = td.closest('table').find('thead th').eq(td.index());
                    var row = td.parent().children().eq(0);

                    var filters = {};
                    filters[primary] = row.data('value');

                    if (secondary){
                        filters[secondary] = col.data('value');
                    }

                    articles_popup().show(form_data, filters);
                }
            });
        }
    });
});

