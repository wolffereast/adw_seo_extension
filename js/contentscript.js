chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		console.log('in the send response with method: '+message.method);
		if(typeof message.origin != "undefined" && message.origin == 'seo_script'){
			switch (message.method){
				case 'getDocument':
					sendResponse({data: document.getElementsByTagName('html')[0].innerHTML, method: "returnDocument"});
					break;
				case 'getScript':
					jQuery.ajax({
						type: 'POST',
						url: message.url,
						headers: {
							'Cache-Control':"max-age=0, no-cache, no-store, must-revalidate",
							'Pragma' : "no-cache",
							'Expires' : "Wed, 11 Jan 1984 05:00:00 GMT",
						},
						success: function(data, textStatus, jqXHR){
							sendResponse({data: data.responseText, method: "returnScript"});
						},
						error: function(jqXHR, textStatus, errorThrown){
							sendResponse({data: 'error finding script. Error: '+errorThrown, method: "returnError"});
						}
					})
					break;
			}
		}
	}
);