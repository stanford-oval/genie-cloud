# Frontend Classifier

The frontend classifier is a simple layer to determine if Almond is able to
interpret a command, before the command is sent to the semantic parser.

It uses a model based on BERT.

## Installation

Use pip and `requirements.txt`. Uses PyTorch. 

## Training

Create a folder called `~/classifier_data` containing:

- `train/questions.txt`: question data
- `train/commands.txt`: ThingTalk commands
- `train/chatty.txt`: chatty text
- `dev/questions.txt`: question data
- `dev/commands.txt`: ThingTalk commands
- `dev/chatty.txt`: chatty text
- `words.txt`: a list of English words (to generate random examples)

Each file should be one example sentence per line, untokenized, with no other
separator or marker.

Train with:

```
python3 nlp/python_classifier/train_classifier.py
  --data_dir ~/classifier_data/
  --model_type bert
  --model_name bert-base-multilingual-uncased
  --output_dir ~/classifier_data/output
  --cache_dir ~/classifier_data/cache
  --do_lower_case
  --do_train
  --evaluate_during_training
  --overwrite_output_dir
```

BERT is very compute and memory hungry, even in its Base configuration, so make sure to train
on a GPU machine with enough memory (V100 recommended).
