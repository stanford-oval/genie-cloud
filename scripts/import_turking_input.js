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

const Q = require('q');
const csv = require('csv');
const fs = require('fs');
const db = require('../util/db');

function insert(dbClient, batchId, programs) {
    let columns = ['batch'];
    for (let i = 1; i < 5; i ++ ) {
        columns.push(`id${i}`);
        columns.push(`thingtalk${i}`);
        columns.push(`sentence${i}`);
    }
    let row = [batchId];
    programs.forEach((p) => {
        row.push(p.id);
        row.push(p.code);
        row.push(p.sentence);
    });
    return db.insertOne(dbClient, 
        `insert into mturk_input(${columns.join(',')}) values (?)`, [row]);
}

function shuffle(array) {
    for (let i = array.length - 1; i > 0; i--) {
        let j = Math.floor(Math.random() * (i + 1));
        [array[i], array[j]] = [array[j], array[i]];
    }
}

function blackList(code, sentence) {
    let code_blacklist = [
        'makeDate() +',
        'makeDate() -',
        'start_of(day) -', 'start_of(day) +',
        'start_of(week) -', 'start_of(week) +',
        'start_of(mon) -', 'start_of(mon) +',
        'start_of(year) -', 'start_of(year) +',
        'end_of(day)', 
        'end_of(week)',
        'end_of(mon)',
        'end_of(year)',
        'sportradar',
        'imgflip',
    ];
    let nl_blacklist = [
        'reach where i am now',
        'what is the date of what day is it',
        'the random number of a random number'
    ];
    for (let snippet of code_blacklist) {
        if (code.indexOf(snippet) > -1)
            return true;
    }
    for (let snippet of nl_blacklist) {
        if (sentence.indexOf(snippet) > -1)
            return true;
    }
    return false;
}

function whiteList(code, sentence) {
    let white_list = ['sportradar', 'imgflip'];
    for (let snippet of white_list) {
        if (code.indexOf(snippet) > -1)
            return true;
    }
    return false;
}

function main() {
    const batch = process.argv[2];
    const parser = csv.parse({ columns: true, delimiter: '\t' });
    process.stdin.pipe(parser);

    const data = [];

    db.withTransaction((dbClient) => {
        return Q.Promise((callback, errback) => {
            parser.on('data', (row) => {
                data.push(row);
            });
            parser.on('error', errback);
            parser.on('end', callback);
        }).then(() => {
            shuffle(data);
            let programs = [];
            return Q.all(data.map((row) => {
                let {id,code,sentence} = row;
                if (!blackList(code, sentence)) {
                    programs.push({ id: parseInt(id), code: code, sentence: sentence });
                    if (programs.length === 4) {
                        let tmp = programs;
                        programs = [];
                        return insert(dbClient, batch, tmp);
                    } 
                }
            }));
        });
    }).then(() => {
        return db.withClient((dbClient) => {
            const output = fs.createWriteStream(process.argv[3]);
            let content = 'url\n';
            return db.selectAll(dbClient, 'select id,batch from mturk_input;', []).then((rows) => {
                return rows.forEach((row) => {
                    content += `https://almond.stanford.edu/mturk/${row.batch}/${row.id}\n`;
                })
            }).then(() => {
                return output.write(content);
            });
        });
    }).then(() => process.exit()).done();
}

main();
