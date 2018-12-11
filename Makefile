all: install prepare

prepare: prepare-bundles prepare-mo prepare-docs

public/javascripts/%-bundle.js : browser/%.js browser/deps/*
	browserify -o $@ $<

bundles := \
	admin-nl-training \
	commandpedia \
	thingpedia-device-create \
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

doc/doc-list.json: doc/
	echo '['$(subst $(space),$(comma),$(foreach d,$(alldocs),'"'$(d)'"'))']' > $@

doc/fts.json: doc/*.md
	./scripts/build-doc-index.js

views/doc_%.pug: doc/%.md views/doc_base.pug
	sed "s|@@DOC@@|$<|" views/doc_base.pug > $@ ; \

doc/thingpedia-api : routes/thingpedia_api.js
	apidoc -i routes/ -f thingpedia_api.js -o doc/thingpedia-api/

prepare-docs: doc/doc-list.json doc/fts.json $(alldocpug) doc/thingpedia-api

install:
	make -C sandbox all || echo WARNING: failed to compile the sandbox

.PHONY: install prepare prepare-bundles prepare-mo prepare-docs
