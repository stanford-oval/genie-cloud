const spawn = require('child_process').spawn;

class NLPClassifier {

	 constructor(){

		this.pythonProcess = spawn('python3',['-u', "python_classifier/classifier.py"]);

		this.pythonProcess.stderr.on('data', (data) => {

		  console.log(data.toString());
		});
	}

	async classify(input){

		let process = this.pythonProcess;
		var promise = new Promise(function(resolve, reject) {
			process.stdout.on('data', async (data)  =>  {

				var receiveData = await data.toString();
				resolve (receiveData);
			});
		});

		process.stdin.write(input);
		process.stdin.end();

		return promise;

	}

}
