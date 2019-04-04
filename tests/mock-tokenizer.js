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

function handleConnection(socket) {
    const wrapped = new JsonDatagramSocket(socket, socket, 'utf8');

    wrapped.on('data', (msg) => {
        try {
            assert.strictEqual(msg.languageTag, 'en');
            const tokens = tokenize(msg.utterance);
            wrapped.write({
                req: msg.req,
                tokens: tokens,
                values: {},
                rawTokens: tokens,
                pos: tokens.map(() => 'NN'),
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
