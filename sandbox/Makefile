
all: sandbox

sandbox: sandbox.c
	$(CC) -o $@ -Wall -Werror -g -O2 -fno-strict-overflow -fstack-protector-strong `pkg-config --cflags --libs libsystemd` $<
	sudo chown root:root $@
	sudo chmod u+s $@
