// ==UserScript==
// @name         Github PR Incremental Diffs
// @namespace    http://tampermonkey.net/
// @version      0.15
// @description  Provides you incremental diffs with the help of jenkins
// @author       Mathias L. Baumann
// @match        *://github.com/*
// @grant       GM_getValue
// @grant       GM_setValue
// @grant       GM_addStyle
// @grant       GM_getResourceText
// @grant       GM_xmlhttpRequest
// @require     https://raw.githubusercontent.com/cemerick/jsdifflib/master/difflib.js
// @require     https://raw.githubusercontent.com/cemerick/jsdifflib/master/diffview.js
// @resource    CSSDIFF https://raw.githubusercontent.com/cemerick/jsdifflib/master/diffview.css
// ==/UserScript==


class Fetcher
{
    constructor ( )
    {
        this.files = [];
        this.base_done = false;
        this.update_done = false;
    }

    start ( owner, repo, commit1, commit2, element )
    {
        this.sha_base = commit1;
        this.sha_update = commit2;
        this.owner = owner;
        this.repo = repo;
        this.element = element;
        this.files = [];

        this.usertoken = GM_getValue("username") + ":" + GM_getValue("token");

        this.fetchCommit(this.sha_update, "update");
    }

    checkDone ( )
    {
        for (var i = 0; i<this.files.length; i++)
        {
            var file = this.files[i];

            if (file.base === undefined)
                return;

            if (file.update === undefined)
                return;
        }

        this.diffUsingJS(0);
        console.log("all done, creating diff");
    }


    fetchFile ( commit, file, type )
    {
        console.log("Fetching file " + file + " from " + commit);

        function receiveFile ( )
        {
            var found = false;

            var response = JSON.parse(this.responseText);

            for (var i = 0; i < this.outside.files.length; i++)
            {
                if (this.outside.files[i].name == this.myPath)
                {
                    var content;

                    if (this.status == 200 && response.content && response.content.length > 0)
                    {
                        content = atob(response.content);
                    }
                    else
                        content = "";

                    if (type == "base")
                        this.outside.files[i].base = content;
                    else if (type == "update")
                        this.outside.files[i].update = content;

                    found = true;
                    break;
                }
            }

            this.outside.checkDone();
        }

        var request = new XMLHttpRequest();

        request.outside = this;
        request.onload = receiveFile;
        request.myPath = file;
        // Initialize a request
        request.open('get', "https://api.github.com/repos/"+this.owner+"/"+this.repo+"/contents/" + file + "?ref=" + commit);

        request.setRequestHeader("Authorization", "Basic " + btoa(this.usertoken));
        // Send it
        request.send();
    }

    fetchCommit ( commit, type )
    {
        function fetchCommitCb ()
        {
            if (this.status == 401)
            {
                GM_setValue("token", "");
                alert("Authentication error, please reenter your token!");
                askCredentials();
                return;
            }

            var response = JSON.parse(this.responseText);

            console.log(response);

            if (type=="update") for (var i = 0; i < response.files.length; i++)
            {
                var file = new Object;
                file.name = response.files[i].filename;

                this.outside.files.push(file);
            }

            for (var i = 0; i < this.outside.files.length; i++)
                this.outside.fetchFile(response.sha, this.outside.files[i].name, type);

            if (type=="update")
                this.outside.fetchCommit(this.outside.sha_base, "base");
        }

        // Create a new request object
        var request = new XMLHttpRequest();

        request.outside = this;
        request.onload = fetchCommitCb;
        // Initialize a request
        request.open('get', 'https://api.github.com/repos/'+this.owner+'/'+this.repo+'/commits/' + commit);
        request.setRequestHeader("Authorization", "Basic " + btoa(this.usertoken));

        // Send it
        request.send();
    }

    makeShaLink ( sha, name )
    {
        var link = document.createElement("A");
        link.href = "https://github.com/" +
            this.owner + "/" +
            this.repo + "/commit/" +
            sha;
        link.innerText = name;

        return link;
    }

    diffUsingJS ( viewType, reset )
    {
        "use strict";

        var contents = this.element.getElementsByClassName("file");
        var content = contents[0];
        content.innerHTML = "";
        content.style.backgroundColor = "white";
        content.style.textAlign = "center";

        for (var i = 0; i < this.files.length; i++)
        {
            if (this.files[i].base == this.files[i].update)
                continue;

            var base = difflib.stringAsLines(this.files[i].base),
                newtxt = difflib.stringAsLines(this.files[i].update),
                sm = new difflib.SequenceMatcher(base, newtxt),
                opcodes = sm.get_opcodes(),
                contextSize = 5; //byId("contextSize").value;

            var filename = document.createElement("DIV");
            filename.className = "file-header";
            filename.innerText = this.files[i].name;

            content.appendChild(filename);
            contextSize = contextSize || null;

            var diff = diffview.buildView({
                baseTextLines: base,
                newTextLines: newtxt,
                opcodes: opcodes,
                baseTextName: "Old",
                newTextName: "New",
                contextSize: contextSize,
                viewType: viewType
            });

            diff.className = diff.className + " blob-wrapper";
            diff.style.margin = "auto";
            diff.style.textAlign = "left";
            content.appendChild(diff);
        }

        var pos = content.getBoundingClientRect();

        content.style.left = "" + (-pos.left + 15) + "px";
        content.style.width = "" + (document.documentElement.clientWidth - 30) + "px";
    }
}

var fetcher = new Fetcher();



function deleteYourself ( ) { this.outerHTML = ""; }

// Renders a box with user/token fields and button to ask for credentials
function askCredentials ( )
{
    if(document.getElementById("github-credentials-box"))
        return;
    
    console.log("Asking credentials");
    
    var box = document.createElement("DIV");
    box.style.backgroundColor = "white";
    box.style.position = "fixed";
    box.style.border = "solid black 2px";
    box.style.zIndex = 999999;
    box.style.left = "40%";
    box.style.top = "40%";
    box.style.padding = "20px";
    box.id = "github-credentials-box";

    var textfield_user = document.createElement("INPUT");
    var textfield_token = document.createElement("INPUT");
    var textfield_jenkins = document.createElement("INPUT");

    textfield_user.type = "text";
    
    var user = GM_getValue("username");
    if (!user)
        user = "Username";
    
    textfield_user.value = user;
    textfield_user.id = "github-user";

    var token = GM_getValue("token");
    if (!token)
        token = "Github Token";
    
    textfield_token.type = "text";
    textfield_token.value = token;
    textfield_token.id = "github-token";
  
    var url = GM_getValue("jenkins");
    if (!url)
        url = "Jenkins Base URL";
  
    textfield_jenkins.type = "text";
    textfield_jenkins.value = url;
    textfield_jenkins.id = "jenkins-url";
    
    var note = document.createElement("P");
    note.href = "https://github.com/settings/tokens";
    note.innerHTML = "The token required here can be created at <a href=\"https://github.com/settings/tokens\">your settings page</a>.<br>Required scope is 'repo'.";
  
    var button = document.createElement("BUTTON");
    button.className = "btn";
    button.innerText = "Save";
    button.style.margin = "5px";
    button.onclick = saveCredentials;

    box.appendChild(textfield_user);
    box.appendChild(textfield_token);
    box.appendChild(document.createElement("BR"));
    box.appendChild(textfield_jenkins);
    box.appendChild(button);
    box.appendChild(note);

    document.body.appendChild(box);
}

// saves the credentials and removes the box and the button
function saveCredentials ( )
{
    var user = document.getElementById("github-user");
    var token = document.getElementById("github-token");
    var jenkins = document.getElementById("jenkins-url");

    jenkins = jenkins.value.trim();

    if (jenkins.substr(-1, 1) != "/")
        jenkins = jenkins + "/";

    GM_setValue("username", user.value.trim());
    GM_setValue("token", token.value.trim());
    GM_setValue("jenkins", jenkins);

    var box = document.getElementById("github-credentials-box");
    box.outerHTML = "";

    fetchUpdates();
}

function getTimeline ( )
{
    var timeline;
    var timeline_content;

    for (var i=0; i<discussion_bucket.children.length; i++)
        if (discussion_bucket.children[i].classname == "discussion-sidebar")
            continue;
        else
            timeline = discussion_bucket.children[i];

    for (i=0; i < timeline.children.length; i++)
        if (timeline.children[i].className == "discussion-timeline-actions")
            continue;
        else
            timeline_content = timeline.children[0];

    return timeline_content;
}


function getTimelineItems ( times_only, type )
{
    var timeline_content = getTimeline();

    // Walks up the parent chain until the direct parent is timeline_content
    var findTopMostChild = function ( child )
    {
        var my_child = child;

        while (my_child.parentElement != timeline_content)
            my_child = my_child.parentElement;

        return my_child;
    };

    var times = timeline_content.getElementsByTagName("relative-time");

    var return_array = [];
    var last;
    var last_was_review = false;

    for (var o=0; o < times.length; o++)
    {
        var topmost = findTopMostChild(times[o]);

        if (topmost == last)
            continue;

        if (type == "review")
        {
            // Only review tags have this class
            var is_review = /discussion-item-review/g.test(topmost.className);


            if (!is_review)
            {
                last_was_review = false;
                continue;
            }
        }
        else if (type == "comment")
        {
            // Only comments have this class
            if (!/timeline-comment-wrapper/g.test(topmost.className))
                continue;
        }

        if (times_only)
        {
            var date = times[o].getAttribute("datetime");
            var parsed_date = Date.parse(date);

            // Collaps reviews that directly follow each other into one
            if (last_was_review)
                return_array[return_array.length-1] = parsed_date;
            else
                return_array.push(parsed_date);
        }
        else
        {
            // Collaps reviews that directly follow each other into one
            if (last_was_review)
                return_array[return_array.length-1] = topmost;
            else
                return_array.push(topmost);
        }

        last = topmost;
        last_was_review = true;
    }

    return return_array;
}

function makeTimelineEntry ( time, text, action, id )
{
    console.log("Creating entry " + text + " " + id);

    var timeline_content = getTimeline();

    // Walks up the parent chain until the direct parent is timeline_content
    var findTopMostChild = function ( child )
    {
        var my_child = child;

        while (my_child.parentElement != timeline_content)
            my_child = my_child.parentElement;

        return my_child;
    };

    var times = timeline_content.getElementsByTagName("relative-time");

    var insert_before;

    // Find the right place in the timeline to insert
    for (var o=0; o < times.length; o++)
    {
        var date = times[o].getAttribute("datetime");

        // Ignore review discussion timestamps
        if (/discussion/.test(times[o].parentElement.getAttribute("href")))
            continue;

        if (Date.parse(date) > time)
        {
            insert_before = findTopMostChild(times[o]);
            break;
        }
    }

    // Construct item to insert
    var timeline_item = document.createElement("DIV");
    timeline_item.className = "discussion-item-header discussion-item";

    // Copied from github src code for push icon
    timeline_item.innerHTML = '<span class="discussion-item-icon"><svg aria-hidden="true" class="octicon octicon-repo-push" height="16" version="1.1" viewBox="0 0 12 16" width="12"><path fill-rule="evenodd" d="M4 3H3V2h1v1zM3 5h1V4H3v1zm4 0L4 9h2v7h2V9h2L7 5zm4-5H1C.45 0 0 .45 0 1v12c0 .55.45 1 1 1h4v-1H1v-2h4v-1H2V1h9.02L11 10H9v1h2v2H9v1h2c.55 0 1-.45 1-1V1c0-.55-.45-1-1-1z"></path></svg></span>';
    timeline_item.id = id;
    timeline_item.appendChild(document.createTextNode(text));

    var link = document.createElement("A");

    link.className = "btn btn-sm btn-outline";
    //link.appendChild(document.createTextNode(text));
    link.innerText = "View changes";
    link.onclick = function () { action(this); return false; };
    link.href = "#";

    timeline_item.appendChild(link);

    timeline_content.insertBefore(timeline_item, insert_before);
}

// Creates a button in the github sidebar in PRs
function makeButton ( text, action, id )
{
    var sidebar = document.getElementById("github-incremental-diffs-sidebar-item");

    var buttondiv = document.createElement("DIV");
    buttondiv.id = id;

    var button = document.createElement("A");

    button.appendChild(document.createTextNode(text));
    button.onclick = function () { action(); return false; };
    button.href = "#";

    buttondiv.appendChild(button);
    sidebar.appendChild(buttondiv);
}

// Fetches the sha heads from jenkins
function fetchUpdates ( )
{
    var urlsplit = document.URL.split("/");
    var owner = urlsplit[3];
    var repo  = urlsplit[4];
    var prid_and_anker = urlsplit[6].split("#");

    var prid = prid_and_anker[0];

    var jenkins = GM_getValue("jenkins");

    var url = jenkins+owner+'/'+repo+'/' + prid + "?cachebust=" + new Date().getTime();

    console.log("Fetching updates from " + url);

    // Create a new request object
    GM_xmlhttpRequest({
        method: "GET",
        url: url,
        onload: function (response) {
            if (response.status == 200)
                drawButtons(response.responseText);
            else
                console.log("No pushes found at "+url+": " + response.status);
        }});
}

// Draws one button for each pair of shas in the \n separated list
function drawButtons ( shas )
{
    var sidebar = document.getElementsByClassName("discussion-sidebar")[0];

    if (sidebar.removeEventListener)
    {
        sidebar.removeEventListener ('DOMSubtreeModified', fetchDelayed);
    }

    var sha_list = shas.split("\n");

    var base, head, update;

    update = 1;

    function makeShowDiffFunc ( inner_base, inner_head )
    {
        var func = function ( item )
        {
            if (item.innerText == "Hide changes")
            {
                var elem = item.parentElement.getElementsByClassName("file")[0];
                elem.outerHTML = "";

                item.innerText = "View changes";
                return;
            }

            var cont = document.createElement("DIV");
            cont.className = "file";
            cont.innerHTML = "Loading...";
            cont.style.backgroundColor = "yellow";

            item.parentElement.appendChild(cont);

            var urlsplit = document.URL.split("/");
            var owner = urlsplit[3];
            var repo  = urlsplit[4];

            item.innerText = "Hide changes";
            
            console.log("pressed.. " + inner_base + " " + inner_head);
            fetcher.start(owner, repo, inner_base, inner_head, item.parentElement);
        };
        return func;
    }

    var pairs = [];

    // Build pairs of commits to create diff from
    for (var i = 0; i < sha_list.length; i++)
    {
        if (sha_list[i].length === 0)
            continue;

        var sha_data = sha_list[i].split(";");
        var sha = sha_data[0];
        var time;

        if (sha_data[1] !== undefined)
            time = new Date(parseInt(sha_data[1]) * 1000);

        if (base === undefined)
        {
            base = sha;
            continue;
        }

        head = sha;

        var pair = {};
        pair.base = base;
        pair.head = head;
        pair.time = time;

        pairs.push(pair);

        base = head;
    }

    console.log("Pairs: " + pairs.length + " last: " + head);
    
    // Next, merge the pairs between reviews/comments
    var timeline_items = getTimelineItems(true, "review");

    console.log("Found " + timeline_items.length + " items");

    var base_pair = null;

    var merged_pairs = [];
    var merged_pair = {};

    var timeline_it = 0;
    
    // Only try to merge pairs if more than one exists
    if (pairs.length > 1)
    {
        for (i=0; i < pairs.length; i++)
        {
                // Find the first review that is right before newer than our current 
                while (pairs[i].time.getTime() > timeline_items[timeline_it] &&
                       timeline_it+1 < timeline_items.length &&
                       pairs[i].time.getTime() > timeline_items[timeline_it+1])
                    timeline_it++;
            
                console.log("Comparing " + pairs[i].time + " > " + new Date(timeline_items[timeline_it]) + " " + i + " > " + timeline_it);
            
                if (pairs[i].time.getTime() > timeline_items[timeline_it])
                {
                    if (base_pair === null)
                    {
                        console.log("Set base at " + i);
                        base_pair = pairs[i];
                        timeline_it++;
                        continue;
                    }

                    console.log("Merging a pair");

                    // And use the pair one before that as head
                    var head_pair = pairs[i-1];

                    merged_pair = {};
                    merged_pair.base = base_pair.base;
                    merged_pair.head = head_pair.head;
                    merged_pair.time = head_pair.time;

                    merged_pairs.push(merged_pair);

                    base_pair = pairs[i];

                    timeline_it++;

                    if (timeline_it >= timeline_items.length)
                        break;

                    continue;
                }
        }

        // Merge any remaining pairs
        if (merged_pairs.length === 0 ||
            merged_pairs[merged_pairs.length-1].head != pairs[pairs.length-1].head)
        {
            merged_pair = {};
            merged_pair.base = base_pair.base;
            merged_pair.head = pairs[pairs.length-1].head;
            merged_pair.time = pairs[pairs.length-1].time;

            merged_pairs.push(merged_pair);
        }
    }
    else
    {
        merged_pairs = pairs;
    }

    console.log("Merged pairs: " + merged_pairs.length);
    
    for (i=0; i < merged_pairs.length; i++)
    {
        var it = merged_pairs[i];

        // Don't remake a button that already exists
        if (!document.getElementById("diffbutton-" + update))
        {
            var formatted_time = update;

            var addZero = function ( num )
            {
                if (num < 10)
                    num = "0" + num;

                return num;
            };

            if (it.time !== undefined)
                formatted_time = it.time.getDate() + "." +
                                 addZero((it.time.getMonth()+1)) + "." +
                                 it.time.getFullYear() + " " +
                                 addZero(it.time.getHours()) + ":" +
                                 addZero(it.time.getMinutes());

            makeTimelineEntry(it.time.getTime(), "Author pushed code changes at " + formatted_time, makeShowDiffFunc(it.base, it.head), "diffbutton-" + update);
        }

        update++;
    }

    if (sidebar.addEventListener)
    {
        sidebar.addEventListener ('DOMSubtreeModified', fetchDelayed, false);
    }
}

function fetchDelayed ( )
{
    // Don't fetch again if there are still diff buttons
    if (document.getElementById("diffbutton-1"))
    {
        return;
    }

    var sidebar = document.getElementsByClassName("discussion-sidebar")[0];
    sidebar.removeEventListener ('DOMSubtreeModified', fetchDelayed);
    setTimeout(fetchUpdates, 1000);
}

function render ( )
{
    'use strict';

    var need_setup = !GM_getValue("username") || !GM_getValue("token") || !GM_getValue("jenkins");

    var css_style = GM_getResourceText ("CSSDIFF");
    GM_addStyle (css_style);

    var sidebar = document.getElementById("partial-discussion-sidebar");

    var item = document.createElement("DIV");
    item.className = "discussion-sidebar-item";
    item.id = "github-incremental-diffs-sidebar-item";

    var header = document.createElement("H3");
    header.appendChild(document.createTextNode("Incremental Diffs Active"));
    header.ondblclick = askCredentials;

    header.className = "discussion-sidebar-heading";

    item.appendChild(header);

    sidebar.appendChild(item);

    // Add button to set up github API access
    if (need_setup)
    {
        makeButton("Setup Credentials", askCredentials, "credentials-button");

        console.log("Requesting user & token & jenkins");
        return;
    }

    fetchUpdates();
}


(function()
{
    var parts = document.URL.split("/");

    if (parts[5] == "pull")
        render();
    // This is required for this script to be run upon ajax load.. not sure why
    window.onbeforeunload = function()
    {
        console.log("window changed!");
    };
})();