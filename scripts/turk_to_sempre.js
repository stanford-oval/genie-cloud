// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const path = require('path');
const fs = require('fs');
const csv = require('csv')

const ThingTalk = require('thingtalk');
const SEMPRESyntax = ThingTalk.SEMPRESyntax;

function main() {
    var inp_format = process.argv[2];
    var fin = path.join(process.argv[3], 'data.csv');
    var fout = path.join(process.argv[3], 'data-sempre.csv');

    var output = csv.stringify();
    var parser = csv.parse();
    var file = fs.createWriteStream(fout);
    output.pipe(file);

    fs.createReadStream(fin)
        .pipe(parser)
        .on('data', (row) => {
            var tt = ThingTalk.Grammar.parse(row[1]);
            var json = SEMPRESyntax.toSEMPRE(tt, false);

            var ex = {
                id: row[0],
                target_json: json,
                target_tt: tt,
                sythetic: row[2],
                utterance: row[3]
            };
            output.write(ex);
        })
        .on('error', (err) => { console.error(err) });
}

main();
