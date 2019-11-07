// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const semver = require('semver');
const resolveLocation = require('../util/location-linking');

async function streamJoinArrow(locale, result, entities) {
    // convert stream-join "=>" to "join"

    const code = result.code;
    if (code.length === 0 || code[0] === 'policy')
        return;

    let start = 0;
    if (code[0] === 'executor') {
        while (code[start] !== ':')
            start += 1;
        start += 1;
    }

    const has_now = code[start] === 'now';
    if (has_now)
        start += 2; // "now" & "=>"

    let last_arrow = null;
    for (let i = code.length-1; i > start; i--) {
        if (code[i] === '=>') {
            last_arrow = i;
            break;
        }
    }

    // no arrow past "now =>" means a straight do, so no fixup needed
    if (last_arrow === null)
        return;

    for (let i = start; i < last_arrow; i++) {
        if (code[i] === '=>')
            code[i] = 'join';
    }
}

async function unresolvedLocations(locale, result, entities) {
    // convert unresolved locations to old-style LOCATION_ tokens

    const newCode = [];
    let entityCounter = 0;
    for (let entity in entities) {
        if (entity.startsWith('LOCATION_'))
            entityCounter = Math.max(entityCounter, parseInt(entity.substring('LOCATION_'.length)));
    }

    for (let i = 0; i < result.code.length; i++) {
        const token = result.code[i];
        if (token === 'location:') {
            // skip location:
            i++;

            // skip "
            i++;

            const begin = i;
            while (result.code[i] !== '"')
                i++;
            const end = i;

            const searchKey = result.code.slice(begin, end).join(' ');
            const locations = (await resolveLocation(locale, searchKey))
                // ignore locations larger than a city
                .filter((c) => c.rank <= 16);

            const entity = 'LOCATION_' + (entityCounter++);
            newCode.push(entity);
            if (locations !== null)
                entities[entity] = locations[0];
        } else {
            newCode.push(token);
        }
    }

    result.code = newCode;
}

function deviceNames(locale, result, entities) {
    let newCode = [];
    let inString = false;
    for (let i = 0; i < result.code.length; i++) {
        const token = result.code[i];
        if (token === '"')
            inString = !inString;
        if (inString) {
            newCode.push(token);
            continue;
        }
        if (!token.startsWith('attribute:')) {
            newCode.push(token);
            continue;
        }
        // eat the attribute:
        i++;
        // eat the =
        i++;
        if (result.code[i] === '"') {
            i++;
            while (i < result.code.length && result.code[i] !== '"')
                i++;
            // the closing quote will be eaten at the end of the loop
        }
        // the next token will be eaten at the end of the loop
    }

    result.code = newCode;
}

const COMPATIBILITY_FIXES = [
    ['<1.3.0', streamJoinArrow],
    ['<1.8.0', unresolvedLocations],
    ['<1.9.0-alpha.1', deviceNames]
];

module.exports = async function applyCompatibility(locale, results, entities, thingtalk_version) {
    for (let [range, fix] of COMPATIBILITY_FIXES) {
        if (semver.satisfies(thingtalk_version, range)) {
            for (let result of results)
                await fix(locale, result, entities);
        }
    }
};
