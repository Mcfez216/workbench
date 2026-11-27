/* todo: a to-do list kept in todo.txt. A finished version. */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define FILE_NAME "todo.txt"
#define USAGE "usage: todo add <title> | list | done <id> | rm <id>\n"

struct task {
    long id;
    int done;
    char *title;
};

static struct task *tasks = NULL;
static size_t count = 0, cap = 0;
static long next_id = 1;

/* strdup isn't in standard C before C23: a copy of a string, on the heap */
static char *copy(const char *s)
{
    size_t n = strlen(s) + 1;
    char *p = malloc(n);
    if (!p) { fprintf(stderr, "todo: out of memory\n"); exit(1); }
    return memcpy(p, s, n);
}

static void push(long id, int done, const char *title)
{
    if (count == cap) {
        cap = cap ? cap * 2 : 8;
        struct task *t = realloc(tasks, cap * sizeof *tasks);
        if (!t) { fprintf(stderr, "todo: out of memory\n"); exit(1); }
        tasks = t;
    }
    tasks[count].id = id;
    tasks[count].done = done;
    tasks[count].title = copy(title);
    count++;
}

static void free_all(void)
{
    for (size_t i = 0; i < count; i++)
        free(tasks[i].title);
    free(tasks);
}

/* digits only, at least one, and it fits */
static int parse_id(const char *s, long *out)
{
    if (!*s || strlen(s) > 9)
        return 0;
    for (const char *p = s; *p; p++)
        if (!isdigit((unsigned char)*p))
            return 0;
    *out = strtol(s, NULL, 10);
    return 1;
}

static void broken(long line)
{
    fprintf(stderr, "todo: " FILE_NAME " line %ld is broken\n", line);
    free_all();
    exit(1);
}

static void load(void)
{
    FILE *f = fopen(FILE_NAME, "r");
    if (!f)
        return; /* no file yet: an empty list */
    char buf[4096];
    long n = 0;
    int seen_next = 0;
    while (fgets(buf, sizeof buf, f)) {
        n++;
        size_t len = strlen(buf);
        if (len && buf[len - 1] == '\n')
            buf[--len] = '\0';
        if (len == 0)
            continue;
        if (!seen_next) {
            if (strncmp(buf, "next ", 5) != 0 || !parse_id(buf + 5, &next_id)) { fclose(f); broken(n); }
            seen_next = 1;
            continue;
        }
        char *tab = strchr(buf, '\t');
        if (!tab) { fclose(f); broken(n); }
        *tab = '\0';
        long id;
        char *rest = tab + 1;
        if (!parse_id(buf, &id) || strlen(rest) < 5 || rest[0] != '[' || (rest[1] != ' ' && rest[1] != 'x') || rest[2] != ']' || rest[3] != ' ') { fclose(f); broken(n); }
        push(id, rest[1] == 'x', rest + 4);
    }
    fclose(f);
    if (n > 0 && !seen_next)
        broken(1);
}

static void save(void)
{
    FILE *f = fopen(FILE_NAME, "w");
    if (!f) { fprintf(stderr, "todo: can't write " FILE_NAME "\n"); free_all(); exit(1); }
    fprintf(f, "next %ld\n", next_id);
    for (size_t i = 0; i < count; i++)
        fprintf(f, "%ld\t[%c] %s\n", tasks[i].id, tasks[i].done ? 'x' : ' ', tasks[i].title);
    fclose(f);
}

static long find(const char *arg)
{
    long id;
    if (!parse_id(arg, &id)) {
        fprintf(stderr, "todo: \"%s\" isn't a task number\n", arg);
        free_all();
        exit(1);
    }
    for (size_t i = 0; i < count; i++)
        if (tasks[i].id == id)
            return (long)i;
    fprintf(stderr, "todo: no task %ld\n", id);
    free_all();
    exit(1);
}

int main(int argc, char **argv)
{
    if (argc < 2) { fputs(USAGE, stderr); return 2; }
    const char *cmd = argv[1];
    load();
    if (strcmp(cmd, "add") == 0) {
        char title[4096] = "";
        for (int i = 2; i < argc; i++) {
            if (strlen(title) + strlen(argv[i]) + 2 > sizeof title) break;
            if (i > 2) strcat(title, " ");
            strcat(title, argv[i]);
        }
        if (!title[0]) { fprintf(stderr, "todo: a task needs a title\n"); free_all(); return 1; }
        push(next_id, 0, title);
        printf("Added %ld: %s\n", next_id, title);
        next_id++;
        save();
    } else if (strcmp(cmd, "list") == 0 && (argc == 2 || (argc == 3 && strcmp(argv[2], "--pending") == 0))) {
        int pending = argc == 3, shown = 0;
        for (size_t i = 0; i < count; i++) {
            if (pending && tasks[i].done) continue;
            printf("%ld [%c] %s\n", tasks[i].id, tasks[i].done ? 'x' : ' ', tasks[i].title);
            shown++;
        }
        if (!shown) printf("Nothing to do.\n");
    } else if (strcmp(cmd, "done") == 0 && argc == 3) {
        long i = find(argv[2]);
        if (tasks[i].done) { fprintf(stderr, "todo: task %ld is already done\n", tasks[i].id); free_all(); return 1; }
        tasks[i].done = 1;
        printf("Done %ld: %s\n", tasks[i].id, tasks[i].title);
        save();
    } else if (strcmp(cmd, "rm") == 0 && argc == 3) {
        long i = find(argv[2]);
        printf("Removed %ld: %s\n", tasks[i].id, tasks[i].title);
        free(tasks[i].title);
        memmove(&tasks[i], &tasks[i + 1], (count - (size_t)i - 1) * sizeof *tasks);
        count--;
        save();
    } else {
        fputs(USAGE, stderr);
        free_all();
        return 2;
    }
    free_all();
    return 0;
}
