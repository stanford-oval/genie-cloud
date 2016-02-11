// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2016 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

// Graphics API abstraction, based on nodejs-gm

const Q = require('q');
const lang = require('lang');
const gm = require('gm');

const Image = new lang.Class({
    Name: 'GraphicsAP',

    _init: function(how) {
        this._gm = gm(how);
    },

    getSize: function() {
        return Q.ninvoke(this._gm, 'size');
    },

    resize: function(width, height) {
        this._gm = this._gm.resizeExact(width, height);
    },

    resizeFit: function(width, height) {
        this._gm = this._gm.resize(width, height);
    },

    stream: function() {
        return this._gm.stream();
    },

    toBuffer: function() {
        return Q.ninvoke(this._gm, 'toBuffer');
    },
});

module.exports = {
    createImageFromPath: function(path) {
        return new Image(path);
    },

    createImageFromStream: function(stream) {
        return new Image(stream);
    },

    createImageFromBuffer: function(buffer) {
        return new Image(buffer);
    },
};

