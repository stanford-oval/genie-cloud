// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const express = require('express');
const user = require('../util/user');
const multer = require('multer');
let router = express.Router();

let storage = multer.diskStorage({
    destination: function (req, file, cb) {
        cb(null, './public/friendhub/backgrounds')
    },
    filename: function (req, file, cb) {
        cb(null, file.originalname)
    },
});

let upload = multer({ storage: storage, limits: {fileSize: 1000000, files: 2}});
let uploadByFields = upload.fields([{name: 'background', maxCount: 1}, {name: 'xml', maxCount: 1}]);

router.post('/upload', user.requireLogIn, user.requireDeveloper(), uploadByFields, (req, res) => {
    uploadBackground(req, res);
});

router.get('/', user.requireLogIn, user.requireDeveloper(), (req, res) => {
    res.render('friendhub', { page_title: req._("Friend Hub") });
});

function uploadBackground(req, res) {
    uploadByFields(req, res, (err) => {
        if (err)
            return res.end('Error uploading files');
        return res.end('Files uploaded');
    });
}

module.exports = router;