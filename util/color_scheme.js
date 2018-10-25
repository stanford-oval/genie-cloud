// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details

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
