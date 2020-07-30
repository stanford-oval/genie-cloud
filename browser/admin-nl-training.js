// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const Chart = require('chart.js');

// copied from https://gist.github.com/mjackson/5311256
function rgbToHsl(r, g, b) {
    console.log(r,g,b);
    r /= 255;
    g /= 255;
    b /= 255;

    const max = Math.max(r, g, b), min = Math.min(r, g, b);
    let h, s, l = (max + min) / 2;

    if (max === min) {
        h = s = 0; // achromatic
    } else {
        let d = max - min;
        s = l > 0.5 ? d / (2 - max - min) : d / (max + min);

        switch (max) {
        case r: h = (g - b) / d + (g < b ? 6 : 0); break;
        case g: h = (b - r) / d + 2; break;
        case b: h = (r - g) / d + 4; break;
        }

        h /= 6;
    }

    return [ h, s, l ];
}

function colorToRGB(color) {
    let r = parseInt(color.slice(1,3), 16);
    let g = parseInt(color.slice(3,5), 16);
    let b = parseInt(color.slice(5,7), 16);
    return [r, g, b];
}

function colorScale(from, length) {
    const [h, s, l] = rgbToHsl(...colorToRGB(from));

    const output = [];
    for (let i = 0; i < length; i++) {
        // linearly interpolate luminance between the
        // starting point and 1.0 (fully white)
        // saturation between starting point and 0.0 (fully gray)
        // we have length+1 stops, so the last stop
        // is before white
        const s2 = s + i * (0 - s) / (length+1);
        const l2 = l + i * (1 - l) / (length+1);
        output.push(`hsl(${Math.round(h*360)}, ${Math.round(s2*100)}%, ${Math.min(Math.round(l2*100), 100)}%)`);
    }
    return output;
}

const LABELS = {
    'ok': "Program",
    'ok_without_param': "Without Param",
    'ok_function': "Function",
    'ok_device': "Device",
    'ok_num_function': "Prim/Compound",
    'ok_syntax': "Syntax"
};
$(() => {
    const ctx = document.getElementById('chart-accuracy-combined');
    const metrics = JSON.parse(ctx.dataset.metrics);

    let metricKeys = Object.keys(LABELS);
    const modelTags = Object.keys(metrics);
    const colors = colorScale('#8c1515', metricKeys.length);

    const data = {
        labels: modelTags,
        datasets: metricKeys.map((metricKey, i) => {
            return {
                label: LABELS[metricKey],
                data: modelTags.map((modelTag) => {
                    const value = (metrics[modelTag][metricKey] || [0.0])[0] || 0;
                    const prevValue = i === 0 ? 0 :
                        ((metrics[modelTag][metricKeys[i-1]] || [0.0])[0] || 0);
                    return 100 * (value - prevValue);
                }),
                backgroundColor: colors[i],
                borderColor: 'black',
                borderWidth: 1,
                stack: 0
            };
        })
    };
    console.log(data);

    new Chart(ctx, {
        type: 'bar',
        data: data,
        options: {
            responsive: false,
            scales: {
                yAxes: [{
                    stacked: true,
                    ticks: {
                        max: 100,
                        min: 0,
                        stepSize: 20
                    }

                }]
            },
            legend: {
                position: 'right',
                reverse: true
            }
        }
    });
});
