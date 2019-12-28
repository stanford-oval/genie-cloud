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

const mmap = require('mmap-io');
const fs = require('fs');
const util = require('util');

const exampleModel = require('../model/example');
const Trie = require('../util/trie');
const BTrie = require('../util/btrie');
const AbstractFS = require('../util/abstract_fs');

const Config = require('../config');

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

        this._btrie = null;
        this._createTrie();
    }

    _createTrie() {
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

    async load() {
        const url = AbstractFS.resolve(Config.NL_EXACT_MATCH_DIR, this._language + '.btrie');
        const tmpPath = await AbstractFS.download(url);

        const fd = await util.promisify(fs.open)(tmpPath, 'r');
        const stats = await util.promisify(fs.fstat)(fd);

        const buffer = mmap.map(Math.ceil(stats.size / mmap.PAGESIZE) * mmap.PAGESIZE,
            mmap.PROT_READ, mmap.MAP_SHARED | mmap.MAP_POPULATE, fd, 0, mmap.MADV_RANDOM);
        this._btrie = new BTrie(buffer);

        // we created the mapping, so we can close the file and remove it - the kernel
        // keeps a reference to it
        // at the next load, we'll overwrite _btrie, which will cause the buffer to go unreferenced
        // later, the GC will release buffer, unmap it, and _only then_ will the file actually be
        // closed and deleted
        await util.promisify(fs.close)(fd);
        await AbstractFS.removeTemporary(tmpPath);

        // assume that the binary file contains all modifications made afterwards, and clear the trie
        this._createTrie();
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

        // combine both the results from the binary file, and from the in-memory trie
        // this way, we can override a single sentence without creating a new file,
        // but everytime the dataset is updated we'll release the memory and go back to
        // the efficient memory mapped file
        let fileResults = this._btrie ? this._btrie.search(utterance) : undefined;
        let localResults = this._trie.search(utterance);

        let results;
        if (fileResults === undefined && localResults === undefined)
            return null;
        if (fileResults === undefined)
            results = Array.from(localResults);
        else if (localResults === undefined)
            results = fileResults.split('\0');
        else
            results = fileResults.split('\0').concat(Array.from(localResults));
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
