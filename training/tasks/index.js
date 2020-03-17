// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = {
    'prepare-training-set': require('./prepare-training-set'),
    'update-dataset': require('./update-dataset'),
    'train': require('./train'),
    'evaluate': require('./evaluate'),
    'gen-custom-synthetic': require('./gen-custom-synthetic'),
    'gen-custom-augmented': require('./gen-custom-augmented'),
};
