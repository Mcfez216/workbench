/* adventure: a small text adventure. A finished version. */
#include <ctype.h>
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

enum room { HALL, LIBRARY, GARDEN, VAULT, ROOMS };
enum { NO_WAY = -1, LOCKED = -2 };

static const char *const DESC[ROOMS] = {
    "You are in the hall. Doors lead north and east.",
    "You are in the library. Dusty books everywhere. Doors lead north and south.",
    "You are in the garden. A path leads west.",
    "You are in the vault. Gold everywhere!",
};

#define MAX_ITEMS 8
struct place {
    const char *items[MAX_ITEMS]; /* in the order they were put there */
    int n;
};
static struct place rooms[ROOMS];
static struct place carried;

static int exit_to(int room, char dir)
{
    switch (room) {
    case HALL: return dir == 'n' ? LIBRARY : dir == 'e' ? GARDEN : NO_WAY;
    case LIBRARY: return dir == 's' ? HALL : dir == 'n' ? LOCKED : NO_WAY;
    case GARDEN: return dir == 'w' ? HALL : NO_WAY;
    default: return NO_WAY;
    }
}

static int find(const struct place *p, const char *name)
{
    for (int i = 0; i < p->n; i++)
        if (strcmp(p->items[i], name) == 0)
            return i;
    return -1;
}
static void move_item(struct place *from, int i, struct place *to)
{
    if (to->n < MAX_ITEMS)
        to->items[to->n++] = from->items[i];
    memmove(&from->items[i], &from->items[i + 1], (size_t)(from->n - i - 1) * sizeof from->items[0]);
    from->n--;
}

static void look(int room)
{
    puts(DESC[room]);
    if (rooms[room].n) {
        printf("You see: ");
        for (int i = 0; i < rooms[room].n; i++)
            printf("%sa %s", i ? ", " : "", rooms[room].items[i]);
        printf(".\n");
    }
}

/* A whole line, however long, on the heap (NULL at the end of input) */
static char *read_line(void)
{
    size_t cap = 128, len = 0;
    char *s = malloc(cap);
    int ch;
    if (!s) return NULL;
    while ((ch = getchar()) != EOF && ch != '\n') {
        if (len + 1 == cap) {
            char *t = realloc(s, cap *= 2);
            if (!t) { free(s); return NULL; }
            s = t;
        }
        s[len++] = (char)ch;
    }
    if (ch == EOF && len == 0) { free(s); return NULL; }
    s[len] = '\0';
    return s;
}

static char dir_of(const char *w)
{
    static const char *const names[] = {"north", "south", "east", "west", "n", "s", "e", "w"};
    for (int i = 0; i < 8; i++)
        if (strcmp(w, names[i]) == 0)
            return names[i][0];
    return 0;
}

int main(void)
{
    rooms[LIBRARY].items[rooms[LIBRARY].n++] = "lamp";
    rooms[GARDEN].items[rooms[GARDEN].n++] = "key";
    int room = HALL;
    puts(DESC[room]);
    char *line;
    while ((line = read_line()) != NULL) {
        /* the words, lowercased */
        char *words[3] = {NULL, NULL, NULL};
        int nw = 0;
        char *copy = malloc(strlen(line) + 1);
        if (!copy) { free(line); return 1; }
        strcpy(copy, line);
        for (char *p = copy; *p; p++)
            *p = (char)tolower((unsigned char)*p);
        for (char *w = strtok(copy, " \t\r"); w && nw < 3; w = strtok(NULL, " \t\r"))
            words[nw++] = w;
        int done = 0;
        if (nw == 0) {
            /* a blank line */
        } else if (strcmp(words[0], "look") == 0) {
            look(room);
        } else if (strcmp(words[0], "quit") == 0) {
            puts("Bye.");
            done = 1;
        } else if (strcmp(words[0], "inventory") == 0 || strcmp(words[0], "i") == 0) {
            if (!carried.n) puts("You carry nothing.");
            else {
                printf("You carry: ");
                for (int i = 0; i < carried.n; i++) printf("%s%s", i ? ", " : "", carried.items[i]);
                printf(".\n");
            }
        } else if (strcmp(words[0], "take") == 0 || strcmp(words[0], "drop") == 0) {
            int take = words[0][0] == 't';
            if (nw < 2) puts(take ? "Take what?" : "Drop what?");
            else {
                struct place *from = take ? &rooms[room] : &carried, *to = take ? &carried : &rooms[room];
                int i = find(from, words[1]);
                if (i < 0) printf(take ? "There is no %s here.\n" : "You don't have a %s.\n", words[1]);
                else { printf(take ? "Taken: %s.\n" : "Dropped: %s.\n", from->items[i]); move_item(from, i, to); }
            }
        } else if (strcmp(words[0], "go") == 0 || dir_of(words[0])) {
            char d = strcmp(words[0], "go") == 0 ? (nw > 1 ? dir_of(words[1]) : '?') : dir_of(words[0]);
            int to = d == '?' ? NO_WAY : exit_to(room, d);
            if (d == '?') puts("Go where?");
            else if (to == NO_WAY) puts("You can't go that way.");
            else if (to == LOCKED && find(&carried, "key") < 0) puts("The vault door is locked.");
            else if (to == LOCKED) {
                puts("You unlock the vault door with the key.");
                puts(DESC[VAULT]);
                puts("You win!");
                done = 1;
            } else {
                room = to;
                puts(DESC[room]);
            }
        } else {
            /* what was typed, without the spaces around it */
            char *s = line;
            while (isspace((unsigned char)*s)) s++;
            size_t n = strlen(s);
            while (n && isspace((unsigned char)s[n - 1])) s[--n] = '\0';
            printf("I don't understand \"%s\".\n", s);
        }
        free(copy);
        free(line);
        if (done) break;
    }
    return 0;
}
