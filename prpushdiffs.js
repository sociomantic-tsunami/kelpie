// ==UserScript==
// @name         Github PR Incremental Diffs
// @namespace    http://tampermonkey.net/
// @version      0.11
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

        var byId = function (id) { return document.getElementById(id); };

        var diffoutputdiv = this.element;

        diffoutputdiv.innerHTML = "";
        diffoutputdiv.style.backgroundColor = "white";
        diffoutputdiv.style.overflow = "auto";
        diffoutputdiv.style.maxHeight = "95%";
        diffoutputdiv.style.maxWidth = "95%";
        
        diffoutputdiv.appendChild(this.makeShaLink(this.sha_base, "old-head"));
        diffoutputdiv.appendChild(document.createTextNode(" ... "));
        diffoutputdiv.appendChild(this.makeShaLink(this.sha_update, "head"));
        diffoutputdiv.appendChild(document.createTextNode("   "));

        var exit_button = document.createElement("BUTTON");
        exit_button.innerText = "Close";
        exit_button.onclick = function() { diffoutputdiv.outerHTML = ""; };
        diffoutputdiv.appendChild(exit_button);

        var content = document.createElement("DIV");
        content.style.marginRight = "150px";

        
        for (var i = 0; i < this.files.length; i++)
        {
            if (this.files[i].base == this.files[i].update)
                continue;

            var base = difflib.stringAsLines(this.files[i].base),
                newtxt = difflib.stringAsLines(this.files[i].update),
                sm = new difflib.SequenceMatcher(base, newtxt),
                opcodes = sm.get_opcodes(),
                contextSize = 5; //byId("contextSize").value;

            var header = document.createElement("H4");
            header.innerHTML = this.files[i].name;

            diffoutputdiv.appendChild(header);
            contextSize = contextSize || null;

            content.appendChild(diffview.buildView({
                baseTextLines: base,
                newTextLines: newtxt,
                opcodes: opcodes,
                baseTextName: "Base",
                newTextName: "New",
                contextSize: contextSize,
                viewType: viewType
            }));
        }
        
        
        diffoutputdiv.appendChild(content);
   
        if (content.children.length == 0)
            return;
        
        var original = document.getElementById("github-incremental-diffs-sidebar-item");
     
        var sidelinks = original.cloneNode(true);

        for (var i=0; i < original.children.length; i++)
        {
            sidelinks.children[i].lastChild.onclick = original.children[i].lastChild.onclick;
        }
        
        var computed = window.getComputedStyle(diffoutputdiv);
        
        sidelinks.id = "temp-links";
        sidelinks.style.right = computed.right; //"0px";
        sidelinks.style.marginRight = "15px";
        sidelinks.style.top   = computed.top;
        sidelinks.style.width = "150px";
        sidelinks.style.position = "fixed";
        
        diffoutputdiv.appendChild(sidelinks);
        
        
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
    var prid  = urlsplit[6];

    var jenkins = GM_getValue("jenkins");

    var url = jenkins+owner+'/'+repo+'/' + prid + "?cachebust=" + Date.now();

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

    function makeShowDiffFunc ( )
    {
        var inner_base = base;
        var inner_head = head;

        var func = function()
        {
            var divdiff;

            var byId = document.getElementById("diff-div");

            if (byId === null)
            {
                divdiff = document.createElement("DIV");
                divdiff.style.backgroundColor = "yellow";
                divdiff.style.position = "fixed";
                divdiff.style.border = "solid black 2px";
                divdiff.style.zIndex = 999999;
                divdiff.style.left = "10px";
                divdiff.style.top = "10px";
                divdiff.style.padding = "20px";

                divdiff.id = "diff-div";
                divdiff.innerHTML = "Loading...";

                document.body.appendChild(divdiff);
            }
            else
            {
                divdiff = byId;
                divdiff.innerHTML = "Loading...";
                divdiff.style.backgroundColor = "yellow";
            }

            var urlsplit = document.URL.split("/");
            var owner = urlsplit[3];
            var repo  = urlsplit[4];

            console.log("pressed.. " + inner_base + " " + inner_head);
            fetcher.start(owner, repo, inner_base, inner_head, divdiff);

        };
        return func;
    }

    for (var i = 0; i < sha_list.length; i++)
    {
        if (sha_list[i].length == 0)
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

        // Don't remake a button that already exists
        if (!document.getElementById("diffbutton-" + update))
        {
            var formatted_time = update;

            if (time !== undefined)
                formatted_time = time.getDate() + "." +
                                 (time.getMonth()+1) + "." +
                                 time.getFullYear() + " " +
                                 time.getHours() + ":" +
                                 time.getMinutes();

            makeButton("Update at " + formatted_time, makeShowDiffFunc(), "diffbutton-" + update);
        }

        update++;
        base = undefined;
        head = undefined;
        i--;
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
    header.appendChild(document.createTextNode("Incremental Diffs"));
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