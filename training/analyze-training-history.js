#!/usr/bin/env node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const byline = require('byline');
const Table = require('cli-table');

function mergeStats(stats, into) {
    for (let key in stats) {
        if (!into[key])
            into[key] = { value: 0, count: 0 };
        into[key].value += stats[key];
        into[key].count ++;
    }
}

function prettyprintTime(ms) {
    if (ms < 1000)
        return `${ms.toFixed(1)} ms`;
    if (ms < 60000)
        return `${(ms/1000).toFixed(1)} s`;
    if (ms < 3600000)
        return `${Math.round(ms/60000)} min ${Math.round((ms%60000)/1000)} s`;
    return `${Math.round(ms/3600000)} h ${Math.round((ms%3600000)/60000)} min ${Math.round((ms%60000)/1000)} s`;
}

function main() {
    const data = {
        'update-dataset': {},
        'train': {}
    };
    const allPhases = {
        'update-dataset': new Set,
        'train': new Set
    };

    process.stdin.setEncoding('utf-8');
    const input = byline(process.stdin);
    input.on('data', (line) => {
        const parsed = JSON.parse(line);

        const stats = parsed.taskStats;
        let lastKey = null;
        for (let key in stats)
            lastKey = key;
        if (['error', 'failed', 'killed'].indexOf(parsed.status) >= 0)
            delete stats[lastKey];
        for (let key in stats)
            allPhases[parsed.jobType].add(key);

        let jobKey;
        if (parsed.jobType === 'update-dataset') {
            jobKey = parsed.forDevices.length ? `${parsed.language}/${parsed.forDevices.map((d) => '@' + d)}` :
                `${parsed.language}/all`;
        } else {
            jobKey = `@${parsed.modelTag}/${parsed.language}`;
        }
        if (!data[parsed.jobType][jobKey])
            data[parsed.jobType][jobKey] = {};

        mergeStats(stats, data[parsed.jobType][jobKey]);
    });

    input.on('end', () => {
        for (let jobType in data) {
            console.log(`Job: ${jobType}`);

            const phases = Array.from(allPhases[jobType]);
            const table = new Table({
                head: [''].concat(phases.map((p) => p.replace('_', ' ')))
            });

            for (let jobKey in data[jobType]) {
                table.push({ [jobKey]: phases.map((p) => {
                    return prettyprintTime(data[jobType][jobKey][p].value / data[jobType][jobKey][p].count);
                }) });
            }

            console.log(table.toString());
        }
    });
}
main();
