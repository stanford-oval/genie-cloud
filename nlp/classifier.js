"use strict";

const spawn = require('child_process').spawn;
const JsonDatagramSocket = require('../util/json_datagram_socket');

class NLPClassifier{

	constructor() {
		//spawn python process
		this.pythonProcess = spawn('python3',['-u', "python_classifier/classifier.py"]);

		this.concurrentRequests = [];
		this.isLive = true;

		this._stream = new JsonDatagramSocket(this.pythonProcess.stdout, this.pythonProcess.stdin, 'utf8');
		this._stream.on('data', (msg) => {

			const id = msg.id;
			//matches id of request to handle concurrent requests
			for (var i = 0; i < this.concurrentRequests.length; i++ ){
				if (id === this.concurrentRequests[i].uniqueid){
					if (msg.error) {
						this.concurrentRequests[i].reject(msg);
						this.concurrentRequests.splice(i, 1);
					}else {
						this.concurrentRequests[i].resolve(msg);
						this.concurrentRequests.splice(i, 1);
				}

				}
			}
		});

		//error handling
		this._stream.on('error', (msg) => {
			console.log("error occured");
		});
		this._stream.on('end', (error) => {
			console.log("Ending Python Process");
		});
		this._stream.on('close', (hadError) => {
			console.log("Closing Python Process");
			this.isLive = false;
			for (var i = 0; i < this.concurrentRequests.length; i++){
				this.concurrentRequests[i].reject("Request Rejected");
				this.concurrentRequests.splice(i, 1);
			}
		});
	}

	newPromise(id){
		var process = {
			promise: null,
			resolve: null,
			reject: null,
			uniqueid: id
		};
		process.promise = new Promise((resolve, reject) => {
			process.resolve = resolve;
			process.reject = reject;
		});
		return process;
	}

	classify(id, input){
		const new_promise = this.newPromise(id);
		this.concurrentRequests.push(new_promise);
		if (!this.isLive){
			new_promise.reject("Python Process Dead");
		}else{
			this._stream.write(
				{id: id, sentence: input }
			);
		}
		return new_promise.promise;
	}
}

module.exports = new NLPClassifier();
