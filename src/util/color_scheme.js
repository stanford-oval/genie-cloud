// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Silei Xu <silei@cs.stanford.edu>

"use strict";

const colorExtractor = require('img-color-extractor');

const defaultsOptions = {
    background: '#FFFFFF',
    alphaMin: 0,
    dist: 100,
    greyVa: -1,
};

const ColorScheme = require('color-scheme');

module.exports = async function makeColorScheme(stream) {
    let colors_dominant = await colorExtractor.extract(stream, defaultsOptions);
    const scheme = new ColorScheme;

    if (colors_dominant[0].color === "#ffffff")
        colors_dominant.shift();

    colors_dominant = colors_dominant.map((color) => color.color);
    const color_dominant = colors_dominant[0].replace(/^#/, '');

    const colors_palette_default = scheme.from_hex(color_dominant)
        .scheme('contrast')
        .variation('default')
        .colors()
        .map((color) => "#" + color);

    const colors_palette_light = scheme.from_hex(color_dominant)
        .scheme('contrast')
        .variation('light')
        .colors()
        .map((color) => "#" + color);

    return {
        colors_dominant: JSON.stringify(colors_dominant),
        colors_palette_default: JSON.stringify(colors_palette_default),
        colors_palette_light: JSON.stringify(colors_palette_light)
    };
};
