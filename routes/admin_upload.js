// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
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

const express = require('express');
const fs = require('fs');
const util = require('util');
const multer = require('multer');
const csurf = require('csurf');
const crypto = require('crypto');
const os = require('os');

const code_storage = require('../util/code_storage');

const user = require('../util/user');

var router = express.Router();

router.use(multer({ dest: os.tmpdir() }).single('file'));
router.use(csurf({ cookie: false }));
router.use((req, res, next) => {
    res.locals.csrfToken = req.csrfToken();
    next();
});
router.use(user.requireLogIn, user.requireRole(user.Role.BLOG_EDITOR));

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
    if (!req.file) {
        res.status(400).json({ error: 'missing file' });
        return;
    }

    try {
        const filehash = await hashfile(req.file.path);
        const extension = req.file.path.substring(0, req.file.path.lastIndexOf('.'));
        let filename = filehash;
        if (extension)
            filename += '.' + extension;

        await code_storage.storeBlogAsset(fs.createReadStream(req.file.path), filename,
                                          req.file.mimetype || 'application/octet-stream');
        res.json({ result: 'ok', filename });
    } finally {
        await util.promisify(fs.unlink)(req.file.path);
    }
}

router.post('/', (req, res, next) => {
    upload(req, res).catch(next);
});

module.exports = router;
