// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import * as Url from 'url';
import * as mysql from 'mysql';
import * as util from 'util';
import * as fs from 'fs';

import * as Config from '../config';

export async function exec(filename : string) {
    const parsed = Url.parse(Config.DATABASE_URL!);
    const [user, pass] = parsed.auth!.split(':');

    const options = {
        host: parsed.hostname!,
        port: parseInt(parsed.port!),
        database: parsed.pathname!.substring(1),
        user: user,
        password: pass,
        multipleStatements: true
    };
    Object.assign(options, parsed.query);

    const queries = await util.promisify(fs.readFile)(filename, { encoding: 'utf8' });

    await new Promise<void>((resolve, reject) => {
        const connection = mysql.createConnection(options);
        connection.query(queries, (error) => {
            if (error) {
                reject(error);
                return;
            }

            connection.end((error) => {
                if (error)
                    reject(error);
                else
                    resolve();
            });
        });
    });
}
