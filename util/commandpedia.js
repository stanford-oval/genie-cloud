// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
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
    }
}

module.exports = {
    getCommandDetails
};
