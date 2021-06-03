// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2020 The Board of Trustees of the Leland Stanford Junior University
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
"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../../src/util/config_init');
process.env.TEST_MODE = '1';

/*async function par(array) {
    await Promise.all(array.map((fn) => fn()));
}*/
async function seq(array) {
    for (let fn of array) {
        console.log(`Running tests for ${fn}`);
        await require(fn)();
    }
}

seq([
    ('./test_abstract_fs'),
    ('./test_lock'),
    ('./test_tokenize'),
    ('./test_device_factories'),
    ('./test_binary_search'),
    ('./test_input_validation'),
    ('./test_example_names'),
    ('./test_k8s_api.js'),
    ('./test_kf_inference_url.js')
]);
