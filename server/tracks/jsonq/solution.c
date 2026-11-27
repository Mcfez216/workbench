/* jsonq: parse JSON by hand, print the value a path picks. A finished version. */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX_DEPTH 1000

enum kind { NUMBER, STRING, LITERAL, ARRAY, OBJECT };

struct node {
    enum kind kind;
    char *text;            /* a number or literal as written; a string decoded */
    size_t len;            /* a string's length: it can hold a \u0000 */
    struct node **items;   /* an array's items, an object's values */
    struct node **keys;    /* an object's keys (STRING nodes), in order */
    size_t n, cap;
};

static const char *src;
static size_t pos, size;

static void bad(void)
{
    fprintf(stderr, "jsonq: bad JSON at byte %zu\n", pos);
    exit(2); /* the OS frees everything */
}
static void *grab(size_t n)
{
    void *p = calloc(1, n ? n : 1);
    if (!p) { fprintf(stderr, "jsonq: out of memory\n"); exit(1); }
    return p;
}
static void skip_ws(void)
{
    while (pos < size && (src[pos] == ' ' || src[pos] == '\t' || src[pos] == '\n' || src[pos] == '\r'))
        pos++;
}
static int digit(char c) { return c >= '0' && c <= '9'; }

static struct node *make(enum kind k)
{
    struct node *n = grab(sizeof *n);
    n->kind = k;
    return n;
}
static void add(struct node *parent, struct node *key, struct node *item)
{
    if (parent->n == parent->cap) {
        parent->cap = parent->cap ? parent->cap * 2 : 4;
        parent->items = realloc(parent->items, parent->cap * sizeof *parent->items);
        if (parent->kind == OBJECT) parent->keys = realloc(parent->keys, parent->cap * sizeof *parent->keys);
        if (!parent->items || (parent->kind == OBJECT && !parent->keys)) { fprintf(stderr, "jsonq: out of memory\n"); exit(1); }
    }
    if (parent->kind == OBJECT) parent->keys[parent->n] = key;
    parent->items[parent->n++] = item;
}

static void put_utf8(char *out, size_t *len, unsigned long cp)
{
    if (cp < 0x80) out[(*len)++] = (char)cp;
    else if (cp < 0x800) { out[(*len)++] = (char)(0xC0 | (cp >> 6)); out[(*len)++] = (char)(0x80 | (cp & 0x3F)); }
    else if (cp < 0x10000) { out[(*len)++] = (char)(0xE0 | (cp >> 12)); out[(*len)++] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[(*len)++] = (char)(0x80 | (cp & 0x3F)); }
    else { out[(*len)++] = (char)(0xF0 | (cp >> 18)); out[(*len)++] = (char)(0x80 | ((cp >> 12) & 0x3F)); out[(*len)++] = (char)(0x80 | ((cp >> 6) & 0x3F)); out[(*len)++] = (char)(0x80 | (cp & 0x3F)); }
}
static unsigned long hex4(void)
{
    if (pos + 4 > size) bad();
    unsigned long v = 0;
    for (int i = 0; i < 4; i++) {
        char c = src[pos++];
        v <<= 4;
        if (digit(c)) v |= (unsigned long)(c - '0');
        else if (c >= 'a' && c <= 'f') v |= (unsigned long)(c - 'a' + 10);
        else if (c >= 'A' && c <= 'F') v |= (unsigned long)(c - 'A' + 10);
        else bad();
    }
    return v;
}

static struct node *parse_string(void)
{
    pos++; /* the opening quote */
    struct node *n = make(STRING);
    n->text = grab(size - pos + 1); /* decoded is never longer than written */
    for (;;) {
        if (pos >= size) bad();
        unsigned char c = (unsigned char)src[pos];
        if (c == '"') { pos++; break; }
        if (c < 0x20) bad();
        if (c != '\\') { n->text[n->len++] = (char)c; pos++; continue; }
        pos++;
        if (pos >= size) bad();
        char e = src[pos++];
        switch (e) {
        case '"': n->text[n->len++] = '"'; break;
        case '\\': n->text[n->len++] = '\\'; break;
        case '/': n->text[n->len++] = '/'; break;
        case 'b': n->text[n->len++] = '\b'; break;
        case 'f': n->text[n->len++] = '\f'; break;
        case 'n': n->text[n->len++] = '\n'; break;
        case 'r': n->text[n->len++] = '\r'; break;
        case 't': n->text[n->len++] = '\t'; break;
        case 'u': {
            unsigned long cp = hex4();
            if (cp >= 0xD800 && cp <= 0xDBFF) {
                if (pos + 2 > size || src[pos] != '\\' || src[pos + 1] != 'u') bad();
                pos += 2;
                unsigned long lo = hex4();
                if (lo < 0xDC00 || lo > 0xDFFF) bad();
                cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
            } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
                bad();
            }
            put_utf8(n->text, &n->len, cp);
            break;
        }
        default: bad();
        }
    }
    return n;
}

static struct node *parse_value(int depth);

static struct node *parse_number(void)
{
    size_t start = pos;
    if (src[pos] == '-') pos++;
    if (pos < size && src[pos] == '0') pos++;
    else if (pos < size && digit(src[pos])) while (pos < size && digit(src[pos])) pos++;
    else bad();
    if (pos < size && src[pos] == '.') {
        pos++;
        if (pos >= size || !digit(src[pos])) bad();
        while (pos < size && digit(src[pos])) pos++;
    }
    if (pos < size && (src[pos] == 'e' || src[pos] == 'E')) {
        pos++;
        if (pos < size && (src[pos] == '+' || src[pos] == '-')) pos++;
        if (pos >= size || !digit(src[pos])) bad();
        while (pos < size && digit(src[pos])) pos++;
    }
    struct node *n = make(NUMBER);
    n->len = pos - start;
    n->text = grab(n->len + 1);
    memcpy(n->text, src + start, n->len);
    return n;
}

static struct node *parse_value(int depth)
{
    if (depth > MAX_DEPTH) bad();
    skip_ws();
    if (pos >= size) bad();
    char c = src[pos];
    if (c == '"') return parse_string();
    if (c == '-' || digit(c)) return parse_number();
    if (c == '[' || c == '{') {
        int obj = c == '{';
        struct node *n = make(obj ? OBJECT : ARRAY);
        pos++;
        skip_ws();
        if (pos < size && src[pos] == (obj ? '}' : ']')) { pos++; return n; }
        for (;;) {
            struct node *key = NULL;
            if (obj) {
                skip_ws();
                if (pos >= size || src[pos] != '"') bad();
                key = parse_string();
                skip_ws();
                if (pos >= size || src[pos] != ':') bad();
                pos++;
            }
            add(n, key, parse_value(depth + 1));
            skip_ws();
            if (pos < size && src[pos] == ',') { pos++; continue; }
            if (pos < size && src[pos] == (obj ? '}' : ']')) { pos++; return n; }
            bad();
        }
    }
    static const char *const words[] = {"true", "false", "null"};
    for (int i = 0; i < 3; i++) {
        size_t len = strlen(words[i]);
        if (size - pos >= len && memcmp(src + pos, words[i], len) == 0) {
            struct node *n = make(LITERAL);
            n->text = grab(len + 1);
            memcpy(n->text, words[i], len);
            n->len = len;
            pos += len;
            return n;
        }
    }
    bad();
    return NULL;
}

static void print_string(const char *s, size_t len)
{
    putchar('"');
    for (size_t i = 0; i < len; i++) {
        unsigned char c = (unsigned char)s[i];
        switch (c) {
        case '"': fputs("\\\"", stdout); break;
        case '\\': fputs("\\\\", stdout); break;
        case '\n': fputs("\\n", stdout); break;
        case '\t': fputs("\\t", stdout); break;
        case '\r': fputs("\\r", stdout); break;
        case '\b': fputs("\\b", stdout); break;
        case '\f': fputs("\\f", stdout); break;
        default:
            if (c < 0x20) printf("\\u%04x", c);
            else putchar(c);
        }
    }
    putchar('"');
}
static void print(const struct node *n)
{
    switch (n->kind) {
    case NUMBER:
    case LITERAL: fwrite(n->text, 1, n->len, stdout); break;
    case STRING: print_string(n->text, n->len); break;
    case ARRAY:
    case OBJECT:
        putchar(n->kind == OBJECT ? '{' : '[');
        for (size_t i = 0; i < n->n; i++) {
            if (i) putchar(',');
            if (n->kind == OBJECT) { print_string(n->keys[i]->text, n->keys[i]->len); putchar(':'); }
            print(n->items[i]);
        }
        putchar(n->kind == OBJECT ? '}' : ']');
        break;
    }
}

static void free_node(struct node *n)
{
    for (size_t i = 0; i < n->n; i++) {
        free_node(n->items[i]);
        if (n->keys) free_node(n->keys[i]);
    }
    free(n->items);
    free(n->keys);
    free(n->text);
    free(n);
}

static void path_error(const char *what, struct node *root, char *input)
{
    fprintf(stderr, "jsonq: %s\n", what);
    free_node(root);
    free(input);
    exit(1);
}

int main(int argc, char **argv)
{
    if (argc != 2) { fprintf(stderr, "usage: jsonq <path>   (for example: jsonq .users[0].name < data.json)\n"); return 2; }
    size_t cap = 4096;
    char *input = grab(cap);
    size_t got;
    size = 0;
    while ((got = fread(input + size, 1, cap - size, stdin)) > 0) {
        size += got;
        if (size == cap) { input = realloc(input, cap *= 2); if (!input) { fprintf(stderr, "jsonq: out of memory\n"); return 1; } }
    }
    src = input;
    pos = 0;
    struct node *root = parse_value(0);
    skip_ws();
    if (pos != size) bad();

    /* the path: . on its own, or .key and [index] steps */
    const char *p = argv[1];
    struct node *at = root;
    if (strcmp(p, ".") != 0) {
        if (*p != '.' && *p != '[') path_error("a path starts with . or [", root, input);
        while (*p) {
            char msg[300];
            if (*p == '.') {
                const char *start = ++p;
                while (*p && *p != '.' && *p != '[') p++;
                size_t klen = (size_t)(p - start);
                if (!klen) path_error("an empty key in the path", root, input);
                if (at->kind != OBJECT) path_error("asked for a key of something that isn't an object", root, input);
                struct node *found = NULL;
                for (size_t i = 0; i < at->n; i++)
                    if (at->keys[i]->len == klen && memcmp(at->keys[i]->text, start, klen) == 0) found = at->items[i];
                if (!found) { snprintf(msg, sizeof msg, "no key \"%.*s\"", (int)(klen > 200 ? 200 : klen), start); path_error(msg, root, input); }
                at = found;
            } else if (*p == '[') {
                char *end;
                p++;
                if (!digit(*p)) path_error("an index is a number: [0]", root, input);
                unsigned long i = strtoul(p, &end, 10);
                if (*end != ']') path_error("an index is a number: [0]", root, input);
                p = end + 1;
                if (at->kind != ARRAY) path_error("asked for an index of something that isn't an array", root, input);
                if (i >= at->n) { snprintf(msg, sizeof msg, "index %lu is past the end (%zu items)", i, at->n); path_error(msg, root, input); }
                at = at->items[i];
            } else {
                path_error("a path is .key and [index] steps", root, input);
            }
        }
    }
    print(at);
    putchar('\n');
    free_node(root);
    free(input);
    return 0;
}
