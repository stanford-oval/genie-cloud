// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2018-2019 The Board of Trustees of the Leland Stanford Junior University
//
// Licensed under the Apache License, Version 2.0 (the "License");
// you may not use this file except in compliance with the License.
// You may obtain a copy of the License at
//
//    http://www.apache.org/licenses/LICENSE-2.0
//
// Unless required by applicable law or agreed to in writing, software
// distributed under the License is distributed on an "AS IS" BASIS,
// WITHOUT WARRANTIES OR CONDITIONS OF ANY KIND, either express or implied.
// See the License for the specific language governing permissions and
// limitations under the License.
//
// Author: Silei Xu <silei@cs.stanford.edu>
//         Giovanni Campagna <gcampagn@cs.stanford.edu>
"use strict";

const InfiniteScroll = require('infinite-scroll');

module.exports = class SearchOrInfiniteScroll {
    constructor(options) {
        this._developerKey = document.body.dataset.developerKey || '';
        this._locale = document.body.dataset.locale || 'en-US';
        this._containerKey = options.container;
        this._container = document.querySelector(options.container + ' .aligned-grid');
        this._render = options.render;

        this._pageSize = options.pageSize || 18;
        this._getUrl = options.url + '?page_size=' + this._pageSize + '&developer_key=' + this._developerKey + '&locale=' + this._locale;
        this._searchUrl = options.searchUrl;

        this._reset = $(options.container + ' .reset-button');

        this._insearch = false;
        this._infscroll = undefined;
        this._autoscrollonstart = options.autoScrollOnStart || false;

        $(options.container + ' .search-button').click((event) => {
            event.preventDefault();
            this._insearch = true;
            if (this._infscroll) {
                this._infscroll.destroy();
                this._infscroll = undefined;
            }
            this._findmore.hide();
            $.ajax(this._searchUrl, { data: {
                q: $(options.container + ' input[name=q]').val(),
                developer_key: this._developerKey,
                locale: this._locale
            }, method: 'GET' }).then((response) => {
                $(this._container).empty();
                $(this._container).append(this._renderCommands(response));
                this._updateSearch();
            });
        });

        this._findmore = $(options.container + ' .find-more-button');
        this._findmore.click((event) => {
            event.preventDefault();

            if (this._infscroll) {
                this._infscroll.loadNextPage();
                this._infscroll.option({ loadOnScroll: true });
            }

            this._findmore.hide();
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
            loadOnScroll: this._autoscrollonstart,

            responseType: 'text'
        });

        this._infscroll.on('load', (response) => {
            const parsed = JSON.parse(response);
            const $items = this._renderCommands(parsed);
            this._infscroll. appendItems($items);
        });

        this._infscroll.loadNextPage();
        this._findmore.show();
    }
};
