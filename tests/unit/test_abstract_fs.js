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
const fs = require('fs');
const proxyquire = require('proxyquire');
const tmpSync = require('tmp');

const StreamUtils = require('../../util/stream-utils');

const cmdStub = {
    lastCmds: [],
    exec: function(file, argv) {
        this.lastCmds.push([file, ...argv].join(' '));
    }
};

const tmpStub = {
    dir: async function() {
        return { path: '/var/tmp'};
    }
};

const afs = proxyquire('../../util/abstract_fs', {
    './command': cmdStub,
    'tmp-promise': tmpStub,
});

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

function testLocal() {
    assert.strictEqual(afs.isLocal('file:///foo/bar'), true);
    assert.strictEqual(afs.isLocal('file:///'), true);
    assert.strictEqual(afs.isLocal('file://'), true);
    assert.strictEqual(afs.isLocal('file:'), true);
    assert.strictEqual(afs.isLocal('file://foo/'), false);
    assert.strictEqual(afs.isLocal('file://localhost/'), false);
    assert.strictEqual(afs.isLocal('/foo/bar'), true);
    assert.strictEqual(afs.isLocal('./bar'), true);
    assert.strictEqual(afs.isLocal('bar'), true);
    assert.strictEqual(afs.isLocal('../bar'), true);
    assert.strictEqual(afs.isLocal('s3://foo/'), false);

    assert.strictEqual(afs.getLocalPath('file:///foo/bar'), '/foo/bar');
    assert.strictEqual(afs.getLocalPath('file:///'), '/');
    assert.strictEqual(afs.getLocalPath('file:'), process.cwd() + '/');
    assert.strictEqual(afs.getLocalPath('file:foo'), process.cwd() + '/foo');
    assert.strictEqual(afs.getLocalPath('/foo/bar'), '/foo/bar');
}

async function expectCmd(fn, args, want) {
    cmdStub.lastCmds = [];
    await fn(...args);
    try {
        assert.deepEqual(cmdStub.lastCmds, want, `${fn.name}(${args})`);
    } catch (err) {
        err.message = `${err}\n   got: ${err.actual}\n  want: ${err.expected}`;
        throw err;
    }
}

async function testUpload() {
    const tmpFile = tmpSync.fileSync();
    const tmpDir = tmpSync.dirSync();
    try {
        await expectCmd(afs.upload, [tmpFile.name, afs.resolve('/tmp', 'b')],
            [`rsync -av ${tmpFile.name} /tmp/b`]);

        await expectCmd(afs.upload, [tmpDir.name, afs.resolve('/tmp', 'b')],
            [`rsync -av ${tmpDir.name} /tmp/b`]);
    
        await expectCmd(afs.upload, [tmpDir.name, tmpDir.name], []);
    
        await expectCmd(afs.upload, [tmpDir.name, afs.resolve('file://host1/tmp', 'b')],
            [`rsync -av ${tmpDir.name} host1:/tmp/b`]);
    
        await expectCmd(afs.upload, [tmpDir.name, afs.resolve('s3://bucket/dir', 'a/')],
            [`aws s3 sync ${tmpDir.name} s3://bucket/dir/a/`]);

        await expectCmd(afs.upload, [tmpFile.name, afs.resolve('s3://bucket/dir', 'a')],
            [`aws s3 cp ${tmpFile.name} s3://bucket/dir/a`]);
    
        await expectCmd(afs.upload,
            [tmpDir.name, afs.resolve('file://host1/tmp', 'b'), '--exclude=*', '--include=*tfevents*'],
            [`rsync -av ${tmpDir.name} host1:/tmp/b --exclude=* --include=*tfevents*`]);
    
        await expectCmd(afs.upload,
            [tmpDir.name, afs.resolve('/tmp', 'b'), '--exclude=*', '--include=*tfevents*'],
            [`rsync -av ${tmpDir.name} /tmp/b --exclude=* --include=*tfevents*`]);
    
        await expectCmd(afs.upload,
            [tmpDir.name, tmpDir.name, '--exclude=*', '--include=*tfevents*'],
            []);
    
        await expectCmd(afs.upload,
            [tmpDir.name, afs.resolve('s3://bucket/dir', 'a/'), '--exclude=*', '--include=*tfevents*'],
            [`aws s3 sync ${tmpDir.name} s3://bucket/dir/a/ --exclude=* --include=*tfevents*`]);

        await expectCmd(afs.upload,
            [tmpFile.name, afs.resolve('s3://bucket/dir', 'a/'), '--exclude=*', '--include=*tfevents*'],
            [`aws s3 cp ${tmpFile.name} s3://bucket/dir/a/`]);
    
        const jobid = 15;
        await expectCmd(afs.upload,
            [tmpDir.name, afs.resolve('s3://bucket/dir', jobid.toString(), './tag:lang/'), '--exclude=*', '--include=*tfevents*'],
            [`aws s3 sync ${tmpDir.name} s3://bucket/dir/15/tag:lang/ --exclude=* --include=*tfevents*`]);
    } finally {
        tmpFile.removeCallback();
        tmpDir.removeCallback();
    }
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

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'b/'), afs.resolve('s3://bucket/dir', 'a/')],
        ['aws s3 sync s3://bucket/dir/b/ s3://bucket/dir/a/']);

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'a/'), afs.resolve('/workdir/a')],
        ['aws s3 sync s3://bucket/dir/a/ /var/tmp',
         'rsync -av /var/tmp /workdir/a',
         'rm -r /var/tmp'
         ]);

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'a/'), afs.resolve('file://host2/workdir/a')],
        ['aws s3 sync s3://bucket/dir/a/ /var/tmp',
         'rsync -av /var/tmp host2:/workdir/a',
         'rm -r /var/tmp'
         ]);

    await expectCmd(afs.sync, [afs.resolve('s3://bucket/dir', 'a/'), afs.resolve('file://host2/workdir/a'), '--extra=arg'],
        ['aws s3 sync s3://bucket/dir/a/ /var/tmp --extra=arg',
         'rsync -av /var/tmp host2:/workdir/a --extra=arg',
         'rm -r /var/tmp'
         ]);

    const jobid = 15;
    await expectCmd(afs.sync,
        ['/var/tmp', afs.resolve('s3://bucket/dir', jobid.toString(), './tag:lang/'), '--exclude=* --include=*tfevents*'],
        ['aws s3 sync /var/tmp s3://bucket/dir/15/tag:lang/ --exclude=* --include=*tfevents*']);
}

async function testCreateWriteStream() {
    const { name: tmpFile, fd: tmpFD } =
        tmpSync.fileSync({ mode: 0o600, dir: '/var/tmp' });
    const tmpSyncStub = {
        fileSync: function() {
            return { name: tmpFile, fd: tmpFD };
        }
    };
    const tmpAFS = proxyquire('../../util/abstract_fs', {
        './command': cmdStub,
        'tmp': tmpSyncStub,
        'fs': { unlink: function(){} },
    });

    try {
        cmdStub.lastCmds = [];
        const stream = tmpAFS.createWriteStream('s3://bucket/dir/file', true);
        const content = 'foobar';
        stream.write(content);
        stream.end();
        await StreamUtils.waitFinish(stream);
        const gotContent = fs.readFileSync(tmpFile, { encoding: 'utf-8' });
        assert.strictEqual(gotContent, content);
        assert.deepEqual(cmdStub.lastCmds, [`aws s3 cp ${tmpFile} s3://bucket/dir/file`]);
    } finally {
        fs.unlinkSync(tmpFile);
    }
}

async function main() {
    testResolve();
    testLocal();
    await testUpload();
    await testSync();
    await testCreateWriteStream();
}
module.exports = main;
if (!module.parent)
    main();
