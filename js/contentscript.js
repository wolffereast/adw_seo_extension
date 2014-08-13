chrome.runtime.onMessage.addListener(
	function(message, sender, sendResponse) {
		var responseText;
		
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
				case 'tagClass':
					jQuery(message.target).addClass(message.newClass);
					return false;
					break;
				case 'scrollTo':
					if (!jQuery(jQuery(message.target)[message.index]).is(':visible')){
						sendResponse({target: message.target, index: message.index, status: 'invisible', method: "scrollTo"});
					}
					else{
						jQuery('.seo_extension_selected').removeClass('seo_extension_selected');
						jQuery(jQuery(message.target)[message.index]).addClass('seo_extension_selected');
						var scrollTop = '';
						if (message.windowHeight < jQuery(window).outerHeight()) scrollTop = (jQuery(window).outerHeight() + message.windowHeight) / 2;
						else scrollTop = jQuery(window).outerHeight() / 2;
						
						//we want the item halfway up the screen, hence - outer height /2
						$('html, body').animate({scrollTop: (jQuery(jQuery(message.target)[message.index]).offset().top - scrollTop) + 'px'}, 'fast');
						return false;
					}
					break;
			}
		}
		return true;
	}
);