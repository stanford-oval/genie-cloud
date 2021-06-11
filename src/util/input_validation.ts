// -*- mode: typescript; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
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

import '../types';

import express from 'express';
import typeIs from 'type-is';
import { ParsedQs } from 'qs';

type BaseType = 'null' | 'string' | 'array' | 'boolean' | 'number' | 'integer' | 'object';

type TypeSpec = BaseType|`?${BaseType}`|RegExp|readonly TypeSpec[];

function checkKey(value : unknown, type : TypeSpec) {
    if (Array.isArray(type)) {
        for (const option of type) {
            if (checkKey(value, option))
                return true;
        }
        return false;
    }
    if (type instanceof RegExp) {
        if (value === undefined)
            value = '';
        if (typeof value !== 'string')
            return false;
        return type.test(value);
    }

    if ((type as string).startsWith('?')) {
        if (value === undefined || value === '' || value === null)
            return true;
        type = (type as string).substring(1) as BaseType;
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

function failKey(req : express.Request<unknown>, res : express.Response, key : string, options : { json ?: boolean } = {}) {
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

function failContentType(req : express.Request<unknown>, res : express.Response, options : { json ?: boolean } = {}) {
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

function _validate(req : express.Request<unknown>, res : express.Response, next : express.NextFunction,
                   body : any,
                   keys : Record<string, TypeSpec>,
                   options ?: { json ?: boolean }) {
    for (const key in keys) {
        if (!checkKey(body[key], keys[key])) {
            failKey(req, res, key, options);
            return;
        }
    }
    next();
}

interface QueryTypes {
    'string' : string;
    'array' : unknown[];
    'boolean' : '1'|''|undefined;
    'number' : string;
    'integer' : string;
    'object' : object;
}

interface BodyTypes {
    'null' : null;
    'string' : string;
    'array' : unknown[];
    'boolean' : boolean|'1'|''|undefined;
    'number' : number|string;
    'integer' : number|string;
    'object' : object;
}


type ValidatedQueryType<Key> =
    Key extends RegExp ? string :
    Key extends `?${infer SubKey}` ? ValidatedQueryType<SubKey>|''|undefined :
    Key extends Array<infer SubKey> ? ValidatedQueryType<SubKey> :
    Key extends keyof QueryTypes ? QueryTypes[Key] :
    unknown;

type ValidatedQuery<Keys> = {
    [K in keyof Keys] : ValidatedQueryType<Keys[K]>
} & ParsedQs;

type ValidatedBodyType<Key> =
    Key extends RegExp ? string :
    Key extends `?${infer SubKey}` ? ValidatedBodyType<SubKey>|''|undefined :
    Key extends Array<infer SubKey> ? ValidatedBodyType<SubKey> :
    Key extends keyof BodyTypes ? BodyTypes[Key] :
    unknown;

type ValidatedBody<Keys> = {
    [K in keyof Keys] : ValidatedBodyType<Keys[K]>
} & Record<string, unknown>;

function validateGET<ResBody, ReqBody, Locals, Keys extends Record<string, TypeSpec>>(keys : Keys, options : { json ?: boolean } = {}) {
    return function(req : express.Request<any, ResBody, ReqBody, ValidatedQuery<Keys>>,
                    res : express.Response<ResBody, Locals>,
                    next : express.NextFunction) {
        _validate(req, res, next, req.query, keys, options);
    };
}
function validatePOST<ResBody, Query extends ParsedQs, Locals, Keys extends Record<string, TypeSpec>>(keys : Keys, options : {
    json ?: boolean, accept ?: string } = {}) {
    return function(req : express.Request<any, ResBody, ValidatedBody<Keys>, Query>,
                    res : express.Response<ResBody, Locals>,
                    next : express.NextFunction) {
        if (options.accept && !typeIs(req, options.accept)) {
            failContentType(req, res, options);
            return;
        }

        _validate(req, res, next, req.body, keys, options);
    };
}

export {
    validateGET,
    validatePOST,

    checkKey,
    failKey,
    failContentType
};
