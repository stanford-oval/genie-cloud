
prefix ?= /opt/thingengine
localstatedir ?= /srv/thingengine

all: platform_config.js
	make -C sandbox all
	cd node_modules/thingengine-core ; npm install --only=prod
	make -C node_modules/sabrina all
	cd node_modules/thingpedia ; npm install --only=prod
	cd node_modules/thingpedia-discovery ; npm install --only=prod
	cd node_modules/thingtalk ; npm install --only=prod
	npm install --only=prod
	npm dedupe

platform_config.js:
	echo "exports.PKGLIBDIR = '$(prefix)'; exports.LOCALSTATEDIR = '$(localstatedir)';" > platform_config.js

SUBDIRS = model util public routes views node_modules/
our_sources = main.js frontend.js instance/platform.js instance/runengine.js platform_config.js

# Note the / after engine, forces symlink resolution
install: all
	install -m 0755 -d $(DESTDIR)$(prefix)
	for d in $(SUBDIRS) ; do cp -pr $$d/ $(DESTDIR)$(prefix) ; done
	install -m 0644 $(our_sources) $(DESTDIR)$(prefix)

clean:
	make -C sandbox clean
	make -C node_modules/thingengine-core clean
	make -C node_modules/sabrina clean

