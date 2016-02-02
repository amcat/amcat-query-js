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

define(["moment"], function(moment){

    /**
     * Sets all missing data to 0, for each date in the range from the first to the last date
     * in the dataset, with the given interval.
     * The resulting data is ordered by date ascendingly, so it can be rendered by HighCharts
     * @param form_data
     * @param data {[][]}
     * @returns {[][]}
     */
    function addDatetimeAggregationDefaultZeroes(form_data, data)
    {
        var dataDict = {};
        var minX = data[0][0];
        var maxX = data[0][0];
        data.forEach(function(datum){
            minX = Math.min(datum[0], minX);
            maxX = Math.max(datum[0], maxX);
            dataDict[datum[0]] = datum;
        });
        minX = moment(minX);
        maxX = moment(maxX);
        var newData = [];
        for(var date = minX; date <= maxX; date.add(1, form_data["interval"] + "s")){
            if(typeof(dataDict[+date]) !== 'undefined'){
                newData.push(dataDict[+date]);
                continue;
            }
            newData.push([+date, 0]);
        }
        return newData;
    }



    var tools = {};

    tools.addDatetimeAggregationDefaultZeroes = addDatetimeAggregationDefaultZeroes;
    return tools;
});