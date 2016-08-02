
prefix ?= /opt/thingengine
localstatedir ?= /srv/thingengine

SUBMODULE_DEPS = thingengine-core sabrina thingpedia thingpedia-discovery thingtalk

all: $(SUBMODULE_DEPS) platform_config.js
	make -C sandbox prefix=$(prefix) localstatedir=$(localstatedir) all
	npm install --only=prod
	npm dedupe
	cd node_modules/sabrina ; npm run compile-mo
	cd node_modules/thingengine-core ; npm run compile-mo
	npm run compile-mo

.PHONY: $(SUBMODULE_DEPS)

$(SUBMODULE_DEPS):
	cd node_modules/$(notdir $@) ; npm install --only=prod

platform_config.js:
	echo "exports.PKGLIBDIR = '$(prefix)'; exports.LOCALSTATEDIR = '$(localstatedir)';" > platform_config.js

SUBDIRS = model util public routes views po node_modules/
our_sources = main.js frontend.js instance/platform.js instance/runengine.js platform_config.js
