"use strict";

var fs = require("fs");
var bayes = require('bayes');

function getModel(file_path) {
  return new Promise(function(resolve, reject){
    fs.readFile(file_path, 'utf8', (err, data) => {
        err ? reject(err) : resolve(bayes.fromJson(data));
    });
  });
}

function getPercentages(text, classifier){

  var tokens = classifier.tokenizer(text);

  var frequencyTable = classifier.frequencyTable(tokens);

  var probabilities = [];

  Object
  .keys(classifier.categories)
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

    if (largest > 0.75) return classifier.categorize(text);

    return "other";
}

module.exports = {
  getModel,
  classify
};

return module.exports;
