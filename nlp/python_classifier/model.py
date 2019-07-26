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

MAX_SEQ_LENGTH = 128

def convert_examples_to_features(examples,
                                 tokenizer,
                                 cls_token='[CLS]',
                                 sep_token='[SEP]',
                                 pad_token=0):

    input_id_batch = []
    input_mask_batch = []
    for text in examples:
        tokens = tokenizer.tokenize(text)
        # Account for [CLS] and [SEP] with "- 2"
        if len(tokens) > MAX_SEQ_LENGTH - 2:
            tokens = tokens[:(MAX_SEQ_LENGTH - 2)]

        tokens = [cls_token] + tokens + [sep_token]

        input_ids = tokenizer.convert_tokens_to_ids(tokens)

        # The mask has 1 for real tokens and 0 for padding tokens. Only real
        # tokens are attended to.
        input_mask = [1] * len(input_ids)

        # Zero-pad up to the sequence length.
        padding_length = MAX_SEQ_LENGTH - len(input_ids)
        input_ids = input_ids + ([pad_token] * padding_length)
        input_mask = input_mask + ([0] * padding_length)

        assert len(input_ids) == MAX_SEQ_LENGTH
        assert len(input_mask) == MAX_SEQ_LENGTH

        input_id_batch.append(input_ids)
        input_mask_batch.append(input_mask)
    return torch.tensor(input_id_batch), torch.tensor(input_mask_batch)


class BertClassifierModel:
    def __init__(self, model_path = 'bert-base-multilingual-uncased'):

        self.config = BertConfig.from_pretrained(model_path)
        self.tokenizer = BertTokenizer.from_pretrained(model_path, do_lower_case=True)
        self.model = BertForSequenceClassification.from_pretrained(model_path)

    def infer(self, data):
        input_id_batch, input_mask_batch = convert_examples_to_features(data, self.tokenizer)

        logits, = self.model(input_id_batch, attention_mask=input_mask_batch)
        return torch.nn.functional.softmax(logits, dim=1)
