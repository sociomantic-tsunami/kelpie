// ==UserScript==
// @name         Github PR Incremental Diffs
// @namespace    http://tampermonkey.net/
// @version      0.1
// @description  Provides you incremental diffs with the help of jenkins
// @author       Mathias L. Baumann
// @match        *://github.com/*/*/pull/*
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

        console.log("element : " + this.element);
        this.usertoken = GM_getValue("username") + ":" + GM_getValue("token");

        this.fetchCommit(commit1, "base");
        this.fetchCommit(commit2, "update");

    }

    allDone ( )
    {
        console.log("All Done, base: " + this.base_done + " update: " + this.update_done);

        // Fetch any missing file versions
        if (!this.base_done || !this.update_done)
            return;


        for (var i = 0; i<this.files.length; i++)
        {
            var file = this.files[i];
            if (!file.base)
            {
                this.base_done = false;
                console.log("Missing base of " + file.name + ", fetching...");
                this.fetchFile(this.sha_base, file.name, "base", true);
            }
            if (!file.update)
            {
                this.update_done = false;
                console.log("Missing update of " + file.name + ", fetching...");
                this.fetchFile(this.sha_update, file.name, "update", true);
            }
        }

        this.diffUsingJS(0);
        console.log("all done, creating diff");
    }


    fetchFile ( commit, file, type, last )
    {
        console.log("Fetching file " + file + " from " + commit);

        function receiveFile ( )
        {
            console.log("Receiving file " + file);

            var response = JSON.parse(this.responseText);

            var found = false;

            for (var i = 0; i < this.outside.files.length; i++)
                if (this.outside.files[i].name == response.path)
                {
                    if (type == "base")
                        this.outside.files[i].base = atob(response.content);
                    else if (type == "update")
                        this.outside.files[i].update = atob(response.content);

                    found = true;
                    break;
                }

            if (!found)
            {
                file = new Object;
                file.name = response.path;

                if (type == "base")
                {
                    file.base = atob(response.content);
                }
                else if (type == "update")
                {
                    file.update = atob(response.content);
                }

                this.outside.files.push(file);
            }

            if (last)
            {
                if (type == "base")
                    this.outside.base_done = true;
                else
                    this.outside.update_done = true;

                this.outside.allDone();
            }
        }


        var request = new XMLHttpRequest();

        request.outside = this;
        request.onload = receiveFile;
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

            for (var i = 0; i < response.files.length; i++)
            {
                this.outside.fetchFile(response.sha, response.files[i].filename,
                        type, i == response.files.length-1);
            }
        }

        console.log("fetching commit " + commit);
        // Create a new request object
        var request = new XMLHttpRequest();

        request.outside = this;
        request.onload = fetchCommitCb;
        // Initialize a request
        request.open('get', 'https://api.github.com/repos/'+this.owner+'/'+this.repo+'/commits/' + commit);
        request.setRequestHeader("Authorization", "Basic " + btoa(this.usertoken));
        // Send it
        request.send();

        console.log("sent");
    }

    diffUsingJS ( viewType, reset )
    {
        "use strict";

        var byId = function (id) { return document.getElementById(id); };

        var diffoutputdiv = this.element;

        //if (reset)
            diffoutputdiv.innerHTML = "";


        var exit_button = document.createElement("BUTTON");
        exit_button.innerText = "Close";
        exit_button.onclick = function() { diffoutputdiv.outerHTML = ""; };
        diffoutputdiv.appendChild(exit_button);

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

            diffoutputdiv.appendChild(diffview.buildView({
                baseTextLines: base,
                newTextLines: newtxt,
                opcodes: opcodes,
                baseTextName: "Base",
                newTextName: "New",
                contextSize: contextSize,
                viewType: viewType
            }));
        }

        document.body.appendChild(this.element);
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

    textfield_user.type = "text";
    
    var user = GM_getValue("username");    
    if (!user)
        user = "Username";
    
    textfield_user.value = user;
    textfield_user.id = "github-user";

    textfield_token.type = "text";
    textfield_token.value = "Github Token";
    textfield_token.id = "github-token";
    
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
    box.appendChild(button);
    box.appendChild(note);

    document.body.appendChild(box);
}

// saves the credentials and removes the box and the button
function saveCredentials ( )
{
    var user = document.getElementById("github-user");
    var token = document.getElementById("github-token");

    GM_setValue("username", user.value);
    GM_setValue("token", token.value);

    var box = document.getElementById("github-credentials-box");
    box.outerHTML = "";

    fetchUpdates();
}


// Creates a button in the github sidebar in PRs
function makeButton ( text, action, id )
{
    var sidebar = document.getElementById("partial-discussion-sidebar");

    var buttondiv = document.createElement("DIV");
    buttondiv.className = "discussion-sidebar-item";
    buttondiv.id = id;

    var button = document.createElement("BUTTON");
    button.className = "btn";
    button.innerText = text;
    button.onclick = action;
    

    buttondiv.appendChild(button);
    sidebar.appendChild(buttondiv);

}

// Fetches the sha heads from jenkins
function fetchUpdates ( )
{    
    console.log("Fetching again");
    var urlsplit = document.URL.split("/");
    var owner = urlsplit[3];
    var repo  = urlsplit[4];
    var prid  = urlsplit[6];
    
    // Create a new request object
    GM_xmlhttpRequest({
        method: "GET",
        url: 'https://ci.sociomantic.com/userContent/'+owner+'/'+repo+'/' + prid + "?cachebust=" + Date.now() ,
        onload: function () {
            if (this.status == 200)
                drawButtons(this.responseText);
            else
                console.log("Received status " + this.status);
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
            var divdiff = document.createElement("DIV");
            divdiff.style.backgroundColor = "white";
            divdiff.style.position = "fixed";
            divdiff.style.border = "solid black 2px";
            divdiff.style.zIndex = 999999;
            divdiff.style.left = "10%";
            divdiff.style.top = "10%";
            divdiff.style.padding = "20px";
            divdiff.id = "diff-div";

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
                                 time.getMonth()+1 + "." +
                                 time.getFullYear() + " " +
                                 time.getHours() + ":" +
                                 time.getMinutes();

            makeButton("Update " + formatted_time, makeShowDiffFunc(), "diffbutton-" + update);
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

    console.log("Fetch delayed triggered!");
    var sidebar = document.getElementsByClassName("discussion-sidebar")[0];
    sidebar.removeEventListener ('DOMSubtreeModified', fetchDelayed);
    setTimeout(fetchUpdates, 1000);
}

(function()
 {
    'use strict';

    var css_style = GM_getResourceText ("CSSDIFF");
    GM_addStyle (css_style);

    // Add button to set up github API access
    if (!GM_getValue("username") || !GM_getValue("token"))
    {
        makeButton("Setup Credentials", askCredentials, "credentials-button");

        console.log("Requesting user & token");
        return;
    }

    fetchUpdates();

})();