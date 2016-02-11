$(function(){

	$("#install").click(function() {
		event.preventDefault();
		sendConfirm();
	})

	function sendConfirm() {
		var request = new XMLHttpRequest();
	  	request.addEventListener('load', function(err, res) {
	  		console.log(request.responseText);
	  		$(document.body).html(request.responseText);
		  });
		request.open('GET', '/install/agree');
		request.send();
	}
})