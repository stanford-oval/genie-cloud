// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const fs = require('fs');
const util = require('util');
const path = require('path');
const byline = require('byline');
const child_process = require('child_process');
const Genie = require('genie-toolkit');
const tmp = require('tmp-promise');

const schemaModel = require('../model/schema');
const entityModel = require('../model/entity');
const exampleModel = require('../model/example');
const templatePackModel = require('../model/template_files');
const SchemaUtils = require('../util/manifest_to_schema');
const DatasetUtils = require('../util/dataset');
const codeStorage = require('../util/code_storage');
const { InternalError } = require('../util/errors');

async function downloadThingpedia(dbClient, orgId, language, tmpDir) {
    const snapshot = await schemaModel.getCurrentSnapshotMeta(dbClient, language, orgId);

    await util.promisify(fs.writeFile)(path.resolve(tmpDir, 'thingpedia.tt'),
        SchemaUtils.schemaListToClassDefs(snapshot, true).prettyprint());

    const entities = (await entityModel.getAll(dbClient)).map((r) => ({
        type: r.id,
        name: r.name,
        is_well_known: r.is_well_known,
        has_ner_support: r.has_ner_support
    }));

    await util.promisify(fs.writeFile)(path.resolve(tmpDir, 'entities.json'),
        JSON.stringify(entities));

    const examples = await exampleModel.getBaseByLanguage(dbClient, orgId, language);

    await util.promisify(fs.writeFile)(path.resolve(tmpDir, 'dataset.tt'),
        DatasetUtils.examplesToDataset(`org.thingpedia.dynamic.everything`, language, examples));
}

async function downloadTemplatePack(dbClient, language, templatePack, tmpDir) {
    const tmpl = await templatePackModel.getByTag(dbClient, language, templatePack);

    const zipFileStream = await codeStorage.downloadZipFile(templatePack, tmpl.version, 'template-files/' + language);

    const tmpZipFile = fs.createWriteStream(path.resolve(tmpDir, 'templates.zip'));
    zipFileStream.pipe(tmpZipFile);

    await new Promise((resolve, reject) => {
        tmpZipFile.on('finish', resolve);
        tmpZipFile.on('error', reject);
    });

    await util.promisify(child_process.execFile)('/usr/bin/unzip', ['-uo',
        '-d', tmpDir, path.resolve(tmpDir, 'templates.zip')]);

    try {
        await util.promisify(fs.mkdir)(path.resolve(tmpDir, 'node_modules'));
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
    try {
        await util.promisify(fs.symlink)(path.dirname(require.resolve('thingtalk')),
                                         path.resolve(tmpDir, './node_modules/thingtalk'));
    } catch(e) {
        if (e.code !== 'EEXIST')
            throw e;
    }
}

function cleanEnv() {
    const ALLOWED_ENVS = ['LANG', 'LOGNAME', 'USER', 'PATH',
                          'HOME', 'SHELL', 'THINGENGINE_PROXY',
                          'CI', 'THINGENGINE_DISABLE_SYSTEMD'];
    function envIsAllowed(name) {
        if (name.startsWith('LC_'))
            return true;
        if (ALLOWED_ENVS.indexOf(name) >= 0)
            return true;
        return false;
    }
    const env = {};
    for (var name in process.env) {
        if (envIsAllowed(name))
            env[name] = process.env[name];
    }

    // disable systemd logging, we want stdin/stdout to be preserved
    env.THINGENGINE_DISABLE_SYSTEMD = '1';
    env.THINGENGINE_USER_ID = 'synthetic-gen';

    return env;
}

module.exports = async function genSynthetic(options) {
    const { path: tmpDir } = await tmp.dir({
        mode: 0o700,
        prefix: 'synthetic-gen-sandbox.',
        unsafeCleanup: true
    });

    await downloadThingpedia(options.dbClient, options.orgId, options.language, tmpDir);
    await downloadTemplatePack(options.dbClient, options.language, options.templatePack, tmpDir);

    const ourpath = path.dirname(module.filename);
    const workerpath = path.resolve(ourpath, './synthetic-gen-worker.js');

    const env = cleanEnv();
    let processPath, args, stdio;
    if (process.env.THINGENGINE_DISABLE_SANDBOX === '1') {
        processPath = process.execPath;
        args = process.execArgv.slice();
        args.push(workerpath);
        stdio = ['ignore', 'pipe', 'inherit', 'pipe', 'ipc'];
    } else {
        processPath = path.resolve(ourpath, '../sandbox/sandbox');
        args = [process.execPath].concat(process.execArgv);
        args.push(workerpath);
        stdio = ['ignore', 'pipe', 'inherit', 'pipe', 'ipc'];

        const jsPrefix = path.resolve(ourpath, '..');
        const nodepath = path.resolve(process.execPath);
        if (!nodepath.startsWith('/usr/'))
            env.THINGENGINE_PREFIX = jsPrefix + ':' + nodepath;
        else
            env.THINGENGINE_PREFIX = jsPrefix;
    }
    args.push('--locale', options.language, '--maxdepth', options.maxDepth);
    for (let f of options.flags)
        args.push('--set-flag', f);

    if (options.debug)
        console.log(args.join(' '));

    const child = child_process.spawn(processPath, args, {
        stdio: stdio,
        cwd: tmpDir,
        env: env
    });

    child.stdout.setEncoding('utf8');
    const stream = child.stdout
        .pipe(byline())
        .pipe(new Genie.DatasetParser());

    // propagate errors from the child process to the stream
    child.on('error', (e) => stream.emit('error', e));
    child.on('exit', (code, signal) => {
        if (code === null)
            stream.emit('error', new InternalError(signal, `Synthetic generation worker died with signal ${signal}.`));
        else if (code !== 0)
            stream.emit('error', new InternalError('E_BAD_EXIT_CODE', `Synthetic generation worker exited with status ${code}.`));
    });
    child.on('message', (obj) => {
        if (obj.cmd === 'progress')
            stream.emit('progress', obj.v);
    });

    return stream;
};
