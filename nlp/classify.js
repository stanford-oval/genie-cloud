"use strict";

var fs = require("fs");
var bayes = require('bayes');

var model = bayes.fromJson(fs.readFileSync('classifier.json', 'utf8'));

function getPercentages(text, classifier){

  var tokens = classifier.tokenizer(text);

  var frequencyTable = classifier.frequencyTable(tokens);

  var probabilities = [];

  Object
  .keys(model.categories)
  .forEach((category) => {

    var categoryProbability = classifier.docCount[category] / classifier.totalDocuments;

    var logProbability = Math.log(categoryProbability);

    Object
    .keys(frequencyTable)
    .forEach((token) => {
      var frequencyInText = frequencyTable[token];
      var tokenProbability = classifier.tokenProbability(token, category);

      logProbability += frequencyInText * Math.log(tokenProbability);

    });
    probabilities.push(Math.exp(logProbability));
  });

  var total = 0;
  for(var i = 0; i < 3; i++) total += parseFloat(probabilities[i]);

  var percentages = [];
  for(var j = 0; j < 3; j++) percentages.push(parseFloat(probabilities[j])/total);

  return percentages;

}

function classify (text, classifier){
    
    var percentages = getPercentages(text, classifier);
    var largest = 0;

    for(var i = 0; i < 3; i++) if (parseFloat(percentages[i]) > largest) largest = parseFloat(percentages[i]);

    if (largest > 0.6) return classifier.categorize(text);

    return "other";
}

console.log(classify("hello", model));
//chatty
console.log(classify("get the price of bitcoin", model));
// commands
console.log(classify("who was the first president of the US", model));
//questions
