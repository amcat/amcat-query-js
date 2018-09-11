define(['query/utils/dates'], (QueryDates) => {

    const elastic_filters = {
        date_year: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "year");
        },
        date_quarter: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "quarter");
        },
        date_month: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "month");
        },
        date_week: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "week");
        },
        date_day: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "day");
        },
        year: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "year");
        },
        quarter: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "quarter");
        },
        month: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "month");
        },
        week: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "week");
        },
        day: function (form_data, value, filters) {
            return elastic_filters.date(form_data, value, filters, "day");
        },
        date: function (form_data, value, filters, interval) {
            let ranges;

            if(value instanceof Array && value.length > 0){
                value = value[0]
            }

            if (form_data.hasOwnProperty('on_date')
                || form_data.hasOwnProperty('end_date')
                || form_data.hasOwnProperty('start_date')) {
                ranges = [
                    QueryDates.get_range_from_form(form_data),
                    QueryDates.get_range(value, interval)
                ];
            }
            else {
                ranges = [QueryDates.get_range(value, interval)];
            }

            if (filters._filtered_before_hack) {
                // Two date filters are active; we need to find the intersection
                ranges.push(filters);
            }

            var range = QueryDates.merge(ranges);

            if (range === null) {
                range = ranges[1]; //
            }

            return {
                datetype: "between",
                start_date: range.start_date,
                end_date: range.end_date,
                _filtered_before_hack: true
            };
        },
        medium: function (form_data, value) {
            return {mediums: [value.id]};
        },
        total: function () {
            return {};
        },
        term: function (form_data, value) {
            return {query: value.label};
        },
        set: function (form_data, value) {
            return {sets: value.id}
        }
    };

    return elastic_filters;
});