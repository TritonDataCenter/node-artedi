#
# This Source Code Form is subject to the terms of the Mozilla Public
# License, v. 2.0. If a copy of the MPL was not distributed with this
# file, You can obtain one at http://mozilla.org/MPL/2.0/.
#
# Copyright (c) 2017, Joyent, Inc.
#

#
# Tools
#
NPM_EXEC	:= $(shell which npm)
NPM		:= npm
TAP		:= ./node_modules/.bin/tape
JSON		:= ./node_modules/.bin/json

#
# Makefile.defs defines variables used as part of the build process.
#
include ./tools/mk/Makefile.defs

#
# Configuration used by Makefile.defs and Makefile.targ to generate
# "check" and "docs" targets.
#
DOC_FILES	 = README.md
JSON_FILES	 = package.json
JS_FILES	:= $(shell find lib test -name '*.js')
JSL_FILES_NODE	 = $(JS_FILES)
JSSTYLE_FILES	 = $(JS_FILES)

JSL_CONF_NODE	 = tools/jsl.node.conf
JSSTYLE_FLAGS	 = -f tools/jsstyle.conf
ESLINT		:= ./node_modules/.bin/eslint
ESLINT_CONF	:= tools/eslint.node.conf
ESLINT_FILES	:= $(JS_FILES)

include ./tools/mk/Makefile.node_deps.defs

#
# Repo-specific targets
#
.PHONY: all
all: $(TAP) $(REPO_DEPS)
	$(NPM) rebuild

$(TAP): | $(NPM_EXEC)
	$(NPM) install

$(JSON): | $(NPM_EXEC)
	$(NPM) install

CLEAN_FILES += ./node_modules

.PHONY: test
test: $(TAP)
	TAP=1 $(TAP) test/*.test.js

# Before running the 'check' target, we first make sure the 'json' tool is
# installed locally.
check:: $(JSON)

#
# Target definitions.  This is where we include the target Makefiles for
# the "defs" Makefiles we included above.
#

include ./tools/mk/Makefile.deps

ifeq ($(shell uname -s),SunOS)
	include ./tools/mk/Makefile.node_prebuilt.targ
else
	include ./tools/mk/Makefile.node.targ
endif

include ./tools/mk/Makefile.node_deps.targ
include ./tools/mk/Makefile.targ
