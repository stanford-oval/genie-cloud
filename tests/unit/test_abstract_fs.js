// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
'use strict';

const assert = require('assert');
const proxyquire = require('proxyquire')

const cmdStub = {
    lastCmd: null,
    exec: function(file, argv) {
        this.lastCmd = [file, ...argv];
    }
}

const afs = proxyquire('../../util/abstract_fs', {'./command': cmdStub} );

function testResolve() {
    assert.strictEqual(afs.resolve('file://foo', 'bar').toString(), 'file://foo//bar');
    assert.strictEqual(afs.resolve('/foo', 'bar').toString(), 'file:///foo/bar');
    assert.strictEqual(afs.resolve('file:///foo', 'bar').toString(), 'file:///foo/bar');

    assert.strictEqual(afs.resolve('s3://bucket/dir', 'a', 'b'), 's3://bucket/dir/a/b');
    assert.strictEqual(afs.resolve('s3://bucket/dir', '/a/b'), 's3:///a/b');
    assert.strictEqual(afs.resolve('s3://bucket/dir', 'tag:lang'), 'tag:lang');
    assert.strictEqual(afs.resolve('s3://bucket/dir', './tag:lang/'), 's3://bucket/dir/tag:lang/');
    assert.strictEqual(afs.resolve('s3://bucket/dir', './tag:lang/./'), 's3://bucket/dir/tag:lang/');
    assert.strictEqual(afs.resolve('s3://bucket/dir', './tag:lang//'), 's3://bucket/dir/tag:lang//');
}


async function expectCmd(fn, args, want) {
    cmdStub.lastCmd = null;
    await fn(...args);
    try {
    	assert.deepEqual(cmdStub.lastCmd, want, `${fn.name}(${args})`); 
    } catch (err) {
        err.message = `${err}\n   got: ${err.actual}\n  want: ${err.expected}`
        throw err
    }
}

async function testUpload() {
    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('/tmp', 'b')],
        ['cp', '-rT', '/tmp/a', '/tmp/b']);

    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('/tmp', 'b')],
        ['cp', '-rT', '/tmp/a', '/tmp/b']);

    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('/tmp', 'b')],
        ['cp', '-rT', '/tmp/a', '/tmp/b']);

    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('/tmp', 'a')], null);

    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('file://host1/tmp', 'b')],
        ['rsync', '-av', '/tmp/a', 'host1:/tmp/b']);

    await expectCmd(afs.upload, ['/tmp', afs.resolve('s3://bucket/dir', 'a/')],
        ['aws', 's3', 'sync', '/tmp', 's3://bucket/dir/a/']);
}

async function testUploadWithExtraArgs() {
    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp/a', afs.resolve('file://host1/tmp', 'b'), '--exclude=*', '--include=*tfevents*'],
        ['rsync', '-av', '/tmp/a', 'host1:/tmp/b', '--exclude=*', '--include=*tfevents*']);

    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp/a', afs.resolve('/tmp', 'b'), '--exclude=*', '--include=*tfevents*'],
        ['rsync', '-av', '/tmp/a', '/tmp/b', '--exclude=*', '--include=*tfevents*']);

    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp/a', afs.resolve('/tmp', 'a'), '--exclude=*', '--include=*tfevents*'],
         null);

    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp', afs.resolve('s3://bucket/dir', 'a/'), '--exclude=*', '--include=*tfevents*'],
        ['aws', 's3', 'sync', '/tmp', 's3://bucket/dir/a/', '--exclude=*', '--include=*tfevents*']);

    const jobid = 15;
    await expectCmd(afs.uploadWithExtraArgs,
        ['/home/workdir', afs.resolve('s3://bucket/dir', jobid.toString(), './tag:lang/'), '--exclude=*', '--include=*tfevents*'],
        ['aws', 's3', 'sync', '/home/workdir', 's3://bucket/dir/15/tag:lang/', '--exclude=*', '--include=*tfevents*']);


}


async function main() {
    testResolve();
    await testUpload();
    await testUploadWithExtraArgs();
}
module.exports = main;
if (!module.parent)
    main();
