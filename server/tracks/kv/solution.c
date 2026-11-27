/* kv: a key-value store kept as an append-only log in kv.db. A finished version. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define DB "kv.db"
#define USAGE "usage: kv set <key> <value> | get <key> | del <key> | list | compact\n"

struct entry {
    char *key, *value;
};
static struct entry *map = NULL;
static size_t n = 0, cap = 0;
static long log_lines = 0;

static void die(const char *msg, int code)
{
    fputs(msg, stderr);
    exit(code);
}

static char *copy(const char *s)
{
    size_t len = strlen(s) + 1;
    char *p = malloc(len);
    if (!p) die("kv: out of memory\n", 1);
    return memcpy(p, s, len);
}

static long find(const char *key)
{
    for (size_t i = 0; i < n; i++)
        if (strcmp(map[i].key, key) == 0)
            return (long)i;
    return -1;
}

static void put(const char *key, const char *value)
{
    long i = find(key);
    if (i >= 0) {
        free(map[i].value);
        map[i].value = copy(value);
        return;
    }
    if (n == cap) {
        cap = cap ? cap * 2 : 16;
        struct entry *m = realloc(map, cap * sizeof *map);
        if (!m) die("kv: out of memory\n", 1);
        map = m;
    }
    map[n].key = copy(key);
    map[n].value = copy(value);
    n++;
}

static void del(const char *key)
{
    long i = find(key);
    if (i < 0) return;
    free(map[i].key);
    free(map[i].value);
    map[i] = map[--n];
}

static void free_all(void)
{
    for (size_t i = 0; i < n; i++) { free(map[i].key); free(map[i].value); }
    free(map);
}

static int good_key(const char *k)
{
    return *k && !strpbrk(k, "=\t \n");
}

/* Replays the log into the map; a line that isn't a set or a del stops everything */
static void load(void)
{
    FILE *f = fopen(DB, "r");
    if (!f) return;
    size_t len = 0, bufcap = 256;
    char *line = malloc(bufcap);
    int ch;
    if (!line) die("kv: out of memory\n", 1);
    for (;;) {
        ch = getc(f);
        if (ch != EOF && ch != '\n') {
            if (len + 1 == bufcap) {
                char *t = realloc(line, bufcap *= 2);
                if (!t) die("kv: out of memory\n", 1);
                line = t;
            }
            line[len++] = (char)ch;
            continue;
        }
        if (ch == EOF && len == 0) break;
        line[len] = '\0';
        log_lines++;
        char *parts[4] = {NULL};
        int np = 0;
        char *p = line;
        parts[np++] = p;
        while ((p = strchr(p, '\t')) && np < 4) { *p++ = '\0'; parts[np++] = p; }
        int ok = 0;
        if (np == 3 && strcmp(parts[0], "set") == 0 && good_key(parts[1])) { put(parts[1], parts[2]); ok = 1; }
        else if (np == 2 && strcmp(parts[0], "del") == 0 && good_key(parts[1])) { del(parts[1]); ok = 1; }
        if (!ok) {
            fprintf(stderr, "kv: " DB " line %ld is broken\n", log_lines);
            free(line);
            fclose(f);
            free_all();
            exit(1);
        }
        len = 0;
        if (ch == EOF) break;
    }
    free(line);
    fclose(f);
}

static void append(const char *kind, const char *key, const char *value)
{
    FILE *f = fopen(DB, "a");
    if (!f) die("kv: can't write " DB "\n", 1);
    if (value) fprintf(f, "%s\t%s\t%s\n", kind, key, value);
    else fprintf(f, "%s\t%s\n", kind, key);
    fclose(f);
}

static int by_key(const void *a, const void *b)
{
    return strcmp(((const struct entry *)a)->key, ((const struct entry *)b)->key);
}

int main(int argc, char **argv)
{
    if (argc < 2) die(USAGE, 2);
    const char *cmd = argv[1];
    int ok = (strcmp(cmd, "set") == 0 && argc >= 4) || ((strcmp(cmd, "get") == 0 || strcmp(cmd, "del") == 0) && argc == 3)
             || ((strcmp(cmd, "list") == 0 || strcmp(cmd, "compact") == 0) && argc == 2);
    if (!ok) die(USAGE, 2);
    load();
    int status = 0;
    if (argc >= 3 && !good_key(argv[2])) { free_all(); die("kv: bad key\n", 1); }
    if (strcmp(cmd, "set") == 0) {
        size_t total = 1;
        for (int i = 3; i < argc; i++) total += strlen(argv[i]) + 1;
        char *value = malloc(total);
        if (!value) die("kv: out of memory\n", 1);
        value[0] = '\0';
        for (int i = 3; i < argc; i++) { if (i > 3) strcat(value, " "); strcat(value, argv[i]); }
        if (strpbrk(value, "\t\n")) { free(value); free_all(); die("kv: bad value\n", 1); }
        append("set", argv[2], value);
        free(value);
    } else if (strcmp(cmd, "get") == 0 || strcmp(cmd, "del") == 0) {
        long i = find(argv[2]);
        if (i < 0) { fprintf(stderr, "kv: no key \"%s\"\n", argv[2]); status = 1; }
        else if (cmd[0] == 'g') puts(map[i].value);
        else append("del", argv[2], NULL);
    } else if (strcmp(cmd, "list") == 0) {
        if (n) qsort(map, n, sizeof *map, by_key); /* qsort(NULL, 0, ...) is undefined behaviour */
        for (size_t i = 0; i < n; i++) printf("%s=%s\n", map[i].key, map[i].value);
    } else {
        if (n) qsort(map, n, sizeof *map, by_key); /* qsort(NULL, 0, ...) is undefined behaviour */
        FILE *f = fopen(DB ".tmp", "w");
        if (!f) { free_all(); die("kv: can't write " DB ".tmp\n", 1); }
        for (size_t i = 0; i < n; i++) fprintf(f, "set\t%s\t%s\n", map[i].key, map[i].value);
        if (fclose(f) != 0) { free_all(); die("kv: can't write " DB ".tmp\n", 1); }
        remove(DB); /* rename won't replace a file on Windows */
        if (rename(DB ".tmp", DB) != 0) { free_all(); die("kv: can't replace " DB "\n", 1); }
        printf("kept %zu, dropped %ld\n", n, log_lines - (long)n);
    }
    free_all();
    return status;
}
