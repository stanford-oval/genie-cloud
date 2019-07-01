// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

module.exports = {
    CREATE_MODEL_COST: 50,
    TRAIN_THINGPEDIA_COST: 20,
    TRAIN_LUINET_PUBLIC_COST: 100,
    TRAIN_LUINET_PRIVATE_COST: 500,
    CREATE_MTURK_BATCH_COST: 5,
    RUN_MTURK_BATCH_COST: 10,

    WEEKLY_THINGPEDIA_UPDATE: 10,
    WEEKLY_OSS_THINGPEDIA_UPDATE: 50,
    WEEKLY_APPROVED_THINGPEDIA_UPDATE: 100,
    WEEKLY_OSS_TEMPLATE_PACK_UPDATE: 100,

    getCreditUpdate(stats) {
        let update = 0;

        update += this.WEEKLY_APPROVED_THINGPEDIA_UPDATE * stats.approved_device_count;

        const non_approved_oss_devices = stats.oss_device_count - stats.oss_approved_device_count;
        update += this.WEEKLY_OSS_THINGPEDIA_UPDATE * non_approved_oss_devices;

        const non_approved_non_oss_devices = stats.device_count - stats.approved_device_count - non_approved_oss_devices;
        update += this.WEEKLY_THINGPEDIA_UPDATE * non_approved_non_oss_devices;

        update += this.WEEKLY_OSS_TEMPLATE_PACK_UPDATE * stats.oss_template_file_count;

        return update;
    },

    getNextUpdate() {
        const now = new Date;
        now.setUTCHours(0, 0, 0);
        now.setUTCDate(now.getUTCDate() + (7 - now.getUTCDay()));
        return now;
    }
};
