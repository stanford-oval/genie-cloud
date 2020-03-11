"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');
process.env.TEST_MODE = '1';

async function seq(array) {
    for (let fn of array) {
        if (fn === null)
            continue;
        console.log(`Running tests for ${fn}`);
        await require(fn)();
    }
}

seq([
    ('./test_voice'),
    ('./test_nlu'),
]);
