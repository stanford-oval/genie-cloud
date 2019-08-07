// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const db = require('../util/db');

module.exports = {
    getByTag(client, language, tag) {
        return db.selectOne(client, "select * from alexa_models where language = ? and tag = ?", [language, tag]);
    },

    async create(client, model) {
        const id = await db.insertOne(client, "insert into alexa_models set ?", [model]);
        model.id = id;
        return model;
    }
};
