const d3 = require("d3");
const IDS = require("./covid-chart-ids")
var stringSimilarity = require("string-similarity");
const URL = "https://api.covidactnow.org/v2/";
const API_KEY = "2d1ce11e569b4ce88093a12fff633afb";

/* Charting Tools */
function chart(data, type, container, title="Chart") {
    data = cleanData(data, type);
    let chatWidth = d3.select(container).node().getBoundingClientRect().width - 20;
    let margin = {top: 50, right: 25, bottom: 50, left: 75},
        width = chatWidth - margin.left - margin.right,
        height = chatWidth/2 - margin.top - margin.bottom;
        height = height > 150 ? height : 150;

    // Add SVG element
    let graph = d3.select(container)
        .append('svg')
        .attr('width', width + margin.left + margin.right)
        .attr('height', height + margin.top + margin.bottom)
        .attr('class', 'd3Chart')
        .append("g").attr("transform",
            "translate(" + margin.left + "," + margin.top + ")");

    // Add Title
    graph.append("text")
        .attr("x", (width / 2))
        .attr("y", 0 - (margin.top / 2))
        .attr("text-anchor", "middle")
        .attr("class", "d3-title")
        .text(title);

    //Add Scales and Axis
    let yScale = d3.scaleLinear()
        .domain([0, d3.max(data, d => d[type])])
        .range([height, 0]);

    let xScale = d3.scaleTime()
        .domain(d3.extent(data, d => new Date(d.date)))
        .range([0, width]);

    let xAxis = d3.axisBottom(xScale)
        .tickFormat(d3.timeFormat("%b '%y")).ticks(width/70);
    let yAxis = d3.axisLeft(yScale).tickFormat(function(value) {
                    if (Math.abs(value) >= 1000000000) value = (value/1000000000).toFixed(1) + 'B';
                    else if (Math.abs(value) >= 1000000) value = (value/1000000).toFixed(1) + 'M';
                    else if (Math.abs(value) >= 1000) value = (value/1000).toFixed(1) + 'K';
                    return value;}).ticks(height/40);

    graph.append("g")
               .attr("transform", "translate(0," + height + ")")
               .call(xAxis);
    graph.append("g")
               .call(yAxis);

    // Gridlines
    let yGrid = d3.axisLeft()
        .scale(yScale)
        .tickFormat('')
        .ticks(6)
        .tickSizeInner(-width);

    graph.append('g')
        .attr('class', 'gridlines')
        .call(yGrid);

    // Chart line and area
    let area = d3.area()
        .x(d => xScale(new Date(d.date)))
        .y0(d => yScale(d[type]))
        .y1(height)
        .curve(d3.curveMonotoneX);

    let line = d3.line()
        .x(d => xScale(new Date(d.date)))
        .y(d => yScale(d[type]))
        .curve(d3.curveMonotoneX);

    graph.append("path")
        .attr("fill", "rgba(0, 140, 255, 0.3)")
        .attr("d", area(data));

    graph.append("path")
        .attr('fill', 'none')
        .attr("stroke", "rgb(0, 140, 255)")
        .attr("stroke-width", 1.5)
        .attr("d", line(data));
}

function cleanData(data, type) {
    return data.filter(d => d[type] !== undefined && d[type] !== null);
}

function interpret_location(loc) {
    let location = {};
    loc = String(loc);

    if (IDS.states_hash[loc.toUpperCase()]) {
        location.type = 'state';
        location.name = loc.toUpperCase();
        location.canonical = IDS.states_hash[loc.toUpperCase()];
        return location;
    }

    let all_loc = Object.keys(IDS.states).concat(Object.keys(IDS.counties));
    let match = stringSimilarity.findBestMatch(loc, all_loc);
    if (match.bestMatch.rating < 0.4) {
        return "bad input";
    } else {
        match = match.bestMatch.target;
        if (IDS.states[match]) {
            location.type = 'state';
            location.name = IDS.states[match];
        } else if (IDS.counties[match]) {
            location.type = 'county';
            location.name =IDS.counties[match];
        } else {
            return "bad input 2";
        }
        location.canonical = match;
    }
    return location;
}

async function pullData(type, loc) {
    let url = `${URL}${type}/${loc}.timeseries.json?apiKey=${API_KEY}`;
    console.log(url);
    let result = await d3.json(url);
    console.log(result);
    return result;
}

const convert_method = {
    cases: 'cases',
    new_cases: 'newCases',
    deaths: 'deaths',
    new_deaths: 'newDeaths',
    vaccines_initiated: 'vaccinationsInitiated',
    vaccines_completed: 'vaccinationsCompleted',
    case_density: 'caseDensity',
    icu_capacity: 'icuCapacityRatio',
    infection_rate: 'infectionRate',
    positivity_rate: 'testPositivityRatio'

};
const convert_type = {
    cases: 'actualsTimeseries',
    new_cases: 'actualsTimeseries',
    deaths: 'actualsTimeseries',
    new_deaths: 'actualsTimeseries',
    vaccines_initiated: 'actualsTimeseries',
    vaccines_completed: 'actualsTimeseries',
    case_density: 'metricsTimeseries',
    icu_capacity: 'metricsTimeseries',
    infection_rate: 'metricsTimeseries',
    positivity_rate: 'metricsTimeseries'
}

module.exports = {
    pullData: pullData,
    chart: chart,
    interpret_location: interpret_location,
    convert_type: convert_type,
    convert_method: convert_method
}
