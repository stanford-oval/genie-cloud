// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2017 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
Q.longStackSupport = true;

const AssistantDispatcher = require('./dispatcher');

function main() {
    global.platform = require('../platform');
    platform.init();

    var dispatcher = new AssistantDispatcher();
    dispatcher.start();

    function stop() {
        dispatcher.stop().delay(1000).then(() => {
            process.exit();
        });
    }

    process.on('SIGINT', stop);
    process.on('SIGTERM', stop);
}
main();
