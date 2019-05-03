var fs = require("fs");
var bayes = require('bayes')

var model = bayes.fromJson(fs.readFileSync('classifier_data/classifier.json', 'utf8'))
var text = fs.readFileSync("classifier_data/words.txt", 'utf8');
var words = text.split("\n")
var common_text = fs.readFileSync("classifier_data/command_words.txt", 'utf8');
var common_words = common_text.split("\n")

var common_punctuation = [',', '.', '!', '?', '#', "^", "*", "+", "-", "="]

function isSpam(sentence){
  var sentence_words = sentence.split(" ")
  var temp_counter = 0
  for (var j = 0; j < sentence_words.length; j++){
    if (sentence_words[j] != "" && !words.includes(sentence_words[j]) && !common_words.includes(sentence_words[j]) && !common_punctuation.includes(sentence_words[j]) && isNaN(sentence_words[j])){
      temp_counter += 1
    }
    if (temp_counter > 1){
      return true
    }
    if (temp_counter > 0 && sentence_words.length < 3){
      return true
    }
  }
  return false
}

function getPercentages(text, classifier){

  var tokens = classifier.tokenizer(text)

  var frequencyTable = classifier.frequencyTable(tokens)

  var probabilities = []

  Object
  .keys(model.categories)
  .forEach(function (category) {

    var categoryProbability = classifier.docCount[category] / classifier.totalDocuments

    var logProbability = Math.log(categoryProbability)

    Object
    .keys(frequencyTable)
    .forEach(function (token) {
      var frequencyInText = frequencyTable[token]
      var tokenProbability = classifier.tokenProbability(token, category)

      logProbability += frequencyInText * Math.log(tokenProbability)

    })
    probabilities.push(Math.exp(logProbability))
  })

  var total = 0;
  for(var i = 0; i < 3; i++) {
      total += parseFloat(probabilities[i])
  }

  var percentages = []
  for(var i = 0; i < 3; i++) {
      percentages.push(parseFloat(probabilities[i])/total)
  }

  return percentages

}

function classify (text, classifier){
    if (isSpam(text)){
      return "spam"
    }

    var percentages = getPercentages(text, classifier)
    var largest = 0
    for(var i = 0; i < 3; i++) {
        if (parseFloat(percentages[i]) > largest){
          largest = parseFloat(percentages[i])
        }
    }
    if (largest > 0.6){
        return classifier.categorize(text)
    }

    return "other"
}

console.log(classify("hello", model))
//chatty
console.log(classify("get the price of bitcoin", model))
// commands
console.log(classify("who was the first president of the US", model))
//questions
console.log(classify("sdfg ghj yu", model))
//spam
