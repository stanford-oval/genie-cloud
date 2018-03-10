# Scripts to manage Thingpedia and the dataset

To use a script, you must set `DATABASE_URL` appropriately in the environment.

- `count_templates.js [LANGUAGE]`: count all templates (aka macros, examples) in each function in Thingpedia, for the given language
- `download_dataset.js LANGUAGE TYPES [TARGET_DIR]`: download the dataset into a set of TSV files that can be consumed by almond-nnparser; one per type inside TARGET_DIR (if unspecified defaults to `.`)
- `gen_sentences.js OUTPUT_FILE LANGUAGE DEPTH`: generate synthetic sentences; the resulting file is a TSV ready to be consumed by almond-nnparser
- `import_entity.js FILE LANGUAGE ENTITY_TYPE`: import a CSV containing entity definitions (one per line, format is `value,name`)
- `import_turking.js BATCH_NAME [permissions | programs] [TEST_PROBABILITY] < INPUT_FILE`: import a paraphrased TSV file; format is one-per-line ID, Thingtalk code and paraphrase;
  requires `almond-tokenizer` running locally.
- `manual_train.js`: perform manual training against a file with a list of sentences (used to import cheatsheet/scenario)
- `prepare_for_turking.js OUTPUT_FILE < INPUT_FILE`: convert a file of synthetic sentences into a file ready for paraphrasing (samples, applies blacklists and assigns constants)
