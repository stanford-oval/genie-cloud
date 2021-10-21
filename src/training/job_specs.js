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


import * as Tp from 'thingpedia';

import * as Config from '../config';

export default {
    'update-dataset': [
        {
            name: 'update-dataset',
            progress: 0.9,
            computeEta: false,

            requests: {
                cpu: 1.1,
                gpu: 0
            }
        },
        {
            name: 'reloading-exact',
            progress: 0.1,
            computeEta: false,

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
};

