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
    lastCmds: [],
    exec: function(file, argv) {
        this.lastCmds.push([file, ...argv].join(' '));
    }
}

const tmpStub = {
    dir: async function() {
        return { path: '/var/tmp/x'};
    }
}

const afs = proxyquire('../../util/abstract_fs', {'./command': cmdStub, 'tmp-promise': tmpStub} );

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
    cmdStub.lastCmds = [];
    await fn(...args);
    try {
    	assert.deepEqual(cmdStub.lastCmds, want, `${fn.name}(${args})`); 
    } catch (err) {
        err.message = `${err}\n   got: ${err.actual}\n  want: ${err.expected}`
        throw err
    }
}

async function testUpload() {
    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('/tmp', 'b')],
        ['cp -rT /tmp/a /tmp/b']);

    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('/tmp', 'a')], []);

    await expectCmd(afs.upload, ['/tmp/a', afs.resolve('file://host1/tmp', 'b')],
        ['rsync -av /tmp/a host1:/tmp/b']);

    await expectCmd(afs.upload, ['/tmp', afs.resolve('s3://bucket/dir', 'a/')],
        ['aws s3 sync /tmp s3://bucket/dir/a/']);
}

async function testUploadWithExtraArgs() {
    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp/a', afs.resolve('file://host1/tmp', 'b'), '--exclude=*', '--include=*tfevents*'],
        ['rsync -av /tmp/a host1:/tmp/b --exclude=* --include=*tfevents*']);

    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp/a', afs.resolve('/tmp', 'b'), '--exclude=*', '--include=*tfevents*'],
        ['rsync -av /tmp/a /tmp/b --exclude=* --include=*tfevents*']);

    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp/a', afs.resolve('/tmp', 'a'), '--exclude=*', '--include=*tfevents*'],
        []);

    await expectCmd(afs.uploadWithExtraArgs,
        ['/tmp', afs.resolve('s3://bucket/dir', 'a/'), '--exclude=*', '--include=*tfevents*'],
        ['aws s3 sync /tmp s3://bucket/dir/a/ --exclude=* --include=*tfevents*']);

    const jobid = 15;
    await expectCmd(afs.uploadWithExtraArgs,
        ['/home/workdir', afs.resolve('s3://bucket/dir', jobid.toString(), './tag:lang/'), '--exclude=*', '--include=*tfevents*'],
        ['aws s3 sync /home/workdir s3://bucket/dir/15/tag:lang/ --exclude=* --include=*tfevents*']);
}

async function testSync() {
    await expectCmd(afs.sync, [afs.resolve('/tmp/a'), afs.resolve('/tmp', 'b')],
        ['rsync -av /tmp/a /tmp/b']);

    await expectCmd(afs.sync, [afs.resolve('/tmp/a'), afs.resolve('/tmp', 'a')], 
        ['rsync -av /tmp/a /tmp/a']);

    await expectCmd(afs.sync, [afs.resolve('/tmp/a'), afs.resolve('file://host1/tmp', 'b')],
        ['rsync -av /tmp/a host1:/tmp/b']);

    await expectCmd(afs.sync, [afs.resolve('/tmp'), afs.resolve('s3://bucket/dir', 'a/')],
        ['aws s3 sync /tmp s3://bucket/dir/a/']);

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'a/'), afs.resolve('/workdir/a')],
        ['aws s3 sync s3://bucket/dir/a/ /var/tmp/x',
         'rsync -av /var/tmp/x /workdir/a',
         'rm -r /var/tmp/x'
         ]);

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'a/'), afs.resolve('file://host2/workdir/a')],
        ['aws s3 sync s3://bucket/dir/a/ /var/tmp/x',
         'rsync -av /var/tmp/x host2:/workdir/a',
         'rm -r /var/tmp/x'
         ]);

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'a/'), afs.resolve('file://host2/workdir/a'), '--extra=arg'],
        ['aws s3 sync s3://bucket/dir/a/ /var/tmp/x --extra=arg',
         'rsync -av /var/tmp/x host2:/workdir/a --extra=arg',
         'rm -r /var/tmp/x'
         ]);

    const jobid = 15;
    await expectCmd(afs.sync,
        ['/home/workdir', afs.resolve('s3://bucket/dir', jobid.toString(), './tag:lang/'), '--exclude=* --include=*tfevents*'],
        ['aws s3 sync /home/workdir s3://bucket/dir/15/tag:lang/ --exclude=* --include=*tfevents*']);
}


async function main() {
    testResolve();
    await testUpload();
    await testUploadWithExtraArgs();
    await testSync();
}
module.exports = main;
if (!module.parent)
    main();
