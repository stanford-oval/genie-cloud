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

const Tp = require('thingpedia');

const AbstractFS = require('../util/abstract_fs');
const db = require('../util/db');
const modelsModel = require('../model/nlp_models');

const Config = require('../config');

module.exports = {
    'update-dataset': [
        {
            name: 'update-dataset',
            progress: 0.9,

            requests: {
                cpu: 1.1,
                gpu: 0
            }
        },
        {
            name: 'reloading-exact',
            progress: 0.1,

            async task(job) {
                // reload the exact matches now that the synthetic set has been updated
                try {
                    await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/exact/@${job.model_tag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
                        dataContentType: 'application/x-www-form-urlencoded'
                    });
                } catch(e) {
                    console.error(`Failed to ask server to reload exact matches: ${e.message}`);
                }
            }
        }
    ],

    'train': [
        {
            name: 'prepare-training-set',
            progress: 0.15,

            requests: {
                cpu: 1.5,
                gpu: 0
            }
        },
        {
            name: 'train',
            progress: 0.8,

            requests: {
                cpu: 2.5,
                gpu: 1
            }
        },
        {
            name: 'evaluate',
            progress: 0.049,

            requests: {
                cpu: 1.5,
                gpu: 0 // XXX: if we care, we can evaluate on GPU too
            }
        },
        {
            name: 'uploading',
            progress: 0.001,

            async task(job) {
                const outputdir = AbstractFS.resolve(job.jobDir, 'output');
                await db.withTransaction(async (dbClient) => {
                    const model = await modelsModel.getByTagForUpdate(dbClient, job.language, job.model_tag);
                    const newVersion = model.version + 1;
                    const modeldir = `./${job.model_tag}:${job.language}-v${newVersion}`;

                    await AbstractFS.sync(outputdir + '/',
                        AbstractFS.resolve(Config.NL_MODEL_DIR, modeldir) + '/');

                    return modelsModel.update(dbClient, model.id, {
                        trained: true,
                        version: newVersion
                    });
                });

                if (Config.NL_SERVER_URL === null)
                    return;

                await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/@${job.model_tag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
                    dataContentType: 'application/x-www-form-urlencoded'
                });
            }
        }
    ]
};

