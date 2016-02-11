
prefix ?= /opt/thingengine-cloud
localstatedir ?= /var/opt/thingengine-cloud

all: platform_config.js
	make -C sandbox all
	npm install
	npm dedupe

platform_config.js:
	echo "exports.PKGLIBDIR = '$(prefix)'; exports.LOCALSTATEDIR = '$(localstatedir)';" > platform_config.js

SUBDIRS = instance/engine model util public routes views node_modules/
our_sources = main.js frontend.js instance/platform.js instance/runengine.js platform_config.js

# Note the / after engine, forces symlink resolution
install: all
	install -m 0755 -d $(DESTDIR)$(prefix)
	for d in $(SUBDIRS) ; do cp -pr $$d/ $(DESTDIR)$(prefix) ; done
	install -m 0644 $(our_sources) $(DESTDIR)$(prefix)

clean:
	make -C ../../engine clean
	rm -fr node_modules/
