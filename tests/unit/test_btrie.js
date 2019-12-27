// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
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
    const builder = new BTrie.Builder();
    for (let [key, value] of DATA)
        builder.insert(key, value);

    const buffer = builder.build();
    assert(buffer instanceof Buffer);
    //await fs.writeFile('out.btrie', buffer);

    const btrie = new BTrie(buffer);

    for (let [key, value] of DATA.slice(0, 6))
        assert.deepStrictEqual(btrie.search(key), value);

    assert.deepStrictEqual(btrie.search(['get', 'foo']), '$6');
    assert.deepStrictEqual(btrie.search(['get', 'a', 'dog']), null);
    assert.deepStrictEqual(btrie.search(['post', 'tweet']), null);
    assert.deepStrictEqual(btrie.search(['when', 'I', 'receive', 'a', 'tweet']), null);
    assert.deepStrictEqual(btrie.search([]), null);
    assert.deepStrictEqual(btrie.search(['when']), null);
    assert.deepStrictEqual(btrie.search(['search']), null);
    assert.deepStrictEqual(btrie.search(['search', 'foo']), '$7');
    assert.deepStrictEqual(btrie.search(['play', 'coldplay']), '$8');
    assert.deepStrictEqual(btrie.search(['play']), '$9');
    assert.deepStrictEqual(btrie.search(['play', 'taylor', 'swift']), null);
}

function testEmpty() {
    const builder = new BTrie.Builder();

    const buffer = builder.build();
    assert(buffer instanceof Buffer);
    assert.deepStrictEqual(buffer, Buffer.from([
        0x41, 0x4c, 0x54, 0x52, 0x1, 0x0, 0x0, 0x0
    ]));

    const btrie = new BTrie(buffer);

    for (let [key,] of DATA.slice(0, 6))
        assert.deepStrictEqual(btrie.search(key), null);
    assert.deepStrictEqual(btrie.search([]), null);
}

async function main() {
    await testBasic();
    await testEmpty();
}
module.exports = main;
if (!module.parent)
    main();
