// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = {
    getSecretKey(app) {
        if (app.get('env') === 'development') {
            return 'not so secret key';
        } else {
            var key = process.env.SECRET_KEY;
            if (key === undefined)
                throw new Error("Configuration error: secret key missing!");
            return key;
        }
    }
};
