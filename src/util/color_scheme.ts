// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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

/// <reference types="./color-scheme" />
/// <reference types="./img-color-extractor" />

import * as stream from 'stream';
import colorExtractor from 'img-color-extractor';
import ColorScheme from 'color-scheme';

const defaultsOptions = {
    background: '#FFFFFF',
    alphaMin: 0,
    dist: 100,
    greyVa: -1,
};

export default async function makeColorScheme(from : stream.Readable) {
    const dominantColors = await colorExtractor.extract(from, defaultsOptions);
    const scheme = new ColorScheme;

    if (dominantColors[0].color === "#ffffff")
    dominantColors.shift();

    const dominantColor = dominantColors[0].color.replace(/^#/, '');

    const defaultPalette = scheme.from_hex(dominantColor)
        .scheme('contrast')
        .variation('default')
        .colors()
        .map((color) => "#" + color);

    const lightPalette = scheme.from_hex(dominantColor)
        .scheme('contrast')
        .variation('light')
        .colors()
        .map((color) => "#" + color);

    return {
        colors_dominant: JSON.stringify(dominantColors.map((color) => color.color)),
        colors_palette_default: JSON.stringify(defaultPalette),
        colors_palette_light: JSON.stringify(lightPalette)
    };
}
