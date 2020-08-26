// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
//
// See LICENSE for details
"use strict";

const assert = require('assert');
if (!assert.rejects) {
    // added in node 9.*, we still support (and mostly use) 8.*

    assert.rejects = async function rejects(promise, error, message) {
        if (typeof promise === 'function')
            promise = promise();

        try {
            await promise;
            try {
                assert.fail("Expected a rejected promise");
            } catch(e) {
                return Promise.reject(e);
            }
        } catch(e) {
            assert.throws(() => { throw e; }, error, message);
        }
        return Promise.resolve();
    };
}
