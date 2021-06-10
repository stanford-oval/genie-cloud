// -*- mode: js; indent-tabs-mode: nil; js-basic-offset: 4 -*-
//
// This file is part of Almond
//
// Copyright 2019-2020 The Board of Trustees of the Leland Stanford Junior University
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
// Author: Giovanni Campagna <gcampagn@cs.stanford.edu>

import prepareTrainingSet from './prepare-training-set';
import updateDataset from './update-dataset';
import train from './train';
import evaluate from './evaluate';
import genCustomSynthetic from './gen-custom-synthetic';
import genCustomAugmented from './gen-custom-augmented';
import genCustomTurking from './gen-custom-turking';

export default {
    'prepare-training-set': prepareTrainingSet,
    'update-dataset': updateDataset,
    'train': train,
    'evaluate': evaluate,
    'gen-custom-synthetic': genCustomSynthetic,
    'gen-custom-augmented': genCustomAugmented,
    'gen-custom-turking': genCustomTurking
};
