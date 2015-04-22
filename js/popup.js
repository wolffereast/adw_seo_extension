
//define some global variables... we will want all the locations here
var tracking_functions = [], method_calls = [], methods = [], function_calls = [], function_callers = [];
var ADW_GLOBALS = new Object
ADW_GLOBALS = {
  num_scripts : 0,
  num_executed : 0,
  scripts_content : [],
  inline_calls : [],
  onclicks : {},
  selector_to_function : {},
  account_num : '',
  quotations : /((["'])(?:(?:\\\\)|\\\2|(?!\\\2)\\|(?!\2).|[\n\r])*\2)/,//contains 2 capturing
  multiline_comment : /(\/\*(?:(?!\*\/).|[\n\r])*\*\/)/,//contains 1 capturing
  single_line_comment : /(\/\/[^\n\r]*(?:[\n\r]+|$))/,// contains 1 capturing
  regex_literal : /(?:\/(?:(?:(?!\\*\/).)|\\\\|\\\/|[^\\]\[(?:\\\\|\\\]|[^]])+\])+\/)/,
  html_comments : /(<!--(?:(?!-->).)*-->)/,//contains 1 capturing
  tracking_type : false, //options: false for no tracking, asynch, or universal
  caller : '', //this will hold the object or function name - traditionally _gaq for asynch and gs for univ
}
ADW_GLOBALS.regex_of_doom = new RegExp(
  '(?:' + ADW_GLOBALS.quotations.source + '|' + //1 and 2
  ADW_GLOBALS.multiline_comment.source + '|' + //3
  ADW_GLOBALS.single_line_comment.source + '|' + //4
  '((?:=|:)\\s*' + ADW_GLOBALS.regex_literal.source + ')|(' + //5 and beginning of 6
  ADW_GLOBALS.regex_literal.source + '([gimy]?\\.(?:exec|test|match|search|replace|split))\\(' + ')|(' + //end 6, 7, begin 8
  '(\\.(?:exec|test|match|search|replace|split))\\(' + ADW_GLOBALS.regex_literal.source + '[gimy]?)|' + //end 8, 9
  ADW_GLOBALS.html_comments.source + ')' , 'g'//10
);

//class ish
//this is used by the check for ua inclusions function to return stripped code and found functions
var UaRetvalWrapper = function(strippedCode, foundFunctions){
  this.strippedCode = strippedCode;
  this.foundFunctions = foundFunctions;
}

/*
 * helper function to print statuses in a pretty manner (to clarify: manner being a behavior, not manor: a large house)
 */
function status_print(content, message_type){
  var to_output = '', i,
      pre = document.createElement('pre'),
      div = document.createElement("div");

  add_link = typeof add_link != "undefined" ? add_link : false;

  if( Object.prototype.toString.call( content ) === '[object Array]' ) {
    for (i = 0; i < content.length; i++){
      to_output = to_output + content[i] + "\n";
    }
  }
  else if ( Object.prototype.toString.call( content ) === '[object Object]' ) {
    $.each(content, function(index, value){
      to_output = to_output + index + "\n  " + value + "</div>";
    });
  }
  else to_output = content

  message_type = message_type || 'status';
  div.setAttribute('class','message ' + message_type);
  jQuery(pre).html(to_output);
  div.appendChild(pre);
  document.getElementsByTagName('h2')[0].parentNode.appendChild(div);
}

/*
 * helper function to find the end of a parenthesis
 */
function match_parens(code_to_test, level, opening, closing){
  var sub_match, matched;
  return code_to_test.replace(new RegExp('^([^'+opening+closing+']*(['+opening+closing+']))[\\s\\S]*$'), function(full_match, matched, $2, offset, original){
/* * /
    status_print('full_match: '+full_match);
    status_print('level: '+level);
    status_print('matched = ' + matched)
    status_print('$2 = ' + $2)
/* */
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

function scrollto_element(target, index) {
  chrome.tabs.getSelected(null, function(tab){
    chrome.tabs.sendMessage(tab.id, {origin: "seo_script", method: "scrollTo", target: target, index: index, windowHeight: jQuery(window).height()}, function(response){
      if (response.status == "invisible"){
        jQuery('input[data-selector="' + response.target + '"][data-index="' + response.index + '"]').after('<div class="error inline">Element is not currently Visible</div>');
        setTimeout(function(){
          jQuery('input[data-selector="' + response.target + '"][data-index="' + response.index + '"]').siblings('.error.inline').animate({opacity : 0}, 300, "linear", function(){
            jQuery('input[data-selector="' + response.target + '"][data-index="' + response.index + '"]').siblings('.error.inline').remove();
          });
        }, 500);
      }
    });
  });
}

function tag_element(target, newClass) {
  chrome.tabs.getSelected(null, function(tab){
    chrome.tabs.sendMessage(tab.id, {origin: "seo_script", method: "tagClass", target: target, newClass: newClass});
  });
}


/*
 * function to look for function calls
 */
function check_for_function_inclusions(function_title){
  var trimmed_code, num_events, num_funcs, code_to_replace, sub_code_to_replace, i, j, temp_function_regex, temp_selector;

  temp_function_regex = new RegExp(function_title+'\\s*\\([^()]*(.)', 'g')
  ////status_print(temp_function_regex.source)

  if (jQuery('.print_functions:checked').length) status_print('looking for ' + function_title)
  //first try at this?  lets grab all the event handlers
  $.each(ADW_GLOBALS.scripts_content, function(){
    trimmed_code = this;
    //check if the function exists
    num_events = trimmed_code.match(temp_function_regex);
    //if it does get the number of event handlers
    if (num_events){
      num_events = trimmed_code.match(/(?:jQuery|\$)\(([^)]*)\)\.click\(\s*function\s*\([^)]*\)\s*[\n\r]*{[^{}]*(.)(?:\);)?/g);
      if (num_events) num_events = num_events.length
      else num_events = 0;
    }
    else num_events = 0;

    //grab and test all the event handlers
    for (i=0; i < num_events; i++){
      /////status_print(trimmed_code);
      trimmed_code.replace(/(?:jQuery|\$)\(([^)]*)\)\.click\(\s*function\s*\([^)]*\)\s*[\n\r]*{/,function($match, $1, offset, original){
        //level 1, only the opening { has been matched, we want to close the .click, so matching the )
        /////status_print('original match: '+$match)
        /////status_print('arg sent to match parens: '+ original.substr(offset+$match.length));
        code_to_replace = $match + match_parens(original.substr(offset+$match.length), 1, '(', ')');
        /////status_print('CODE TO REPLACE: '+code_to_replace);
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
          //level 2, as we just matched the second opening
          if ($1 == '(')sub_code_to_replace = $match + match_parens(original.substr(offset+$match.length), 2, '(', ')');
          else sub_code_to_replace = $match
          return $match;
        });
        code_to_replace.replace(sub_code_to_replace, '');
        //split the selector and populate the global array with the funciton calls
        $(temp_selector.split(',')).each(function(){
          if (typeof ADW_GLOBALS.selector_to_function[this] == "undefined"){
            ADW_GLOBALS.selector_to_function[this.substr(1,this.length - 2)] = [sub_code_to_replace];
            tag_element(this.substr(1,this.length - 2), 'seo_extension_target function_tracking');
          }
          else ADW_GLOBALS.selector_to_function[this].push(sub_code_to_replace)
        });
      }
    }
  });
}

function find_inline_handlers(code_to_test, tracking_regex){
/* * /
  var component_array = [], handler, parts, part, method_object, i, j,
      function_regex = /^([a-zA-Z0-9\s_.-]+)\([^)]*\)$/,
      method_regex = /^.*\.([^.]*)$/;
/* */
  var num_calls = 0, i=0, code_to_replace = '';
  //if there are no matches
  if (code_to_test.match(tracking_regex) == null){
    status_print('no matches');
    return false;
  }

  num_calls = code_to_test.match(tracking_regex).length;
  for (i=0;i<num_calls; i++){
    code_to_replace = '';
    code_to_test.replace(tracking_regex, function($match, offset, original){
      //level 1, as we only have the opening paren so far
      code_to_replace = $match + match_parens(original.substr(offset+$match.length), 1, '(', ')');
      return $match;
    });
    //shouldnt need this condition, apparently I am getting antsy
    if (code_to_replace != ''){
      ADW_GLOBALS.inline_calls.push(code_to_replace);
      code_to_test = code_to_test.replace(code_to_replace, '');
    }
  }
  return true;
}

function find_onclick_handlers(dom_object, tracking_regex){
  var handler, selector;

  $('[onclick]', dom_object).each(function(){
    handler = $(this).attr('onclick');
    selector = find_path(this, dom_object, 'temp-dom-wrapper');

    ////status_print("Handler: " + handler + " -- tracking_regex: " + tracking_regex);

    while(handler.match(tracking_regex) !== null){
      code_to_replace = '';
      handler.replace(tracking_regex, function($match, offset, original){
        //level 1, as we only have the opening paren so far
        code_to_replace = $match + match_parens(original.substr(offset+$match.length), 1, '(', ')');
        return $match;
      });
      //shouldnt need this condition, apparently I am getting antsy
      if (code_to_replace != ''){
        if (typeof ADW_GLOBALS.onclicks[selector] == "undefined"){
          ADW_GLOBALS.onclicks[selector] = [];
          //tag the target with a border
          tag_element(selector, 'seo_extension_target onclick_tracking');
        }
        ADW_GLOBALS.onclicks[selector].push(code_to_replace);
        //ADW_GLOBALS.inline_calls.push(code_to_replace);
        handler = handler.replace(code_to_replace, '');
      }
    }
  });//end jquery onclick selector
}

/*
 * function to look for inclusion of ua within a script or function
 *
 * code_to_test is the trimmed contents of an inline or included script
 */
function check_for_ua_inclusions(code_to_test, tracking_regex){
  var has_target, matching = true, matched_code = [], code_to_replace, i, array_length, trimmed_code = code_to_test, matched_funcs = [], retVal;

  //the fun part - check for functions, test them for tracking, then remove them from the text
  //find the number of functions to look for
  array_length = code_to_test.match(/function\s*([^\s(]+)\s*\([^)]+\)\s*[\n\r]?\s*{[^{}]*([{}])/g);
  if (array_length) array_length = array_length.length
  else array_length = 0;

  for (i=0; i < array_length; i++){
    trimmed_code.replace(/function\s*([^\s(]+)\s*\([^)]+\)\s*[\n\r]?\s*{[^{}]*([{}])/,function($match, $1, $2, offset, original){
      //level 2, as we just matched the second opening
      if ($2 == '{')code_to_replace = $match + match_parens(original.substr(offset+$match.length), 2, '{', '}');
      else code_to_replace = $match
      //great, we have the full function, now does it contain the regex?
      ////status_print(code_to_replace)
      ////status_print(tracking_regex)

      if (code_to_replace.match(tracking_regex)){
        ////status_print("matched " + code_to_replace)
        matched_funcs.push($1);
        /////status_print($match)
        /////status_print($1)
      }
      return $match;
    });
    trimmed_code = trimmed_code.replace(code_to_replace, '');
  }

  //all functions removed, any remaining tracking is inline
  //check for remaining inlines here
  retVal = new UaRetvalWrapper(trimmed_code, matched_funcs);
  return retVal;
}

function get_external_script(external_url, f){
  f = (typeof f != "undefined") ? f : false;
  //this is a script file, have the tab request the script for us
  chrome.tabs.getSelected(null, function(tab){
    //sendMessage(integer tabId, any message, function responseCallback)
    chrome.tabs.sendMessage(tab.id, {origin: "seo_script", method: "getScript", url: external_url}, function(response) {
      if(response.method=="returnScript"){
        parse_script(response.data, f);
      }
      else{
        //even if it is a bad request, it has been parsed...
        ADW_GLOBALS.num_executed += 1;
        status_print('returned an error: '+response.data);
      }
    });
  });
}

/*
 * function to trim unwanted items out of the script (comments, regex literals, Quoted items)
 * find the tracking code
 * takes code snippets (from internals directly or files via the get_external_script call)
 */
function parse_script(code_to_test, f){
  var xmlhttp, results,
      //removed the following from the univ_regex to allow for differing arguments
      //,\s*{?(['"])[a-zA-Z0-9]+\5\s*}?\)
      univ_regex = /([$_a-zA-Z][$_a-zA-Z0-9]*)\s*\((['"])create\2\s*,\s*(['"])(UA-[0-9]+-[0-9])+\3\s*/i,
      asynch_regex = /([$_a-zA-Z][$_a-zA-Z0-9]*)\.push\(\[(["'])_setAccount\2\s*,\s*(['"])(.*?)\3/i;

  f = (typeof f != "undefined") ? f : false;

  //pull on those regex boots, its stompy time!
  //check for the UA code, need to test both asynch and universal
  results = code_to_test.match(asynch_regex);
  if ($(results).length) ADW_GLOBALS.tracking_type = 'asynch';
  else{
    results = code_to_test.match(univ_regex);
    if ($(results).length) ADW_GLOBALS.tracking_type = 'universal';
  }
  //if we had results in either, print it out here
  if ($(results).length){
    //both regexes match these positions - convenient
    ADW_GLOBALS.account_num = results[4];
    ADW_GLOBALS.caller = results[1];
    status_print('Tracking Type: '+ADW_GLOBALS.tracking_type+"\n"+'Account Number: '+ADW_GLOBALS.account_num);
  }

  /////status_print(ADW_GLOBALS.regex_of_doom);
  /////status_print('before the regex of doom call.  calling it on '+"\n"+code_to_test)
  //strip the comments from the js.  we dont need no stinkin comments!
  /* */
  code_to_test = code_to_test.replace(ADW_GLOBALS.regex_of_doom, function($match, $1, $2, $3, $4, $5, $6, $7, $8, $9, $10, offset, original){
    if (typeof $1 != 'undefined') return $1;
    if (typeof $5 != 'undefined') return $match.replace($5,'');
    if (typeof $6 != 'undefined') return $match.replace($6,$7);
    if (typeof $8 != 'undefined') return $match.replace($8,$9);
    return '';
  });
  /* */
  /////status_print('after the regex of doom call.  resulting code:'+"\n"+code_to_test);

  //add all the scripts to the scripts array, we will need ot check them for functions and binds
  ADW_GLOBALS.scripts_content.push(code_to_test);

  ADW_GLOBALS.num_executed += 1;
  /////status_print('num executed: '+ADW_GLOBALS.num_executed+' num scripts total = '+ADW_GLOBALS.num_scripts+' the type of f is '+typeof f);
  if (ADW_GLOBALS.num_executed == ADW_GLOBALS.num_scripts && typeof f == 'function') f.call();
}

/*
 * function to find all of the scripts on the page
 * pulls inline and internal scripts directly
 * ignores externals ... for now
 *
 * calls parse_script on each script found
 *
 * @todo parse external scripts as well
 */
function find_scripts(temp_dom, current_url, f){
  //status_print('beginning of the find scripts function');
  var host, rude_host, host_regex, url_to_curl, arg, external, current_src, code_to_test, incremented;

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
    arg = false;
    external = false;
    incremented = false;
    //inline scripts
    if (typeof($(this).attr('src')) === 'undefined'){
      ////status_print('internal script '+$(this).text()+' is onsite and parsable');
      parse_script($(this).text(), f);
      incremented = true;
    }
    else if($(this).attr('src').indexOf('chrome-extension://') == -1){
      //all of these options require ajax
      external = true;

      current_src = $(this).attr('src');
      //internals
      if (current_src.match(host_regex)){
        arg = current_src;
      }
      else if (!current_src.match(/^(http|\/\/)/i)){
        //doesnt have the protocal or host, append them!
        if (current_src.match(/^\//)){
          //this is from the root
          arg = current_url.replace(/(https?:\/\/[^\/]*)\/.*$/, function(match, $1, offset, original){return $1})+current_src;
        }
        else{
          //first, remove the friggin starting./
          current_src = current_src.replace(/^\.\//,'');
          //now, this is the host and the path without host
          arg = current_url.replace(/\/[^\/]*$/,'/')+current_src;
        }
      }

      if (arg != false){
        //if the arg has been set, get the script contents
        //get external script calls parse script on the returned contents
        get_external_script(arg, f);
        incremented = true;
      }
    }
    //this keeps the count correct
    if (!incremented) ADW_GLOBALS.num_executed += 1;
  });//end of .each
}

function build_function_calls(temp_dom, function_object){
  var returnVal = '<h3>Function Calls</h3>',
      i;

  $.each(function_object, function(index, value){
    returnVal = returnVal + '<div class="selector_wrapper"><div class="selector">' + index + '</div><span class="iconWrapper"><span class="icon"></span></span><div class="scrollToWrapper">';
    for (i=0; i<jQuery(index, temp_dom).length; i++){
      returnVal = returnVal + '<input type="button" class="scrollTo" value="Scroll to Element ' + (i + 1) + '" data-selector="' + index + '" data-index="' + i + '">';
    }
    returnVal = returnVal + '</div><div class="functionCall">' + value + '</div>' + '</div>';
  });

  return returnVal;
}

function toggle_inputs(target){
  var toggleTarget = jQuery(target).parent('.iconWrapper').siblings('.scrollToWrapper');
  jQuery(toggleTarget).stop(true, true);
  if (jQuery(toggleTarget).hasClass('open')){
    jQuery(toggleTarget).removeClass('open');
    jQuery(toggleTarget).hide(400);
  }
  else{
    jQuery(toggleTarget).addClass('open');
    jQuery(toggleTarget).show(400);
  }
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
  var i, tracking_regex, temp_content, retVal, matched_functions = [],current_function, inner_current_function;
  /////status_print('in the eval current page helper');

  //split based on call type
  if (ADW_GLOBALS.tracking_type == 'asynch'){
    tracking_regex = new RegExp(ADW_GLOBALS.caller+/\.push\(/.source, 'g');
  }
  else if(ADW_GLOBALS.tracking_type == 'universal'){
    tracking_regex = new RegExp(ADW_GLOBALS.caller+/\s*\(/.source, 'g');
  }

  //grab all the inline handlers
  //find_inline_handlers(temp_dom);
  //parse the scripts
  $.each(ADW_GLOBALS.scripts_content, function(){
    /////console.log(this.toString());
    retVal = check_for_ua_inclusions(this.toString(), tracking_regex);

    matched_functions = matched_functions.concat(retVal.foundFunctions);

    //moved the find_inline_handlers function here
    if (retVal.strippedCode.match(tracking_regex)){
      find_inline_handlers(retVal.strippedCode, tracking_regex);
    }
  });

  //check the dom for onclicks
  find_onclick_handlers(temp_dom, tracking_regex)

  //parse em again, but this time look for the functions
  if (matched_functions.length){
    //first, check if there are any functions that call the function - recursion ftw!
    var checked = [];
    var to_check = matched_functions;

    while (to_check.length){
      current_function = to_check.pop();
      //add the most recent function to the checked array
      checked.push(current_function);

      ////status_print('checking ' + current_function);

      temp_function_regex = new RegExp(current_function+'\\s*\\([^()]*', 'g')
      ////status_print(temp_function_regex.source);
      ////status_print('number of scripts: ' + ADW_GLOBALS.scripts_content.length)

      $.each(ADW_GLOBALS.scripts_content, function(){
        retVal = check_for_ua_inclusions(this.toString(), temp_function_regex);
        while(retVal.foundFunctions.length){
          inner_current_function= retVal.foundFunctions.pop();
          //if it isnt in checked or to_check add it to to_check
          if (checked.indexOf(inner_current_function) == -1 && to_check.indexOf(inner_current_function) == -1){
            ////status_print('found ' + inner_current_function + '. adding it to to_check');
            to_check.push(inner_current_function);
          }
        }

        //check for inline usage
        if (retVal.strippedCode.match(temp_function_regex)){
          ////status_print(retVal.strippedCode)
          find_inline_handlers(retVal.strippedCode, temp_function_regex);
        }
      });
    }

    matched_functions = checked;

    $.each(matched_functions, function(){
      check_for_function_inclusions(this);
      //also need to check if the functions are in an onclick
      temp_function_regex = new RegExp(this+'\\s*\\([^()]*', 'g')

      find_onclick_handlers(temp_dom, temp_function_regex)
    });
  }
  $.each(ADW_GLOBALS.selector_to_function, function(index, value){
    if (!$(index, temp_dom).length)delete ADW_GLOBALS.selector_to_function[index]
  });

  //function calls print
  ADW_GLOBALS.selector_to_function = clean_array('', ADW_GLOBALS.selector_to_function);
  if (!jQuery.isEmptyObject(ADW_GLOBALS.selector_to_function)){
    temp_content = build_function_calls(temp_dom, ADW_GLOBALS.selector_to_function);
    status_print(temp_content, 'status');

    jQuery('input.scrollTo').click(function(){
      scrollto_element(jQuery(this).attr('data-selector'), (typeof jQuery(this).attr('data-index') != "undefined" ? jQuery(this).attr('data-index') : 0));
    });
    jQuery('span.icon').click(function(){toggle_inputs(this);});
  }
  else status_print('No function calls with tracking found', 'warning')

  //onclick prints
  if (!jQuery.isEmptyObject(ADW_GLOBALS.onclicks)){
    tempVal = "Inline Onclick Handlers\r\n";
    for (var key in ADW_GLOBALS.onclicks){
      if (ADW_GLOBALS.onclicks.hasOwnProperty(key)) {
        tempVal += key + "\r\n";
        for (var i = 0; i < jQuery(ADW_GLOBALS.onclicks[key]).length; i++){
          tempVal += "&nbsp;&nbsp" + ADW_GLOBALS.onclicks[key][i] + "\r\n";
        }
      }
    }

    status_print(tempVal);
  }
  else status_print('No onclick handlers with tracking found', 'warning')

  //inline items print
  ADW_GLOBALS.inline_calls = clean_array('', ADW_GLOBALS.inline_calls);
  if (ADW_GLOBALS.inline_calls.length != 0)status_print(['Inline Calls'].concat(ADW_GLOBALS.inline_calls));
  status_print('Testing Complete', 'warning')
}

function clean_array(delete_value, array_to_parse){
  var i;
  for (i = 0; i < array_to_parse.length; i++) {
    if (array_to_parse[i] == '') {
      array_to_parse.splice(i, 1);
      i--;
    }
  }
  return array_to_parse;
}

/*
 * Finds the current chrome tab
 * Adds http auth if it is set
 * cURLs in the info from the tab
 *
 * calls find_scripts
 *   callback of eval_current_page_helper
 */
function eval_current_page() {
  var tab_url, xmlhttp, temp_dom;
  chrome.tabs.getSelected(null, function(tab){
    chrome.tabs.sendMessage(tab.id, {origin: "seo_script", method: "getDocument"}, function(response) {
      if(typeof response != "undefined" && typeof response.method != "undefined" && response.method=="returnDocument"){
        temp_dom = document.createElement('div');
        $(temp_dom).attr('id', 'temp-dom-wrapper');
        temp_dom.innerHTML = response.data;

        find_scripts(temp_dom, tab.url, function(){
          //no need to evaluate further if no tracking code is found
          if (ADW_GLOBALS.account_num != '')eval_current_page_helper(temp_dom);
          else status_print('No tracking found', 'error');
        });
      }
    });
  });
}

document.addEventListener('DOMContentLoaded', function () {
  $('button#reload-button').click(eval_current_page);
});