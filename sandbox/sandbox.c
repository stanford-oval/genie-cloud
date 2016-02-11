/* ThingEngine Sandbox
 * (adapted from xdg-app)
 *
 * Copyright (C) 2014 Alexander Larsson
 *               2016 Giovanni Campagna
 *
 * This program is free software; you can redistribute it and/or
 * modify it under the terms of the GNU Lesser General Public
 * License as published by the Free Software Foundation; either
 * version 2 of the License, or (at your option) any later version.
 *
 * This library is distributed in the hope that it will be useful,
 * but WITHOUT ANY WARRANTY; without even the implied warranty of
 * MERCHANTABILITY or FITNESS FOR A PARTICULAR PURPOSE.	 See the GNU
 * Lesser General Public License for more details.
 *
 * You should have received a copy of the GNU Lesser General Public
 * License along with this library. If not, see <http://www.gnu.org/licenses/>.
 *
 */

#define _GNU_SOURCE

#include <assert.h>
#include <arpa/inet.h>
#include <dirent.h>
#include <errno.h>
#include <fcntl.h>
#include <getopt.h>
#include <linux/loop.h>
#include <linux/netlink.h>
#include <linux/rtnetlink.h>
#include <net/if.h>
#include <netinet/in.h>
#include <sched.h>
#include <signal.h>
#include <poll.h>
#include <stdarg.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>
#include <sys/mount.h>
#include <sys/socket.h>
#include <sys/stat.h>
#include <sys/syscall.h>
#include <sys/types.h>
#include <sys/wait.h>
#include <sys/eventfd.h>
#include <sys/signalfd.h>
#include <sys/capability.h>
#include <sys/prctl.h>
#include <sys/utsname.h>
#include <unistd.h>
#include <pwd.h>
#include <grp.h>

#if 0
#define __debug__(x) printf x
#else
#define __debug__(x)
#endif

#define N_ELEMENTS(arr)		(sizeof (arr) / sizeof ((arr)[0]))

#define TRUE 1
#define FALSE 0
typedef int bool;

#define READ_END 0
#define WRITE_END 1

static int
fdwalk (int (*cb)(void *data, int fd), void *data)
{
  int open_max;
  int fd;
  int res = 0;
  DIR *d;

  if ((d = opendir ("/proc/self/fd")))
    {
      struct dirent *de;

      while ((de = readdir (d)))
        {
          long l;
          char *e = NULL;

          if (de->d_name[0] == '.')
            continue;

          errno = 0;
          l = strtol (de->d_name, &e, 10);
          if (errno != 0 || !e || *e)
            continue;

          fd = (int) l;

          if ((long) fd != l)
            continue;

          if (fd == dirfd (d))
            continue;

          if ((res = cb (data, fd)) != 0)
            break;
        }

      closedir (d);
      return res;
  }

  open_max = sysconf (_SC_OPEN_MAX);

  for (fd = 0; fd < open_max; fd++)
    if ((res = cb (data, fd)) != 0)
      break;

  return res;
}

/* Globals to avoid having to use getuid(), since the uid/gid changes during runtime */
static uid_t uid;
static gid_t gid;

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

  fprintf (stderr, "\n");

  exit (1);
}

static void
die_oom (void)
{
  die ("Out of memory");
}

static void *
xmalloc (size_t size)
{
  void *res = malloc (size);
  if (res == NULL)
    die_oom ();
  return res;
}

static void *
xrealloc (void *ptr, size_t size)
{
  void *res = realloc (ptr, size);
  if (size != 0 && res == NULL)
    die_oom ();
  return res;
}

static char *
xstrdup (const char *str)
{
  char *res;

  assert (str != NULL);

  res = strdup (str);
  if (res == NULL)
    die_oom ();

  return res;
}

static void
xsetenv (const char *name, const char *value, int overwrite)
{
  if (setenv (name, value, overwrite))
    die ("setenv failed");
}

static char *
strconcat (const char *s1,
           const char *s2)
{
  size_t len = 0;
  char *res;

  if (s1)
    len += strlen (s1);
  if (s2)
    len += strlen (s2);

  res = xmalloc (len + 1);
  *res = 0;
  if (s1)
    strcat (res, s1);
  if (s2)
    strcat (res, s2);

  return res;
}

static char *
strconcat3 (const char *s1,
	    const char *s2,
	    const char *s3)
{
  size_t len = 0;
  char *res;

  if (s1)
    len += strlen (s1);
  if (s2)
    len += strlen (s2);
  if (s3)
    len += strlen (s3);

  res = xmalloc (len + 1);
  *res = 0;
  if (s1)
    strcat (res, s1);
  if (s2)
    strcat (res, s2);
  if (s3)
    strcat (res, s3);

  return res;
}

static char*
strdup_printf (const char *format,
               ...)
{
  char *buffer = NULL;
  va_list args;

  va_start (args, format);
  vasprintf (&buffer, format, args);
  va_end (args);

  if (buffer == NULL)
    die_oom ();

  return buffer;
}

static inline int raw_clone(unsigned long flags, void *child_stack) {
#if defined(__s390__) || defined(__CRIS__)
        /* On s390 and cris the order of the first and second arguments
         * of the raw clone() system call is reversed. */
        return (int) syscall(__NR_clone, child_stack, flags);
#else
        return (int) syscall(__NR_clone, flags, child_stack);
#endif
}

static void
usage (char **argv)
{
  fprintf (stderr, "usage: %s [OPTIONS...] COMMAND [ARGS...]\n\n", argv[0]);
  exit (1);
}

static int
pivot_root (const char * new_root, const char * put_old)
{
#ifdef __NR_pivot_root
  return syscall(__NR_pivot_root, new_root, put_old);
#else
  errno = ENOSYS;
  return -1;
#endif
}

typedef enum {
  FILE_TYPE_REGULAR,
  FILE_TYPE_DIR,
  FILE_TYPE_SYMLINK,
  FILE_TYPE_SYSTEM_SYMLINK,
  FILE_TYPE_BIND,
  FILE_TYPE_BIND_RO,
  FILE_TYPE_MOUNT,
  FILE_TYPE_REMOUNT,
  FILE_TYPE_DEVICE,
  FILE_TYPE_SHM,
  FILE_TYPE_ETC_PASSWD,
  FILE_TYPE_ETC_GROUP,
} file_type_t;

typedef enum {
  FILE_FLAGS_NONE = 0,
  FILE_FLAGS_NON_FATAL = 1 << 0,
  FILE_FLAGS_IF_LAST_FAILED = 1 << 1,
  FILE_FLAGS_DEVICES = 1 << 2,
} file_flags_t;

typedef struct {
  file_type_t type;
  const char *name;
  mode_t mode;
  const char *data;
  file_flags_t flags;
  int *option;
} create_table_t;

typedef struct {
  const char *what;
  const char *where;
  const char *type;
  const char *options;
  unsigned long flags;
} mount_table_t;

static const create_table_t create[] = {
  { FILE_TYPE_DIR, ".oldroot", 0755 },
  { FILE_TYPE_DIR, "tmp", 01777 },
  { FILE_TYPE_DIR, "app", 0755},
  { FILE_TYPE_DIR, "var", 0755},
  { FILE_TYPE_DIR, "run", 0755},
  { FILE_TYPE_SYSTEM_SYMLINK, "lib64", 0755, "usr/lib64"},
  { FILE_TYPE_SYSTEM_SYMLINK, "lib", 0755, "usr/lib"},
  { FILE_TYPE_SYSTEM_SYMLINK, "bin", 0755, "usr/bin" },
  { FILE_TYPE_SYSTEM_SYMLINK, "sbin", 0755, "usr/sbin"},
  { FILE_TYPE_DIR, "proc", 0755},
  { FILE_TYPE_MOUNT, "proc"},
  { FILE_TYPE_BIND_RO, "proc/sys", 0755, "proc/sys"},
  { FILE_TYPE_BIND_RO, "proc/sysrq-trigger", 0755, "proc/sysrq-trigger"},
  { FILE_TYPE_BIND_RO, "proc/irq", 0755, "proc/irq"},
  { FILE_TYPE_BIND_RO, "proc/bus", 0755, "proc/bus"},
  { FILE_TYPE_DIR, "sys", 0755},
  { FILE_TYPE_DIR, "sys/block", 0755},
  { FILE_TYPE_BIND, "sys/block", 0755, "/sys/block"},
  { FILE_TYPE_DIR, "sys/bus", 0755},
  { FILE_TYPE_BIND, "sys/bus", 0755, "/sys/bus"},
  { FILE_TYPE_DIR, "sys/class", 0755},
  { FILE_TYPE_BIND, "sys/class", 0755, "/sys/class"},
  { FILE_TYPE_DIR, "sys/dev", 0755},
  { FILE_TYPE_BIND, "sys/dev", 0755, "/sys/dev"},
  { FILE_TYPE_DIR, "sys/devices", 0755},
  { FILE_TYPE_BIND, "sys/devices", 0755, "/sys/devices"},
  { FILE_TYPE_DIR, "dev", 0755},
  { FILE_TYPE_DIR, "dev/shm", 0755},
  { FILE_TYPE_SHM, "dev/shm"},
  { FILE_TYPE_DEVICE, "dev/null", 0666},
  { FILE_TYPE_DEVICE, "dev/zero", 0666},
  { FILE_TYPE_DEVICE, "dev/full", 0666},
  { FILE_TYPE_DEVICE, "dev/random", 0666},
  { FILE_TYPE_DEVICE, "dev/urandom", 0666},
  { FILE_TYPE_DEVICE, "dev/tty", 0666},
};

/* warning: Don't create any actual files here, as we could potentially
   write over bind mounts to the system */
static const create_table_t create_post[] = {
};

static const mount_table_t mount_table[] = {
  { "proc",      "proc",     "proc",  NULL,        MS_NOSUID|MS_NOEXEC|MS_NODEV           },
  { "devpts",    "dev/pts",  "devpts","newinstance,ptmxmode=0666,mode=620", MS_NOSUID|MS_NOEXEC },
  { "tmpfs",     "dev/shm",  "tmpfs", "mode=1777", MS_NOSUID|MS_NODEV|MS_STRICTATIME      },
};

const char *dont_mount_in_root[] = {
  ".", "..", "lib", "lib32", "lib64", "bin", "sbin", "boot", "root",
  "srv", "home", "media", "mnt", "tmp", "app", "proc", "sys", "dev",
  "var", "run"
};

typedef enum {
  BIND_READONLY = (1<<0),
  BIND_PRIVATE = (1<<1),
  BIND_DEVICES = (1<<2),
  BIND_RECURSIVE = (1<<3),
} bind_option_t;

static char *
load_file (const char *path)
{
  int fd;
  char *data;
  ssize_t data_read;
  ssize_t data_len;
  ssize_t res;

  fd = open (path, O_CLOEXEC | O_RDONLY);
  if (fd == -1)
    return NULL;

  data_read = 0;
  data_len = 4080;
  data = xmalloc (data_len);

  do
    {
      if (data_len >= data_read + 1)
        {
          data_len *= 2;
          data = xrealloc (data, data_len);
        }

      do
        res = read (fd, data + data_read, data_len - data_read - 1);
      while (res < 0 && errno == EINTR);

      if (res < 0)
        {
          int errsv = errno;
          free (data);
          errno = errsv;
          return NULL;
        }

      data_read += res;
    }
  while (res > 0);

  data[data_read] = 0;

  close (fd);

  return data;
}

static char *
skip_line (char *line)
{
  while (*line != 0 && *line != '\n')
    line++;

  if (*line == '\n')
    line++;

  return line;
}

static char *
skip_token (char *line, bool eat_whitespace)
{
  while (*line != ' ' && *line != '\n')
    line++;

  if (eat_whitespace && *line == ' ')
    line++;

  return line;
}

static bool
str_has_prefix (const char *str,
                const char *prefix)
{
  return strncmp (str, prefix, strlen (prefix)) == 0;
}

static char *
unescape_string (const char *escaped, ssize_t len)
{
  char *unescaped, *res;
  const char *end;

  if (len < 0)
    len = strlen (escaped);
  end = escaped + len;

  unescaped = res = xmalloc (len + 1);
  while (escaped < end)
    {
      if (*escaped == '\\')
	{
	  *unescaped++ =
	    ((escaped[1] - '0')  << 6) |
	    ((escaped[2] - '0')  << 3) |
	    ((escaped[3] - '0')  << 0);
	  escaped += 4;
	}
      else
	*unescaped++ = *escaped++;
    }
  *unescaped = 0;
  return res;
}

static char *
get_mountinfo (const char *mountpoint)
{
  char *line_mountpoint, *line_mountpoint_end;
  char *mountinfo;
  char *free_me = NULL;
  char *line, *line_start;
  char *res = NULL;
  int i;

  if (mountpoint[0] != '/')
    {
      char *cwd = getcwd(NULL, 0);
      if (cwd == NULL)
        die_oom ();

      mountpoint = free_me = strconcat3 (cwd, "/", mountpoint);
      free (cwd);
    }

  mountinfo = load_file ("/proc/self/mountinfo");
  if (mountinfo == NULL)
    return NULL;

  line = mountinfo;

  while (*line != 0)
    {
      char *unescaped;

      line_start = line;
      for (i = 0; i < 4; i++)
        line = skip_token (line, TRUE);
      line_mountpoint = line;
      line = skip_token (line, FALSE);
      line_mountpoint_end = line;
      line = skip_line (line);

      unescaped = unescape_string (line_mountpoint, line_mountpoint_end - line_mountpoint);
      if (strcmp (mountpoint, unescaped) == 0)
        {
	  free (unescaped);
          res = line_start;
          line[-1] = 0;
          break;
        }
      free (unescaped);
    }

  if (free_me)
    free (free_me);
  free (mountinfo);

  if (res)
    return xstrdup (res);
  return NULL;
}

static unsigned long
get_mountflags (const char *mountpoint)
{
  char *line, *token, *end_token;
  int i;
  unsigned long flags = 0;
  static const struct  { int flag; char *name; } flags_data[] = {
    { 0, "rw" },
    { MS_RDONLY, "ro" },
    { MS_NOSUID, "nosuid" },
    { MS_NODEV, "nodev" },
    { MS_NOEXEC, "noexec" },
    { MS_NOATIME, "noatime" },
    { MS_NODIRATIME, "nodiratime" },
    { MS_RELATIME, "relatime" },
    { 0, NULL }
  };

  line = get_mountinfo (mountpoint);
  if (line == NULL)
    return 0;

  token = line;
  for (i = 0; i < 5; i++)
    token = skip_token (token, TRUE);

  end_token = skip_token (token, FALSE);
  *end_token = 0;

  do {
    end_token = strchr (token, ',');
    if (end_token != NULL)
      *end_token = 0;

    for (i = 0; flags_data[i].name != NULL; i++)
      {
        if (strcmp (token, flags_data[i].name) == 0)
          flags |= flags_data[i].flag;
      }

    if (end_token)
      token = end_token + 1;
    else
      token = NULL;
  } while (token != NULL);

  free (line);

  return flags;
}


static char **
get_submounts (const char *parent_mount)
{
  char *mountpoint, *mountpoint_end;
  char **submounts;
  int i, n_submounts, submounts_size;
  char *mountinfo;
  char *line;

  mountinfo = load_file ("/proc/self/mountinfo");
  if (mountinfo == NULL)
    return NULL;

  submounts_size = 8;
  n_submounts = 0;
  submounts = xmalloc (sizeof (char *) * submounts_size);

  line = mountinfo;

  while (*line != 0)
    {
      char *unescaped;
      for (i = 0; i < 4; i++)
        line = skip_token (line, TRUE);
      mountpoint = line;
      line = skip_token (line, FALSE);
      mountpoint_end = line;
      line = skip_line (line);
      *mountpoint_end = 0;

      unescaped = unescape_string (mountpoint, -1);

      if (*unescaped == '/' &&
          str_has_prefix (unescaped + 1, parent_mount) &&
          *(unescaped + 1 + strlen (parent_mount)) == '/')
        {
          if (n_submounts + 1 >= submounts_size)
            {
              submounts_size *= 2;
              submounts = xrealloc (submounts, sizeof (char *) * submounts_size);
            }
          submounts[n_submounts++] = xstrdup (unescaped + 1);
        }
      free (unescaped);
    }

  submounts[n_submounts] = NULL;

  free (mountinfo);

  return submounts;
}

static int
bind_mount (const char *src, const char *dest, bind_option_t options)
{
  bool readonly = (options & BIND_READONLY) != 0;
  bool private = (options & BIND_PRIVATE) != 0;
  bool devices = (options & BIND_DEVICES) != 0;
  bool recursive = (options & BIND_RECURSIVE) != 0;
  unsigned long current_flags;
  char **submounts;
  int i;

  if (mount (src, dest, NULL, MS_MGC_VAL|MS_BIND|(recursive?MS_REC:0), NULL) != 0)
    return 1;

  if (private)
    {
      if (mount ("none", dest,
                 NULL, MS_REC|MS_PRIVATE, NULL) != 0)
        return 2;
    }

  current_flags = get_mountflags (dest);

  if (mount ("none", dest,
             NULL, MS_MGC_VAL|MS_BIND|MS_REMOUNT|current_flags|(devices?0:MS_NODEV)|MS_NOSUID|(readonly?MS_RDONLY:0), NULL) != 0)
    return 3;

  /* We need to work around the fact that a bind mount does not apply the flags, so we need to manually
   * apply the flags to all submounts in the recursive case.
   * Note: This does not apply the flags to mounts which are later propagated into this namespace.
   */
  if (recursive)
    {
      submounts = get_submounts (dest);
      if (submounts == NULL)
        return 4;

      for (i = 0; submounts[i] != NULL; i++)
        {
          current_flags = get_mountflags (submounts[i]);
          if (mount ("none", submounts[i],
                     NULL, MS_MGC_VAL|MS_BIND|MS_REMOUNT|current_flags|(devices?0:MS_NODEV)|MS_NOSUID|(readonly?MS_RDONLY:0), NULL) != 0)
            return 5;
          free (submounts[i]);
        }

      free (submounts);
    }

  return 0;
}

static bool
write_to_file (int fd, const char *content, ssize_t len)
{
  ssize_t res;

  while (len > 0)
    {
      res = write (fd, content, len);
      if (res < 0 && errno == EINTR)
	continue;
      if (res <= 0)
	return FALSE;
      len -= res;
      content += res;
    }

  return TRUE;
}

static bool
create_file (const char *path, mode_t mode, const char *content)
{
  int fd;
  bool res;
  int errsv;

  fd = creat (path, mode);
  if (fd == -1)
    return FALSE;

  res = TRUE;
  if (content)
    res = write_to_file (fd, content, strlen (content));

  errsv = errno;
  close (fd);
  errno = errsv;

  return res;
}

static void
create_files (const create_table_t *create, int n_create)
{
  bool last_failed = FALSE;
  int i;

  for (i = 0; i < n_create; i++)
    {
      char *name;
      char *data = NULL;
      mode_t mode = create[i].mode;
      file_flags_t flags = create[i].flags;
      int *option = create[i].option;
      unsigned long current_mount_flags;
      char *in_root;
      int k;
      bool found;
      int res;

      if ((flags & FILE_FLAGS_IF_LAST_FAILED) &&
          !last_failed)
        continue;

      if (option && !*option)
	continue;

      name = strdup_printf (create[i].name, uid);
      if (create[i].data)
	data = strdup_printf (create[i].data, uid);

      last_failed = FALSE;

      switch (create[i].type)
        {
        case FILE_TYPE_DIR:
          if (mkdir (name, mode) != 0)
            die_with_error ("creating dir %s", name);
          break;

        case FILE_TYPE_ETC_PASSWD:
          {
            char *content = NULL;
            struct passwd *p = getpwuid (uid);
            if (p)
              {
                content = strdup_printf ("%s:x:%d:%d:%s:%s:%s\n"
                                         "nfsnobody:x:65534:65534:Unmapped user:/:/sbin/nologin\n",
                                         p->pw_name,
                                         uid, gid,
                                         p->pw_gecos,
                                         p->pw_dir,
                                         p->pw_shell);

              }

            if (!create_file (name, mode, content))
              die_with_error ("creating file %s", name);

            if (content)
              free (content);
          }
          break;

        case FILE_TYPE_ETC_GROUP:
          {
            char *content = NULL;
            struct group *g = getgrgid (gid);
            struct passwd *p = getpwuid (uid);
            if (p && g)
              {
                content = strdup_printf ("%s:x:%d:%s\n"
                                         "nfsnobody:x:65534:\n",
                                         g->gr_name,
                                         gid, p->pw_name);
              }

            if (!create_file (name, mode, content))
              die_with_error ("creating file %s", name);

            if (content)
              free (content);
          }
          break;

        case FILE_TYPE_REGULAR:
          if (!create_file (name, mode, NULL))
            die_with_error ("creating file %s", name);
          break;

        case FILE_TYPE_SYSTEM_SYMLINK:
          /* Only create symlink if target exists */
          if (data != NULL && str_has_prefix (data, "usr/"))
	    {
	      struct stat buf;
	      char *in_usr = strconcat ("/usr/", data + strlen("usr/"));
              int res;

              res = lstat (in_usr, &buf);
              free (in_usr);

              if (res !=  0)
                data = NULL;
            }
          else
            data = NULL;

	  if (data == NULL)
	    break;

	  /* else Fall through */

        case FILE_TYPE_SYMLINK:
          if (symlink (data, name) != 0)
            die_with_error ("creating symlink %s", name);
          break;

        case FILE_TYPE_BIND:
        case FILE_TYPE_BIND_RO:
          if ((res = bind_mount (data, name,
                                 0 |
                                 ((create[i].type == FILE_TYPE_BIND_RO) ? BIND_READONLY : 0) |
                                 ((flags & FILE_FLAGS_DEVICES) ? BIND_DEVICES : 0)
				 )))
            {
              if (res > 1 || (flags & FILE_FLAGS_NON_FATAL) == 0)
                die_with_error ("mounting bindmount %s", name);
              last_failed = TRUE;
            }

          break;

        case FILE_TYPE_SHM:
        case FILE_TYPE_MOUNT:
          found = FALSE;
          for (k = 0; k < N_ELEMENTS(mount_table); k++)
            {
              if (strcmp (mount_table[k].where, name) == 0)
                {
                  if (mount(mount_table[k].what,
                            mount_table[k].where,
                            mount_table[k].type,
                            mount_table[k].flags,
                            mount_table[k].options) < 0)
                    die_with_error ("Mounting %s", name);
                  found = TRUE;
                }
            }

          if (!found)
            die ("Unable to find mount %s\n", name);

          break;

        case FILE_TYPE_REMOUNT:
          current_mount_flags = get_mountflags (name);
          if (mount ("none", name,
                     NULL, MS_MGC_VAL|MS_REMOUNT|current_mount_flags|mode, NULL) != 0)
            die_with_error ("Unable to remount %s\n", name);

          break;

        case FILE_TYPE_DEVICE:
          if (!create_file (name, mode, NULL))
            die_with_error ("creating file %s", name);

	  in_root = strconcat ("/", name);
          if ((res = bind_mount (in_root, name,
                                 BIND_DEVICES)))
            {
              if (res > 1 || (flags & FILE_FLAGS_NON_FATAL) == 0)
                die_with_error ("binding device %s", name);
            }
	  free (in_root);

          break;

        default:
          die ("Unknown create type %d\n", create[i].type);
        }

      free (name);
      free (data);
    }
}

static void
mount_extra_root_dirs ()
{
  DIR *dir;
  struct dirent *dirent;
  int i;

  /* Bind mount most dirs in / into the new root */
  dir = opendir("/");
  if (dir != NULL)
    {
      while ((dirent = readdir(dir)))
        {
          bool dont_mount = FALSE;
          char *path;
          struct stat st;

          for (i = 0; i < N_ELEMENTS(dont_mount_in_root); i++)
            {
              if (strcmp (dirent->d_name, dont_mount_in_root[i]) == 0)
                {
                  dont_mount = TRUE;
                  break;
                }
            }

          if (dont_mount)
            continue;

          path = strconcat ("/", dirent->d_name);

          if (lstat (path, &st) != 0)
            {
              free (path);
              continue;
            }

          if (S_ISDIR(st.st_mode))
            {
              if (mkdir (dirent->d_name, 0755) != 0)
                die_with_error (dirent->d_name);

              if (bind_mount (path, dirent->d_name, BIND_RECURSIVE | BIND_READONLY))
                die_with_error ("mount root subdir %s", dirent->d_name);
            }
          else if (S_ISLNK(st.st_mode))
            {
              ssize_t r;
              char *target;

              target = xmalloc (st.st_size + 1);
              r = readlink (path, target, st.st_size);
              if (r == -1)
                die_with_error ("readlink %s", path);
              target[r] = 0;

              if (symlink (target, dirent->d_name) != 0)
                die_with_error ("symlink %s %s", target, dirent->d_name);
            }

          free (path);
        }
    }
}

static void
block_sigchild_sigterm (void)
{
  sigset_t mask;

  sigemptyset (&mask);
  sigaddset (&mask, SIGCHLD);
  sigaddset (&mask, SIGTERM);

  if (sigprocmask (SIG_BLOCK, &mask, NULL) == -1)
    die_with_error ("sigprocmask");
}

static void
unblock_sigchild_sigterm (void)
{
  sigset_t mask;

  sigemptyset (&mask);
  sigaddset (&mask, SIGCHLD);
  sigaddset (&mask, SIGTERM);

  if (sigprocmask (SIG_UNBLOCK, &mask, NULL) == -1)
    die_with_error ("sigprocmask");
}

static void
unblock_sigterm (void)
{
  sigset_t mask;

  sigemptyset (&mask);
  sigaddset (&mask, SIGTERM);

  if (sigprocmask (SIG_UNBLOCK, &mask, NULL) == -1)
    die_with_error ("sigprocmask");
}

static int
close_extra_fds (void *data, int fd)
{
  int *extra_fds = (int *)data;
  int i;

  for (i = 0; extra_fds[i] != -1; i++)
    if (fd == extra_fds[i])
      return 0;

  if (fd <= 2)
    return 0;

  close (fd);
  return 0;
}

/* This stays around for as long as the initial process in the app does
 * and when that exits it exits, propagating the exit status. We do this
 * by having pid1 in the sandbox detect this exit and tell the monitor
 * the exit status via a eventfd. We also track the exit of the sandbox
 * pid1 via a signalfd for SIGCHLD, and exit with an error in this case.
 * This is to catch e.g. problems during setup. */
static void
monitor_child (int event_fd, int pid1_pid)
{
  int res;
  uint64_t val;
  ssize_t s;
  int signal_fd;
  sigset_t mask;
  struct pollfd fds[2];
  struct signalfd_siginfo fdsi;
  int dont_close[] = { event_fd, -1 };

  /* Close all extra fds in the monitoring process.
     Any passed in fds have been passed on to the child anyway. */
  fdwalk (close_extra_fds, dont_close);

  sigemptyset (&mask);
  sigaddset (&mask, SIGCHLD);
  sigaddset (&mask, SIGTERM);

  signal_fd = signalfd (-1, &mask, SFD_CLOEXEC | SFD_NONBLOCK);
  if (signal_fd == -1)
    die_with_error ("signalfd");

  fds[0].fd = event_fd;
  fds[0].events = POLLIN;
  fds[1].fd = signal_fd;
  fds[1].events = POLLIN;

  while (1)
    {
      fds[0].revents = fds[1].revents = 0;
      res = poll (fds, 2, -1);
      if (res == -1 && errno != EINTR)
	die_with_error ("poll");

      s = read (event_fd, &val, 8);
      if (s == -1 && errno != EINTR && errno != EAGAIN)
	die_with_error ("read eventfd");
      else if (s == 8)
	exit ((int)val - 1);

      s = read (signal_fd, &fdsi, sizeof (struct signalfd_siginfo));
      if (s == -1 && errno != EINTR && errno != EAGAIN)
	die_with_error ("read signalfd");
      else if (s == sizeof(struct signalfd_siginfo))
	{
	  if (fdsi.ssi_signo != SIGCHLD && fdsi.ssi_signo != SIGTERM)
	      die ("Read unexpected signal\n");
          if (fdsi.ssi_signo == SIGTERM)
            kill (pid1_pid, SIGTERM);
	  exit (1);
	}
    }
}

/* This is pid1 in the app sandbox. It is needed because we're using
 * pid namespaces, and someone has to reap zombies in it. We also detect
 * when the initial process (pid 2) dies and report its exit status to
 * the monitor so that it can return it to the original spawner.
 *
 * When there are no other processes in the sandbox the wait will return
 *  ECHILD, and we then exit pid1 to clean up the sandbox. */
static int
do_init (int event_fd, pid_t initial_pid)
{
  int initial_exit_status = 1;

  while (1)
    {
      pid_t child;
      int status;

      child = wait (&status);
      if (child == initial_pid)
	{
	  uint64_t val;

	  if (WIFEXITED (status))
	    initial_exit_status = WEXITSTATUS(status);

	  val = initial_exit_status + 1;
	  write (event_fd, &val, 8);
	}

      if (child == -1 && errno != EINTR)
	{
	  if (errno != ECHILD)
	    die_with_error ("init wait()");
	  break;
	}
    }

  return initial_exit_status;
}

#define REQUIRED_CAPS (CAP_TO_MASK(CAP_SYS_ADMIN))

static void
acquire_caps (void)
{
  struct __user_cap_header_struct hdr;
  struct __user_cap_data_struct data;

  if (getuid () != geteuid ())
    {
      /* Tell kernel not clear capabilities when dropping root */
      if (prctl (PR_SET_KEEPCAPS, 1, 0, 0, 0) < 0)
        die_with_error ("prctl(PR_SET_KEEPCAPS) failed");

      /* Drop root uid, but retain the required permitted caps */
      if (setuid (getuid ()) < 0)
        die_with_error ("unable to drop privs");
    }

  memset (&hdr, 0, sizeof(hdr));
  hdr.version = _LINUX_CAPABILITY_VERSION;

  /* Drop all non-require capabilities */
  data.effective = REQUIRED_CAPS;
  data.permitted = REQUIRED_CAPS;
  data.inheritable = 0;
  if (capset (&hdr, &data) < 0)
    die_with_error ("capset failed to acquire");
}

static void
drop_caps (void)
{
  struct __user_cap_header_struct hdr;
  struct __user_cap_data_struct data;

  memset (&hdr, 0, sizeof(hdr));
  hdr.version = _LINUX_CAPABILITY_VERSION;
  data.effective = 0;
  data.permitted = 0;
  data.inheritable = 0;

  if (capset (&hdr, &data) < 0)
    die_with_error ("capset failed to release");
}

static char *arg_space;
size_t arg_space_size;

static void
clean_argv (int argc,
            char **argv)
{
  int i;
  char *newargv;

  arg_space = argv[0];
  arg_space_size = argv[argc-1] - argv[0] + strlen (argv[argc-1]) + 1;
  newargv = xmalloc (arg_space_size);
  memcpy (newargv, arg_space, arg_space_size);
  for (i = 0; i < argc; i++)
    argv[i] = newargv + (argv[i] - arg_space);
}

static void
set_procname (const char *name)
{
  strncpy (arg_space, name, arg_space_size - 1);
  arg_space[arg_space_size] = 0;
}

static pid_t initial_pid;

static void
monitor_sigterm (int signal)
{
  kill (initial_pid, SIGTERM);
}

int
main (int argc,
      char **argv)
{
  mode_t old_umask;
  char *newroot;
  char **args;
  char *app_id;
  int n_args;
  char *old_cwd = NULL;
  int c;
  pid_t pid;
  int event_fd;
  int sync_fd = -1;

  /* Get the capabilities we need, drop root */
  acquire_caps ();

  /* Never gain any more privs during exec */
  if (prctl (PR_SET_NO_NEW_PRIVS, 1, 0, 0, 0) < 0)
    die_with_error ("prctl(PR_SET_NO_NEW_CAPS) failed");

  clean_argv (argc, argv);

  while ((c = getopt (argc, argv, "+i:h")) >= 0)
    {
      switch (c)
        {
        case 'i':
          /* ignore: this is a place holder for a large argument
             that contains the cloud ID
          */
          break;

        case 'h':
        default: /* '?' */
          usage (argv);
      }
    }

  args = &argv[optind];
  n_args = argc - optind;

  if (n_args < 1)
    usage (argv);

  /* The initial code is run with high permissions
     (at least CAP_SYS_ADMIN), so take lots of care. */

  __debug__(("Creating sandbox-root dir\n"));

  uid = getuid ();
  gid = getgid ();

  newroot = "/srv/thingengine/sandbox-root";
  if (mkdir (newroot, 0755) && errno != EEXIST)
    die_with_error ("Creating sandbox-root failed");

  __debug__(("creating new namespace\n"));

  event_fd = eventfd (0, EFD_CLOEXEC | EFD_NONBLOCK);

  old_cwd = get_current_dir_name ();
  app_id = basename (xstrdup (old_cwd));

  block_sigchild_sigterm (); /* Block before we clone to avoid races */

  pid = raw_clone (SIGCHLD | CLONE_NEWNS | CLONE_NEWPID | CLONE_NEWIPC,
		   NULL);
  if (pid == -1)
    die_with_error ("Creating new namespace failed");

  if (pid != 0)
    {
      /*if (app_id)
        set_procname (strdup_printf ("thingengine-sandbox %s launcher", app_id));*/
      monitor_child (event_fd, pid);
      exit (0); /* Should not be reached, but better safe... */
    }

  old_umask = umask (0);

  /* Mark everything as slave, so that we still
   * receive mounts from the real root, but don't
   * propagate mounts to the real root. */
  if (mount (NULL, "/", NULL, MS_SLAVE|MS_REC, NULL) < 0)
    die_with_error ("Failed to make / slave");

  /* Create a tmpfs which we will use as / in the namespace */
  if (mount ("", newroot, "tmpfs", MS_NODEV|MS_NOSUID, NULL) != 0)
    die_with_error ("Failed to mount tmpfs");

  if (chdir (newroot) != 0)
      die_with_error ("chdir");

  create_files (create, N_ELEMENTS (create));

  if (bind_mount (old_cwd, "app", BIND_PRIVATE))
    die_with_error ("mount app");

  create_files (create_post, N_ELEMENTS (create_post));

  mount_extra_root_dirs ();

  if (pivot_root (newroot, ".oldroot"))
    die_with_error ("pivot_root");

  chdir ("/");

  /* The old root better be rprivate or we will send unmount events to the parent namespace */
  if (mount (".oldroot", ".oldroot", NULL, MS_REC|MS_PRIVATE, NULL) != 0)
    die_with_error ("Failed to make old root rprivate");

  if (umount2 (".oldroot", MNT_DETACH))
    die_with_error ("unmount oldroot");

  umask (old_umask);

  /* Now we have everything we need CAP_SYS_ADMIN for, so drop it */
  drop_caps ();

  chdir ("/app");
  xsetenv ("PWD", "/app", 1);
  free (old_cwd);

  __debug__(("forking for child\n"));

  pid = fork ();
  if (pid == -1)
    die_with_error("Can't fork for child");

  if (pid == 0)
    {
      __debug__(("launch executable %s\n", args[0]));

      if (sync_fd != -1)
	close (sync_fd);

      unblock_sigchild_sigterm ();

      if (execvp (args[0], args) == -1)
        die_with_error ("execvp %s", args[0]);
      return 0;
    }

  initial_pid = pid;

  /* Close all extra fds in pid 1.
     Any passed in fds have been passed on to the child anyway. */
  {
    int dont_close[] = { event_fd, sync_fd, -1 };
    fdwalk (close_extra_fds, dont_close);
  }

  {
    struct sigaction act;

    act.sa_handler = monitor_sigterm;
    sigemptyset (&act.sa_mask);
    act.sa_flags = 0;

    if (sigaction (SIGTERM, &act, NULL) < 0)
      die_with_error ("sigaction SIGTERM");

    unblock_sigterm ();
  }

  if (app_id)
    set_procname (strdup_printf ("thingengine-sandbox %s monitor", app_id));
  return do_init (event_fd, pid);
}
