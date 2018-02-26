
prefix ?= /opt/thingengine
localstatedir ?= /srv/thingengine

all:
	make -C sandbox prefix=$(prefix) localstatedir=$(localstatedir) all
	npm install --only=prod
	npm dedupe
	cd node_modules/almond ; npm run compile-mo
	cd node_modules/thingtalk ; npm run compile-mo
	cd node_modules/thingengine-core ; npm run compile-mo
	npm run compile-mo

SUBDIRS = model util public routes views po node_modules/
our_sources = main.js frontend.js instance/platform.js instance/runengine.js platform_config.js
