"use strict";

const assert = require('assert');

const classifier = require('../../nlp/classify');

async function main() {
  
    const model = await classifier.getModel('../../nlp/classifier.json');
    assert.strictEqual(classifier.classify("hello", model), 'chatty');
    assert.strictEqual(classifier.classify("hey", model), 'chatty');
    assert.strictEqual(classifier.classify("whats up", model), 'chatty');
    assert.strictEqual(classifier.classify("get the price of bitcoin", model), 'commands');
    assert.strictEqual(classifier.classify("get pictures of cats from facebook", model), 'commands');
    assert.strictEqual(classifier.classify("remind me to call my boss at 1:00 pm", model), 'commands');
    assert.strictEqual(classifier.classify("who was the first president of the US", model), 'questions');
    assert.strictEqual(classifier.classify("what time is it", model), 'questions');
    assert.strictEqual(classifier.classify("what is the capital of Canada", model), 'questions');

}
module.exports = main;
if (!module.parent)
    main();
