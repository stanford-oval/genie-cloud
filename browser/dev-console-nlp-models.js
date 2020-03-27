// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Thingpedia
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const highlightjs = require("highlight.js/lib/highlight.js");
highlightjs.registerLanguage('json', require('highlight.js/lib/languages/json'));
highlightjs.registerLanguage('tt', require('../util/highlightjs-thingtalk'));
highlightjs.initHighlightingOnLoad();
