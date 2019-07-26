# This file is part of Almond
#
# Copyright 2019 Ryan Cheng <ryachen@nuevaschool.org>
#
# See COPYING for details

import sys
import json
from model import BertClassifierModel, CLASSES

def main():
    model = BertClassifierModel(sys.argv[1])

    # print probabilities based on user input

    try:

        while True:
            line = sys.stdin.readline()

            if not line:
                break

            inputs = json.loads(line)

            unique_id = inputs['id']
            sentence = inputs['sentence']

            probabilities = model.infer([sentence])[0]
            class_probabilities = {
                "id": unique_id
            }
            for cls, cls_id in CLASSES.items():
                class_probabilities[cls] = probabilities[cls_id].item()

            sys.stdout.write(str(json.dumps(class_probabilities)) + '\n')
            sys.stdout.flush()

    except KeyboardInterrupt:
        pass


if __name__ == "__main__":
    main()
