// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const fs = require('fs');
const util = require('util');
const multer = require('multer');
const csurf = require('csurf');
const crypto = require('crypto');

const platform = require('../util/platform');

const code_storage = require('../util/code_storage');

const user = require('../util/user');

var router = express.Router();

router.use(multer({ dest: platform.getTmpDir() }).fields([
    { name: 'file', maxCount: 1 }
]));
router.use(csurf({ cookie: false }));
router.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});
router.use(user.requireLogIn, user.requireRole(user.Role.ADMIN));

function hashfile(filename) {
    const stream = fs.createReadStream(filename);
    const digest = crypto.createHash('sha1');

    return new Promise((resolve, reject) => {
        stream.on('data', (data) => {
            digest.update(data);
        });
        stream.on('end', () => {
            resolve(digest.digest('hex'));
        });
        stream.on('error', reject);
    });
}

async function upload(req, res) {
    try {
        if (!req.files || !req.files.file || !req.files.file.length) {
            res.status(400).json({ error: 'missing file' });
            return;
        }

        const filehash = await hashfile(req.files.file[0].path);
        const extension = req.files.file[0].path.substring(0, req.files.file[0].path.lastIndexOf('.'));
        let filename = filehash;
        if (extension)
            filename += '.' + extension;

        await code_storage.storeBlogAsset(fs.createReadStream(req.files.file[0].path), filename,
                                          req.files.file[0].mimetype || 'application/octet-stream');
        res.json({ result: 'ok', filename });
    } finally {
        if (req.files && req.files.file && req.files.file.length)
            await util.promisify(fs.unlink)(req.files.file[0].path);
    }
}

router.post('/blog/upload', (req, res, next) => {
    upload(req, res).catch(next);
});

module.exports = router;
