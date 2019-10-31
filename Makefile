all: install prepare

prepare: prepare-bundles prepare-mo prepare-docs

public/javascripts/%-bundle.js : browser/%.js browser/deps/*
	browserify -o $@ $<

bundles := \
	admin-nl-training \
	commandpedia \
	thingpedia-device-create \
	thingpedia-device-translate \
	thingpedia-portal \
	trainer \
	blog-editor \
	rotating-globe

prepare-bundles: $(foreach b,$(bundles),public/javascripts/$(b)-bundle.js)

%.mo: %.po
	msgfmt $< -o $@

languages := it zh_CN
prepare-mo: $(foreach l,$(languages),po/$(l).mo)

empty =
space = $(empty) $(empty)
comma = ,

alldocs := $(foreach w,$(wildcard doc/*.md),$(basename $(notdir $(w))))
alldocpug := $(foreach d,$(alldocs),views/doc_$(d).pug)

jsdocmodules = thingtalk thingpedia thingengine-core
alljsdocs = $(foreach m,$(jsdocmodules),doc/jsdoc/$(m))

doc/doc-list.json: doc/
	echo '['$(subst $(space),$(comma),$(foreach d,$(alldocs),'"'$(d)'"'))']' > $@

doc/fts.json: doc/*.md ./build/build-doc-index.js
	./build/build-doc-index.js

views/thingpedia_doc_index.pug: doc/index.yml ./build/build-doc-sidebar.js
	./build/build-doc-sidebar.js $< $@

views/doc_%.pug: doc/%.md views/doc_base.pug
	sed "s|@@DOC@@|$<|" views/doc_base.pug > $@ ; \

doc/thingpedia-api : routes/thingpedia_api.js apidoc.json
	apidoc -i routes/ -f thingpedia_api.js -o doc/thingpedia-api/

doc/almond-config-file-reference.md: config.js ./build/make-config-file-reference.js
	./build/make-config-file-reference.js $< $@

doc/jsdoc/% : node_modules/% jsdoc.json yarn.lock doc/jsdoc/%.md
	mkdir -p $@
	jsdoc -c jsdoc.json -t node_modules/ink-docstrap/template -d doc/jsdoc --readme doc/jsdoc/$*.md --package $</package.json --verbose -r $$(test -f $</index.js && echo $</index.js) $</lib
	touch $@

prepare-docs: doc/doc-list.json doc/fts.json $(alldocpug) $(alljsdocs) doc/thingpedia-api views/thingpedia_doc_index.pug

install:
	make -C sandbox all || echo WARNING: failed to compile the sandbox

.PHONY: install prepare prepare-bundles prepare-mo prepare-docs
