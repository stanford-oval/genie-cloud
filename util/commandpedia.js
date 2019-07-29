// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2015-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const { PARAM_REGEX } = require('./tokenize');

function getCommandDetails(_, commands) {
    for (let command of commands) {
        if (command.liked !== undefined)
            command.liked = !!command.liked;
        if (command.is_base) {
            command.utterance = command.utterance.replace(new RegExp(PARAM_REGEX, 'g'), '____');
            if (command.utterance.startsWith(', '))
                command.utterance = command.utterance.substring(2);
            else if (command.target_code.startsWith('let stream') || command.target_code.startsWith('stream'))
                command.utterance = _("notify me %s").format(command.utterance);
            else if (command.target_code.startsWith('let table') || command.target_code.startsWith('query'))
                command.utterance = _("show me %s").format(command.utterance);

            command.devices = [command.kind];
        } else {
            // get device kinds from target_code
            let functions = command.target_code.split(' ').filter((code) => code.startsWith('@'));
            let devices = new Set(functions.map((f) => {
                let kind = f.split('.');
                kind.splice(-1, 1);
                kind = kind.join('.').substr(1);
                return kind;
            }));
            command.devices = Array.from(devices);
        }
        delete command.kind;

        const renames = {
             'light-bulb': 'com.hue',
             'car': 'com.tesla.car',
             'thermostat': 'com.nest',
             'security-camera': 'com.nest'
        };

        command.devices = command.devices.map((d) => renames[d] || d);
    }
}

module.exports = {
    getCommandDetails
};
