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

// NOTE: S3 is hosted in Northern California (us-west-1), not Washington (us-west-2)
AWS.config.update({ region: 'us-west-1',
                    logger: process.stdout });

module.exports = {
    storeFile: function(blob, name, version) {
        var s3 = new AWS.S3();
        var upload = s3.upload({ Bucket: 'thingpedia',
                                 Key: 'devices/' + name + '-v' + version + '.zip',
                                 Body: blob,
                                 ContentType: 'application/zip' });
        return Q.ninvoke(upload, 'send').then(function() {
            console.log('Successfully uploaded zip file to S3 for ' +
                        name + ' v' + version);
        });
    },
};
