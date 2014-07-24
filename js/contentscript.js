chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if(typeof message.origin != "undefined" && message.origin == 'seo_script'){
			switch (message.method){
				case 'getDocument':
					sendResponse({data: document.getElementsByTagName('html')[0].innerHTML, method: "returnDocument"});
					break;
				case 'getScript':
					//we are in chrome, dont have to worry about the XMLHttpRequest being supported
					var xmlhttp = new XMLHttpRequest();
				
					xmlhttp.onreadystatechange = function(){
						if (xmlhttp.readyState==4){
							if (xmlhttp.status==200){
								sendResponse({data: xmlhttp.responseText, method: "returnScript"});
							}
							else{
								sendResponse({data: 'error finding script. Error Status: '+xmlhttp.status, method: "returnError"});
							}
						}
					};
				
					xmlhttp.open("GET",message.url+"?t=" + Math.random(),true);
					xmlhttp.send();
					
					break;
			}
		}
		return true;
	}
);