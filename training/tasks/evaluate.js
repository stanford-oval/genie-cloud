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
const path = require('path');
const fs = require('fs');
const Genie = require('genie-toolkit');
const ThingTalk = require('thingtalk');

const AdminThingpediaClient = require('../../util/admin-thingpedia-client');
const AbstractFS = require('../../util/abstract_fs');
const TokenizerService = require('../../util/tokenizer_service');

class LocalParserClient {
    constructor(modeldir, locale) {
        this._locale = locale;
        this._tokenizer = TokenizerService.getLocal();
        this._predictor = new Genie.Predictor('local', modeldir, 1);
    }

    async start() {
        await this._predictor.start();
    }
    async stop() {
        await this._predictor.stop();
    }

    async tokenize(utterance, contextEntities) {
        const tokenized = await this._tokenizer.tokenize(this._locale, utterance);
        Genie.Utils.renumberEntities(tokenized, contextEntities);
        return tokenized;

    }
    async sendUtterance(utterance, tokenized, contextCode, contextEntities) {
        let tokens, entities;
        if (tokenized) {
            tokens = utterance.split(' ');
            entities = {};
            Object.assign(entities, contextEntities);
        } else {
            const tokenized = await this._tokenizer.tokenize(this._locale, utterance);
            Genie.Utils.renumberEntities(tokenized, contextEntities);
            tokens = tokenized.tokens;
            entities = tokenized.entities;
        }

        const candidates = await this._predictor.predict(tokens, contextCode);
        return { tokens, candidates, entities };
    }
}


module.exports = async function main(task, argv) {
    task.handleKill();

    const jobdir = await AbstractFS.download(task.jobDir + '/');
    const datadir = path.resolve(jobdir, 'dataset');
    const outputdir = path.resolve(jobdir, 'output');

    const tpClient = new AdminThingpediaClient(task.language);
    const schemas = new ThingTalk.SchemaRetriever(tpClient, null, true);
    const parser = new LocalParserClient(outputdir, task.language);
    await parser.start();

    const output = fs.createReadStream(path.resolve(datadir, 'eval.tsv'))
        .setEncoding('utf8')
        .pipe(byline())
        .pipe(new Genie.DatasetParser({
            contextual: task.modelInfo.contextual,
            preserveId: true,
            parseMultiplePrograms: true
        }))
        .pipe(new Genie.SentenceEvaluatorStream(parser, schemas, true /* tokenized */, argv.debug))
        .pipe(new Genie.CollectSentenceStatistics());

    const result = await output.read();
    await task.setMetrics(result);

    await Promise.all([
        parser.stop(),
        TokenizerService.tearDown(),
        AbstractFS.removeTemporary(jobdir)
    ]);
};
