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

const parse5 = require('parse5');

function* getElementsByTagName(root, tagName) {
    if (root.namespaceURI === 'http://www.w3.org/1999/xhtml' &&
        root.tagName === tagName)
        yield root;

    for (let child of root.childNodes) {
        if (child.nodeName === '#text' || child.nodeName === '#comment')
            continue;
        yield* getElementsByTagName(child, tagName);
    }
}

function* getTextContentHelper(root) {
    if (root.nodeName === '#text') {
        yield root.value;
        return;
    }

    for (let child of root.childNodes) {
        if (child.nodeName === '#comment')
            continue;
        yield* getTextContentHelper(child);
    }
}

function getTextContent(root) {
    let buffer = '';
    for (let node of getTextContentHelper(root))
        buffer += node;
    return buffer;
}

function getElementById(root, id) {
    if (getAttribute(root, 'id') === id)
        return root;

    for (let child of root.childNodes) {
        if (child.nodeName === '#text' || child.nodeName === '#comment')
            continue;
        let descendant;
        if ((descendant = getElementById(child, id)))
            return descendant;
    }

    return undefined;
}

function getDocumentElement(document) {
    for (let node of document.childNodes) {
        if (node.nodeName === 'html')
            return node;
    }
    return null;
}

function getAttribute(element, attrName) {
    for (let attr of element.attrs) {
        if (attr.name === attrName)
            return attr.value;
    }
    return undefined;
}

function parse(htmlString) {
    return getDocumentElement(parse5.parse(htmlString));
}

module.exports = {
    parse,

    getElementsByTagName,
    getElementById,
    getDocumentElement,
    getAttribute,
    getTextContent,
};
