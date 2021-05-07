all: install prepare

prepare: prepare-bundles prepare-mo

public/javascripts/%-bundle.js : browser/%.js browser/deps/* package-lock.json
	browserify -o $@ $<

bundles := \
	admin-nl-training \
	commandpedia \
	thingpedia-device-create \
	thingpedia-device-translate \
	thingpedia-portal \
	blog-editor \
	dev-console-nlp-models \
	conversation

prepare-bundles: $(foreach b,$(bundles),public/javascripts/$(b)-bundle.js)

%.mo: %.po
	msgfmt $< -o $@

languages := it zh_CN es
prepare-mo: $(foreach l,$(languages),po/$(l).mo)

install:
	make -C sandbox all || echo WARNING: failed to compile the sandbox

.PHONY: install prepare prepare-bundles prepare-mo
