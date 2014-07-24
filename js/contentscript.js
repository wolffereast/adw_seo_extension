chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		if(typeof message.origin != "undefined" && message.origin == 'seo_script' && message.method == "getDocument"){
			sendResponse({data: document.getElementsByTagName('html')[0].innerHTML, method: "getDocument"});
		}
	}
);