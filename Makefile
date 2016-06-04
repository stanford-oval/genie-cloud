
prefix ?= /opt/thingengine
localstatedir ?= /srv/thingengine

SUBMODULE_DEPS = thingengine-core sabrina thingpedia thingpedia-discovery thingtalk

all: $(SUBMODULE_DEPS) platform_config.js
	make -C sandbox prefix=$(prefix) localstatedir=$(localstatedir) all
	npm install --only=prod
	npm dedupe

.PHONY: $(SUBMODULE_DEPS)

$(SUBMODULE_DEPS):
	cd node_modules/$(notdir $@) ; npm install --only=prod

platform_config.js:
	echo "exports.PKGLIBDIR = '$(prefix)'; exports.LOCALSTATEDIR = '$(localstatedir)';" > platform_config.js

SUBDIRS = model util public routes views node_modules/
our_sources = main.js frontend.js instance/platform.js instance/runengine.js platform_config.js
