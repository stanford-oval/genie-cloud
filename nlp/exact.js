// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2017-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const exampleModel = require('../model/example');
const Trie = require('../util/trie');

// at most 20 parses for each sentence
const LIMIT = 20;

function findSpan(sequence, substring) {
    for (let i = 0; i < sequence.length-substring.length+1; i++) {
        let found = true;
        for (let j = 0; j < substring.length; j++) {
            if (sequence[i+j] !== substring[j]) {
                found = false;
                break;
            }
        }
        if (found)
            return i;
    }
    return -1;
}

module.exports = class ExactMatcher {
    constructor(language) {
        this._language = language;

        this._trie = new Trie((existing, newValue) => {
            if (existing === undefined) {
                existing = new Set;
            } else {
                if (existing.has(newValue))
                    existing.delete(newValue);
            }
            existing.add(newValue);
            if (existing.size > LIMIT) {
                const { data:first } = existing.keys().next();
                existing.delete(first);
            }
            return existing;
        });
    }

    *[Symbol.iterator]() {
        for (let [key, valueSet] of this._trie) {
            for (let value of valueSet)
                yield [key, value];
        }
    }

    async load(dbClient) {
        const rows = await exampleModel.getExact(dbClient, this._language);
        for (let row of rows)
            this.add(row.preprocessed, row.target_code);
        console.log(`Loaded ${rows.length} exact matches for language ${this._language}`);
    }

    async addExample(dbClient, exampleId) {
        const row = await exampleModel.getExactById(dbClient, exampleId);
        this.add(row.preprocessed, row.target_code);
        console.log(`Added ${exampleId} for language ${this._language}`);
    }

    add(utterance, target_code) {
        utterance = utterance.split(' ');
        target_code = target_code.split(' ');

        let inString = false;
        let spanBegin = null;
        for (let i = 0; i < target_code.length; i++) {
            let token = target_code[i];
            if (token !== '"')
                continue;
            inString = !inString;
            if (inString) {
                spanBegin = i+1;
            } else {
                const spanEnd = i;
                const span = target_code.slice(spanBegin, spanEnd);
                const beginIndex = findSpan(utterance, span);
                const endIndex = beginIndex + span.length;

                for (let j = beginIndex; j < endIndex; j++)
                    utterance[j] = Trie.WILDCARD;
                for (let j = spanBegin; j < spanEnd; j++)
                    target_code[j] = '\\' + (beginIndex + j - spanBegin);
            }
        }
        if (utterance[utterance.length-1] === '.')
            utterance.pop();

        this._trie.insert(utterance, target_code.join(' '));
    }

    get(utterance) {
        if (typeof utterance === 'string')
            utterance = utterance.split(' ');
        if (utterance[utterance.length-1] === '.')
            utterance.pop();

        let results = this._trie.search(utterance);
        if (results === undefined)
            return null;
        results = Array.from(results);
        results.reverse();
        for (let i = 0; i < results.length; i++) {
            const code = results[i].split(' ');
            results[i] = code;
            for (let j = 0; j < code.length; j++) {
                const token = code[j];
                if (/^\\[0-9]+$/.test(token))
                    code[j] = utterance[parseInt(token.substring(1), 10)];
            }
        }
        return results;
    }
};
