// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingPedia
//
// Copyright 2015 Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details

const db = require('../util/db');
const Q = require('q');

function create(client, category) {
    var KEYS = ['catchphrase', 'name', 'description', 'tag', 'order_position', 'icon'];
    KEYS.forEach(function(key) {
        if (category[key] === undefined)
            category[key] = null;
    });
    var vals = KEYS.map(function(key) {
        return category[key];
    });
    var marks = KEYS.map(function() { return '?'; });

    return db.insertOne(client, 'insert into category(' + KEYS.join(',') + ') '
                        + 'values (' + marks.join(',') + ')', vals).then(function(id) {
                            category.id = id;
                            return category;
                        });
}

module.exports = {
    get: function(client, id) {
        return db.selectAll(client, "select * from category where id = ?", [id]);
    },

    getAll: function(client) {
        return db.selectAll(client, "select * from category order by order_position asc");
    },

    create: create,

    update: function(client, id, category) {
        return db.query(client, "update category set ? where id = ?", [category, id]);
    },

    'delete': function(client, id) {
        return db.query(client, "delete from category where id = ?", [id]);
    }
};
