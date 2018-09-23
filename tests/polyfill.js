// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
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
