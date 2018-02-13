// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const path = require('path');
const fs = require('fs');
const mysql = require('mysql');

function main() {
    const language = process.argv[2];
    const types = process.argv[3].split(',');
    const target_dir = process.argv[4] || '.';

    const dbClient = mysql.createConnection(process.env.DATABASE_URL);

    let waiting = types.length;
    for (let type of types) {
        const output = fs.createWriteStream(path.resolve(target_dir, type + '.tsv'));
        const query = dbClient.query('select id,preprocessed,target_code from example_utterances where type = ? and language = ?', [type, language]);

        query.on('result', (row) => {
            output.write(row.id + '\t' + row.preprocessed + '\t' + row.target_code + '\n');
        });
        query.on('end', () => {
            output.end();
        });
        output.on('finish', () => {
            waiting--;
            if (waiting === 0)
                dbClient.end();
        });
    }
}

main();
