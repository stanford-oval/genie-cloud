#!/bin/bash

echo '[' > doc/doc-list.json
comma=""
for f in doc/*.md ; do
	docname=$(basename "$f" .md )
	sed "s|@@DOC@@|$f|" views/doc_base.pug > views/doc_${docname}.pug ;
	echo ${comma}'"'${docname}'"' >> doc/doc-list.json
	comma=","
done
echo ']' >> doc/doc-list.json
apidoc -i routes/ -f thingpedia_api.js -o doc/thingpedia-api/ 