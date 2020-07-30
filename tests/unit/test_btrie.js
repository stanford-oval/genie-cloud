// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
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
"use strict";

const assert = require('assert');
const BTrie = require('../../util/btrie');
//const fs = require('fs').promises;

const DATA = [
    [['get', 'a', 'cat'], '$0'],
    [['get', 'a', 'cat', 'picture'], '$1'],
    [['get', 'latest', 'emails'], '$2'],
    [['get', 'latest', 'xkcd'], '$3'],
    [['when', 'I', 'receive', 'an', 'email'], '$4'],
    [['when', 'I', 'leave', 'home'], '$5'],
    [['get', BTrie.WILDCARD], '$6'],
    [['search', BTrie.WILDCARD], '$7'],
    [['play', BTrie.WILDCARD], '$8'],
    [['play'], '$9'],
];

async function testBasic() {
    const builder = new BTrie.Builder((existing, newValue) => newValue);
    for (let [key, value] of DATA)
        builder.insert(key, value);

    const buffer = builder.build();
    assert(buffer instanceof Buffer);
    //await fs.writeFile('out.btrie', buffer);

    const btrie = new BTrie(buffer);

    for (let [key, value] of DATA.slice(0, 6))
        assert.deepStrictEqual(btrie.search(key), value);

    assert.deepStrictEqual(btrie.search(['get', 'foo']), '$6');
    assert.deepStrictEqual(btrie.search(['get', 'a', 'dog']), undefined);
    assert.deepStrictEqual(btrie.search(['post', 'tweet']), undefined);
    assert.deepStrictEqual(btrie.search(['when', 'I', 'receive', 'a', 'tweet']), undefined);
    assert.deepStrictEqual(btrie.search([]), undefined);
    assert.deepStrictEqual(btrie.search(['when']), undefined);
    assert.deepStrictEqual(btrie.search(['search']), undefined);
    assert.deepStrictEqual(btrie.search(['search', 'foo']), '$7');
    assert.deepStrictEqual(btrie.search(['play', 'coldplay']), '$8');
    assert.deepStrictEqual(btrie.search(['play']), '$9');
    assert.deepStrictEqual(btrie.search(['play', 'taylor', 'swift']), undefined);
}

function testEmpty() {
    const builder = new BTrie.Builder((existing, newValue) => newValue);

    const buffer = builder.build();
    assert(buffer instanceof Buffer);
    assert.deepStrictEqual(buffer, Buffer.from([
        0x41, 0x4c, 0x54, 0x52, 0x1, 0x0, 0x0, 0x0
    ]));

    const btrie = new BTrie(buffer);

    for (let [key,] of DATA.slice(0, 6))
        assert.deepStrictEqual(btrie.search(key), undefined);
    assert.deepStrictEqual(btrie.search([]), undefined);
}

async function main() {
    await testBasic();
    await testEmpty();
}
module.exports = main;
if (!module.parent)
    main();
