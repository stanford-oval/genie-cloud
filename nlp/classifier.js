"use strict";

const spawn = require('child_process').spawn;

class NLPClassifier	{

	constructor(){

		this.pythonProcess = spawn('python3',['-u', "python_classifier/classifier.py"]);
	}

	async classify(input){

		let process = this.pythonProcess;
		var promise = new Promise((resolve, reject) => {
			process.stdout.on('data', async (data)  =>  {

				var receiveData = await data.toString();
				resolve (receiveData);

			});
		});

		process.stdin.write(input + "\n");

		return promise;

	}

}

module.exports = new NLPClassifier();
