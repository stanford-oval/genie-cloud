// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const WILDCARD = {};

class TrieNode {
    constructor(valueCombine) {
        this._valueCombine = valueCombine;
        this.value = undefined;
        this.children = new Map;
    }

    *_iterate(keyPrefix) {
        if (this.value !== undefined)
            yield [keyPrefix, this.value];

        for (let [key, child] of this.children) {
            keyPrefix.push(key);
            yield* child._iterate(keyPrefix);
            keyPrefix.pop();
        }
    }

    addValue(value) {
        this.value = this._valueCombine(this.value, value);
    }

    addChild(key) {
        const child = new TrieNode(this._valueCombine);
        this.children.set(key, child);
        return child;
    }

    getChild(key, allowWildcard = false) {
        let child = this.children.get(key);
        if (allowWildcard && !child)
            child = this.children.get(WILDCARD);
        return child;
    }
}

/**
  A simple Trie-based key-value store.
*/
module.exports = class Trie {
    constructor(valueCombine) {
        this.root = new TrieNode(valueCombine);
    }

    [Symbol.iterator]() {
        return this.root._iterate([]);
    }

    insert(sequence, value, limit = 20) {
        let node = this.root;
        for (let key of sequence) {
            let child = node.getChild(key);
            if (!child)
                child = node.addChild(key);
            node = child;
        }
        node.addValue(value, limit);
    }

    search(sequence) {
        let node = this.root;
        for (let key of sequence) {
            const child = node.getChild(key, true);
            if (!child)
                return undefined;
            node = child;
        }
        return node.value;
    }
};
module.exports.WILDCARD = WILDCARD;
