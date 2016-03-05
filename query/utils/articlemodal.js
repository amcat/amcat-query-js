"use strict";
/**************************************************************************
*          (C) Vrije Universiteit, Amsterdam (the Netherlands)            *
*                                                                         *
* This file is part of AmCAT - The Amsterdam Content Analysis Toolkit     *
*                                                                         *
* AmCAT is free software: you can redistribute it and/or modify it under  *
* the terms of the GNU Affero General Public License as published by the  *
* Free Software Foundation, either version 3 of the License, or (at your  *
* option) any later version.                                              *
*                                                                         *
* AmCAT is distributed in the hope that it will be useful, but WITHOUT    *
* ANY WARRANTY; without even the implied warranty of MERCHANTABILITY or   *
* FITNESS FOR A PARTICULAR PURPOSE. See the GNU Affero General Public     *
* License for more details.                                               *
*                                                                         *
* You should have received a copy of the GNU Affero General Public        *
* License along with AmCAT.  If not, see <http://www.gnu.org/licenses/>.  *
***************************************************************************/
define([
    "jquery", "query/utils/dates", "query/valuerenderers", "bootstrap",
    "amcat/amcat.datatables"],
    function($, QueryDates, value_renderers){
    var defaults = { "modal": "#articlelist-dialog" };
    var SEARCH_API_URL = "/api/v4/search";
    var ARTICLE_URL_FORMAT = "../articles/{id}";

    var elastic_filters = {
        year: function(form_data, value, filters){
            return elastic_filters.date(form_data, value, filters, "year");
        },
        quarter: function(form_data, value, filters){
            return elastic_filters.date(form_data, value, filters, "quarter");
        },
        month: function(form_data, value, filters){
            return elastic_filters.date(form_data, value, filters, "month");
        },
        week: function(form_data, value, filters){
            return elastic_filters.date(form_data, value, filters, "week");
        },
        day: function(form_data, value, filters){
            return elastic_filters.date(form_data, value, filters, "day");
        },
        date: function(form_data, value, filters, interval){
            var ranges = [
                QueryDates.get_range_from_form(form_data),
                QueryDates.get_range(value, interval)
            ];

            if (filters._filtered_before_hack){
                // Two date filters are active; we need to find the intersection
                ranges.push(filters);
            }

            var range = QueryDates.merge(ranges);

            return {
                datetype: "between",
                start_date: range.start_date,
                end_date: range.end_date,
                _filtered_before_hack: true
            };
        },
        medium: function(form_data, value){
            return {mediums: [value.id]};
        },
        total: function(){
            return {};
        },
        term: function(form_data, value){
            return {query: value.label};
        },
        set: function(form_data, value){
            return {sets: value.id}
        }
    };


    return function(userOptions){
        var options = $.extend({}, $.extend(defaults, userOptions));
        var $modal = $(options.modal);

        /**
         * Renders popup with a list of articles, based on given filters.
         * @param filters mapping { type -> filter }. For example:
         *        { medium : 1, date: 1402005600000 }
         */
        function articles_popup(form_data, filters){
            var data = $.extend({}, form_data);

            $.each(filters, function(type, value){
                if (elastic_filters[type] !== undefined){
                    // Use elastic mapping function
                    $.extend(data, elastic_filters[type](form_data, value, data));
                } else {
                    // Store raw data as filter
                    data[type] = value;
                }
            });

            // HACK: If a specific set is requested by a user (by clicking on a table cell,
            // for example), override global articleset filter.
            if (filters.set !== undefined){
                delete data["articlesets"];
            }

            var table = $modal.find(".articlelist").find(".dataTables_scrollBody table");

            if (table.length > 0){
                table.DataTable().destroy();
            }

            amcat.datatables.create_rest_table(
                $modal.find(".articlelist").html(""),
                SEARCH_API_URL + "?" + $.param(getSearchFilters(data), true),
                {
                    "setup_callback": function(tbl){
                        tbl.fnSetRowlink(ARTICLE_URL_FORMAT, "new");
                    },
                    datatables_options: {iDisplayLength: 10,  aaSorting: []}
                }
            )
        }

        /**
         * Convert form field / values to their search API counterpart. For
         * example:
         *     mediums -> mediumid
         *     query -> q
         * @param filters
         */
        function getSearchFilters(filters){
            var new_filters = {};

            var field_map = {
                mediums: "mediumid", query: "q", article_ids: "ids",
                start_date: "start_date", end_date: "end_date",
                articlesets: "sets", sets: "sets"
            };

            var value_map = {
                ids: function(aids){ return $.map(aids.split("\n"), $.trim); },
                start_date: value_renderers.date,
                end_date: value_renderers.date
            };

            $.each(field_map, function(k, v){
                if (filters[k] === null || filters[k] === undefined || filters[k] === ""){
                    return;
                }

                new_filters[v] = filters[k];
                if (value_map[v] !== undefined){
                    new_filters[v] = value_map[v](new_filters[v]);
                }
            });

            return new_filters;
        }

        return {
            /**
             * Show article popup with given filters applied.
             *
             * @param filters: mapping of type -> value.
             */
            show: function(form_data, filters){
                filters = (filters === undefined) ? {} : filters;
                articles_popup(form_data, filters);
                $modal.modal("show");
            },
            hide: function(){
                $modal.modal("hide");
            }
        }
    }
});