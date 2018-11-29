// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of ThingEngine
//
// Copyright 2018 The Board of Trustees of the Leland Stanford Junior University
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
//
// See COPYING for details
"use strict";

const InfiniteScroll = require('infinite-scroll');

module.exports = class SearchOrInfiniteScroll {
    constructor(options) {
        this._developerKey = document.body.dataset.developerKey || '';
        this._container = document.querySelector(options.container + ' .aligned-grid');
        this._render = options.render;

        this._getUrl = options.url + '?developer_key=' + this._developerKey;
        this._searchUrl = options.searchUrl;

        this._pageSize = options.pageSize || 9;

        this._reset = $(options.container + ' .reset-button');

        this._insearch = false;
        this._infscroll = undefined;

        $(options.container + ' .search-button').click((event) => {
            event.preventDefault();
            this._insearch = true;
            if (this._infscroll) {
                this._infscroll.destroy();
                this._infscroll = undefined;
            }
            $.ajax(this._searchUrl, { data: {
                q: $(options.container + ' input[name=q]').val(),
                developer_key: this._developerKey
            }, method: 'GET' }).then((response) => {
                $(this._container).empty();
                $(this._container).append(this._renderCommands(response));
                this._updateSearch();
            });
        });

        this._reset.click((event) => {
            event.preventDefault();
            if (!this._insearch)
                return;
            this._insearch = false;
            $(this._container).empty();
            this._updateSearch();
            this._initializeInfiniteScroll();
        });

        this._updateSearch();
        this._initializeInfiniteScroll();
    }

    _updateSearch() {
        if (this._insearch)
            this._reset.show();
        else
            this._reset.hide();
    }

    _renderCommands(result) {
        if (result.data.length <= this._pageSize)
            this._reachedEnd = true;

        let output = [];
        for (let i = 0; i < Math.min(result.data.length, this._pageSize); i++)
            output.push(this._render(result.data[i]));
        return output;
    }

    _initializeInfiniteScroll() {
        this._reachedEnd = false;

        const self = this;
        this._infscroll = new InfiniteScroll(this._container, {
            path() {
                if (!self._reachedEnd)
                    return self._getUrl + '&page=' + this.loadCount;
                else
                    return undefined;
            },

            append: false,
            history: false,

            responseType: 'text'
        });

        this._infscroll.on('load', (response) => {
            const parsed = JSON.parse(response);
            const $items = this._renderCommands(parsed);
            this._infscroll. appendItems($items);
        });

        this._infscroll.loadNextPage();
    }
};
