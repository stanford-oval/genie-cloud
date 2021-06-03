// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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


const byline = require('byline');
const path = require('path');
const fs = require('fs');
const Genie = require('genie-toolkit');
const ThingTalk = require('thingtalk');

const AdminThingpediaClient = require('../../util/admin-thingpedia-client');
const AbstractFS = require('../../util/abstract_fs');

module.exports = async function main(task, argv) {
    task.handleKill();

    const jobdir = await AbstractFS.download(task.jobDir + '/');
    const datadir = path.resolve(jobdir, 'dataset');
    const outputdir = path.resolve(jobdir, 'output');

    const tpClient = new AdminThingpediaClient(task.language);
    const schemas = new ThingTalk.SchemaRetriever(tpClient, null, true);
    const parser = Genie.ParserClient.get('file://' + outputdir, task.language);
    await parser.start();

    const output = fs.createReadStream(path.resolve(datadir, 'eval.tsv'))
        .setEncoding('utf8')
        .pipe(byline())
        .pipe(new Genie.DatasetParser({
            contextual: task.modelInfo.contextual,
            preserveId: true,
            parseMultiplePrograms: true
        }))
        .pipe(new Genie.Evaluation.SentenceEvaluatorStream(parser, {
            locale: task.language,
            targetLanguage: 'thingtalk',
            tokenized: true,
            thingpediaClient: tpClient,
            schemaRetriever: schemas,
            debug: argv.debug,
            oracle: false
        }))
        .pipe(new Genie.Evaluation.CollectSentenceStatistics());

    const result = await output.read();
    await task.setMetrics(result);

    await Promise.all([
        parser.stop(),
        AbstractFS.removeTemporary(jobdir)
    ]);
};
