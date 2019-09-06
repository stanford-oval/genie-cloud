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
const Config = require('../config');

module.exports = {
    'update-dataset': [
        {
            name: 'update-dataset',

            requests: {
                cpu: 1.1,
                gpu: 0
            }
        },
        {
            name: 'reloading-exact',

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

            requests: {
                cpu: 1.5,
                gpu: 0
            }
        },
        {
            name: 'train',

            requests: {
                cpu: 2.5,
                gpu: 1
            }
        },
        {
            name: 'evaluate',

            requests: {
                cpu: 1.5,
                gpu: 0 // XXX: if we care, we can evaluate on GPU too
            }
        },
        {
            name: 'uploading',

            async task(job) {
                const modelLangDir = `./${job.model_tag}:${job.language}`;
                const outputdir = AbstractFS.resolve(job.jobDir, 'output');

                if (Config.NL_MODEL_DIR === null)
                    return;

                await AbstractFS.sync(outputdir + '/',
                    AbstractFS.resolve(Config.NL_MODEL_DIR, modelLangDir) + '/');

                await Tp.Helpers.Http.post(Config.NL_SERVER_URL + `/admin/reload/@${job.model_tag}/${job.language}?admin_token=${Config.NL_SERVER_ADMIN_TOKEN}`, '', {
                    dataContentType: 'application/x-www-form-urlencoded'
                });
            }
        }
    ]
};

