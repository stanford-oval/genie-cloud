// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const fs = require('fs');
const Q = require('q');

var AWS = require('aws-sdk');

AWS.config.update({ region: 'us-west-2',
                    logger: process.stdout });

module.exports = {
    storeIcon: function(blob, name) {
        var s3 = new AWS.S3();
        var upload = s3.upload({ Bucket: 'thingpedia2',
                                 Key: 'icons/' + name + '.png',
                                 Body: blob,
                                 ContentType: 'image/png' });
        return Q.ninvoke(upload, 'send').then(function() {
            console.log('Successfully uploading png file to S3 for ' + name);
        });
    },
    storeZipFile: function(blob, name, version) {
        var s3 = new AWS.S3();
        var upload = s3.upload({ Bucket: 'thingpedia2',
                                 Key: 'devices/' + name + '-v' + version + '.zip',
                                 Body: blob,
                                 ContentType: 'application/zip' });
        return Q.ninvoke(upload, 'send').then(function() {
            console.log('Successfully uploaded zip file to S3 for ' +
                        name + ' v' + version);
        });
    },
};
