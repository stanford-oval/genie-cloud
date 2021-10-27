// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2021 The Board of Trustees of the Leland Stanford Junior University
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

import '../../src/util/config_init';
import * as i18n from '../../src/util/i18n';
i18n.init(['en-US']);

import { validateDevice } from '../../src/util/validation';

const req = {
    _: (x) => x,

    user: {
        developer_key: null,
        locale: 'en-US',
        roles: 0,
    }
};

const TEST_CASES = [
    [
        {
            name: 'Foo',
            description: 'Foo',
            primary_kind: 'com.foo',
            license: 'Apache-2.0',
            subcategory: 'service',
        },
        `class @com.foo {
            import loader from @org.thingpedia.v2();
        }`,
        `dataset @com.foo {}`,
        null
    ],

    [
        {
            name: 'Foo',
            description: 'Foo',
            primary_kind: 'com.foo',
            license: 'Apache-2.0',
            subcategory: 'service',
        },
        `class @com.foo {}`,
        `dataset @com.foo {}`,
        `Loader mixin missing from class declaration`
    ],

    [
        {
            name: 'Foo',
            description: 'Foo',
            primary_kind: 'com.foo',
            license: 'Apache-2.0',
            subcategory: 'service',
        },
        `class @com.foo #_[canonical="$\{invalid"] {
            import loader from @org.thingpedia.v2();
        }`,
        `dataset @com.foo {}`,
        `Invalid canonical form for @com.foo: Expected ".", ":", "[", or "}" but end of input found.`
    ],

    [
        {
            name: 'Foo',
            description: 'Foo',
            primary_kind: 'com.foo',
            license: 'Apache-2.0',
            subcategory: 'service',
        },
        `class @com.foo {
            import loader from @org.thingpedia.v2();

            query q1()
            #_[canonical="\${invalid"];
        }`,
        `dataset @com.foo {}`,
        `Invalid canonical form for @com.foo.q1: Expected ".", ":", "[", or "}" but end of input found.`
    ],

    [
        {
            name: 'Foo',
            description: 'Foo',
            primary_kind: 'com.foo',
            license: 'Apache-2.0',
            subcategory: 'service',
        },
        `class @com.foo {
            import loader from @org.thingpedia.v2();

            query q1(out arg : String #_[canonical="\${invalid"]);
        }`,
        `dataset @com.foo {}`,
        `Invalid canonical form for @com.foo.q1:arg: Expected ".", ":", "[", or "}" but end of input found.`
    ],
];

async function test(i) {
    console.log(`Test Case #${i+1}`);

    const [options, classDef, datasetDef, expected] = TEST_CASES[i];

    let error;
    try {
        await validateDevice(null, req, options, classDef, datasetDef);
    } catch(e) {
        error = e;
    }

    if (expected !== null) {
        if (error === undefined) {
            console.error(`Test Case #${i+1}: expected error`);
            if (process.env.TEST_MODE)
                throw new Error(`testClassValidation ${i+1} FAILED`);
        } else if (error.message !== expected) {
            console.error(`Test Case #${i+1}: does not match what expected`);
            console.error('Expected: ' + expected);
            console.error('Generated: ' + error.message);
            if (process.env.TEST_MODE)
                throw new Error(`testClassValidation ${i+1} FAILED`);
        }
    } else if (error !== undefined) {
        console.error(`Test Case #${i+1}: unexpected error: ${error.message}`);
        if (process.env.TEST_MODE)
            throw new Error(`testClassValidation ${i+1} FAILED`);
    }
}

async function main() {
    for (let i = 0; i < TEST_CASES.length; i++)
        await test(i);
}
export default main;
if (!module.parent)
    main();
