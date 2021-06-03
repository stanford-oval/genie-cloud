// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2020 The Board of Trustees of the Leland Stanford Junior University
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


const assert = require('assert');
const fs = require('fs');
const byline = require('byline');

function parseMeasure(valueString) {
    const match = /^(-?(?:[0-9]+(?:\.[0-9]*)?(?:e[0-9]+)?|\.[0-9]+(?:e[0-9]+)?))([A-Za-z_][A-Za-z0-9_]*)/.exec(valueString);
    if (match === null)
        throw new Error(`Invalid measure syntax: ${valueString}`);
    const value = Number(match[1]);
    const unit = match[2];
    return [value, unit];
}

function parseConstant(locale, key, valueString, display) {
    let type;
    if (key.startsWith('param:@')) {
        const match = /^param:@[^:]+:[^:]+:(.+)$/.exec(key);
        if (match === null)
            throw new Error(`Invalid syntax: ${key}`);
        type = match[1];
    } else if (key.startsWith('param:')) {
        const match = /^param:[^:]+:(.+)$/.exec(key);
        if (match === null)
            throw new Error(`Invalid syntax: ${key}`);
        type = match[1];
    } else {
        type = key;
    }

    switch (type) {
    case 'Number':
        return {
            key: valueString,
            value: Number(valueString),
            display: display || (Number(valueString).toLocaleString(locale))
        };
    case 'String':
        return {
            key: valueString,
            // lower-case the string to match what almond-tokenizer does, or the program
            // will be inconsistent
            value: valueString.toLowerCase(),
            display: `“${valueString}”`
        };
    case 'Currency': {
        const [value, unit] = parseMeasure(valueString);
        return {
            key: valueString,
            value: { value, unit },
            display: display || value.toLocaleString(locale, { style: 'currency', currency: unit.toUpperCase() })
        };
    }
    case 'Location': {
        const [lat, lon] = valueString.split(',');
        if (!display)
            throw new Error(`display field is required for Location constant`);
        return {
            key: valueString,
            value: {
                latitude: Number(lat),
                longitude: Number(lon),
                display
            },
            display
        };
    }
    case 'Date': {
        const date = new Date(valueString);
        return {
            key: valueString,
            value: date,
            display: display || date.toLocaleString(locale)
        };
    }
    case 'Time': {
        let [hour, minute, second] = valueString.split(':');
        hour = parseInt(hour, 10);
        minute = parseInt(minute, 10);
        second = parseInt(second, 10) || 0;
        return {
            key: valueString,
            value: { hour, minute, second },
            display: display || valueString
        };
    }
    case 'Entity(tt:email_address)':
    case 'Entity(tt:phone_number)':
    case 'Entity(tt:url)':
    case 'Entity(tt:path_name)':
        return {
            key: valueString,
            value: valueString,
            display: display || valueString
        };
    case 'Entity(tt:hashtag)':
        return {
            key: '#' + valueString,
            value: valueString,
            display: display || '#' + valueString
        };
    case 'Entity(tt:username)':
        return {
            key: '@' + valueString,
            value: valueString,
            display: display || '@' + valueString
        };
    }


    if (type.startsWith('Measure(')) {
        const [value, unit] = parseMeasure(valueString);
        assert(!Number.isNaN(value));
        return {
            key: valueString,
            value,
            unit,
            display: display || `${value.toLocaleString(locale)} ${unit}`
        };
    } else if (type.startsWith('Entity(')) {
        if (!display)
            throw new Error(`display field is required for constant of type ${type}`);
        const key = valueString === `null` ? null : valueString;
        return {
            key: key,
            value: {
                value: key,
                display
            },
            display
        };
    } else {
        throw new Error(`Invalid constant type ${type}`);
    }
}

function parseConstantFile(locale, filename) {
    const file = fs.createReadStream(filename);
    file.setEncoding('utf8');
    const input = byline(file);

    const constants = {};
    input.on('data', (line) => {
        if (/^\s*(#|$)/.test(line))
            return;

        const [key, value, display] = line.trim().split('\t');

        if (!constants[key])
            constants[key] = [];
        constants[key].push(parseConstant(locale, key, value, display));
    });

    return new Promise((resolve, reject) => {
        input.on('end', () => resolve(constants));
        input.on('error', reject);
    });
}

module.exports = { parseConstant, parseConstantFile };
