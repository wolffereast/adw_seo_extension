//define some global variables... we will want all the locations here
var tracking_functions = [];
var tracking_locations = [];

function status_print(content, message_type){
	message_type = message_type || 'status';
	var div = document.createElement("div");
	div.setAttribute('class','message ' + message_type);
	div.appendChild(document.createTextNode(content));
	document.getElementsByTagName('h2')[0].parentNode.appendChild(div);
}

/*
 * function to look for wrapper functions around a string
 * Best way to do this?  Im not sure, maybe break the file into functions? - giving it a go
 */
function check_for_inclusions(code_to_test){
	var free_text, functions, temp_text, temp_function, function_regex;
	//first, we need to remove the comments, two different formats, // on one line or /* ... */
	status_print(code_to_test);
	code_to_test = code_to_test.replace(/\/\/[^$]*$/i,'');
	
	status_print(code_to_test);
	
	free_text = functions = [];
	function_regex = /^(?:(?!function)[\s\S]|function\s*\([^)]*\))+/mi;
	//we are going to pull this thing apart... 
	while (code_to_test.length > 0){
		//first, get all the text till a function
		status_print('the original text to check: '+code_to_test);
		temp_text = code_to_test.match(function_regex);
		status_print(temp_text);
		//then find the end of the function, 
		
		//then repeat till the variable is empty...
		
		//then, realize you need a full brower-esque processor to deal with this type of parsing and move on to other methods
		break;
	}
}

/*
 * This function is adapted from code found on stackoverflow.  originally submitted by jessegavin
 * The post can be found here: http://stackoverflow.com/questions/2420970/how-can-i-get-selector-from-jquery-object
 */
function find_path(dom_object){
	var selector, id, classNames;
	
	selector = $(dom_object).parents().map(function() { return this.tagName; }).get().reverse().join(" ");
	
	if (selector) { 
		selector += " "+ $(dom_object)[0].nodeName;
	}

	id = $(dom_object).attr("id");
	if (id) { 
		selector += "#"+ id;
	}

	classNames = $(dom_object).attr("class");
	if (classNames) {
		selector += "." + $.trim(classNames).replace(/\s/gi, ".");
	}

	return selector;
}

/*
 * Combs the dom_object for any element with an inline handler
 */
function find_inline_handlers(dom_object){
	var component_array, function_regex, handler, parts, part, method_object, i, j, function_calls, methods, method_calls, function_callers;
	component_array = [];
	function_calls = [];
	methods = [];
	method_calls = [];
	function_callers = [];
	
	function_regex =/^([a-zA-Z0-9\s_.-]+)\([^)]*\)$/;
	method_regex = /^.*\.([^.]*)$/;
	
	$('[onclick]', dom_object).each(function(){
		handler = $(this).attr('onclick');

		parts = handler.split(';');
		for (i=0, j=parts.length; i<j; i++){
			if (parts[i].length){
				//status_print(parts[i]);
				part = parts[i].match(function_regex);
				if (part != null){
					status_print(part[1], 'error');
					method_object = part[1].match(method_regex);
					if (method_object != null){
						status_print('method: '+method_object,'warning');
						methods.push(method_object[1]);
						method_calls.push(method_object[2]);
					}//end if method object null
					else if ($.inArray(part[1], function_calls) === -1){
						status_print('function: '+part,'warning');
						function_calls.push(part[1]);
					}
					function_callers.push(this);
				}//end if part null
			}//end if parts[i].length
		}//end for
	});//end jquery onclick selector
	var methods, functions, callers;
	for (i=0; i<method_calls.length; i++){
		if (methods != '') methods += ', ';
		methods += method_calls[i];
	}
	for (i=0; i<function_calls.length; i++){
		if (functions != '') functions += ', ';
		functions += function_calls[i];
	}
	for (i=0; i<function_callers.length; i++){
		if (callers != '') callers += ', ';
		callers += find_path(function_callers[i]);
	}
	status_print('methods: '+methods);
	status_print('functions: '+functions);
	status_print('caller selectors: '+callers);
}

function find_tracking_code(code_to_test, external, url){
	var xmlhttp;
	external = (typeof external === 'undefined') ? false : external;
	
	if (external){
		//this is a script file, time for some AJAX!
		/////status_print('this is an external script with url: '+code_to_test);
		xmlhttp = new XMLHttpRequest();
		
		xmlhttp.onreadystatechange = function(){
			if (xmlhttp.readyState==4){
				if (xmlhttp.status==200){
					find_tracking_code(xmlhttp.responseText, false, url);
				}
				else if (xmlhttp.status==404){
					status_print('returning a 404 for the ajax request to '+code_to_test,'error');
				}
				else{
					status_print('status is not 200 or 404 for the ajax request to '+code_to_test+', what is it? drumroll please.....'+"\n"+xmlhttp.status,'warning');
				}
			}
		};

		xmlhttp.open("GET",code_to_test+"?t=" + Math.random(),true);
		xmlhttp.send();
	}
	else{
		//this is the script text.  pull on those regex boots, its stompy time!
		if (code_to_test.indexOf('_gaq') !== -1){
			status_print('found _gaq within a script, looking in '+url+' for the stash');
			//this has tracking, AWESOME SAUCE
			check_for_inclusions(code_to_test);
		}
	}
}

function find_scripts(temp_dom, current_url){
	//status_print('beginning of the find scripts function');
	var host, rude_host, host_regex;
	
	//We will need the host we are currently using
	host = current_url.match(/^([^.]*\.)?[^.]*\.[^\/]*\//i);
	if (host !== null){
		host = host[0];
	}
	else{
		status_print('bad host name, the current url is '+current_url);
	}
	
	//strip the protocal
	rude_host = host.replace(/https?:\/\//i,'');
	//the host is now rude... get it?  it doesnt have protocal? ... shut up, its funny
	////status_print('todays show brought to you by your host '+host);
	host_regex = new RegExp('(https?:)?(\/\/)?'+rude_host,'i');
	////status_print('(https?:)?(\/\/)?'+host)
	host_regex.compile(host_regex);
	
	////status_print('there are '+$('script',temp_dom).length+' scripts on the whole page');
	
	$('script',temp_dom).each(function(){
		if (typeof($(this).attr('src')) === 'undefined'){
			console.log($(this).text());
			////status_print('internal script '+$(this).text()+' is onsite and parsable');
			find_tracking_code($(this).text(), false, 'internal');
		}
		else{
			var current_src;
			current_src = $(this).attr('src');
			if (current_src.match(host_regex)){
				/////status_print('external script '+external_scripts[i]+' is onsite and parsable');
				find_tracking_code(current_src, true, current_src);
			}
			else if (!current_src.match(/^(http|\/\/)/i)){
				//doesnt have the protocal or host, append them!
				//first, remove the friggin starting./
				current_src = current_src.replace(/^\.\//,'');
				//now, this is the host and the path without host
				find_tracking_code(current_url.replace(/\/[^\/]*$/,'/')+current_src, true, current_url.replace(/\/[^\/]*$/,'/')+current_src);
			}
		}
	});
}

function find_event_bindings(temp_dom, current_url){
	var temp_events, selector_array, event_array;
	selector_array = [];
	event_array = [];
	
	$('*', temp_dom).each(function(){
		temp_events = $._data(this, "events");
		if (temp_events != 'undefined'){
			selector_array.push(find_path(this));
			event_array.push(temp_events);
		}
	});
	
	status_print(selector_array);
	status_print(event_array);
}

function eval_current_page() {
	var tab_url, xmlhttp, temp_dom;
	chrome.tabs.getSelected(null, function(tab){
		////status_print('url being checked: '+tab.url);
		//dont have to worry about activex, this is a chrome browser extension
		xmlhttp = new XMLHttpRequest();
		
		xmlhttp.onreadystatechange=function(){
			if (xmlhttp.readyState==4){
				if (xmlhttp.status==200){
					//return the text to its original dom properties
					temp_dom = document.createElement('div');
					temp_dom.innerHTML = xmlhttp.responseText;
					//trying a different way, test the whole dom to see if there are events attached to anything
					//find_event_bindings(temp_dom, tab.url);
					//this pulls all the scripts on the page
					//find_scripts(temp_dom, tab.url);
					//grab all the inline handlers
					find_inline_handlers(temp_dom);
				}
				else if (xmlhttp.status==404){
					status_print('returning a 404 for the ajax request - what page do you think has tracking on it?','error');
				}
				else{
					status_print('status is not 200 or 404, what is it? drumroll please.....'+"\n"+xmlhttp.status,'warning');
				}
			}
		};
		
		//build the url with auth if it exists
		if ($('input.username').val() != '' && $('input.password').val() != ''){
			tab_url = tab.url.replace(/(https?:\/\/)(.*)$/i,"$1"+$('input.username').val()+":"+$('input.password').val()+"@$2");
			////status_print(tab_url);
		}
		else{
			tab_url = tab.url;
		}
		xmlhttp.open("GET",tab_url+"?t=" + Math.random(),true);
		xmlhttp.send();
	});
}

document.addEventListener('DOMContentLoaded', function () {
  $('button#reload-button').click(eval_current_page);
});
