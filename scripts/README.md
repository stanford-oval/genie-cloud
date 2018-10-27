# Scripts to manage Thingpedia and the dataset

To use a script, you must set `DATABASE_URL` appropriately in the environment.

- `count_templates.js [LANGUAGE]`: count all templates (aka macros, examples) in each function in Thingpedia, for the given language
- `gen_cheatsheet.js`: download the cheatsheet as a .tex file
- `generate_binary_ppdb.js INPUT_FILE OUTPUT_FILE`: compile a PPDB file into the compact binary format used by the sentence generator
- `gen_sentences.js OUTPUT_FILE LANGUAGE DEPTH`: generate synthetic sentences; the resulting file is a TSV ready to be consumed by luinet
- `prepare_for_turking.js OUTPUT_FILE < INPUT_FILE`: convert a file of synthetic sentences into a file ready for paraphrasing (samples, applies blacklists and assigns constants)
- `sync-assets-to-s3.sh S3_BUCKET`: upload the assets (client side JS, CSS, images) to the given S3 bucket

# Build scripts

These scripts are called by `yarn` automatically during package build:

- `update-bundles.sh`: update the browserified JS files
- `update-docs.sh`: regenerate the documentation
