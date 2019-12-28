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

const GrowableBuffer = require('./growable_buffer');

const WILDCARD = {};

const FILE_HEADER_LENGTH = 6;

const NodeType = {
    DATA: 1,
    LEAF: 2,
    COMPACT: 3,
    INTERMEDIATE: 4,
    NODE_TYPE_MAX: 4
};
const NodeFlags = {
    NONE: 0,
    WILDCARD: 8,
};

function writeNodeHeader(buffer, offset, nodeType, flags = NodeFlags.NONE) {
    assert(nodeType >= 0 && nodeType <= NodeType.NODE_TYPE_MAX);
    assert((flags & 0b111) === 0);
    buffer.writeUInt8(nodeType | flags, offset);
    offset++;
    return offset;
}

function readNodeHeader(buffer, offset) {
    const header = buffer.readUInt8(offset);
    assert((header & 0b111) <= NodeType.NODE_TYPE_MAX);
    const nodeType = header & 0b111;
    const flags = header & ~0b111;
    return { nodeType, flags };
}

class TrieBuilderLeafNode {
    constructor() {
        this.value = undefined;
        this._size = 0;
        this._dataPtrOffset = null;
    }

    addValue(value, valueCombine) {
        this.value = valueCombine(this.value, value);
        assert(typeof this.value === 'string');
        this._size ++;
    }

    get size() {
        return this._size;
    }

    writeKey(buffer, offset) {
        offset = writeNodeHeader(buffer, offset, NodeType.LEAF);
        this._dataPtrOffset = offset;
        buffer.writeUInt32LE(0, offset);
        offset += 4;
        return offset;
    }

    writeData(buffer, offset, valueMap) {
        if (valueMap.has(this.value)) {
            const existing = valueMap.get(this.value);
            console.log(existing);
            buffer.writeUInt32LE(existing, this._dataPtrOffset);
            return offset;
        }

        valueMap.set(this.value, offset);
        buffer.writeUInt32LE(offset, this._dataPtrOffset);
        offset = writeNodeHeader(buffer, offset, NodeType.DATA);
        const dataBuffer = Buffer.from(this.value, 'utf8');
        assert(dataBuffer.length <= 65536);
        buffer.writeUInt16LE(dataBuffer.length, offset);
        offset += 2;
        buffer.writeBuffer(dataBuffer, offset);
        offset += dataBuffer.length;
        return offset;
    }
}

class TrieBuilderIntermediateNode {
    constructor(key) {
        this.key = key;
        this._leaf = null;
        this.children = new Map;

        this._childrenBeginPtrOffset = 0;
        this._isCompact = true;

        this._size = undefined;
        this._sortedChildren = undefined;
    }

    get size() {
        if (this._size !== undefined)
            return this._size;

        this._size = 0;
        if (this._leaf)
            this._size += this._leaf.size;
        for (let child of this.children.values())
            this._size += child.size;
        return this._size;
    }

    setValue(value, valueCombine) {
        if (this._leaf === null)
            this._leaf = new TrieBuilderLeafNode();
        this._leaf.addValue(value, valueCombine);
        if (this.children.size > 0)
            this._isCompact = false;
    }

    addChild(key) {
        const child = new TrieBuilderIntermediateNode(key);
        this.children.set(key, child);
        if (this._leaf !== null)
            this._isCompact = false;
        if (this.children.size > 1)
            this._isCompact = false;
        return child;
    }

    getChild(key) {
        return this.children.get(key);
    }

    _sortChildren() {
        const keys = Array.from(this.children.keys());
        keys.sort((a, b) => {
            if (a === WILDCARD)
                return -1;
            if (b === WILDCARD)
                return 1;

            const asize = this.children.get(a).size;
            const bsize = this.children.get(b).size;
            if (asize > bsize)
                return -1;
            if (asize < bsize)
                return 1;
            if (a < b)
                return -1;
            if (b < a)
                return 1;

            return 0;
        });
        this._sortedChildren = keys.map((key) => this.children.get(key));
    }

    _writeOwnKey(buffer, offset, nodeType) {
        if (this.key === WILDCARD) {
            offset = writeNodeHeader(buffer, offset, nodeType, NodeFlags.WILDCARD);
            buffer.writeUInt8(0, offset++);
        } else {
            offset = writeNodeHeader(buffer, offset, nodeType, NodeFlags.NONE);
            const keyBuffer = Buffer.from(this.key, 'utf8');
            assert(keyBuffer.length <= 255);
            buffer.writeUInt8(keyBuffer.length, offset++);
            buffer.writeBuffer(keyBuffer, offset);
            offset += keyBuffer.length;
        }
        return offset;
    }

    writeKey(buffer, offset) {
        this._sortChildren();
        assert(this._leaf || this.children.size > 0);

        if (this._isCompact) {
            offset = this._writeOwnKey(buffer, offset, NodeType.COMPACT);
            if (this._leaf)
                offset = this._leaf.writeKey(buffer, offset);
            for (let child of this._sortedChildren)
                offset = child.writeKey(buffer, offset);
            return offset;
        } else {
            offset = this._writeOwnKey(buffer, offset, NodeType.INTERMEDIATE);
            this._childrenBeginPtrOffset = offset;
            buffer.writeUInt32LE(0, offset);
            offset += 4;
            buffer.writeUInt16LE(0, offset);
            offset += 2;
            return offset;
        }
    }

    writeData(buffer, offset, valueMap) {
        assert(typeof offset === 'number');
        if (this._leaf)
            offset = this._leaf.writeData(buffer, offset, valueMap);
        for (let child of this._sortedChildren)
            offset = child.writeData(buffer, offset, valueMap);
        return offset;
    }

    writeChildren(buffer, offset) {
        if (!this._isCompact) {
            const beginOffset = offset;
            if (this._leaf)
                offset = this._leaf.writeKey(buffer, offset);
            for (let child of this._sortedChildren)
                offset = child.writeKey(buffer, offset);
            const endOffset = offset;
            assert(endOffset - beginOffset <= 65536);
            buffer.writeUInt32LE(beginOffset, this._childrenBeginPtrOffset);
            buffer.writeUInt16LE(endOffset - beginOffset, this._childrenBeginPtrOffset+4);
        }

        for (let child of this._sortedChildren)
            offset = child.writeChildren(buffer, offset);

        return offset;
    }
}

class TrieBuilderRootNode extends TrieBuilderIntermediateNode {
    constructor() {
        super('');
        this._isCompact = false;
        this._childrenPtrOffset = 0;
    }

    writeKey(buffer, offset) {
        this._sortChildren();
        this._childrenPtrOffset = offset;
        buffer.writeUInt16LE(0, offset);
        offset += 2;
        return offset;
    }

    writeChildren(buffer, offset) {
        const beginOffset = offset;
        if (this._leaf)
            offset = this._leaf.writeKey(buffer, offset);
        for (let child of this._sortedChildren)
            offset = child.writeKey(buffer, offset);
        const endOffset = offset;
        buffer.writeUInt16LE(endOffset - beginOffset, this._childrenPtrOffset);

        for (let child of this._sortedChildren)
            offset = child.writeChildren(buffer, offset);

        return offset;
    }
}

class BTrieBuilder {
    constructor(valueCombine) {
        this._valueCombine = valueCombine;
        this.root = new TrieBuilderRootNode();
    }

    insert(sequence, value) {
        let node = this.root;
        for (let key of sequence) {
            let child = node.getChild(key);
            if (!child)
                child = node.addChild(key);
            node = child;
        }
        node.setValue(value, this._valueCombine);
    }

    build() {
        const buffer = new GrowableBuffer();

        // write the header
        // magic number (Almond Trie)
        buffer.writeBuffer(Buffer.from('ALTR', 'utf8'), 0);
        // version number: 0x01 0x00 (minor, major)
        buffer.writeUInt16LE(1, 4);

        let offset = this.root.writeKey(buffer, FILE_HEADER_LENGTH);
        offset = this.root.writeChildren(buffer, offset);

        const valueMap = new Map;
        offset = this.root.writeData(buffer, offset, valueMap);
        assert(offset === buffer.length);

        return buffer.toBuffer();
    }
}

/**
 * A B-Tree-based (immutable) Trie.
 *
 * This is a disk-based data structure for efficient storing of key-value pairs,
 * where the keys are sequences. It is designed to be memory-mappable, which is
 * memory efficient.
 *
 * The file is organized in _nodes_, which roughly represent the trie nodes.
 * Each node is identified by a 1 byte head, followed by a variable size.
 *
 * Four types of nodes exist:
 * - _data_ nodes contain the values mapped to by the Trie; they are formed by a 4 byte length
 *   followed by the data
 * - _leaf_ nodes indicate a complete key (end of string marker); they are 4 bytes
 *   that point to the corresponding data node
 * - _intermediate_ nodes indicate a portion of the key (a single word); they are composed
 *   of 1 byte key length, followed by the key, followed by 4 bytes of pointer and 2 bytes
 *   of length into a _key block_; the key block is the sequential list of children of this
 *   node
 * - _compact_ nodes are an optimization of intermediate nodes with only one child; compact
 *   nodes have 1 byte key length, followed by the key; the child is then emitted immediately
 *   after the compact node, without pointers
 */
class BTrie {
    constructor(buffer) {
        this._buffer = buffer;

        // read the header
        if (buffer.toString('utf8', 0, 4) !== 'ALTR')
            throw new Error('Invalid magic');

        if (buffer.readUInt16LE(4) !== 1)
            throw new Error('Invalid version');

        this._root = {
            offset: FILE_HEADER_LENGTH + 2,
            size: buffer.readUInt16LE(FILE_HEADER_LENGTH)
        };
        this._check(this._root.size + this._root.offset <= this._buffer.length);
    }

    _check(condition, ...data) {
        if (!condition) {
            console.log(...data);
            throw new Error(`BTrie file is corrupt`);
        }
    }

    // skip a single node in the file
    _skipNode(offset) {
        const header = readNodeHeader(this._buffer, offset);
        offset ++;

        switch (header.nodeType) {
        case NodeType.DATA: {
            const dataLength = this._buffer.readUInt32LE(offset);
            this._check(offset + 2 + dataLength <= this._buffer.length);
            offset += 2;
            offset += dataLength;
            break;
        }
        case NodeType.LEAF: {
            // skip the data pointer
            this._check(offset + 4 <= this._buffer.length);
            offset += 4;
            break;
        }
        case NodeType.COMPACT: {
            const keyLength = this._buffer.readUInt8(offset);
            this._check(offset + 1 + keyLength <= this._buffer.length);
            offset += 1;
            offset += keyLength;
            break;
        }
        case NodeType.INTERMEDIATE: {
            const keyLength = this._buffer.readUInt8(offset);
            this._check(offset + 1 + keyLength <= this._buffer.length);
            offset += 1;
            offset += keyLength;

            // skip the pointer to the key block and length
            this._check(offset + 6 <= this._buffer.length);
            offset += 6;
            break;
        }

        }

        return offset;
    }

    // Skip a whole entry (sequence of compact nodes followed by a non-compact one)
    _skipEntry(offset) {
        let header = readNodeHeader(this._buffer, offset);
        while (header.nodeType === NodeType.COMPACT) {
            offset = this._skipNode(offset);
            header = readNodeHeader(this._buffer, offset);
        }

        // skip one more node
        // NOTE: in well-formed files, all compact nodes are guaranteed to be followed
        // by a non-compact node, either a leaf or an intermediate node
        return this._skipNode(offset);
    }

    _findKey(key, node) {
        let startOffset = node.offset;
        while (startOffset < node.offset + node.size) {
            const candidateHeader = readNodeHeader(this._buffer, startOffset);
            this._check(candidateHeader.nodeType !== NodeType.DATA, startOffset, candidateHeader);

            if (candidateHeader.nodeType === NodeType.LEAF) {
                startOffset = this._skipNode(startOffset);
                continue;
            }

            const keyLength = this._buffer.readUInt8(startOffset + 1);
            this._check(startOffset + 2 + keyLength <= this._buffer.length);
            if (key === WILDCARD) {
                if ((candidateHeader.flags & NodeFlags.WILDCARD) !== NodeFlags.WILDCARD) {
                    startOffset = this._skipEntry(startOffset);
                    continue;
                }
                this._check(keyLength === 0);
            } else {
                if ((candidateHeader.flags & NodeFlags.WILDCARD) !== 0) {
                    startOffset = this._skipEntry(startOffset);
                    continue;
                }
                if (keyLength !== key.length ||
                    this._buffer.compare(key, 0, key.length,
                        startOffset + 2, startOffset + 2 + keyLength) !== 0) {
                    startOffset = this._skipEntry(startOffset);
                    continue;
                }
            }

            if (candidateHeader.nodeType === NodeType.COMPACT) {
                return {
                    offset: startOffset + 2 + keyLength,
                    size: 1
                };
            } else {
                this._check(startOffset + 2 + keyLength + 6 <= this._buffer.length);

                const child = {
                    offset: this._buffer.readUInt32LE(startOffset + 2 + keyLength),
                    size: this._buffer.readUInt16LE(startOffset + 2 + keyLength + 4)
                };
                this._check(child.offset + child.size <= this._buffer.length);
                return child;
            }
        }

        return null;
    }

    search(sequence) {
        let node = this._root;
        for (let key of sequence) {
            assert(typeof key === 'string');
            const keyBuffer = Buffer.from(key, 'utf8');
            let child = this._findKey(keyBuffer, node);
            if (child === null)
                child = this._findKey(WILDCARD, node);
            if (child === null)
                return undefined;
            node = child;
        }

        // this can only occur with the root node, for an empty trie
        if (node.size === 0)
            return undefined;

        const nodeHeader = readNodeHeader(this._buffer, node.offset);
        this._check(nodeHeader.nodeType !== NodeType.DATA);

        if (nodeHeader.nodeType === NodeType.LEAF) {
            const dataNodeOffset = this._buffer.readUInt32LE(node.offset + 1);
            const dataHeader = readNodeHeader(this._buffer, dataNodeOffset);
            this._check(dataHeader.nodeType === NodeType.DATA && dataHeader.flags === 0);
            const dataSize = this._buffer.readUInt16LE(dataNodeOffset + 1);
            const dataOffset = dataNodeOffset + 1 + 2;
            return this._buffer.toString('utf8', dataOffset, dataOffset+dataSize);
        } else {
            return undefined;
        }
    }
}
module.exports = BTrie;
BTrie.WILDCARD = WILDCARD;
BTrie.Builder = BTrieBuilder;
