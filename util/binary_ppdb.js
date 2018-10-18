// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const fs = require('fs');
const mmap = require('mmap-io');
const util = require('util');

// Compact, binary representation of a PPDB database, suitable for mmap'ing
//
// This is essentially a binary version of HashMap<String, Array<String>>
//
// Strings are not deduplicated between keys and values, as I suspect that
// would have better cache behavior (assuming everything is readahead into RAM
// quickly).
//
// Format:
//
// Header:
// - 4 bytes "PPDB" (magic number and endianness marker)
// - 4 bytes (LE) of hash table length (number of buckets)
//
// Hash Table:
// aligned array of 4-byte (LE) buckets
// each bucket is an offset into the data segment
//
// Data Segment:
// unaligned sequence of:
// - 1 byte key length
// - string key (utf8 encoded)
// - 2 bytes (LE) number of paraphrases
// - for each paraphrase:
//   - 1 byte data length
//   - data (utf8 encoded)

const EMPTY_BUCKET = 0xFFFFFFFF;

function strHash(str) {
    if (!(str instanceof Buffer))
        str = Buffer.from(str, 'utf8');

    // simple deterministic string hash
    // based on g_str_hash from glib
    let h = 5381;
    for (let i = 0; i < str.length; i++) {
        h = (h << 5) + h + str[i];
        h = h % EMPTY_BUCKET;
        if (h < 0)
            h = (1<<32) - h;
    }
    return h;
}

function stringToBuffer(str) {
    let length = Buffer.byteLength(str);
    assert(length <= 255, `string ${str} too long`);
    let buffer = Buffer.alloc(1 + length);
    buffer.writeUInt8(length, 0);
    buffer.write(str, 1);
    return buffer;
}

// Open addressing hashing with simple linear probing
//
// NOTE: there are no tombstones because you cannot
// delete from the hashtable
function getEmptyBucket(str, numBuckets, hashTable) {
    let hash = strHash(str);
    let index = hash % numBuckets;
    while (hashTable.readUInt32LE(index * 4) !== EMPTY_BUCKET) {
        hash += 7;
        index = hash % numBuckets;
    }
    return index;
}
function findBucket(key, numBuckets, hashTable, dataSegment) {
    let keyLength = Buffer.byteLength(key);
    let hash = strHash(key);
    for (let probeCount = 0; probeCount < numBuckets; probeCount++) {
        let index = (hash + 7 * probeCount) % numBuckets;
        let dataOffset = hashTable.readUInt32LE(index * 4);
        if (dataOffset === EMPTY_BUCKET)
            return EMPTY_BUCKET;
        let indexKeyLength = dataSegment.readUInt8(dataOffset);
        if (indexKeyLength !== keyLength)
            continue;
        let indexKey = dataSegment.slice(dataOffset + 1, dataOffset + 1 + indexKeyLength).toString('utf8');
        if (indexKey === key)
            return dataOffset + 1 + indexKeyLength;
    }
    return EMPTY_BUCKET;
}

class BinaryPPDBBuilder {
    constructor() {
        this._dictionary = new Map;
    }

    add(key, paraphrase) {
        if (!this._dictionary.has(key))
            this._dictionary.set(key, new Set);
        this._dictionary.get(key).add(paraphrase);
    }

    serialize() {
        let buffers = [];
        let totalLength = 0;

        let header = Buffer.alloc(8);
        buffers.push(header);
        totalLength += 8;

        header.write('PPDB', 0);

        const numBuckets = Math.ceil(1.5 * this._dictionary.size);

        const hashTable = Buffer.alloc(numBuckets * 4, 0xFF);
        buffers.push(hashTable);
        totalLength += hashTable.length;
        header.writeUInt32LE(numBuckets, 4);

        let dataOffset = 0;
        for (let [key, values] of this._dictionary.entries()) {
            let keyOffset = dataOffset;
            hashTable.writeUInt32LE(keyOffset, getEmptyBucket(key, numBuckets, hashTable) * 4);

            let keyBuffer = stringToBuffer(key);
            buffers.push(keyBuffer);
            totalLength += keyBuffer.length;
            dataOffset += keyBuffer.length;

            const numValues = values.size;
            assert(numValues <= 65535, `too many values for key ${key}`);
            let numValueBuffer = Buffer.alloc(2);
            numValueBuffer.writeUInt16LE(numValues, 0);
            buffers.push(numValueBuffer);
            dataOffset += 2;
            totalLength += 2;

            for (let value of values) {
                let valueBuffer = stringToBuffer(value);
                buffers.push(valueBuffer);
                dataOffset += valueBuffer.length;
                totalLength += valueBuffer.length;
            }
        }

        return Buffer.concat(buffers, totalLength);
    }

}

module.exports = class BinaryPPDB {
    constructor(buffer) {
        if (buffer.toString('utf8', 0, 4) !== 'PPDB')
            throw new Error(`Invalid magic number`);

        this._numBuckets = buffer.readUInt32LE(4);

        this._hashTable = buffer.slice(8, 8 + this._numBuckets * 4);
        this._dataSegment = buffer.slice(8 + this._numBuckets * 4);
    }

    get(key) {
        let dataOffset = findBucket(key, this._numBuckets, this._hashTable,
            this._dataSegment);
        if (dataOffset === EMPTY_BUCKET)
            return [];

        let numValues = this._dataSegment.readUInt16LE(dataOffset);
        dataOffset += 2;
        let result = [];
        for (let i = 0; i < numValues; i++) {
            let length = this._dataSegment.readUInt8(dataOffset);
            dataOffset += 1;
            let value = this._dataSegment.toString('utf8', dataOffset, dataOffset + length);
            result.push(value);
            dataOffset += length;
        }
        return result;
    }

    static async mapFile(filename) {
        const fd = await util.promisify(fs.open)(filename, 'r');
        const stats = await util.promisify(fs.fstat)(fd);

        const buffer = mmap.map(Math.ceil(stats.size / mmap.PAGESIZE) * mmap.PAGESIZE,
            mmap.PROT_READ, mmap.MAP_SHARED | mmap.MAP_POPULATE, fd, 0, mmap.MADV_RANDOM);
        return new BinaryPPDB(buffer);
    }
};
module.exports.Builder = BinaryPPDBBuilder;

