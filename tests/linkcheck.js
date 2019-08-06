// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond Cloud
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

// load thingpedia to initialize the polyfill
require('thingpedia');
require('./polyfill');
process.on('unhandledRejection', (up) => { throw up; });
require('../util/config_init');

// Recursive link-checker
//
// Opens each page, crawls all <a> links, then tries to open
// them and verifies the server responds with 200
// If the server dies (500) or the link is broken (404) the
// test fails

// Operates on static pages only, and does not check forms;
// use Selenium tests to verify dynamic (JS-generated) links and buttons
//
// Set the COOKIE environment variable to set a cookie
// on request pages.

const Tp = require('thingpedia');
const Url = require('url');
const minidom = require('./util/minidom');

const Config = require('../config');

// some pages are intentionally missing from the test
// environment, but they exist in the real thing
const IGNORED_404 = new Set([
    '/download/devices/com.bing-v0.zip',

    // these links come from the documentation
    '/me/devices/oauth2/com.twitter',
    '/thingpedia/devices/by-id/com.twitter',
    '/thingpedia/devices/by-id/com.forismatic.quotes'
]);

class LinkChecker {
    constructor() {
        this._baseUrl = process.env.BASE_URL || Config.SERVER_ORIGIN;

        this._visited = new Set;
        this._stack = [];
    }

    _fullUrl(relative) {
        return Url.resolve(this._baseUrl, relative);
    }

    async run() {
        const httpOptions = {
            accept: 'text/html',
            'user-agent': 'Almond-Cloud-LinkCheck/1.0.0',
            followRedirects: false
        };
        if (process.env.COOKIE)
            httpOptions.extraHeaders = { 'Cookie': process.env.COOKIE };

        this._stack.push(['/', null]);
        let anyFailed = false;

        while (this._stack.length > 0) {
            let [next, parent] = this._stack.pop();
            // remove baseUrl prefix to clean the debug logging
            if (next.startsWith(this._baseUrl))
                next = next.substring(this._baseUrl.length);

            // don't call to /logout if we are logged in as that defeats the
            // point!
            if (next === '/user/logout' && process.env.COOKIE)
                continue;

            if (this._visited.has(next))
                continue;
            this._visited.add(next);
            const fullUrl = this._fullUrl(next);

            // ignore external links (we don't want to crawl the whole web!)
            if (!fullUrl.startsWith(this._baseUrl)) {
                console.log(`linkchecker: ignored external link ${fullUrl}`);
                continue;
            }

            if (IGNORED_404.has(next))
                continue;

            console.log(`linkchecker: checking ${next}`);
            try {
                const response = await Tp.Helpers.Http.get(fullUrl, httpOptions);

                for (let a of minidom.getElementsByTagName(minidom.parse(response), 'a')) {
                    const href = minidom.getAttribute(a, 'href');
                    if (!href)
                        continue;
                    if (href.startsWith('#')) // ignore links to the same page
                        continue;

                    this._stack.push([href, next]);
                }
            } catch(e) {
                if (typeof e.code !== 'number')
                    throw e; // some JS error in the link checker, or network error

                // catch redirects and treat them as links
                // this allows checking the /oauth2 pages, which redirect externally
                if (e.code === 301 || e.code === 302 || e.code === 303 || e.code === 307) {
                    this._stack.push([e.redirect, parent]);
                } else {
                    console.error(`linkchecker: error: ${next} responded with HTTP status ${e.code} (link from ${parent})`);
                    anyFailed = true;
                }
            }
        }

        if (anyFailed)
            throw new Error('some links failed');
    }
}

async function main() {
    await (new LinkChecker()).run();
}
main();
