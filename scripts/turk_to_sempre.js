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

const SempreSyntax = require('../util/sempre_syntax.js');

function main() {
    var fin = path.join(process.argv[2], 'data.csv');
    var fout = path.join(process.argv[2], 'data-sempre.csv');

    var output = csv.stringify();
    var parser = csv.parse();
    var file = fs.createWriteStream(fout || output.csv)
    output.pipe(file);

    fs.createReadStream(fin)
        .pipe(parser)
        .on('data', (row) => {
            //console.log(row)
            var target_json = SempreSyntax.toSEMPRE(row[1]);
            var ex = {
                id: row[0],
                tt: row[1],
                target_json: JSON.stringify(target_json),
                sythetic: row[2],
                utterance: row[3]
            };
            output.write(ex);
        })
        .on('error', (err) => { console.error(err) });

    file.on('finish', () => process.exit());
}

main();
