
all: sandbox

CFLAGS := -Wall -Werror -g -O2 -fno-strict-overflow -fstack-protector-strong
DEPS := $(shell pkg-config --cflags --libs libsystemd)
CPPFLAGS := -D_FORTIFY_SOURCE=2

sandbox: sandbox.c
	$(CC) -o $@  $(CFLAGS) $(CPPFLAGS) $(DEPS) $<
	sudo chown root:root $@
	sudo chmod u+s $@

clean:
	rm -f sandbox
