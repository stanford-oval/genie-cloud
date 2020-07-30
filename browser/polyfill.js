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

// The following is from the gjs project.
// Copyright 2014 Jasper St. Pierre, Florian Mullner, Dan Winship, et al.
//
// Licensed under the BSD license
"use strict";

function vprintf(str, args) {
    var i = 0;
    var usePos = false;
    return str.replace(/%(?:([1-9][0-9]*)\$)?([0-9]+)?(?:\.([0-9]+))?(.)/g, (str, posGroup, widthGroup, precisionGroup, genericGroup) => {
        if (precisionGroup && genericGroup !== 'f')
            throw new Error("Precision can only be specified for 'f'");

        var pos = parseInt(posGroup, 10) || 0;
        if (usePos === false && i === 0)
            usePos = pos > 0;
        if (usePos && pos === 0 || !usePos && pos > 0)
            throw new Error("Numbered and unnumbered conversion specifications cannot be mixed");

        var fillChar = (widthGroup && widthGroup[0] === '0') ? '0' : ' ';
        var width = parseInt(widthGroup, 10) || 0;

        function fillWidth(s, c, w) {
            var fill = '';
            for (var i = 0; i < w; i++)
                fill += c;
            return fill.substr(s.length) + s;
        }

        function getArg() {
            return usePos ? args[pos - 1] : args[i++];
        }

        var s = '';
        switch (genericGroup) {
        case '%':
            return '%';
        case 's':
            s = String(getArg());
            break;
        case 'd':
            var intV = parseInt(getArg());
            s = intV.toString();
            break;
        case 'x':
            s = parseInt(getArg()).toString(16);
            break;
        case 'f':
            if (precisionGroup === '' || precisionGroup === undefined)
                s = parseFloat(getArg()).toString();
            else
                s = parseFloat(getArg()).toFixed(parseInt(precisionGroup));
            break;
        default:
            throw new Error('Unsupported conversion character %' + genericGroup);
        }
        return fillWidth(s, fillChar, width);
    });
}

/*
 * This function is intended to extend the String object and provide
 * an String.format API for string formatting.
 * It has to be set up using String.prototype.format = Format.format;
 * Usage:
 * "somestring %s %d".format('hello', 5);
 * It supports %s, %d, %x and %f, for %f it also support precisions like
 * "%.2f".format(1.526). All specifiers can be prefixed with a minimum
 * field width, e.g. "%5s".format("foo"). Unless the width is prefixed
 * with '0', the formatted string will be padded with spaces.
 */
String.prototype.format = function format() {
    return vprintf(this, arguments);
};