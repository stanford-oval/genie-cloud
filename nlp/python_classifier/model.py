# This file is part of Almond
#
# Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
#
# Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
#
# See COPYING for details

import torch
from pytorch_transformers import BertForSequenceClassification, BertTokenizer, BertConfig

CLASSES = {
    'question': 0,
    'command': 1,
    'chatty': 2,
    'other': 3
}

class BertClassifierModel:
    def __init__(self, model_path = 'bert-base-multilingual-uncased'):

        self.config = BertConfig.from_pretrained(model_path)
        self.tokenizer = BertTokenizer.from_pretrained(model_path, do_lower_case=True)
        self.model = BertForSequenceClassification.from_pretrained(model_path)

    def infer(self, data):
        sentence_batch = [self.tokenizer.encode(sentence) for sentence in data]
        sentence_batch = torch.tensor(sentence_batch)

        logits, = self.model(sentence_batch)
        return torch.nn.functional.softmax(logits, dim=1)
