# This file is part of Almond
#
# Copyright 2019 The Board of Trustees of the Leland Stanford Junior University
#
# Author: Giovanni Campagna <gcampagn@cs.stanford.edu>
#
# See COPYING for details

import torch
from pytorch_transformers import BertForSequenceClassification, BertTokenizer

CLASSES = {
    'question': 0,
    'command': 1,
    'chatty': 2,
    'other': 3
}

class BertClassifierModel:
    def __init__(self, model_path = 'bert-base-multilingual-uncased'):

        self.config = BertConfig.from_pretrained('bert-base-multilingual-uncased',
                                                 num_classes=len(CLASSES))
        self.tokenizer = BertTokenizer.from_pretrained('bert-base-multilingual-uncased', do_lower_case=True)
        self.model = BertForSequenceClassification.from_pretrained(model_path)

    def train(self, data):
        sentence_batch = [self.tokenizer.encode(sentence) for (sentence, cls) in data]
        sentence_batch = torch.tensor(sentence_batch)
        label_batch = torch.tensor([cls for (sentence, cls) in data])

        loss, logits, hidden_states, attentions = self.model(sentence_batch, labels=label_batch)
        return loss

    def infer(self, data):
        sentence_batch = [self.tokenizer.encode(sentence) for (sentence, cls) in data]
        sentence_batch = torch.tensor(sentence_batch)
        label_batch = torch.tensor([cls for (sentence, cls) in data])

        loss, logits, hidden_states, attentions = self.model(sentence_batch, labels=label_batch)
        return torch.nn.functional.softmax(logits, dim=1)
