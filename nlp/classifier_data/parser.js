var fs = require('fs');
var data = []


var outputFile = 'webquestions.examples.train.json'
var json = JSON.parse(fs.readFileSync(outputFile, 'utf8'));

for (i = 0; i < json.length; i++){
  data.push(json[i]['utterance']);
}


unique_data = []

for (j = 0; j < data.length; j++){
  command = data[j]
  if (!unique_data.includes(command)){
    unique_data.push(command)
  }
}


console.log(unique_data.length)

var json_data = JSON.stringify(unique_data);
fs.writeFile ("questions_train.json", JSON.stringify(json_data), function(err) {
    if (err) throw err;
    console.log('complete');
    }
);
