// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const typeIs = require('type-is');

function checkKey(value, type) {
    if (Array.isArray(type)) {
        for (let option of type) {
            if (checkKey(value, option))
                return true;
        }
        return false;
    }

    if (type.startsWith('?')) {
        if (value === undefined || value === '' || value === null)
            return true;
        type = type.substring(1);
    }

    switch (type) {
    case 'null':
        return value === null;

    case 'array':
        return Array.isArray(value);

    case 'string':
        // NOTE: the character ranges U+0000-U+001F and U+007F-U+009F are control
        // characters (NUL, BACKSPACE, DEL, etc.) that have special meaning in many
        // contexts
        // there is no reason to allow them, anywhere
        /* eslint no-control-regex: "off" */
        return typeof value === 'string' && !!value && !/[\x00-\x08\x0e-\x1f\x7f-\x9f]/.test(value);

    case 'boolean':
        // a checkbox is either present (== 1) or absent (== undefined)
        // for api compatibility, also allow true/false
        return value === undefined || value === '1' || value === '' || value === true || value === false;

    // NOTE: parseInt/parseFloat have weird behavior with trailing garbage
    // we don't want to accept that, so we use the unary "+" operator to
    // convert to a number instead
    case 'number':
        return typeof value === 'string' && value !== '' && Number.isFinite(+value);
    case 'integer':
        return typeof value === 'string' && value !== '' && Number.isInteger(+value);

    case 'object':
        return typeof value === 'object' && !Array.isArray(value);

    default:
        // should never be reached
        return false;
    }
}

function failKey(req, res, key, options = {}) {
    res.status(400);
    if (options.json) {
        res.json({ code: 'EINVAL', error: `missing or invalid parameter ${key}` });
    } else {
        res.render('error', {
            page_title: req._("Almond - Error"),
            message: req._("Missing or invalid parameter %s").format(key)
        });
    }
}

function failContentType(req, res, options = {}) {
    res.status(415); // Not Acceptable
    if (options.json) {
        res.json({ code: 'EINVAL', error: `invalid content-type` });
    } else {
        res.render('error', {
            page_title: req._("Almond - Error"),
            message: req._("Invalid request")
        });
    }
}

function _validate(req, res, next, body, keys, options) {
    for (let key in keys) {
        if (!checkKey(body[key], keys[key])) {
            failKey(req, res, key, options);
            return;
        }
    }
    next();
}

function validateGET(keys, options) {
    options = options || {};
    return function(req, res, next) {
        _validate(req, res, next, req.query, keys, options);
    };
}
function validatePOST(keys, options) {
    options = options || {};

    return function(req, res, next) {
        if (options.accept && !typeIs(req, options.accept)) {
            failContentType(req, res, options);
            return;
        }

        _validate(req, res, next, req.body, keys, options);
    };
}

module.exports = {
    validateGET,
    validatePOST,

    checkKey,
    failKey,
    failContentType
};
