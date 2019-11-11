// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const JSZip = require('jszip');
const ThingTalk = require('thingtalk');
const stream = require('stream');
const deq = require('deep-equal');
const util = require('util');

const model = require('../model/device');
const schemaModel = require('../model/schema');
const exampleModel = require('../model/example');

const user = require('./user');

const graphics = require('../almond/graphics');
const colorScheme = require('./color_scheme');

const Validation = require('./validation');
const code_storage = require('./code_storage');
const SchemaUtils = require('./manifest_to_schema');
const DatasetUtils = require('./dataset');
const FactoryUtils = require('./device_factories');
const TrainingServer = require('./training_server');
const { NotFoundError, ForbiddenError, BadRequestError } = require('./errors');
const db = require('./db');

const EngineManager = require('../almond/enginemanagerclient');

function areMetaIdentical(one, two) {
    for (let what of ['queries', 'actions']) {
        const oneKeys = Object.keys(one[what]).sort();
        const twoKeys = Object.keys(two[what]).sort();
        if (oneKeys.length !== twoKeys.length)
            return false;
        for (let i = 0; i < oneKeys.length; i++) {
            if (oneKeys[i] !== twoKeys[i])
                return false;

            // ignore confirmation remote in comparison
            one[what][oneKeys[i]].confirmation_remote = two[what][twoKeys[i]].confirmation_remote;
            if (!deq(one[what][oneKeys[i]], two[what][twoKeys[i]], { strict: true }))
                return false;
        }
    }

    return true;
}

async function ensurePrimarySchema(dbClient, name, classDef, req, approve) {
    const metas = SchemaUtils.classDefToSchema(classDef);

    return schemaModel.getByKind(dbClient, classDef.kind).then(async (existing) => {
        if (existing.owner !== req.user.developer_org &&
            (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0)
            throw new ForbiddenError();

        const existingMeta = (await schemaModel.getMetasByKindAtVersion(dbClient, classDef.kind, existing.developer_version, 'en'))[0];
        if (areMetaIdentical(existingMeta, metas)) {
            console.log('Skipped updating of schema: identical to previous version');
            if (existing.approved_version === null && approve)
                await schemaModel.approveByKind(dbClient, classDef.kind);

            return [existing.id, false];
        }

        var obj = {
            kind_canonical: classDef.metadata.canonical,
            developer_version: existing.developer_version + 1
        };
        if (approve)
            obj.approved_version = obj.developer_version;

        await schemaModel.update(dbClient, existing.id, existing.kind, obj, metas);
        return [existing.id, true];
    }, async (e) => {
        var obj = {
            kind: classDef.kind,
            kind_canonical: classDef.metadata.canonical,
            kind_type: 'primary',
            owner: req.user.developer_org
        };
        if (approve) {
            obj.approved_version = 0;
            obj.developer_version = 0;
        } else {
            obj.approved_version = null;
            obj.developer_version = 0;
        }

        const schema = await schemaModel.create(dbClient, obj, metas);
        return [schema.id, true];
    });
}

async function ensureDataset(dbClient, schemaId, dataset, datasetSource) {
    /* This functions does three things:

       - it fetches the list of existing examples in the database
       - it matches the IDs against the examples in the dataset file
         and updates the database
       - it creates fresh examples for secondary utterances
    */

    const existingMap = new Map;
    const toDelete = new Set;

    const old = await exampleModel.getBaseBySchema(dbClient, schemaId, dataset.language);
    const oldDataset = DatasetUtils.examplesToDataset(dataset.name.substring(1), dataset.language, old, { editMode: true });

    // if the datasets are byte by byte identical, skip everything and return false
    // this covers the case where the user did not touch the file at all
    if (datasetSource.replace(/\r\n/g, '\n').trim() === oldDataset.trim())
        return false;

    for (let row of old) {
        existingMap.set(row.id, row);
        toDelete.add(row.id);
    }

    const toCreate = [];
    const toUpdate = [];

    for (let example of dataset.examples) {
        const code = DatasetUtils.exampleToCode(example);

        if (example.id >= 0) {
            if (existingMap.has(example.id)) {
                const existing = existingMap.get(example.id);
                if (existing.target_code === code && existing.language === dataset.language &&
                    existing.name === example.annotations.name) {
                    toDelete.delete(example.id);
                    if (existing.utterance !== example.utterances[0]) {
                        toUpdate.push({ id: example.id,
                                        utterance: example.utterances[0],
                                        preprocessed: example.preprocessed[0] });
                    }
                } else {
                    example.id = -1;
                }
            } else {
                example.id = -1;
            }
        }
        if (example.id < 0) {
            toCreate.push({
                utterance: example.utterances[0],
                preprocessed: example.preprocessed[0],
                target_code: code,
                name: example.annotations.name,
            });
        }

        for (let i = 1; i < example.utterances.length; i++) {
            toCreate.push({
                utterance: example.utterances[i],
                preprocessed: example.preprocessed[i],
                target_code: code,
                name: null
            });
        }
    }

    if (toDelete.length === 0 && toCreate.length === 0 && toUpdate.length === 0)
        return false;

    await Promise.all([
        exampleModel.deleteMany(dbClient, Array.from(toDelete)),
        Promise.all(toUpdate.map((ex) => {
            return exampleModel.update(dbClient, ex.id, ex);
        })),
        exampleModel.createMany(dbClient, toCreate.map((ex) => {
            return ({
                schema_id: schemaId,
                utterance: ex.utterance,
                preprocessed: ex.preprocessed,
                target_code: ex.target_code,
                target_json: '', // FIXME
                type: 'thingpedia',
                language: dataset.language,
                is_base: 1,
                flags: 'template',
                name: ex.name
            });
        }))
    ]);
    return true;
}

function uploadZipFile(req, obj, stream) {
    var zipFile = new JSZip();

    return Promise.resolve().then(() => {
        // unfortunately JSZip only loads from memory, so we need to load the entire file
        // at once
        // this is somewhat a problem, because the file can be up to 30-50MB in size
        // we just hope the GC will get rid of the buffer quickly

        var buffers = [];
        var length = 0;
        return new Promise((callback, errback) => {
            stream.on('data', (buffer) => {
                buffers.push(buffer);
                length += buffer.length;
            });
            stream.on('end', () => {
                callback(Buffer.concat(buffers, length));
            });
            stream.on('error', errback);
        });
    }).then((buffer) => {
        return zipFile.loadAsync(buffer, { checkCRC32: false });
    }).then(() => {
        var packageJson = zipFile.file('package.json');
        if (!packageJson)
            throw new BadRequestError(req._("package.json missing from device zip file"));

        return packageJson.async('string');
    }).then((text) => {
        try {
            var parsed = JSON.parse(text);
        } catch(e) {
            throw new BadRequestError("Invalid package.json: SyntaxError at line " + e.lineNumber + ": " + e.message);
        }
        if (!parsed.name || !parsed.main)
            throw new BadRequestError(req._("Invalid package.json (missing name or main)"));

        parsed['thingpedia-version'] = obj.developer_version;

        zipFile.file('package.json', JSON.stringify(parsed));

        return code_storage.storeZipFile(zipFile.generateNodeStream({ compression: 'DEFLATE',
                                                                      type: 'nodebuffer',
                                                                      platform: 'UNIX'}),
                                         obj.primary_kind, obj.developer_version);
    }).catch((e) => {
        console.error('Failed to upload zip file to S3: ' + e);
        e.status = 400;
        throw e;
    });
}

function uploadJavaScript(req, obj, stream) {
    var zipFile = new JSZip();

    return Promise.resolve().then(() => {
        zipFile.file('package.json', JSON.stringify({
            name: obj.primary_kind,
            author: req.user.username + '@thingpedia.stanford.edu',
            main: 'index.js',
            'thingpedia-version': obj.developer_version
        }));
        zipFile.file('index.js', stream);
        return code_storage.storeZipFile(zipFile.generateNodeStream({ compression: 'DEFLATE',
                                                                      type: 'nodebuffer',
                                                                      platform: 'UNIX'}),
                                         obj.primary_kind, obj.developer_version);
    }).catch((e) => {
        console.error('Failed to upload zip file to S3: ' + e);
        console.error(e.stack);
        throw e;
    });
}

function isDownloadable(classDef) {
    const loader = classDef.loader;
    return !classDef.is_abstract &&
        Validation.JAVASCRIPT_MODULE_TYPES.has(loader.module) &&
        loader.module !== 'org.thingpedia.builtin' &&
        loader.module !== 'org.thingpedia.embedded';
}

function getCategory(classDef) {
    if (classDef.annotations.system && classDef.annotations.system.toJS())
        return 'system';
    if (classDef.is_abstract)
        return 'system';

    if (classDef.loader.module === 'org.thingpedia.builtin') {
        switch (classDef.kind) {
        case 'org.thingpedia.builtin.thingengine.gnome':
        case 'org.thingpedia.builtin.thingengine.phone':
        case 'org.thingpedia.builtin.thingengine.home':
            return 'physical';
        }
    }

    switch (classDef.config.module) {
    case 'org.thingpedia.config.builtin':
    case 'org.thingpedia.config.none':
        return 'data';
    case 'org.thingpedia.config.discovery.bluetooth':
    case 'org.thingpedia.config.discovery.upnp':
        return 'physical';
    default:
        return 'online';
    }
}

async function uploadIcon(primary_kind, iconPath, deleteAfterwards = true) {
    try {
        var image = graphics.createImageFromPath(iconPath);
        image.resizeFit(512, 512);
        const [stdout,] = await image.stream('png');

        // we need to consume the stream twice: once
        // to upload to S3 / store on reliable file system
        // and the other time to compute the color scheme
        //
        // in theory, nodejs supports this
        // in practice, it depends heavily on what each library
        // is doing, and I don't want to dig too deep in their
        // source code (plus it could break at any moment)
        //
        // instead, we create a separate PassThrough for each
        // destination

        const pt1 = new stream.PassThrough();
        stdout.pipe(pt1);

        const pt2 = new stream.PassThrough();
        stdout.pipe(pt2);

        // we must run the two consumers in parallel, or one of
        // the streams will be forced to buffer everything in memory
        // and we'll be sad
        const [,result] = await Promise.all([
            code_storage.storeIcon(pt1, primary_kind),
            colorScheme(pt2, primary_kind)
        ]);
        return result;
    } finally {
        if (deleteAfterwards)
            await util.promisify(fs.unlink)(iconPath);
    }
}

async function importDevice(dbClient, req, primary_kind, json, { owner = 0, zipFilePath = null, iconPath = null, approve = true }) {
    const device = {
        primary_kind: primary_kind,
        owner: owner,
        name: json.thingpedia_name,
        description: json.thingpedia_description,

        license: json.license || 'GPL-3.0',
        license_gplcompatible: json.license_gplcompatible || true,
        website: json.website || '',
        repository: json.repository || '',
        issue_tracker: json.issue_tracker || (json.repository ? json.repository + '/issues' : ''),
        subcategory: json.subcategory,

        approved_version: (approve ? 0 : null),
        developer_version: 0,

        source_code: json.class
    };

    const [classDef, dataset] = await Validation.validateDevice(dbClient, req, device, json.class, json.dataset);
    await Validation.tokenizeDataset(dataset);
    device.category = getCategory(classDef);

    const [schemaId,] = await ensurePrimarySchema(dbClient, device.name,
                                                  classDef, req, approve);
    await ensureDataset(dbClient, schemaId, dataset, json.dataset);
    const factory = FactoryUtils.makeDeviceFactory(classDef, device);

    classDef.annotations.version = ThingTalk.Ast.Value.Number(device.developer_version);
    classDef.annotations.package_version = ThingTalk.Ast.Value.Number(device.developer_version);
    const versionedInfo = {
        code: classDef.prettyprint(),
        factory: JSON.stringify(factory),
        downloadable: isDownloadable(classDef),
        module_type: classDef.is_abstract ? 'org.thingpedia.abstract' : classDef.loader.module
    };

    if (iconPath)
        Object.assign(device, await uploadIcon(primary_kind, iconPath, false));

    await model.create(dbClient, device, classDef.extends || [],
                       classDef.annotations.child_types ?
                       classDef.annotations.child_types.toJS() : [],
                       FactoryUtils.getDiscoveryServices(classDef),
                       versionedInfo);

    if (versionedInfo.downloadable && zipFilePath !== null) {
        if (zipFilePath.endsWith('.js'))
            await uploadJavaScript(req, device, fs.createReadStream(zipFilePath));
        else
            await uploadZipFile(req, device, fs.createReadStream(zipFilePath));
    }

    return device;
}

function migrateManifest(code, device) {
    const isJSON = typeof code === 'object' || /^\s*\{/.test(code);
    if (!isJSON) // already migrated
        return code;

    let ast = typeof code === 'string' ? JSON.parse(code) : code;

    ast.system = device.category === 'system';
    return ThingTalk.Ast.fromManifest(device.primary_kind, ast).prettyprint();
}

function tryUpdateDevice(primaryKind, userId) {
    // do the update asynchronously - if the update fails, the user will
    // have another chance from the status page
    EngineManager.get().getEngine(userId).then((engine) => {
        return engine.devices.updateDevicesOfKind(primaryKind);
    }).catch((e) => {
        console.error(`Failed to auto-update device ${primaryKind} for user ${userId}: ${e.message}`);
    });

    return Promise.resolve();
}

function isJavaScript(file) {
    return file.mimetype === 'application/javascript' ||
        file.mimetype === 'text/javascript' ||
        (file.originalname && file.originalname.endsWith('.js'));
}

async function uploadDevice(req) {
    const approve = (req.user.roles & (user.Role.TRUSTED_DEVELOPER | user.Role.THINGPEDIA_ADMIN)) !== 0
        && !!req.body.approve;

    try {
        const retrain = await db.withTransaction(async (dbClient) => {
            let create = false;
            let old = null;
            try {
                old = await model.getByPrimaryKind(dbClient, req.body.primary_kind);

                if (old.owner !== req.user.developer_org &&
                    (req.user.roles & user.Role.THINGPEDIA_ADMIN) === 0)
                    throw new ForbiddenError();
            } catch(e) {
                if (!(e instanceof NotFoundError))
                    throw e;
                create = true;
                if (!req.files.icon || !req.files.icon.length)
                    throw new BadRequestError(req._("An icon must be specified for new devices"));
            }

            const [classDef, dataset] = await Validation.validateDevice(dbClient, req, req.body,
                                                                        req.body.code, req.body.dataset);
            await Validation.tokenizeDataset(dataset);

            const [schemaId, schemaChanged] = await ensurePrimarySchema(dbClient, req.body.name,
                                                                        classDef, req, approve);
            const datasetChanged = await ensureDataset(dbClient, schemaId, dataset, req.body.dataset);

            const extraKinds = classDef.extends || [];
            const extraChildKinds = classDef.annotations.child_types ?
                classDef.annotations.child_types.toJS() : [];

            const downloadable = isDownloadable(classDef);

            const developer_version = create ? 0 : old.developer_version + 1;
            classDef.annotations.version = ThingTalk.Ast.Value.Number(developer_version);
            classDef.annotations.package_version = ThingTalk.Ast.Value.Number(developer_version);

            const generalInfo = {
                primary_kind: req.body.primary_kind,
                name: req.body.name,
                description: req.body.description,
                license: req.body.license,
                license_gplcompatible: !!req.body.license_gplcompatible,
                website: req.body.website || '',
                repository: req.body.repository || '',
                issue_tracker: req.body.issue_tracker || '',
                category: getCategory(classDef),
                subcategory: req.body.subcategory,
                source_code: req.body.code,
                developer_version: developer_version,
                approved_version: approve ? developer_version :
                    (old !== null ? old.approved_version : null),
            };
            if (req.files.icon && req.files.icon.length)
                Object.assign(generalInfo, await uploadIcon(req.body.primary_kind, req.files.icon[0].path));

            const discoveryServices = FactoryUtils.getDiscoveryServices(classDef);
            const factory = FactoryUtils.makeDeviceFactory(classDef, generalInfo);
            const versionedInfo = {
                code: classDef.prettyprint(),
                factory: JSON.stringify(factory),
                module_type: classDef.is_abstract ? 'org.thingpedia.abstract' : classDef.loader.module,
                downloadable: downloadable
            };

            if (create) {
                generalInfo.owner = req.user.developer_org;
                await model.create(dbClient, generalInfo, extraKinds, extraChildKinds, discoveryServices, versionedInfo);
            } else {
                generalInfo.owner = old.owner;
                await model.update(dbClient, old.id, generalInfo, extraKinds, extraChildKinds, discoveryServices, versionedInfo);
            }

            if (downloadable) {
                const zipFile = req.files && req.files.zipfile && req.files.zipfile.length ?
                    req.files.zipfile[0] : null;

                let stream;
                if (zipFile !== null)
                    stream = fs.createReadStream(zipFile.path);
                else if (old !== null)
                    stream = code_storage.downloadZipFile(req.body.primary_kind, old.developer_version);
                else
                    throw new BadRequestError(req._("Invalid zip file"));

                if (zipFile && isJavaScript(zipFile))
                    await uploadJavaScript(req, generalInfo, stream);
                else
                    await uploadZipFile(req, generalInfo, stream);
            }

            return schemaChanged || datasetChanged;
        }, 'repeatable read');

        // the following two ops access the database from other processes, so they must be outside
        // the transaction, or we will deadlock

        if (retrain) {
            // trigger the training server if configured
            await TrainingServer.get().queue('en', [req.body.primary_kind], 'update-dataset');
        }

        // trigger updating the device on the user
        await tryUpdateDevice(req.body.primary_kind, req.user.id);
    } finally {
        var toDelete = [];
        if (req.files) {
            if (req.files.zipfile && req.files.zipfile.length)
                toDelete.push(util.promisify(fs.unlink)(req.files.zipfile[0].path));
        }
        await Promise.all(toDelete);
    }
}

module.exports = {
    ensurePrimarySchema,
    ensureDataset,

    isDownloadable,
    getCategory,
    uploadZipFile,
    uploadJavaScript,
    uploadIcon,

    importDevice,
    uploadDevice,

    migrateManifest,
};
