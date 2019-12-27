// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const assert = require('assert');
const binarySearch = require('./binary_search');

/**
 * A Buffer-like class that automatically grows in size.
 */
class GrowableBuffer {
    constructor() {
        this._size = 0;
        this._capacity = 0;
        this._buffers = [];
        this._offsets = [];
    }

    get length() {
        return this._size;
    }

    toBuffer() {
        return Buffer.concat(this._buffers, this._size);
    }

    _ensureSize(requested) {
        if (this._size >= requested)
            return;
        if (this._capacity >= requested) {
            this._size = requested;
            assert(this._capacity >= this._size);
            return;
        }

        // allocate a new buffer big enough for the allocation, and at least 4KB
        const newBuffer = Buffer.alloc(Math.max(requested - this._capacity, 4096));
        this._buffers.push(newBuffer);
        this._offsets.push(this._capacity);
        this._capacity += newBuffer.length;
        this._size = requested;
        assert(this._capacity >= this._size);
        assert(this._buffers.length === this._offsets.length);
    }

    _findBuffer(offset) {
        // common case: offset is inside the last buffer
        if (offset >= this._offsets[this._offsets.length-1])
            return this._offsets.length-1;

        // binary search
        return binarySearch(this._offsets);
    }

    writeUInt8(value, offset = 0) {
        this._ensureSize(offset+1);

        const bufferIndex = this._findBuffer(offset);
        const buffer = this._buffers[bufferIndex];
        const bufferOffset = this._offsets[bufferIndex];
        assert(offset - bufferOffset < buffer.length);
        buffer.writeUInt8(value, offset - bufferOffset);
    }

    writeUInt16LE(value, offset = 0) {
        assert(value >= 0 && value <= 65536, `Value is negative or too large: ${value}`);
        this._ensureSize(offset+2);

        const bufferIndex = this._findBuffer(offset);
        const buffer = this._buffers[bufferIndex];
        const bufferOffset = this._offsets[bufferIndex];
        assert(offset - bufferOffset < buffer.length);

        if (offset - bufferOffset + 2 > buffer.length) {
            // we need to split the write across two buffers
            const nextBuffer = this._buffers[bufferIndex+1];
            buffer.writeUInt8(value & 0xFF, offset - bufferOffset);
            nextBuffer.writeUInt8(value >> 8, 0);
        } else {
            buffer.writeUInt16LE(value, offset - bufferOffset);
        }
    }

    writeUInt32LE(value, offset = 0) {
        assert(value >= 0 && value <= Math.pow(2, 32), `Value is negative or too large: ${value}`);
        this._ensureSize(offset+4);

        const bufferIndex = this._findBuffer(offset);
        const buffer = this._buffers[bufferIndex];
        const bufferOffset = this._offsets[bufferIndex];
        assert(offset - bufferOffset < buffer.length);

        if (offset - bufferOffset + 4 > buffer.length) {
            // we need to split the write across two buffers

            const firstPartLength = buffer.length - (offset - bufferOffset);
            assert(firstPartLength >= 0 && firstPartLength <= 3);
            const nextBuffer = this._buffers[bufferIndex+1];
            assert(nextBuffer.length >= 4 - firstPartLength);

            switch (firstPartLength) {
            case 1:
                buffer.writeUInt8(value & 0xFF, offset - bufferOffset);
                nextBuffer.writeUInt8((value >> 8) & 0xFF, 0);
                nextBuffer.writeUInt16LE(value >> 16, 1);
                break;
            case 2:
                buffer.writeUInt16LE(value & 0xFFFF, offset - bufferOffset);
                nextBuffer.writeUInt16LE(value >> 16, 0);
                break;
            case 3:
                buffer.writeUInt8(value & 0xFF, offset - bufferOffset);
                buffer.writeUInt16LE((value >> 8) & 0xFFFF, offset - bufferOffset + 1);
                nextBuffer.writeUInt8(value >> 24, 0);
                break;
            }
        } else {
            buffer.writeUInt32LE(value, offset - bufferOffset);
        }
    }

    writeBuffer(fromBuffer, offset = 0) {
        this._ensureSize(offset+fromBuffer.length);

        const bufferIndex = this._findBuffer(offset);
        const buffer = this._buffers[bufferIndex];
        const bufferOffset = this._offsets[bufferIndex];
        assert(offset - bufferOffset < buffer.length);

        if (offset - bufferOffset + fromBuffer.length > buffer.length) {
            // we need to split the write across two buffers

            const firstPartLength = buffer.length - (offset - bufferOffset);
            assert(firstPartLength >= 0 && firstPartLength < fromBuffer.length);
            const nextBuffer = this._buffers[bufferIndex+1];
            assert(nextBuffer.length >= fromBuffer.length - firstPartLength);

            fromBuffer.copy(buffer, offset - bufferOffset, 0, firstPartLength);
            fromBuffer.copy(nextBuffer, 0, firstPartLength, fromBuffer.length);
        } else {
            fromBuffer.copy(buffer, offset - bufferOffset, 0, fromBuffer.length);
        }
    }
}
module.exports = GrowableBuffer;
