// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const Q = require('q');
const fs = require('fs');
const express = require('express');
const multer = require('multer');
const csurf = require('csurf');
const Canvas = require('canvas');
const xml2js = require('xml2js');
const ColorThief = require('color-thief');

const user = require('../util/user');
const db = require('../util/db');
const platform = require('../util/platform');
const code_storage = require('../util/code_storage');
const graphics = require('../almond/graphics');
const background = require('../model/background');
const iv = require('../util/input_validation');

const colorThief = new ColorThief();

const palette_size = 4;

let router = express.Router();

router.use(user.requireLogIn);

router.get('/search', iv.validateGET({ tags: 'string' }), (req, res) => {
    let tags = req.query.tags.split(/[ ,]+/) || null;
    Q.try(() => {
        return tags ? db.withClient((dbClient) => background.getByTags(dbClient, tags)) : {};
    }).then((result) => {
        res.json(result);
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error:e.message});
    });
});

router.use(user.requireLogIn, user.requireDeveloper());

router.post('/upload', multer({ dest: platform.getTmpDir() }).fields([
    { name: 'background', maxCount: 1 },
    { name: 'xml', maxCount: 1 }
]), csurf({ cookie: false }),  (req, res) => {
    uploadBackground(req, res);
});

router.use(csurf({ cookie: false }));

router.get('/', (req, res) => {
    res.render('friendhub', { page_title: req._("Friend Hub") });
});

router.post('/delete', iv.validatePOST({ id: 'integer' }), (req, res) => {
    let id = req.body.id;
    Q.try(() => {
        return db.withTransaction((dbClient) => deleteBackground(dbClient, id));
    }).then(() => {
        res.json({result: 'succeeded'});
    }).catch((e) => {
        console.error(e.stack);
        res.status(500).json({error: e.message});
    });
});

function deleteBackground(client, bg_id) {
    if (bg_id)
        return background.delete(client, bg_id);
    return Q();
}

function uploadBackground(req, res) {
    if (!(req.files.background && req.files.xml))
        return Q();
    if (!(req.files.background.length === 1 && req.files.xml.length === 1))
        return Q();
    let originalname = req.files.background[0].originalname;
    let filename = req.files.background[0].filename;
    originalname = originalname.substring(0, originalname.length - '.png'.length);
    return Q(Promise.resolve().then(() => {
        setTimeout(() => {
            Promise.resolve().then(() => {
                let image = graphics.createImageFromPath(req.files.background[0].path);
                image.resizeFit(1920, 1080);
                return image.stream('png');
            }).then(([stdout, stderr]) => {
                return code_storage.storeBackground(stdout, filename);
            }).catch ((e) => {
                console.error('Failed to upload background to S3: ' + e);
            });
        }, 0);
    }).then(() => {
        return processOneFile(req.files.xml[0].path, req.files.background[0].path, originalname).then((output) => {
            return db.withTransaction((dbClient) => {
                return background.add(dbClient, output, req.user.developer_org, filename);
            });
        });
    }).then(() => {
        res.redirect(303, '/friendhub');
    })).finally(() => {
        let toDelete = [];
        if (req.files) {
            toDelete.push(Q.nfcall(fs.unlink, req.files.background[0].path));
            toDelete.push(Q.nfcall(fs.unlink, req.files.xml[0].path));
        }
        return Promise.all(toDelete);
    }).catch((e) => {
        console.error(e.stack);
        res.status(400).render('error', { page_title: "Thingpedia - Error",
            message: e });
    }).done();
}

function avgColor(ctx, x, y, w, h) {
    let imgData = ctx.getImageData(x, y, w, h);
    let colorSum = [0, 0, 0];
    let n = 0;
    for (let i = 0; i < imgData.data.length; i += 4) {
        colorSum[0] += imgData.data[i];
        colorSum[1] += imgData.data[i+1];
        colorSum[2] += imgData.data[i+2];
        // skip A
        n++;
    }
    colorSum[0] /= n;
    colorSum[1] /= n;
    colorSum[2] /= n;
    return colorSum;
}

function loadImage(imageFilename) {
    let img = new Canvas.Image();
    img.src = imageFilename;
    const canvas = new Canvas();
    canvas.width = img.width;
    canvas.height = img.height;
    const ctx = canvas.getContext('2d');
    ctx.drawImage(img, 0, 0, img.width, img.height);
    return ctx;
}

function processOneFile(path, imageFilepath, filename) {
    console.log('Loading xml ' + path);

    return Q.nfcall(fs.readFile, path).then((data) => {
        return Q.nfcall(xml2js.parseString, data);
    }).then((parsedXml) => {
        if (!parsedXml)
            console.error('Something weird with ' + filename);
        let imageFilename = filename;
        console.log('Loading image ' + imageFilepath);

        const width = parseInt(parsedXml.annotation.size[0].width[0]);
        const height = parseInt(parsedXml.annotation.size[0].height[0]);
        let scale, xoff, yoff;
        if (width >= height) {
            scale = width;
            xoff = 0;
            yoff = (width-height)/2/width;
        } else {
            scale = height;
            xoff = (height-width)/2/height;
            yoff = 0;
        }

        const output = {};
        const rectangles = [];
        output.filename = imageFilename;
        output.tags = filename.split(/[_\-.]/g).map((t) => t.toLowerCase()).filter((t) => !/^[0-9]+$/.test(t));
        output.brands = [];
        output.rectangles = rectangles;

        const ctx = loadImage(imageFilepath);
        const wholeImagePixels = ctx.getImageData(0, 0, width, height).data;
        const wholeImagePixelCount = wholeImagePixels.length/4;
        const overallPalette = colorThief.getPaletteFromPixels(wholeImagePixels, wholeImagePixelCount, palette_size, 10, true);
        output['color-palette'] = overallPalette;

        function getColor(x, y, w, h) {
            const pixels = ctx.getImageData(x, y, w, h).data;
            return colorThief.getPaletteFromPixels(pixels, pixels.length/4, palette_size, 10, true)[0];
        }
        output['corner-colors'] = {
            'bottom-right': getColor(width*0.6, height*0.8, width*0.4, height*0.2),
            'top-left': getColor(0, 0, width*0.2, height*0.2),
            'top-right': getColor(width*0.9, 0, width*0.1, height*0.1),
            'top': getColor(width*0.1, 0, width*0.8, height*0.1)
        };

        for (let rect of parsedXml.annotation.object) {
            let info = rect.name[0].split('-');
            let label = info[0];
            let index = parseInt(info[1]) || 0;
            let fontcolor, fontsize, fontfamily, textalign, cover = false;
            for (let i = 2; i < info.length; i++) {
                let part = info[i];
                if (part === 'cover')
                    cover = true;
                else if (part.startsWith('#'))
                    fontcolor = part;
                else if (part.startsWith('F'))
                    fontsize = parseFloat(part.substr(1));
                else if (part === 'left' || part === 'right' || part === 'center' || part === 'justify')
                    textalign = part;
                else if (part === 'monospace' || part === 'handwriting' || part === 'sans' || part === 'serif' || part === 'display')
                    fontfamily = part;
            }

            let ymin = parseInt(rect.bndbox[0].ymin[0]);
            let ymax = parseInt(rect.bndbox[0].ymax[0]);
            let xmin = parseInt(rect.bndbox[0].xmin[0]);
            let xmax = parseInt(rect.bndbox[0].xmax[0]);

            let pixels = ctx.getImageData(xmin, ymin, xmax-xmin, ymax-ymin).data;
            let pixelCount = pixels.length/4;
            let palette = colorThief.getPaletteFromPixels(pixels, pixelCount, palette_size, 10, true);

            let top_color = avgColor(ctx, xmin, ymin, xmax-xmin, 1);
            let left_color = avgColor(ctx, xmin, ymin, 1, ymax-ymin);
            let right_color = avgColor(ctx, xmax, ymin, 1, ymax-ymin);
            let bottom_color = avgColor(ctx, xmin, ymax, xmax-xmin, 1);

            ymin = (ymin / scale + yoff) * 100;
            ymax = (ymax / scale + yoff) * 100;
            xmin = (xmin / scale + xoff) * 100;
            xmax = (xmax / scale + xoff) * 100;

            rectangles.push({
                'top-color': top_color,
                'left-color': left_color,
                'right-color': right_color,
                'bottom-color': bottom_color,
                color: (palette[0] || [255,255,255]),
                coordinates: [
                    [xmin, ymin],
                    [xmax, ymax]
                ],
                label: label,
                index: index,
                cover: cover,
                'font-color': fontcolor,
                'font-size': fontsize,
                'font-family': fontfamily,
                'text-align': textalign,
            });
        }
        rectangles.sort((one, two) => {
            return one.index - two.index;
        });

        return output;
    });
}

module.exports = router;
