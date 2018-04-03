// Polyfills from MDN and various places on the Internet

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