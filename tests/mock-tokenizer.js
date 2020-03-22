#!/usr/bin/node
// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2019 The Board of Trustees of The Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// A "Mock" version of almond-tokenizer, that is good enough for testing purposes
// without requiring several GBs of Java and Stanford CoreNLP

const net = require('net');
const assert = require('assert');
const JsonDatagramSocket = require('../util/json_datagram_socket');
const { tokenize } = require('../util/tokenize');

function mockTokenize(string) {
    const entities = {};
    let num = 0, hashtag = 0, username = 0, email = 0, phone = 0, url = 0;

    const rawTokens = tokenize(string);
    const tokens = rawTokens.map((token) => {
        if (token.startsWith('+')) {
            const tok = `PHONE_NUMBER_${phone}`;
            phone++;
            entities[tok] = token;
            return tok;
        } else if (/^[0-9]+$/.test(token) && token !== '911') {
            const v = parseInt(token);
            if (v < -12 || v > 12) {
                const tok = `NUMBER_${num}`;
                num++;
                entities[tok] = v;
                return tok;
            } else {
                return token;
            }
        } else if (token.startsWith('#')) {
            const tok = `HASHTAG_${hashtag}`;
            hashtag++;
            entities[tok] = token.substring(1);
            return tok;
        } else if (token.startsWith('@')) {
            const tok = `USERNAME_${username}`;
            username++;
            entities[tok] = token.substring(1);
            return tok;
        } else if (token.indexOf('@') > 0) {
            const tok = `EMAIL_ADDRESS_${email}`;
            email++;
            entities[tok] = token;
            return tok;
        } else if (token.startsWith('http') > 0) {
            const tok = `URL_${url}`;
            url++;
            entities[tok] = token;
            return tok;
        } else {
            return token;
        }
    });
    return [rawTokens, tokens, entities];
}

function handleConnection(socket) {
    const wrapped = new JsonDatagramSocket(socket, socket, 'utf8');

    wrapped.on('data', (msg) => {
        try {
            assert.strictEqual(msg.languageTag, 'en');
            const [rawTokens, tokens, values] = mockTokenize(msg.utterance);
            wrapped.write({
                req: msg.req,
                tokens,
                values,
                rawTokens,
                pos: rawTokens.map(() => 'NN'),
                sentiment: 'neutral'
            });
        } catch(e) {
            wrapped.write({
                req: msg.req,
                error: e.message
            });
        }
    });
}

function main() {
    const server = net.createServer();
    server.on('connection', handleConnection);
    server.listen(8888);
}
main();
