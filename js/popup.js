
//define some global variables... we will want all the locations here
var tracking_functions = [], method_calls = [], methods = [], function_calls = [], function_callers = [];
var ADW_GLOBALS = new Object
ADW_GLOBALS = {
	num_scripts : 0,
	num_executed : 0,
	scripts_content : [],
	matched_functions : [],
	selector_to_function : new Object,
	account_num : '',
	quotations : /((["'])(?:(?:\\\\)|\\\2|(?!\\\2)\\|(?!\2).|[\n\r])*\2)/,
	multiline_comment : /(\/\*(?:(?!\*\/).|[\n\r])*\*\/)/,
	single_line_comment : /(\/\/[^\n\r]*(?:[\n\r]+|$))/,
	regex_literal : /(?:\/(?:(?:(?!\\*\/).)|\\\\|\\\/|[^\\]\[(?:\\\\|\\\]|[^]])+\])+\/)/,
	html_comments : /(<!--(?:(?!-->).)*-->)/,
	tracking_type : false, //options: false for no tracking, asynch, or universal
}
ADW_GLOBALS.regex_of_doom = new RegExp(
	'(?:' + ADW_GLOBALS.quotations.source + '|' + 
	ADW_GLOBALS.multiline_comment.source + '|' + 
	ADW_GLOBALS.single_line_comment.source + '|' + 
	'((?:=|:)\\s*' + ADW_GLOBALS.regex_literal.source + ')|(' + 
	ADW_GLOBALS.regex_literal.source + '[gimy]?\\.(?:exec|test|match|search|replace|split)\\(' + ')|(' + 
	'\\.(?:exec|test|match|search|replace|split)\\(' + ADW_GLOBALS.regex_literal.source + ')|' +
	ADW_GLOBALS.html_comments.source + ')' , 'g'
);

function status_print(content, message_type){
	var to_output = '', i;
	if( Object.prototype.toString.call( content ) === '[object Array]' ) {
		for (i = 0; i < content.length; i++){
			to_output = to_output + content[i] + "\n";
		}
	}
	else if ( Object.prototype.toString.call( content ) === '[object Object]' ) {
		$.each(content, function(index, value){
			to_output = to_output + index + ' : ' + value + "\n";
		});
	}
	else to_output = content

	message_type = message_type || 'status';
	var pre = document.createElement('pre');
	var div = document.createElement("div");
	div.setAttribute('class','message ' + message_type);
	pre.appendChild(document.createTextNode(to_output));
	div.appendChild(pre);
	document.getElementsByTagName('h2')[0].parentNode.appendChild(div);
}

/*
 * function to find the end of a parenthesis
 */
function match_parens(code_to_test, level, opening, closing){
	var sub_match, matched;
	return code_to_test.replace(new RegExp('^([^'+opening+closing+']*(.))[\\s\\S]*$'), function(full_match, matched, $2, offset, original){
		/////status_print('$2 = ' + $2)
		if ($2 == opening){
			sub_match = match_parens(original.substr(offset+matched.length), level + 1, opening, closing);
			/////status_print('in match parens if with level of ' + level + ' and match of ' + matched + ' and a sub match of ' + sub_match);
			matched = matched + sub_match
		}
		else if (level > 1){
			sub_match = match_parens(original.substr(offset+matched.length), level - 1, opening, closing);
			/////status_print('in match parens else with level of ' + level + ' and match of ' + matched + ' and a sub match of ' + sub_match);
			matched += sub_match;
		}
		/////status_print('in match parens with level of ' + level + ' returning a match of ' + matched);
		return matched;
	});
}

/*
 * function to look for function calls
 */
function check_for_function_inclusions(function_title){
	var trimmed_code, num_events, num_funcs, code_to_replace, sub_code_to_replace, i, j, temp_function_regex, temp_selector;
	
	temp_function_regex = new RegExp(function_title+'\\s*\\([^()]*(.)', 'g')
	
	status_print('looking for ' + function_title)
	//first try at this?  lets grab all the event handlers
	$.each(ADW_GLOBALS.scripts_content, function(){
		trimmed_code = this;
		//check if the function exists
		num_events = trimmed_code.match(temp_function_regex);
		//if it does get the number of event handlers
		if (num_events){
			num_events = trimmed_code.match(/(?:jQuery|\$)\(([^)]*)\)\.click\(\s*function\s*\(([^)]*)\)\s*[\n\r]*{[^{}]*(.)(?:\);)?/g);
			if (num_events) num_events = num_events.length
			else num_events = 0;
		}
		else num_events = 0;

		//grab and test all the event handlers
		for (i=0; i < num_events; i++){
			/////status_print(trimmed_code);
			trimmed_code.replace(/(?:jQuery|\$)\(([^)]*)\)\.click\(\s*function\s*\(([^)]*)\)\s*[\n\r]*{[^{}]*(.)(?:\);)?/,function($match, $1, $2, $3, offset, original){
				if ($3 == '{') code_to_replace = $match + match_parens(original.substr(offset+$match.length), 2, '{', '}');
				else code_to_replace = $match;
				temp_selector = $1;
				return $match
			})
			trimmed_code = trimmed_code.replace(code_to_replace, '');
			
			num_funcs = code_to_replace.match(temp_function_regex);
			if (num_funcs) num_funcs = num_funcs.length
			else num_funcs = 0;

			//now, parse the event to pull out the function we are looking for
			for (j=0; j < num_funcs; j++){
				code_to_replace.replace(new RegExp(function_title+'\\s*\\([^()]*(.)'), function($match, $1, offset, original){
					if ($1 == '(')sub_code_to_replace = $match + match_parens(original.substr(offset+$match.length), 2, '(', ')');
					else sub_code_to_replace = $match
					return $match;
				});
				code_to_replace.replace(sub_code_to_replace, '');
				//split the selector and populate the global array with the funciton calls
				$(temp_selector.split(',')).each(function(){
					if (typeof ADW_GLOBALS.selector_to_function[this] == "undefined") ADW_GLOBALS.selector_to_function[this.substr(1,this.length - 2)] = [sub_code_to_replace];
					else ADW_GLOBALS.selector_to_function[this].push(sub_code_to_replace)
				});
			}
		}
	});
}

/*
 * function to look for inclusion of ua within a script or function
 */
function check_for_ua_inclusions(code_to_test){
	var has_target, matching = true, matched_code = [], code_to_replace, i, array_length, trimmed_code = code_to_test,
			asynch_regex, asynch_regex_match, univ_regex;
	
	asynch_regex = /_gaq\.push\([^()]*(?:\(|\))/g;
	asynch_regex_match = /_gaq\.push\([^()]*(?:\(|\))/g;
	//matches [function name](['"]create['"], ['"][ua code here]['"], ['"][call here - defaults to auto]['"])
	//function name in \1, UA code in \4
	univ_regex = /([$_a-zA-Z][$_a-zA-Z0-9]*)\s*\((['"])create\2\s*,\s*(['"])(UA-[0-9]+-[0-9])+\3\s*,\s*(['"])[a-zA-Z0-9]+\5\s*\)/;
	
	//try asynchronous first
	array_length = code_to_test.match(asynch_regex);
	if (array_length) array_length = array_length.length
	else{
		//now universal
		array_length = code_to_test.match(univ_regex);
		if (array_length){
			status_print(trimmed_code);
			array_length = array_length.length
			trimmed_code.replace(univ_regex,function($match, $1, $2, $3, $4, $5, offset, original){
				status_print($1,'error');
			});
		}
		array_length = 0;
	}
	
	for (i=0; i < array_length; i++){
		/////status_print("the original text to check:\n"+code_to_test);
		/////status_print(has_target[1],'error');
		trimmed_code.replace(asynch_regex_match,function($match, $1, $2, offset, original){
			if ($2 == '(')code_to_replace = $match + match_parens(original.substr(offset+$match.length), 2, '(', ')');
			else code_to_replace = $match
			matched_code.push(code_to_replace);
			return $match;
		});
		/////status_print('code_to_replace is '+code_to_replace);
		trimmed_code = trimmed_code.replace(code_to_replace, '');
	}
	
	if (array_length){
		/////status_print(matched_code);
		//next the fun part - check for functions with gaqs
		//first, reset the trimming text
		trimmed_code = code_to_test
		//find the number of functions to look for
		array_length = code_to_test.match(/function\s*([^\s(]+)\s*\([^)]+\)\s*[\n\r]?\s*{[^{}]*([{}])/g);
		if (array_length) array_length = array_length.length
		else array_length = 0;
		
		for (i=0; i < array_length; i++){
			trimmed_code.replace(/function\s*([^\s(]+)\s*\([^)]+\)\s*[\n\r]?\s*{[^{}]*([{}])/,function($match, $1, $2, offset, original){
				ADW_GLOBALS.matched_functions.push($1);
				if ($2 == '{')code_to_replace = $match + match_parens(original.substr(offset+$match.length), 2, '{', '}');
				else code_to_replace = $match
				return $match;
			});
			trimmed_code = trimmed_code.replace(code_to_replace, '');
		}
	}
}

/*
 * This function is adapted from code found on stackoverflow.  originally submitted by jessegavin
 * The post can be found here: http://stackoverflow.com/questions/2420970/how-can-i-get-selector-from-jquery-object
 */
function find_path(item_to_find, dom_object, id_to_ignore){
	var selector, id, classNames;
	
	id_to_ignore = (typeof id_to_ignore != 'undefined') ? id_to_ignore : false;

	id = $(item_to_find, dom_object).attr("id");
	if (id && id_to_ignore !== false){
		if (id == id_to_ignore) return '';
	}

	if ($(item_to_find, dom_object).parent().length){
		selector = find_path($(item_to_find, dom_object).parent(), dom_object, id_to_ignore);
	}
	else selector = '';
	
	selector += " "+ $(item_to_find, dom_object)[0].nodeName;

	if (id) { 
		selector += "#"+ id;
	}

	classNames = $(item_to_find, dom_object).attr("class");
	if (classNames) {
		selector += "." + $.trim(classNames).replace(/\s/gi, ".");
	}

	return selector;
}

/*
 * Combs the dom_object for any element with an inline handler
 */
function find_inline_handlers(dom_object){
	var component_array, function_regex, handler, parts, part, method_object, i, j;
	component_array = [];
	
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
					////status_print(part[1], 'error');
					method_object = part[1].match(method_regex);
					if (method_object != null){
						////status_print('method: '+method_object,'warning');
						methods.push(method_object[1]);
						method_calls.push(method_object[2]);
					}//end if method object null
					else if ($.inArray(part[1], function_calls) === -1){
						////status_print('function: '+part,'warning');
						function_calls.push(part[1]);
					}
					function_callers.push(this);
				}//end if part null
			}//end if parts[i].length
		}//end for
	});//end jquery onclick selector
	/*
	 * uncomment this to print out the functions and methods found
	 * /
	var methods = '', functions = '', callers = '';
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
		callers += find_path(function_callers[i], dom_object, 'temp-dom-wrapper');
	}
	status_print('methods: '+methods);
	status_print('functions: '+functions);
	status_print('caller selectors: '+callers);
	/*
	 */
}

/*
 * function to find the tracking code
 * takes internal (as code) or external (as an address) js
 *
 * external is recursive.  it pulls the code then calls itself with code instead of link
 */
function find_tracking_code(code_to_test, external, f){
	var xmlhttp, results,
			univ_regex = /([$_a-zA-Z][$_a-zA-Z0-9]*)\s*\((['"])create\2\s*,\s*(['"])(UA-[0-9]+-[0-9])+\3\s*,\s*(['"])[a-zA-Z0-9]+\5\s*\)/i,
			asynch_regex = /_gaq\.push\(\[(["'])_setAccount\1\s*,\s*(['"])(.*?)\2/i;
	external = (typeof external == 'undefined') ? false : external;
	f = (typeof f == 'function') ? f : false;
	
	
	
	if (external){
		//this is a script file, time for some AJAX!
		/////status_print('this is an external script with url: '+code_to_test);
		xmlhttp = new XMLHttpRequest();
		
		xmlhttp.onreadystatechange = function(){
			if (xmlhttp.readyState==4){
				if (xmlhttp.status==200){
					find_tracking_code(xmlhttp.responseText, false, f);
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
		
		results = code_to_test.match(asynch_regex);
		if ($(results).length){
			status_print('matching the asynch')
			status_print(''+results[3]);
			ADW_GLOBALS.tracking_type = 'asynch';
			ADW_GLOBALS.account_num = results[3]
		}
		else{
			results = code_to_test.match(univ_regex);
			if ($(results).length){
				status_print('matching the universal')
				status_print(results);
				ADW_GLOBALS.tracking_type = 'universal';
				ADW_GLOBALS.account_num = results[5]
			}
		}
		/////status_print(ADW_GLOBALS.regex_of_doom);
		/////status_print('before the regex of doom call.  calling it on '+"\n"+code_to_test)
		//strip the comments from the js.  we dont need no stinkin comments!
		// /*
		code_to_test = code_to_test.replace(ADW_GLOBALS.regex_of_doom, function($match, $1, $2, $3, $4, $5, $6, $7, $8, offset, original){
			if (typeof $1 != 'undefined') return $1;
			if (typeof $5 != 'undefined') return $match.replace($5,'');
			if (typeof $6 != 'undefined') return $match.replace($6,'');
			if (typeof $7 != 'undefined') return $match.replace($7,'');
			return '';
		});
		/////status_print('after the regex of doom call.  resulting code:'+"\n"+code_to_test);		
		// */
		
		// we need to be able to check the code even if it doesnt contain _gaq
		ADW_GLOBALS.scripts_content.push(code_to_test);
		
		ADW_GLOBALS.num_executed += 1;
		/////status_print('num executed: '+ADW_GLOBALS.num_executed+' num scripts total = '+ADW_GLOBALS.num_scripts+' the type of f is '+typeof f);
		if (ADW_GLOBALS.num_executed == ADW_GLOBALS.num_scripts && typeof f == 'function') f.call();
	}
}

/*
 * function to find all of the scripts on the page
 * pulls inline and internal scripts directly
 * ignores externals ... for now
 *
 * calls find_tracking_code on each script found
 *
 * @todo parse external scripts as well
 */
function find_scripts(temp_dom, current_url, f){
	//status_print('beginning of the find scripts function');
	var host, rude_host, host_regex, url_to_curl;
	
	f = (typeof f == 'function') ? f : false;
	
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
	
	host_regex = new RegExp('(https?:)?(\/\/)?'+rude_host,'i');
	host_regex.compile(host_regex);
	
	ADW_GLOBALS.num_scripts = $('script',temp_dom).length;

	$('script',temp_dom).each(function(){
		//inline scripts
		if (typeof($(this).attr('src')) === 'undefined'){
			status_print($(this).text(), 'warning');
			////status_print('internal script '+$(this).text()+' is onsite and parsable');
			find_tracking_code($(this).text(), false, f);
		}
		else{
			var current_src;
			current_src = $(this).attr('src');
			//internals
			if (current_src.match(host_regex)){
				find_tracking_code(current_src, true, f);
			}
			else if (!current_src.match(/^(http|\/\/)/i)){
				//doesnt have the protocal or host, append them!
				if (current_src.match(/^\//)){
					//this is from the root
					url_to_curl = current_url.replace(/(https?:\/\/[^\/]*)\/.*$/, function(match, $1, offset, original){return $1})+current_src;
				}
				else{
					//first, remove the friggin starting./
					current_src = current_src.replace(/^\.\//,'');
					//now, this is the host and the path without host
					url_to_curl = current_url.replace(/\/[^\/]*$/,'/')+current_src;
				}
				find_tracking_code(url_to_curl, true, f);
			}
			else{
				//this script is offsite, we are currently not parsing these...
				//we still need to increment the counter though
				ADW_GLOBALS.num_executed += 1;
			}
		}
	});
}

/*
 * takes resources found earlier and parses them
 * looks for inline handlers and function calls that associate with GA calls
 *
 * prints out selectors for elements on the page with handlers
 * @todo - generate borders around elements with handlers for visual
 * @todo - onclick scrolling to element in question
 * @todo - number of each kind of element on the page
 */
function eval_current_page_helper(temp_dom){
	//grab all the inline handlers
	find_inline_handlers(temp_dom);
	//parse the scripts
	$.each(ADW_GLOBALS.scripts_content, function(){
		check_for_ua_inclusions(this);
	});
	//parse em again, but this time look for the functions
	if (ADW_GLOBALS.matched_functions.length){
		$.each(ADW_GLOBALS.matched_functions, function(){
			check_for_function_inclusions(this);
		});
	}
	$.each(ADW_GLOBALS.selector_to_function, function(index, value){
		if (!$(index, temp_dom).length)delete ADW_GLOBALS.selector_to_function[index]
	});
	status_print(ADW_GLOBALS.selector_to_function);
}

/*
 * Finds the current chrome tab
 * Adds http auth if it is set
 * cURLs in the info from the tab
 *
 * calls find_scripts
 * 	callback of eval_current_page_helper
 */
function eval_current_page() {
	var tab_url, xmlhttp, temp_dom;
	chrome.tabs.getSelected(null, function(tab){
		//sendMessage(integer tabId, any message, function responseCallback)
		chrome.tabs.sendMessage(tab.id, {origin: "seo_script", method: "getDocument"}, function(response) {
			if(response.method=="getDocument"){
				temp_dom = document.createElement('div');
				$(temp_dom).attr('id', 'temp-dom-wrapper');
				temp_dom.innerHTML = response.data;
				
				console.log(temp_dom);
				find_scripts(temp_dom, tab.url, function(){
					/////status_print('finished with find scripts');
					eval_current_page_helper(temp_dom);
				});
			}
    });
		
/* * /
		////status_print('url being checked: '+tab.url);
		//dont have to worry about activex, this is a chrome browser extension
		xmlhttp = new XMLHttpRequest();
		
		xmlhttp.onreadystatechange=function(){
			if (xmlhttp.readyState==4){
				if (xmlhttp.status==200){
					//return the text to its original dom properties
					temp_dom = document.createElement('div');
					$(temp_dom).attr('id', 'temp-dom-wrapper');
					temp_dom.innerHTML = xmlhttp.responseText;
					
					//this pulls all the scripts on the page
					// Implemented a callback functionality on this, so call find inline handlers on return
					find_scripts(temp_dom, tab.url, function(){
						/////status_print('finished with find scripts');
						eval_current_page_helper(temp_dom);
					});
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
/* */
	});
}

document.addEventListener('DOMContentLoaded', function () {
  $('button#reload-button').click(eval_current_page);
});