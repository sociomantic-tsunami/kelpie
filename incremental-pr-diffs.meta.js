// ==UserScript==
// @name         Github PR Incremental Diffs
// @version      0.20
// @namespace    https://tampermonkey.net/
// @homepage     https://github.com/sociomantic-tsunami/kelpie
// @supportURL   https://github.com/sociomantic-tsunami/kelpie/issues
// @downloadURL  https://raw.githubusercontent.com/sociomantic-tsunami/kelpie/master/incremental-pr-diffs.user.js
// @updateURL    https://raw.githubusercontent.com/sociomantic-tsunami/kelpie/master/incremental-pr-diffs.meta.js
// @description  Provides you incremental diffs with the help of an extra server
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
