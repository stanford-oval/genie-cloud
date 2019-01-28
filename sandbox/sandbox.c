/* ThingEngine Sandbox
 *
 * Copyright (C) 2019 Giovanni Campagna
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU General Public License as
 * published by the Free Software Foundation; either
 * version 3 of the License, or (at your option) any later version.
 *
 * This software is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.   See the GNU
 * General Public License for more details.
 *
 * You should have received a copy of the GNU General Public License
 * along with this software. If not, see <http://www.gnu.org/licenses/>.
 *
 */

// This is a tiny wrapper over bwrap (bubblewrap) that sets up systemd
// logging in a way that we like

#define _GNU_SOURCE

#include <unistd.h>
#include <string.h>
#include <stdarg.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>
#include <syslog.h>
#include <stdbool.h>

#include <systemd/sd-journal.h>

static void
die_with_error (const char *format, ...)
{
  va_list args;
  int errsv;

  errsv = errno;

  va_start (args, format);
  vfprintf (stderr, format, args);
  va_end (args);

  fprintf (stderr, ": %s\n", strerror (errsv));

  exit (1);
}

static void
die (const char *format, ...)
{
  va_list args;

  va_start (args, format);
  vfprintf (stderr, format, args);
  va_end (args);
  exit (1);
}

struct strv {
  char **argv;
  size_t argc;
  size_t cap;
};

static void
strv_init (struct strv* strv)
{
  strv->argv = malloc (sizeof(const char*) * 8);
  if (strv->argv == NULL)
      die_with_error ("Failed to create argument array");
  strv->argc = 0;
  strv->cap = 8;
}

static void
strv_enlarge (struct strv* strv)
{
  char **argv = realloc (strv->argv, sizeof(char*) * strv->cap * 2);
  if (argv == NULL)
      die_with_error ("Failed to extend argument array to size %llu", (unsigned long long)strv->cap*2);

  strv->argv = argv;
  strv->cap *= 2;
}

static void
strv_add_one (struct strv *strv, const char *p)
{
  if (strv->argc >= strv->cap)
    strv_enlarge (strv);

  strv->argv[strv->argc] = (char*)p;
  strv->argc ++;
}

static void
strv_add (struct strv* strv, const char* first, ...)
{
  va_list args;
  const char *p;

  strv_add_one (strv, first);
  va_start (args, first);

  p = va_arg (args, const char*);
  while (p != NULL) {
    strv_add_one (strv, p);
    p = va_arg (args, const char*);
  }
}

static void
add_base_args (struct strv *strv)
{
  strv_add (strv, "bwrap",
            "--unshare-ipc",
            "--unshare-pid",
            "--new-session",
            "--info-fd", "3",
            NULL);
}

static void
add_usr_dirs (struct strv *strv)
{
  strv_add (strv,
            "--ro-bind", "/usr", "/usr",
            "--ro-bind", "/lib", "/lib",
            "--ro-bind", "/lib64", "/lib64",
            "--ro-bind", "/bin", "/bin",
            "--ro-bind", "/sbin", "/sbin",
            NULL);
}

static void
add_api_fs (struct strv *strv)
{
  strv_add (strv,
            "--proc", "/proc",
            "--dir", "/tmp",
            "--dir", "/var/tmp",
            "--dir", "/run",
            "--symlink", "../run", "/var/run",
            "--dev", "/dev",
            "--ro-bind", "/sys/block", "/sys/block",
            "--ro-bind", "/sys/bus", "/sys/bus",
            "--ro-bind", "/sys/class", "/sys/class",
            "--ro-bind", "/sys/dev", "/sys/dev",
            "--ro-bind", "/sys/devices", "/sys/devices",
            NULL);
}

static void
add_thingengine_dirs (struct strv *strv)
{
  char *pwd;
  char *thingengine_prefix;
  char *p, *q;

  pwd = getcwd (NULL, 0);

  strv_add (strv,
            "--chdir", "/app",
            "--bind", pwd, "/app",
            NULL);

  thingengine_prefix = strdup (getenv ("THINGENGINE_PREFIX"));
  if (thingengine_prefix == NULL)
    die_with_error ("Failed to copy prefix environment variable");

  for (p = thingengine_prefix; ;) {
    bool last;
    q = strchrnul (p, ':');
    last = *q == 0;
    *q = 0;

    strv_add (strv, "--ro-bind", p, p, NULL);
    if (last)
      break;
    else
      p = q + 1;
  }
}

static void
add_etc (struct strv *strv)
{
  static const char* whitelist[] = {
    "ca-certificates", "ca-certificates.conf", "ssl", "pki",

    "hostname", "localtime", "machine-id", "os-release",

    "nsswitch.conf", "host.conf", "hosts", "passwd", "group", "networks",
    "protocols", "services", "ethers", "shells",

    "ld.so.cache", "ld.so.conf", "ld.so.conf.d",

    "resolv.conf"
  };
  int i;

  for (i = 0; i < sizeof(whitelist)/sizeof(const char*); i++) {
    size_t sz = strlen("/etc/") + strlen(whitelist[i]) + 1;
    char *buffer = malloc(sz);
    if (buffer == NULL)
      die_with_error ("Failed to allocate buffer");
    snprintf (buffer, sz, "/etc/%s", whitelist[i]);

    if (access (buffer, F_OK) == 0)
      strv_add (strv, "--ro-bind", buffer, buffer, NULL);
  }
}

static void
strv_dump (struct strv* strv)
{
  size_t i = 0;
  fprintf (stderr, "%s", strv->argv[0]);
  for (i = 1; strv->argv[i]; i++)
    fprintf (stderr, " %s", strv->argv[i]);
  fprintf (stderr, "\n");
}

int main(int argc, const char* const *argv)
{
  int stdout_fileno, stderr_fileno;
  char syslog_identifier[] = "thingengine-child-XXXXXXXX";
  char *thingengine_prefix;
  char *thingengine_user_id;
  struct strv args;
  int i;

  if (argc < 2)
    die ("Usage: %s <command>\n", argv[0]);

  thingengine_prefix = getenv ("THINGENGINE_PREFIX");
  if (thingengine_prefix == NULL)
    die ("Missing THINGENGINE_PREFIX in the environment\n");
  thingengine_user_id = getenv ("THINGENGINE_USER_ID");
  if (thingengine_user_id == NULL)
    die ("Missing THINGENGINE_USER_ID in the environment\n");

  if (getenv ("THINGENGINE_DISABLE_SYSTEMD") == NULL) {
    snprintf (syslog_identifier, sizeof(syslog_identifier), "thingengine-child-%s",
              thingengine_user_id);
    stdout_fileno = sd_journal_stream_fd (syslog_identifier, LOG_INFO, 0);
    if (stdout_fileno < 0 || dup2 (stdout_fileno, 1) < 0 || close (stdout_fileno) < 0)
      die_with_error ("Failed to open stdout");
    stderr_fileno = sd_journal_stream_fd (syslog_identifier, LOG_WARNING, 0);
    if (stderr_fileno < 0 || dup2 (stderr_fileno, 2) < 0 || close (stderr_fileno) < 0)
      die_with_error ("Failed to open stderr");
  }

  strv_init (&args);
  add_base_args (&args);
  add_usr_dirs (&args);
  add_api_fs (&args);
  add_thingengine_dirs (&args);
  add_etc (&args);
  for (i = 1; i < argc; i++)
    strv_add_one (&args, argv[i]);
  strv_add_one (&args, NULL);

  if (getenv ("CI") != NULL)
    strv_dump (&args);

  execvp ("bwrap", args.argv);

  die_with_error ("Failed to spawn bwrap");
  return 0;
}
