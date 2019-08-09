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

require('../../util/config_init');
const assert = require('assert');
const FormData = require('form-data');
const { assertHttpError, sessionRequest } = require('./scaffold');
const { startSession, login } = require('../login');

const db = require('../../util/db');
const entityModel = require('../../model/entity');
const stringModel = require('../../model/strings');

const Config = require('../../config');

const ENTITY_FILE = `one,The First Entity
two,The Second Entity
three,The Third Entity
`;

const BAD_ENTITY_FILE = `one,The First Entity
two,The Second Entity
bad,Bad,Entity,File
`;

const STRING_FILE_ONE = `Aaaa
Bbbb.
Cccc???
Dddd`;
const STRING_FILE_TWO = `aaaa
bbbb .
cccc???
dddd`;
const STRING_FILE_THREE = `aaaa\t1.0
bbbb\t5.0
cccc\t
dddd\t1.0`;
const STRING_FILE_BAD = `aaaa\t1.0
bbbb\t5.0
cccc
`;

function createUpload(file, data) {
    const fd = new FormData();

    if (file)
        fd.append('upload', file, { filename: 'entity.csv', contentType: 'text/csv;charset=utf8' });
    for (let key in data)
        fd.append(key, data[key]);
    return fd;
}

function toObject(v) {
    return JSON.parse(JSON.stringify(v));
}

async function testEntityCreate(nobody, bob, root) {
    await assertHttpError(sessionRequest('/thingpedia/entities/create', 'POST', {}, nobody),
        401);

    const fd1 = createUpload(ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:entity_test1',
        entity_name: 'Test Entity',
        no_ner_support: ''
    });
    await assertHttpError(sessionRequest('/thingpedia/entities/create', 'POST', fd1, bob),
        403, 'The prefix of the entity ID must correspond to the ID of a Thingpedia device owned by your organization.');

    const fd2 = createUpload(ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:111bad',
        entity_name: 'Test Entity',
        no_ner_support: ''
    });

    await assertHttpError(sessionRequest('/thingpedia/entities/create', 'POST', fd2, root),
        400, 'Invalid entity type ID.');

    const fd3 = createUpload(ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:entity_test1',
        entity_name: 'Test Entity',
        no_ner_support: ''
    });

    await sessionRequest('/thingpedia/entities/create', 'POST', fd3, root);
    await db.withClient(async (dbClient) => {
        const entity = toObject(await entityModel.get(dbClient, 'org.thingpedia.test:entity_test1'));
        assert.deepStrictEqual(entity, {
            has_ner_support: 1,
            id: 'org.thingpedia.test:entity_test1',
            is_well_known: 0,
            language: 'en',
            name: 'Test Entity'
        });

        const entityValues = toObject(await entityModel.getValues(dbClient, 'org.thingpedia.test:entity_test1'));
        assert.deepStrictEqual(entityValues, [
            {
                entity_canonical: 'the first entity',
                entity_name: 'The First Entity',
                entity_value: 'one'
            },
            {
                entity_canonical: 'the third entity',
                entity_name: 'The Third Entity',
                entity_value: 'three'
            },
            {
                entity_canonical: 'the second entity',
                entity_name: 'The Second Entity',
                entity_value: 'two'
            }
        ]);
    });

    const fd4 = createUpload(null, {
        entity_id: 'org.thingpedia.test:entity_test2',
        entity_name: 'Test Entity 2',
        no_ner_support: ''
    });

    await assertHttpError(sessionRequest('/thingpedia/entities/create', 'POST', fd4, root),
        400, 'You must upload a CSV file with the entity values.');

    const fd5 = createUpload(BAD_ENTITY_FILE, {
        entity_id: 'org.thingpedia.test:entity_test2',
        entity_name: 'Test Entity 2',
        no_ner_support: ''
    });

    await assertHttpError(sessionRequest('/thingpedia/entities/create', 'POST', fd5, root),
        400, 'Invalid Record Length: expect 2, got 4 on line 3');

    const fd6 = createUpload(null, {
        entity_id: 'org.thingpedia.test:entity_test2',
        entity_name: 'Test Entity 2',
        no_ner_support: '1'
    });

    await sessionRequest('/thingpedia/entities/create', 'POST', fd6, root);
    await db.withClient(async (dbClient) => {
        const entity = toObject(await entityModel.get(dbClient, 'org.thingpedia.test:entity_test2'));
        assert.deepStrictEqual(entity, {
            has_ner_support: 0,
            id: 'org.thingpedia.test:entity_test2',
            is_well_known: 0,
            language: 'en',
            name: 'Test Entity 2'
        });

        const entityValues = await entityModel.getValues(dbClient, 'org.thingpedia.test:entity_test2');
        assert.deepStrictEqual(entityValues, []);
    });
}

async function testStringCreate(nobody, bob, root) {
    await assertHttpError(sessionRequest('/thingpedia/strings/create', 'POST', {}, nobody),
        401);

    const fd1 = createUpload(STRING_FILE_ONE, {
        type_name: 'org.thingpedia.test:string_test1',
        name: 'Test String One',
        license: 'public-domain'
    });
    await assertHttpError(sessionRequest('/thingpedia/strings/create', 'POST', fd1, bob),
        403, 'The prefix of the dataset ID must correspond to the ID of a Thingpedia device owned by your organization.');

    const fd2 = createUpload(STRING_FILE_ONE, {
        type_name: 'org.thingpedia.test:111string_test1',
        name: 'Test String One',
        license: 'public-domain'
    });

    await assertHttpError(sessionRequest('/thingpedia/strings/create', 'POST', fd2, root),
        400, 'Invalid string type ID.');

    const fd3 = createUpload(STRING_FILE_ONE, {
        type_name: 'org.thingpedia.test:string_test1',
        name: 'Test String One',
        license: 'foooooo'
    });

    await assertHttpError(sessionRequest('/thingpedia/strings/create', 'POST', fd3, root),
        400, 'Invalid license.');

    const fd4 = createUpload(STRING_FILE_ONE, {
        type_name: 'org.thingpedia.test:string_test1',
        name: 'Test String One',
        license: 'public-domain',
    });

    await sessionRequest('/thingpedia/strings/create', 'POST', fd4, root);
    await db.withClient(async (dbClient) => {
        const stringType = await stringModel.getByTypeName(dbClient, 'org.thingpedia.test:string_test1');
        assert.strictEqual(stringType.type_name, 'org.thingpedia.test:string_test1');
        assert.strictEqual(stringType.language, 'en');
        assert.strictEqual(stringType.name, 'Test String One');
        assert.strictEqual(stringType.license, 'public-domain');

        const values = toObject(await stringModel.getValues(dbClient, 'org.thingpedia.test:string_test1'));
        values.sort((a, b) => a.preprocessed.localeCompare(b.preprocessed));
        assert.deepStrictEqual(values, [
            {
                preprocessed: 'aaaa',
                value: 'Aaaa',
                weight: 1.0
            },
            {
                preprocessed: 'bbbb .',
                value: 'Bbbb.',
                weight: 1.0
            },
            {
                preprocessed: 'cccc ???',
                value: 'Cccc???',
                weight: 1.0
            },
            {
                preprocessed: 'dddd',
                value: 'Dddd',
                weight: 1.0
            },
        ]);
    });

    const fd5 = createUpload(null, {
        type_name: 'org.thingpedia.test:string_test2',
        name: 'Test String Two',
        license: 'public-domain'
    });

    await assertHttpError(sessionRequest('/thingpedia/strings/create', 'POST', fd5, root),
        400, 'You must upload a TSV file with the string values.');

    const fd6 = createUpload(STRING_FILE_TWO, {
        type_name: 'org.thingpedia.test:string_test2',
        name: 'Test String Two',
        license: 'public-domain',
        preprocessed:'1'
    });

    await sessionRequest('/thingpedia/strings/create', 'POST', fd6, root);
    await db.withClient(async (dbClient) => {
        const stringType = await stringModel.getByTypeName(dbClient, 'org.thingpedia.test:string_test2');
        assert.strictEqual(stringType.type_name, 'org.thingpedia.test:string_test2');
        assert.strictEqual(stringType.language, 'en');
        assert.strictEqual(stringType.name, 'Test String Two');
        assert.strictEqual(stringType.license, 'public-domain');

        const values = toObject(await stringModel.getValues(dbClient, 'org.thingpedia.test:string_test2'));
        values.sort((a, b) => a.preprocessed.localeCompare(b.preprocessed));
        assert.deepStrictEqual(values, [
            {
                preprocessed: 'aaaa',
                value: 'aaaa',
                weight: 1.0
            },
            {
                preprocessed: 'bbbb .',
                value: 'bbbb .',
                weight: 1.0
            },
            {
                preprocessed: 'cccc???',
                value: 'cccc???',
                weight: 1.0
            },
            {
                preprocessed: 'dddd',
                value: 'dddd',
                weight: 1.0
            },
        ]);
    });

    const fd7 = createUpload(STRING_FILE_BAD, {
        type_name: 'org.thingpedia.test:string_test3',
        name: 'Test String Three',
        license: 'proprietary',
        preprocessed:'1'
    });

    await assertHttpError(sessionRequest('/thingpedia/strings/create', 'POST', fd7, root),
        400, 'Invalid Record Length: expect 2, got 1 on line 3');

    const fd8 = createUpload(STRING_FILE_THREE, {
        type_name: 'org.thingpedia.test:string_test3',
        name: 'Test String Three',
        license: 'proprietary',
        preprocessed:'1'
    });

    await sessionRequest('/thingpedia/strings/create', 'POST', fd8, root);
    await db.withClient(async (dbClient) => {
        const stringType = await stringModel.getByTypeName(dbClient, 'org.thingpedia.test:string_test3');
        assert.strictEqual(stringType.type_name, 'org.thingpedia.test:string_test3');
        assert.strictEqual(stringType.language, 'en');
        assert.strictEqual(stringType.name, 'Test String Three');
        assert.strictEqual(stringType.license, 'proprietary');

        const values = toObject(await stringModel.getValues(dbClient, 'org.thingpedia.test:string_test3'));
        values.sort((a, b) => a.preprocessed.localeCompare(b.preprocessed));
        assert.deepStrictEqual(values, [
            {
                preprocessed: 'aaaa',
                value: 'aaaa',
                weight: 1.0
            },
            {
                preprocessed: 'bbbb',
                value: 'bbbb',
                weight: 5.0
            },
            {
                preprocessed: 'cccc',
                value: 'cccc',
                weight: 1.0
            },
            {
                preprocessed: 'dddd',
                value: 'dddd',
                weight: 1.0
            },
        ]);
    });

    await assertHttpError(sessionRequest('/thingpedia/strings/download/org.thingpedia.test:string_test3', 'GET', '', root),
        403, 'This dataset is proprietary and cannot be downloaded directly. Contact the Thingpedia administrators directly to obtain it.');
}

async function main() {
    if (Config.WITH_THINGPEDIA !== 'embedded')
        return;

    const nobody = await startSession();
    const bob = await login('bob', '12345678');
    const root = await login('root', 'rootroot');

    try {
        await testEntityCreate(nobody, bob, root);
        await testStringCreate(nobody, bob, root);
    } finally {
        await db.withTransaction(async (dbClient) => {
            await entityModel.delete(dbClient, 'org.thingpedia.test:entity_test1');
            await entityModel.delete(dbClient, 'org.thingpedia.test:entity_test2');
            await stringModel.deleteByTypeName(dbClient, 'org.thingpedia.test:string_test1');
            await stringModel.deleteByTypeName(dbClient, 'org.thingpedia.test:string_test2');
            await stringModel.deleteByTypeName(dbClient, 'org.thingpedia.test:string_test3');
        });
    }

    await db.tearDown();
}
module.exports = main;
if (!module.parent)
    main();
