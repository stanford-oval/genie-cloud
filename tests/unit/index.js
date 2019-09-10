"use strict";

process.on('unhandledRejection', (up) => { throw up; });
require('../../util/config_init');
process.env.TEST_MODE = '1';

/*async function par(array) {
    await Promise.all(array.map((fn) => fn()));
}*/
async function seq(array) {
    for (let fn of array) {
        console.log(`Running tests for ${fn}`);
        await require(fn)();
    }
}

seq([
    ('./test_abstract_fs'),
    ('./test_lock'),
    ('./test_tokenize'),
    ('./test_device_factories'),
    ('./test_binary_search'),
    ('./test_input_validation'),
    ('./test_trie'),
    ('./test_edit_distance'),
    ('./test_exact_matcher'),
    ('./test_nlp_compat'),
    ('./test_example_names'),
    ('./test_alexa_intent_parser')
]);
