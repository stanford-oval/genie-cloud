#!/bin/sh

set -e
set -x

podir=`dirname $0`
find almond/ routes/ model/ util/ nlp/ -name \*.js -or -name \*.ts > po/POTFILES
find views/ -name \*.pug > po/POTFILES.jade

xgettext -f po/POTFILES -x po/POTFILES.skip -o po/${npm_package_name}.pot -LJavaScript --from-code UTF-8 --package-name ${npm_package_name} --package-version ${npm_package_version};
xargs -a po/POTFILES.jade jsxgettext -k _,N_,gettext,ngettext,pgettext -L pug -o po/${npm_package_name}.pot -j
