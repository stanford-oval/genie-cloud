// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;
require('thingengine-core/lib/polyfill');
require('../polyfill');

const assert = require('assert');
const Tp = require('thingpedia');
const qs = require('qs');
const Url = require('url');
const FormData = require('form-data');

const Config = require('../../config');

const db = require('../../util/db');

const DEBUG = false;

function dbQuery(query, args) {
    return db.withClient((dbClient) => {
        return db.selectAll(dbClient, query, args);
    });
}

function request(url, method, data, options = {}) {
    options['user-agent'] = 'Thingpedia-Cloud-Test/1.0.0';
    options.debug = DEBUG;

    if (method === 'POST' && (typeof data !== 'string' && data !== null && !(data instanceof Buffer)))
        return Tp.Helpers.Http.postStream(Config.SERVER_ORIGIN + url, data, options);
    else
        return Tp.Helpers.Http.request(Config.SERVER_ORIGIN + url, method, data, options);
}

function sessionRequest(url, method, data, session, options = {}) {
    if (method === 'POST') {
        if (data instanceof FormData) {
            data.append('_csrf', session.csrfToken);
            options.dataContentType = 'multipart/form-data; boundary=' + data.getBoundary();
        } else {
            if (data !== null && typeof data !== 'string')
                data = qs.stringify(data);
            if (data)
                data += '&_csrf=' + session.csrfToken;
            else
                data = '_csrf=' + session.csrfToken;
            options.dataContentType = 'application/x-www-form-urlencoded';
        }
    } else {
        if (data !== null && typeof data !== 'string') {
            url += '?' + qs.stringify(data);
            data = null;
        }
    }
    if (!options.extraHeaders)
        options.extraHeaders = {};
    options.extraHeaders.Cookie = session.cookie;

    return request(url, method, data, options);
}

function assertHttpError(request, httpStatus, expectedMessage) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP error`));
    }, (err) => {
        if (!err.detail)
            throw err;
        if (typeof err.code === 'number')
            assert.deepStrictEqual(err.code, httpStatus);
        else
            throw err;
        if (expectedMessage) {
            let message;
            if (err.detail.startsWith('<!DOCTYPE html>')) {
                const match = /Sorry that did not work<\/p><p>([^<]+)<\/p>/.exec(err.detail);
                if (!match)
                    assert.fail(`cannot find error message`);
                message = match[1];
            } else if (err.detail.startsWith('{')) {
                message = JSON.parse(err.detail).error;
            } else {
                message = err.detail;
            }
            assert.strictEqual(message, expectedMessage);
        }
    });
}

function assertLoginRequired(request) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP error`));
    }, (err) => {
        if (!err.detail || !err.code)
            throw err;
        assert.deepStrictEqual(err.code, 401);
        assert(err.detail.indexOf('Sorry but you must log in before opening this page') >= 0);
    });
}

function assertRedirect(request, redirect) {
    return request.then(() => {
        assert.fail(new Error(`Expected HTTP redirect`));
    }, (err) => {
        if (!err.detail || !err.code)
            throw err;
        assert.strictEqual(err.redirect, Url.resolve(Config.SERVER_ORIGIN, redirect));
    });
}

async function assertBanner(request, expected) {
    const response = await request;

    const match = /<div class="alert alert-[a-z]+ alert-dismissible fade in" role="alert">(?:(?!<\/div>).)*<p>([^<]+)<\/p><\/div>/.exec(response);
    if (!match)
        assert.fail(`cannot find banner`);
    assert.strictEqual(match[1], expected);
}

async function assertBlocked(path, bob, nobody) {
    await assertRedirect(sessionRequest(path, 'GET', null, nobody, { followRedirects: false }), '/user/login');
    await assertHttpError(sessionRequest(path, 'GET', null, bob),
            403, 'You do not have permission to perform this operation.');
}

module.exports = {
    dbQuery,
    request,
    sessionRequest,
    assertHttpError,
    assertLoginRequired,
    assertRedirect,
    assertBanner,
    assertBlocked
};
