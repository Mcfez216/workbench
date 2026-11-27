'use strict';
// More C and C++ exercises, after the basics (exercise-data.js): function
// pointers, bits, a linked list, matrices, files, enums and unions in C;
// RAII and the rule of five, operators, templates, smart pointers, move
// semantics, ranges, errors and inheritance in C++. Same harness: your
// file and a test program, built with the sanitizers on (a leak, a double
// free or an overflow fails the step).

module.exports = [
  // ================================================================== C, going further
  {
    id: 'c-function-pointers', lang: 'c', kind: 'functions', track: 'C, going further', topic: 'Function pointers', file: 'funcs.c',
    title: 'Function pointers and qsort',
    intro: 'A function pointer holds the address of a function, so you can pass "what to do" as a value. `int (*f)(int)` is a pointer to a function taking an int and returning an int. qsort uses one to compare.',
    starter: String.raw`#include <stddef.h>
#include <stdlib.h>

int apply(int (*f)(int), int x) {
    /* TODO step 1 */
    return 0;
}

void map_array(int *a, size_t n, int (*f)(int)) {
    /* TODO step 2 */
}

int cmp_desc(const void *a, const void *b) {
    /* TODO step 3 */
    return 0;
}

void sort_desc(int *a, size_t n) {
    /* TODO step 3: qsort with cmp_desc */
}
`,
    decls: '#include <stddef.h>\nint apply(int (*f)(int), int x);\nvoid map_array(int *a, size_t n, int (*f)(int));\nint cmp_desc(const void *a, const void *b);\nvoid sort_desc(int *a, size_t n);\nstatic int twice(int x) { return 2 * x; }\nstatic int negate(int x) { return -x; }\nstatic int square(int x) { return x * x; }\n',
    steps: [
      { title: 'apply', brief: '`apply(f, x)` calls the function `f` on `x` and returns what it gives back. The tests pass functions like `twice` and `negate`.', hints: ['Call it like a function: `return f(x);` (`(*f)(x)` means the same).'],
        test: String.raw`CHECK_INT(apply(twice, 21), 42); CHECK_INT(apply(negate, 5), -5); CHECK_INT(apply(square, -3), 9);` },
      { title: 'map_array', brief: 'Replace every element `a[i]` with `f(a[i])`.', hints: ['`for (size_t i = 0; i < n; i++) a[i] = f(a[i]);`'],
        test: String.raw`int a[] = {1, 2, 3}; map_array(a, 3, twice); CHECK_INT(a[0], 2); CHECK_INT(a[2], 6); map_array(a, 3, negate); CHECK_INT(a[1], -4); map_array(a, 0, twice);` },
      { title: 'sort_desc', brief: 'Sort the array biggest first, with `qsort` and your comparison `cmp_desc`. It gets pointers to two elements: return a negative number if the first should come first, positive if the second should, 0 if equal. Don\'t return `b - a`: that can overflow.', hints: ['`int x = *(const int *)a, y = *(const int *)b;`', '`return (x < y) - (x > y);` is negative when x is bigger, so bigger comes first.', '`qsort(a, n, sizeof a[0], cmp_desc);`'],
        test: String.raw`int a[] = {3, 9, -1, 9, 0}; sort_desc(a, 5); CHECK_INT(a[0], 9); CHECK_INT(a[1], 9); CHECK_INT(a[4], -1);
int b[] = {INT_MIN, INT_MAX, 0}; sort_desc(b, 3); CHECK_INT(b[0], INT_MAX); CHECK_INT(b[2], INT_MIN);` },
    ],
    solution: String.raw`#include <stddef.h>
#include <stdlib.h>

int apply(int (*f)(int), int x) { return f(x); }

void map_array(int *a, size_t n, int (*f)(int)) {
    for (size_t i = 0; i < n; i++) a[i] = f(a[i]);
}

int cmp_desc(const void *a, const void *b) {
    int x = *(const int *)a, y = *(const int *)b;
    return (x < y) - (x > y);
}

void sort_desc(int *a, size_t n) { qsort(a, n, sizeof a[0], cmp_desc); }
`,
  },
  {
    id: 'c-bits', lang: 'c', kind: 'functions', track: 'C, going further', topic: 'Bits', file: 'bits.c',
    title: 'Bits and masks',
    intro: 'Every number is bits. `&` keeps the bits both have, `|` sets bits, `^` flips them, `~` flips all, `<<` and `>>` shift. Flags, permissions, network headers and hash functions are all made of these. Unsigned types only: shifting signed numbers has traps.',
    starter: String.raw`#include <stdint.h>

int count_bits(uint32_t x) {
    /* TODO step 1 */
    return 0;
}

int is_power_of_two(uint32_t x) {
    /* TODO step 1 */
    return 0;
}

uint32_t set_bit(uint32_t x, int n) {
    /* TODO step 2 */
    return x;
}

uint32_t clear_bit(uint32_t x, int n) {
    /* TODO step 2 */
    return x;
}

int get_bit(uint32_t x, int n) {
    /* TODO step 2 */
    return 0;
}

uint32_t rotate_left(uint32_t x, int n) {
    /* TODO step 3 */
    return x;
}
`,
    decls: '#include <stdint.h>\nint count_bits(uint32_t x);\nint is_power_of_two(uint32_t x);\nuint32_t set_bit(uint32_t x, int n);\nuint32_t clear_bit(uint32_t x, int n);\nint get_bit(uint32_t x, int n);\nuint32_t rotate_left(uint32_t x, int n);\n',
    steps: [
      { title: 'count_bits and is_power_of_two', brief: '`count_bits` counts the 1 bits (0b1011 has 3). A power of two (1, 2, 4, 8...) has exactly one 1 bit; 0 isn\'t a power of two.', hints: ['`while (x) { n += x & 1; x >>= 1; }`', 'The trick: `x & (x - 1)` clears the lowest 1 bit, so a power of two gives 0: `return x != 0 && (x & (x - 1)) == 0;`'],
        test: String.raw`CHECK_INT(count_bits(0), 0); CHECK_INT(count_bits(11), 3); CHECK_INT(count_bits(0xFFFFFFFFu), 32);
CHECK(is_power_of_two(1)); CHECK(is_power_of_two(1024)); CHECK(!is_power_of_two(0)); CHECK(!is_power_of_two(12)); CHECK(is_power_of_two(0x80000000u));` },
      { title: 'set, clear and get', brief: 'Bit n counts from 0 at the right. `set_bit` turns it on, `clear_bit` off, `get_bit` returns 0 or 1.', hints: ['The mask for bit n: `(uint32_t)1 << n` (1 on its own is an int: shifting it to bit 31 is undefined).', 'Set: `x | mask`. Clear: `x & ~mask`. Get: `(x >> n) & 1`.'],
        test: String.raw`CHECK_INT(set_bit(0, 3), 8); CHECK_INT(set_bit(8, 3), 8); CHECK_INT(clear_bit(15, 0), 14); CHECK_INT(get_bit(5, 2), 1); CHECK_INT(get_bit(5, 1), 0);
CHECK(set_bit(0, 31) == 0x80000000u);` },
      { title: 'rotate_left', brief: 'Rotate the 32 bits left by n: bits pushed off the left come back on the right. n can be 0 to 31 (and n = 32 behaves like 0).', hints: ['`n &= 31;` first. Then `(x << n) | (x >> (32 - n))`, except when n is 0: shifting a 32-bit number by 32 is undefined.'],
        test: String.raw`CHECK(rotate_left(0x80000001u, 1) == 0x00000003u); CHECK(rotate_left(0x12345678u, 8) == 0x34567812u); CHECK(rotate_left(7u, 0) == 7u); CHECK(rotate_left(7u, 32) == 7u);` },
    ],
    solution: String.raw`#include <stdint.h>

int count_bits(uint32_t x) {
    int n = 0;
    while (x) { n += (int)(x & 1u); x >>= 1; }
    return n;
}

int is_power_of_two(uint32_t x) { return x != 0 && (x & (x - 1)) == 0; }

uint32_t set_bit(uint32_t x, int n) { return x | ((uint32_t)1 << n); }
uint32_t clear_bit(uint32_t x, int n) { return x & ~((uint32_t)1 << n); }
int get_bit(uint32_t x, int n) { return (int)((x >> n) & 1u); }

uint32_t rotate_left(uint32_t x, int n) {
    n &= 31;
    if (n == 0) return x;
    return (x << n) | (x >> (32 - n));
}
`,
  },
  {
    id: 'c-linked-list', lang: 'c', kind: 'functions', track: 'C, going further', topic: 'Linked lists', file: 'list.c',
    title: 'A linked list',
    intro: 'Each node is malloc\'d and points at the next one; the last points at NULL. You own every node: each malloc needs exactly one free. The sanitizers check: a leak or a use after free fails the step.',
    files: { 'list.h': String.raw`#pragma once
#include <stddef.h>

struct node {
    int value;
    struct node *next;
};

struct node *push_front(struct node *head, int value);
void free_list(struct node *head);
size_t list_length(const struct node *head);
long list_sum(const struct node *head);
struct node *reverse(struct node *head);
` },
    starter: String.raw`#include <stdlib.h>
#include "list.h"

struct node *push_front(struct node *head, int value) {
    /* TODO step 1: a new node in front, pointing at the old head */
    (void)value;
    return head;
}

void free_list(struct node *head) {
    /* TODO step 1 */
    (void)head;
}

size_t list_length(const struct node *head) {
    /* TODO step 2 */
    (void)head;
    return 0;
}

long list_sum(const struct node *head) {
    /* TODO step 2 */
    (void)head;
    return 0;
}

struct node *reverse(struct node *head) {
    /* TODO step 3 */
    return head;
}
`,
    decls: '#include "list.h"\n',
    steps: [
      { title: 'push_front and free_list', brief: '`push_front` mallocs a node holding `value`, pointing at the old head, and returns it (the new head). If malloc fails, return the old head unchanged. `free_list` frees every node: save `next` before you free the node it\'s in.', hints: ['`struct node *n = malloc(sizeof *n); if (!n) return head; n->value = value; n->next = head; return n;`', '`while (head) { struct node *next = head->next; free(head); head = next; }`'],
        test: String.raw`struct node *l = NULL; l = push_front(l, 1); l = push_front(l, 2);
CHECK(l != NULL); if (l) { CHECK_INT(l->value, 2); CHECK(l->next && l->next->value == 1); CHECK(l->next && l->next->next == NULL); }
free_list(l); free_list(NULL);` },
      { title: 'length and sum', brief: 'Walk the list from the head to NULL, counting nodes and adding values.', hints: ['`for (const struct node *p = head; p; p = p->next) n++;`'],
        test: String.raw`struct node *l = NULL; for (int i = 1; i <= 4; i++) l = push_front(l, i * 10);
CHECK_INT(list_length(l), 4); CHECK_INT(list_sum(l), 100); CHECK_INT(list_length(NULL), 0); CHECK_INT(list_sum(NULL), 0);
free_list(l);` },
      { title: 'reverse', brief: 'Reverse the list in place, by turning each `next` pointer round, and return the new head. No new nodes, no frees.', hints: ['Keep three pointers: `prev` (starts NULL), `cur` (starts at head), `next`.', '`while (cur) { next = cur->next; cur->next = prev; prev = cur; cur = next; } return prev;`'],
        test: String.raw`struct node *l = NULL; for (int i = 1; i <= 3; i++) l = push_front(l, i);
l = reverse(l); CHECK(l && l->value == 1); CHECK(l && l->next && l->next->value == 2); CHECK(l && l->next && l->next->next && l->next->next->value == 3);
free_list(l); CHECK(reverse(NULL) == NULL);` },
    ],
    solution: String.raw`#include <stdlib.h>
#include "list.h"

struct node *push_front(struct node *head, int value) {
    struct node *n = malloc(sizeof *n);
    if (!n) return head;
    n->value = value;
    n->next = head;
    return n;
}

void free_list(struct node *head) {
    while (head) {
        struct node *next = head->next;
        free(head);
        head = next;
    }
}

size_t list_length(const struct node *head) {
    size_t n = 0;
    for (const struct node *p = head; p; p = p->next) n++;
    return n;
}

long list_sum(const struct node *head) {
    long s = 0;
    for (const struct node *p = head; p; p = p->next) s += p->value;
    return s;
}

struct node *reverse(struct node *head) {
    struct node *prev = NULL, *cur = head;
    while (cur) {
        struct node *next = cur->next;
        cur->next = prev;
        prev = cur;
        cur = next;
    }
    return prev;
}
`,
  },
  {
    id: 'c-matrix', lang: 'c', kind: 'functions', track: 'C, going further', topic: '2D arrays', file: 'matrix.c',
    title: 'Matrices in a flat array',
    intro: 'A grid of rows × cols numbers is usually stored as one flat array, row after row: element (r, c) is at index `r * cols + c`. That\'s how images, game boards and matrices are kept in memory.',
    starter: String.raw`int get(const int *m, int cols, int r, int c) {
    /* TODO step 1 */
    return 0;
}

int trace(const int *m, int n) {
    /* TODO step 1: the sum of the diagonal of an n x n matrix */
    return 0;
}

void transpose(const int *m, int rows, int cols, int *out) {
    /* TODO step 2: out is cols x rows */
}

void mat_mul(const int *a, const int *b, int n, int *out) {
    /* TODO step 3: n x n */
}
`,
    decls: 'int get(const int *m, int cols, int r, int c);\nint trace(const int *m, int n);\nvoid transpose(const int *m, int rows, int cols, int *out);\nvoid mat_mul(const int *a, const int *b, int n, int *out);\n',
    steps: [
      { title: 'get and trace', brief: '`get` reads element (r, c) of a matrix with `cols` columns. `trace` adds up the diagonal of an n × n matrix: (0,0), (1,1)...', hints: ['`return m[r * cols + c];`', '`for (int i = 0; i < n; i++) t += m[i * n + i];`'],
        test: String.raw`int m[] = {1, 2, 3, 4, 5, 6}; CHECK_INT(get(m, 3, 0, 2), 3); CHECK_INT(get(m, 3, 1, 0), 4); CHECK_INT(get(m, 2, 2, 1), 6);
int sq[] = {1, 2, 3, 4, 5, 6, 7, 8, 9}; CHECK_INT(trace(sq, 3), 15);` },
      { title: 'transpose', brief: 'Rows become columns: a 2 × 3 matrix becomes 3 × 2, and element (r, c) moves to (c, r).', hints: ['`out[c * rows + r] = m[r * cols + c];` for every r and c.'],
        test: String.raw`int m[] = {1, 2, 3, 4, 5, 6}; int t[6] = {0}; transpose(m, 2, 3, t);
CHECK_INT(t[0], 1); CHECK_INT(t[1], 4); CHECK_INT(t[2], 2); CHECK_INT(t[3], 5); CHECK_INT(t[4], 3); CHECK_INT(t[5], 6);` },
      { title: 'mat_mul', brief: 'Multiply two n × n matrices: out(r, c) is the sum over k of a(r, k) × b(k, c).', hints: ['Three loops: r, c, and k inside. Start each sum at 0.'],
        test: String.raw`int a[] = {1, 2, 3, 4}, b[] = {5, 6, 7, 8}, o[4] = {0}; mat_mul(a, b, 2, o);
CHECK_INT(o[0], 19); CHECK_INT(o[1], 22); CHECK_INT(o[2], 43); CHECK_INT(o[3], 50);
int id[] = {1, 0, 0, 1}, o2[4] = {0}; mat_mul(a, id, 2, o2); CHECK_INT(o2[3], 4);` },
    ],
    solution: String.raw`int get(const int *m, int cols, int r, int c) { return m[r * cols + c]; }

int trace(const int *m, int n) {
    int t = 0;
    for (int i = 0; i < n; i++) t += m[i * n + i];
    return t;
}

void transpose(const int *m, int rows, int cols, int *out) {
    for (int r = 0; r < rows; r++)
        for (int c = 0; c < cols; c++)
            out[c * rows + r] = m[r * cols + c];
}

void mat_mul(const int *a, const int *b, int n, int *out) {
    for (int r = 0; r < n; r++)
        for (int c = 0; c < n; c++) {
            int s = 0;
            for (int k = 0; k < n; k++) s += a[r * n + k] * b[k * n + c];
            out[r * n + c] = s;
        }
}
`,
  },
  {
    id: 'c-files', lang: 'c', kind: 'functions', track: 'C, going further', topic: 'Files', file: 'files.c',
    title: 'Reading and writing files',
    intro: 'fopen gives a FILE * (or NULL: always check), fprintf/fgets/fscanf use it, fclose finishes it. Every opened file must be closed, on every path out of the function.',
    starter: String.raw`#include <stdio.h>
#include <stddef.h>

int write_numbers(const char *path, const int *a, size_t n) {
    /* TODO step 1: one number per line; 0 if it worked, -1 if not */
    return -1;
}

long count_lines(const char *path) {
    /* TODO step 2: -1 if it can't be opened */
    return -1;
}

long sum_file(const char *path) {
    /* TODO step 3: add up the whole numbers in it; -1 if it can't be opened */
    return -1;
}
`,
    decls: '#include <stddef.h>\nint write_numbers(const char *path, const int *a, size_t n);\nlong count_lines(const char *path);\nlong sum_file(const char *path);\n',
    steps: [
      { title: 'write_numbers', brief: 'Write the n numbers to the file at `path`, one per line. Return 0, or -1 if the file can\'t be opened.', hints: ['`FILE *f = fopen(path, "w"); if (!f) return -1;`', '`fprintf(f, "%d\\n", a[i]);` in a loop, then `fclose(f)`; `return fclose(f) == 0 ? 0 : -1;` also catches a full disk.'],
        test: String.raw`int a[] = {3, -1, 40}; CHECK_INT(write_numbers("cpw_nums.txt", a, 3), 0);
FILE *f = fopen("cpw_nums.txt", "r"); char buf[64] = ""; size_t got = f ? fread(buf, 1, sizeof buf - 1, f) : 0; if (f) fclose(f); buf[got] = 0;
CHECK_STR(buf, "3\n-1\n40\n"); CHECK_INT(write_numbers("no/such/dir/x.txt", a, 3), -1); remove("cpw_nums.txt");` },
      { title: 'count_lines', brief: 'How many lines the file has: the number of newline characters. -1 if it can\'t be opened.', hints: ['`int ch; while ((ch = fgetc(f)) != EOF) if (ch == \'\\n\') n++;` and close the file before returning.'],
        test: String.raw`FILE *f = fopen("cpw_lines.txt", "w"); if (f) { fputs("a\nb\n\nc\n", f); fclose(f); }
CHECK_INT(count_lines("cpw_lines.txt"), 4); CHECK_INT(count_lines("cpw_missing.txt"), -1); remove("cpw_lines.txt");` },
      { title: 'sum_file', brief: 'Add up every whole number in the file (separated by any whitespace). -1 if it can\'t be opened.', hints: ['`long x, s = 0; while (fscanf(f, "%ld", &x) == 1) s += x;` stops at the end, or at something that isn\'t a number.'],
        test: String.raw`int a[] = {1, 2, 3, 100}; write_numbers("cpw_sum.txt", a, 4); CHECK_INT(sum_file("cpw_sum.txt"), 106); CHECK_INT(sum_file("cpw_missing.txt"), -1); remove("cpw_sum.txt");` },
    ],
    solution: String.raw`#include <stdio.h>
#include <stddef.h>

int write_numbers(const char *path, const int *a, size_t n) {
    FILE *f = fopen(path, "w");
    if (!f) return -1;
    for (size_t i = 0; i < n; i++) fprintf(f, "%d\n", a[i]);
    return fclose(f) == 0 ? 0 : -1;
}

long count_lines(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    long n = 0;
    int ch;
    while ((ch = fgetc(f)) != EOF)
        if (ch == '\n') n++;
    fclose(f);
    return n;
}

long sum_file(const char *path) {
    FILE *f = fopen(path, "r");
    if (!f) return -1;
    long x, s = 0;
    while (fscanf(f, "%ld", &x) == 1) s += x;
    fclose(f);
    return s;
}
`,
  },
  {
    id: 'c-enums-unions', lang: 'c', kind: 'functions', track: 'C, going further', topic: 'Enums, switch and unions', file: 'kinds.c',
    title: 'Enums, switch and tagged unions',
    intro: 'An enum names a fixed set of choices; a switch handles each one (and -Wall warns about one you forgot). A union holds one of several types in the same memory: pair it with an enum saying which, a "tagged union", the C version of Rust\'s enums.',
    files: { 'kinds.h': String.raw`#pragma once

enum light { RED, RED_AMBER, GREEN, AMBER };

enum kind { KIND_INT, KIND_DOUBLE, KIND_TEXT };
struct value {
    enum kind kind;         /* which member of the union is in use */
    union {
        long i;
        double d;
        const char *text;
    } as;
};

enum light next_light(enum light l);
const char *light_name(enum light l);
int count_words(const char *s);
double as_double(struct value v);
` },
    starter: String.raw`#include "kinds.h"

enum light next_light(enum light l) {
    /* TODO step 1: RED -> RED_AMBER -> GREEN -> AMBER -> RED */
    return l;
}

const char *light_name(enum light l) {
    /* TODO step 1 */
    (void)l;
    return "";
}

int count_words(const char *s) {
    /* TODO step 2: a two-state machine */
    (void)s;
    return 0;
}

double as_double(struct value v) {
    /* TODO step 3 */
    (void)v;
    return 0;
}
`,
    decls: '#include "kinds.h"\n',
    steps: [
      { title: 'next_light and light_name', brief: 'UK traffic lights go red, red and amber, green, amber, red. `light_name` gives `"red"`, `"red and amber"`, `"green"` or `"amber"`. Use a switch on the enum, with no default: then -Wall warns if you leave a light out.', hints: ['`switch (l) { case RED: return RED_AMBER; case RED_AMBER: return GREEN; ... }`', 'After the switch, return something for a value outside the enum (C enums can hold any int): `return RED;`'],
        test: String.raw`CHECK_INT(next_light(RED), RED_AMBER); CHECK_INT(next_light(GREEN), AMBER); CHECK_INT(next_light(AMBER), RED);
CHECK_STR(light_name(RED_AMBER), "red and amber"); CHECK_STR(light_name(GREEN), "green");` },
      { title: 'count_words', brief: 'Count the words in `s` with a state machine: two states, inside a word and between words (`enum { OUT, IN }`). A word starts at a non-space character when you\'re OUT.', hints: ['`enum { OUT, IN } state = OUT;` then for each character: `if (isspace((unsigned char)*p)) state = OUT; else if (state == OUT) { state = IN; n++; }`'],
        test: String.raw`CHECK_INT(count_words("hello world"), 2); CHECK_INT(count_words("  lots   of   space  "), 3); CHECK_INT(count_words(""), 0); CHECK_INT(count_words("one"), 1);` },
      { title: 'as_double', brief: 'Read the value as a double, whichever kind it is: an int converted, a double as it is, text parsed with `strtod` (0 if it isn\'t a number). Read only the union member the tag says is there.', hints: ['`switch (v.kind) { case KIND_INT: return (double)v.as.i; case KIND_DOUBLE: return v.as.d; case KIND_TEXT: return strtod(v.as.text, NULL); }`'],
        test: String.raw`struct value a = { KIND_INT, { .i = 7 } }; struct value b = { KIND_DOUBLE, { .d = 2.5 } }; struct value c = { KIND_TEXT, { .text = "3.25" } }; struct value d = { KIND_TEXT, { .text = "pear" } };
CHECK_DBL(as_double(a), 7.0); CHECK_DBL(as_double(b), 2.5); CHECK_DBL(as_double(c), 3.25); CHECK_DBL(as_double(d), 0.0);` },
    ],
    solution: String.raw`#include <ctype.h>
#include <stdlib.h>
#include "kinds.h"

enum light next_light(enum light l) {
    switch (l) {
    case RED: return RED_AMBER;
    case RED_AMBER: return GREEN;
    case GREEN: return AMBER;
    case AMBER: return RED;
    }
    return RED;
}

const char *light_name(enum light l) {
    switch (l) {
    case RED: return "red";
    case RED_AMBER: return "red and amber";
    case GREEN: return "green";
    case AMBER: return "amber";
    }
    return "?";
}

int count_words(const char *s) {
    enum { OUT, IN } state = OUT;
    int n = 0;
    for (const char *p = s; *p; p++) {
        if (isspace((unsigned char)*p)) state = OUT;
        else if (state == OUT) { state = IN; n++; }
    }
    return n;
}

double as_double(struct value v) {
    switch (v.kind) {
    case KIND_INT: return (double)v.as.i;
    case KIND_DOUBLE: return v.as.d;
    case KIND_TEXT: return strtod(v.as.text, NULL);
    }
    return 0;
}
`,
  },

  // ================================================================== C++, going further
  {
    id: 'cpp-rule-of-five', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'RAII and the rule of five', file: 'buffer.cpp',
    title: 'RAII: a class that owns memory',
    intro: 'A class that owns a resource frees it in its destructor (RAII), so it can\'t leak. Then copying and moving need care too: the "rule of five". A copy must get its own memory (a deep copy); a move steals the memory and leaves the old object empty. The sanitizers catch a leak, a double free or a use after free.',
    files: { 'buffer.hpp': String.raw`#pragma once
#include <cstddef>

// A fixed-size array of ints on the heap, that owns its memory
class Buffer {
public:
    explicit Buffer(std::size_t n);        // n ints, all 0
    ~Buffer();
    Buffer(const Buffer& other);            // a deep copy
    Buffer& operator=(const Buffer& other);
    Buffer(Buffer&& other) noexcept;        // steal, leave other empty
    Buffer& operator=(Buffer&& other) noexcept;

    std::size_t size() const { return size_; }
    int& operator[](std::size_t i) { return data_[i]; }
    const int& operator[](std::size_t i) const { return data_[i]; }

private:
    int* data_ = nullptr;
    std::size_t size_ = 0;
};
` },
    starter: String.raw`#include "buffer.hpp"

Buffer::Buffer(std::size_t n) {
    // TODO step 1: new int[n]() (the () makes them 0)
    (void)n;
}

Buffer::~Buffer() {
    // TODO step 1
}

Buffer::Buffer(const Buffer& other) {
    // TODO step 2
    (void)other;
}

Buffer& Buffer::operator=(const Buffer& other) {
    // TODO step 2
    (void)other;
    return *this;
}

Buffer::Buffer(Buffer&& other) noexcept {
    // TODO step 3
    (void)other;
}

Buffer& Buffer::operator=(Buffer&& other) noexcept {
    // TODO step 3
    (void)other;
    return *this;
}
`,
    decls: '#include "buffer.hpp"\n#include <utility>\n',
    steps: [
      { title: 'construct and destroy', brief: 'The constructor allocates n ints, all 0 (`new int[n]()`), and remembers n. The destructor frees them with `delete[]`: the sanitizers report a leak if you forget.', hints: ['`Buffer::Buffer(std::size_t n) : data_(new int[n]()), size_(n) {}`', '`Buffer::~Buffer() { delete[] data_; }` (delete[] for new[], never plain delete)'],
        test: String.raw`{ Buffer b(4); CHECK_INT(b.size(), 4); CHECK_INT(b[3], 0); b[2] = 7; CHECK_INT(b[2], 7); }` },
      { title: 'copy', brief: 'A copy gets its own memory with the same numbers, so changing one doesn\'t change the other. Copy assignment frees the old memory first, and copes with `b = b`.', hints: ['Copy constructor: allocate `other.size_` ints and `std::copy(other.data_, other.data_ + other.size_, data_)`.', 'Assignment: `if (this == &other) return *this;` then make the new memory, copy, `delete[]` the old, swap in the new. (Or: copy-and-swap.)'],
        test: String.raw`Buffer a(3); a[0] = 1; Buffer b(a); b[0] = 99; CHECK_INT(a[0], 1); CHECK_INT(b[0], 99); CHECK_INT(b.size(), 3);
Buffer c(1); c = a; CHECK_INT(c.size(), 3); c[1] = 5; CHECK_INT(a[1], 0);
c = c; CHECK_INT(c[1], 5);` },
      { title: 'move', brief: 'A move takes the other buffer\'s memory pointer and leaves it empty (nullptr, size 0): no copying at all. Move assignment frees its own memory first.', hints: ['`Buffer::Buffer(Buffer&& o) noexcept : data_(o.data_), size_(o.size_) { o.data_ = nullptr; o.size_ = 0; }`', 'Assignment: `if (this != &o) { delete[] data_; data_ = o.data_; size_ = o.size_; o.data_ = nullptr; o.size_ = 0; }`'],
        test: String.raw`Buffer a(2); a[1] = 42; Buffer b(std::move(a)); CHECK_INT(b[1], 42); CHECK_INT(b.size(), 2); CHECK_INT(a.size(), 0);
Buffer c(5); c = std::move(b); CHECK_INT(c.size(), 2); CHECK_INT(c[1], 42); CHECK_INT(b.size(), 0);` },
    ],
    solution: String.raw`#include <algorithm>
#include "buffer.hpp"

Buffer::Buffer(std::size_t n) : data_(new int[n]()), size_(n) {}

Buffer::~Buffer() { delete[] data_; }

Buffer::Buffer(const Buffer& other) : data_(new int[other.size_]), size_(other.size_) {
    std::copy(other.data_, other.data_ + other.size_, data_);
}

Buffer& Buffer::operator=(const Buffer& other) {
    if (this == &other) return *this;
    int* fresh = new int[other.size_];
    std::copy(other.data_, other.data_ + other.size_, fresh);
    delete[] data_;
    data_ = fresh;
    size_ = other.size_;
    return *this;
}

Buffer::Buffer(Buffer&& other) noexcept : data_(other.data_), size_(other.size_) {
    other.data_ = nullptr;
    other.size_ = 0;
}

Buffer& Buffer::operator=(Buffer&& other) noexcept {
    if (this != &other) {
        delete[] data_;
        data_ = other.data_;
        size_ = other.size_;
        other.data_ = nullptr;
        other.size_ = 0;
    }
    return *this;
}
`,
  },
  {
    id: 'cpp-operators', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Operator overloading', file: 'fraction.cpp',
    title: 'Operators: a Fraction type',
    intro: 'Your own types can have +, *, ==, < and << like the built-in ones. A Fraction that always keeps itself in lowest terms with a positive bottom (an invariant), so 2/4 and 1/2 are equal.',
    files: { 'fraction.hpp': String.raw`#pragma once
#include <ostream>

class Fraction {
public:
    Fraction(long num = 0, long den = 1);   // den 0 throws std::invalid_argument
    long num() const { return num_; }
    long den() const { return den_; }
private:
    long num_, den_;
};

Fraction operator+(const Fraction& a, const Fraction& b);
Fraction operator*(const Fraction& a, const Fraction& b);
bool operator==(const Fraction& a, const Fraction& b);
bool operator<(const Fraction& a, const Fraction& b);
std::ostream& operator<<(std::ostream& out, const Fraction& f);
` },
    starter: String.raw`#include <stdexcept>
#include "fraction.hpp"

Fraction::Fraction(long num, long den) : num_(num), den_(den) {
    // TODO step 1: den 0 throws; lowest terms; the sign on top
}

Fraction operator+(const Fraction& a, const Fraction& b) {
    // TODO step 2
    return a;
}

Fraction operator*(const Fraction& a, const Fraction& b) {
    // TODO step 2
    return b;
}

bool operator==(const Fraction& a, const Fraction& b) {
    // TODO step 3
    return false;
}

bool operator<(const Fraction& a, const Fraction& b) {
    // TODO step 3
    return false;
}

std::ostream& operator<<(std::ostream& out, const Fraction& f) {
    // TODO step 3: "3/4", or "3" when the bottom is 1
    return out;
}
`,
    decls: '#include "fraction.hpp"\n#include <sstream>\n#include <stdexcept>\nstatic std::string cpw_str(const Fraction& f) { std::ostringstream o; o << f; return o.str(); }\n',
    steps: [
      { title: 'the constructor keeps the rule', brief: 'Make every Fraction lowest terms (divide top and bottom by their greatest common divisor, `std::gcd` in <numeric>) with a positive bottom (1/-2 becomes -1/2). A bottom of 0 throws `std::invalid_argument`.', hints: ['`if (den == 0) throw std::invalid_argument("zero denominator");`', '`if (den_ < 0) { num_ = -num_; den_ = -den_; }` then `long g = std::gcd(num_, den_); if (g) { num_ /= g; den_ /= g; }`'],
        test: String.raw`Fraction a(2, 4); CHECK_INT(a.num(), 1); CHECK_INT(a.den(), 2); Fraction b(3, -6); CHECK_INT(b.num(), -1); CHECK_INT(b.den(), 2);
Fraction z(0, 5); CHECK_INT(z.den(), 1); bool threw = false; try { Fraction bad(1, 0); } catch (const std::invalid_argument&) { threw = true; } CHECK(threw);` },
      { title: '+ and *', brief: 'a/b + c/d is (ad + cb)/bd; a/b × c/d is ac/bd. Build the result with the constructor, so it\'s reduced for free.', hints: ['`return Fraction(a.num() * b.den() + b.num() * a.den(), a.den() * b.den());`'],
        test: String.raw`Fraction s = Fraction(1, 2) + Fraction(1, 3); CHECK_INT(s.num(), 5); CHECK_INT(s.den(), 6); Fraction p = Fraction(2, 3) * Fraction(3, 4); CHECK_INT(p.num(), 1); CHECK_INT(p.den(), 2);
Fraction w = Fraction(1, 2) + Fraction(1, 2); CHECK_INT(w.num(), 1); CHECK_INT(w.den(), 1);` },
      { title: '==, < and <<', brief: 'Because every Fraction is reduced, equal means the same top and bottom. For <, compare a/b and c/d as a×d < c×b (bottoms are positive). `<<` prints `3/4`, or just `3` when the bottom is 1.', hints: ['`return a.num() * b.den() < b.num() * a.den();`', '`out << f.num(); if (f.den() != 1) out << \'/\' << f.den(); return out;`'],
        test: String.raw`CHECK(Fraction(2, 4) == Fraction(1, 2)); CHECK(!(Fraction(1, 3) == Fraction(1, 2))); CHECK(Fraction(1, 3) < Fraction(1, 2)); CHECK(Fraction(-1, 2) < Fraction(0));
CHECK_STR(cpw_str(Fraction(6, 8)), "3/4"); CHECK_STR(cpw_str(Fraction(4, 2)), "2"); CHECK_STR(cpw_str(Fraction(1, -3)), "-1/3");` },
    ],
    solution: String.raw`#include <numeric>
#include <stdexcept>
#include "fraction.hpp"

Fraction::Fraction(long num, long den) : num_(num), den_(den) {
    if (den_ == 0) throw std::invalid_argument("zero denominator");
    if (den_ < 0) { num_ = -num_; den_ = -den_; }
    long g = std::gcd(num_, den_);
    if (g) { num_ /= g; den_ /= g; }
}

Fraction operator+(const Fraction& a, const Fraction& b) {
    return Fraction(a.num() * b.den() + b.num() * a.den(), a.den() * b.den());
}

Fraction operator*(const Fraction& a, const Fraction& b) {
    return Fraction(a.num() * b.num(), a.den() * b.den());
}

bool operator==(const Fraction& a, const Fraction& b) { return a.num() == b.num() && a.den() == b.den(); }

bool operator<(const Fraction& a, const Fraction& b) { return a.num() * b.den() < b.num() * a.den(); }

std::ostream& operator<<(std::ostream& out, const Fraction& f) {
    out << f.num();
    if (f.den() != 1) out << '/' << f.den();
    return out;
}
`,
  },
  {
    id: 'cpp-templates', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Templates', file: 'templates.cpp',
    title: 'Templates: code for any type',
    intro: 'A template is a recipe the compiler fills in for each type you use. Templates live where they\'re used, usually in headers (here, the test program #includes your file). C++20 concepts say what a type must be able to do.',
    starter: String.raw`#pragma once
#include <cstddef>
#include <stdexcept>
#include <vector>

template <class T>
T clamp_to(T x, T lo, T hi) {
    // TODO step 1
    return x;
}

template <class It, class Pred>
std::size_t count_matching(It first, It last, Pred p) {
    // TODO step 2
    return 0;
}

// A stack with a fixed capacity N, set when it's made: Ring<int, 3>
template <class T, std::size_t N>
class FixedStack {
public:
    void push(const T& x) {
        // TODO step 3: throw std::length_error when full
    }
    T pop() {
        // TODO step 3: throw std::out_of_range when empty
        return T{};
    }
    std::size_t size() const { return n_; }
    static constexpr std::size_t capacity() { return N; }
private:
    T items_[N] {};
    std::size_t n_ = 0;
};
`,
    decls: '#include "templates.cpp"\n#include <string>\n',
    steps: [
      { title: 'clamp_to', brief: 'Keep `x` between `lo` and `hi`, for any type that has `<`: ints, doubles, strings.', hints: ['`if (x < lo) return lo; if (hi < x) return hi; return x;` (only `<` is used, so the type needs nothing else)'],
        test: String.raw`CHECK_INT(clamp_to(15, 0, 10), 10); CHECK_INT(clamp_to(-2, 0, 10), 0); CHECK_DBL(clamp_to(0.5, 0.0, 1.0), 0.5); CHECK_STR(clamp_to(std::string("zebra"), std::string("a"), std::string("m")), "m");` },
      { title: 'count_matching', brief: 'Count the elements between two iterators that the predicate says yes to. Works for vectors, arrays, strings: anything with iterators.', hints: ['`std::size_t n = 0; for (; first != last; ++first) if (p(*first)) ++n; return n;`'],
        test: String.raw`std::vector<int> v{1, 2, 3, 4, 5, 6}; CHECK_INT(count_matching(v.begin(), v.end(), [](int x) { return x % 2 == 0; }), 3);
std::string s = "Hello World"; CHECK_INT(count_matching(s.begin(), s.end(), [](char c) { return c == 'o'; }), 2);
int a[] = {5, 50, 500}; CHECK_INT(count_matching(a, a + 3, [](int x) { return x > 10; }), 2);` },
      { title: 'FixedStack<T, N>', brief: 'A stack whose capacity is part of its type: `FixedStack<int, 3>` holds at most 3. Push onto a full one throws `std::length_error`; pop from an empty one throws `std::out_of_range`.', hints: ['`if (n_ == N) throw std::length_error("full"); items_[n_++] = x;`', '`if (n_ == 0) throw std::out_of_range("empty"); return items_[--n_];`'],
        test: String.raw`FixedStack<int, 2> s; s.push(1); s.push(2); CHECK_INT(s.size(), 2); bool full = false; try { s.push(3); } catch (const std::length_error&) { full = true; } CHECK(full);
CHECK_INT(s.pop(), 2); CHECK_INT(s.pop(), 1); bool empty = false; try { s.pop(); } catch (const std::out_of_range&) { empty = true; } CHECK(empty);
FixedStack<std::string, 1> w; w.push("hi"); CHECK_STR(w.pop(), "hi"); CHECK_INT((FixedStack<double, 7>::capacity()), 7);` },
    ],
    solution: String.raw`#pragma once
#include <cstddef>
#include <stdexcept>
#include <vector>

template <class T>
T clamp_to(T x, T lo, T hi) {
    if (x < lo) return lo;
    if (hi < x) return hi;
    return x;
}

template <class It, class Pred>
std::size_t count_matching(It first, It last, Pred p) {
    std::size_t n = 0;
    for (; first != last; ++first)
        if (p(*first)) ++n;
    return n;
}

template <class T, std::size_t N>
class FixedStack {
public:
    void push(const T& x) {
        if (n_ == N) throw std::length_error("full");
        items_[n_++] = x;
    }
    T pop() {
        if (n_ == 0) throw std::out_of_range("empty");
        return items_[--n_];
    }
    std::size_t size() const { return n_; }
    static constexpr std::size_t capacity() { return N; }
private:
    T items_[N] {};
    std::size_t n_ = 0;
};
`,
  },
  {
    id: 'cpp-smart-pointers', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Smart pointers', file: 'tree.cpp',
    title: 'Smart pointers: a tree that frees itself',
    intro: '`std::unique_ptr` owns one object and deletes it when it goes; a vector of them owns a whole tree, freed with no delete anywhere. `std::shared_ptr` is shared ownership, counted. No new, no delete, no leaks.',
    files: { 'tree.hpp': String.raw`#pragma once
#include <memory>
#include <vector>

struct Node {
    int value = 0;
    std::vector<std::unique_ptr<Node>> children;   // each child is owned by its parent
};

std::unique_ptr<Node> make_node(int value);
Node* add_child(Node& parent, int value);   // returns the new child (not owning it)
int tree_sum(const Node& root);
int tree_depth(const Node& root);           // a lone node has depth 1
long owners(int copies);                    // see step 3
` },
    starter: String.raw`#include "tree.hpp"

std::unique_ptr<Node> make_node(int value) {
    // TODO step 1: std::make_unique
    (void)value;
    return nullptr;
}

Node* add_child(Node& parent, int value) {
    // TODO step 1
    (void)parent; (void)value;
    return nullptr;
}

int tree_sum(const Node& root) {
    // TODO step 2
    (void)root;
    return 0;
}

int tree_depth(const Node& root) {
    // TODO step 2
    (void)root;
    return 0;
}

long owners(int copies) {
    // TODO step 3
    (void)copies;
    return 0;
}
`,
    decls: '#include "tree.hpp"\n',
    steps: [
      { title: 'make_node and add_child', brief: '`make_node` makes a Node holding `value`, owned by a unique_ptr. `add_child` makes a child, moves its ownership into `parent.children`, and returns a plain (non-owning) pointer to it so you can add grandchildren.', hints: ['`auto n = std::make_unique<Node>(); n->value = value; return n;`', '`parent.children.push_back(make_node(value)); return parent.children.back().get();`'],
        test: String.raw`auto root = make_node(1); CHECK(root != nullptr); if (root) { CHECK_INT(root->value, 1); Node* c = add_child(*root, 2); CHECK(c != nullptr); if (c) { add_child(*c, 3); CHECK_INT(root->children.size(), 1); CHECK_INT(c->children.size(), 1); } }` },
      { title: 'tree_sum and tree_depth', brief: 'Walk the tree recursively: the sum of every value, and the depth (1 for a lone node, plus the deepest child).', hints: ['`int s = root.value; for (const auto& c : root.children) s += tree_sum(*c); return s;`', '`int d = 0; for (const auto& c : root.children) d = std::max(d, tree_depth(*c)); return d + 1;`'],
        test: String.raw`auto root = make_node(1); if (root) { Node* a = add_child(*root, 2); add_child(*root, 3); if (a) add_child(*a, 4);
CHECK_INT(tree_sum(*root), 10); CHECK_INT(tree_depth(*root), 3); auto lone = make_node(5); CHECK_INT(tree_depth(*lone), 1); }` },
      { title: 'owners', brief: 'shared_ptr counts its owners. Make one `std::make_shared<int>(0)`, put `copies` copies of it in a vector, and return `use_count()` with them all alive: copies + 1.', hints: ['`auto p = std::make_shared<int>(0); std::vector<std::shared_ptr<int>> v(copies, p); return p.use_count();`'],
        test: String.raw`CHECK_INT(owners(0), 1); CHECK_INT(owners(3), 4);` },
    ],
    solution: String.raw`#include <algorithm>
#include "tree.hpp"

std::unique_ptr<Node> make_node(int value) {
    auto n = std::make_unique<Node>();
    n->value = value;
    return n;
}

Node* add_child(Node& parent, int value) {
    parent.children.push_back(make_node(value));
    return parent.children.back().get();
}

int tree_sum(const Node& root) {
    int s = root.value;
    for (const auto& c : root.children) s += tree_sum(*c);
    return s;
}

int tree_depth(const Node& root) {
    int d = 0;
    for (const auto& c : root.children) d = std::max(d, tree_depth(*c));
    return d + 1;
}

long owners(int copies) {
    auto p = std::make_shared<int>(0);
    std::vector<std::shared_ptr<int>> v(static_cast<std::size_t>(copies), p);
    return p.use_count();
}
`,
  },
  {
    id: 'cpp-move', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Move semantics', file: 'moves.cpp',
    title: 'Move semantics: no copies',
    intro: '`Tracker` counts how often it\'s copied and moved. Each step asks for the same result with no copies at all: reserve, emplace, std::move and returning by value are how.',
    files: { 'tracker.hpp': String.raw`#pragma once
#include <string>
#include <utility>
#include <vector>

// Counts its copies and moves, so the tests can see them
struct Tracker {
    static inline int copies = 0, moves = 0;
    std::string name;
    explicit Tracker(std::string n) : name(std::move(n)) {}
    Tracker(const Tracker& o) : name(o.name) { ++copies; }
    Tracker(Tracker&& o) noexcept : name(std::move(o.name)) { ++moves; }
    Tracker& operator=(const Tracker& o) { name = o.name; ++copies; return *this; }
    Tracker& operator=(Tracker&& o) noexcept { name = std::move(o.name); ++moves; return *this; }
    static void reset() { copies = moves = 0; }
};

std::vector<Tracker> build(int n);                                   // "t0", "t1"...
void append_all(std::vector<Tracker>& dst, std::vector<Tracker>&& src);
std::string longest_name(const std::vector<Tracker>& v);
` },
    starter: String.raw`#include "tracker.hpp"

std::vector<Tracker> build(int n) {
    // TODO step 1: n Trackers named "t0", "t1"... with no copies and no moves
    std::vector<Tracker> v;
    for (int i = 0; i < n; ++i) {
        Tracker t("t" + std::to_string(i));
        v.push_back(t);   // a copy each time!
    }
    return v;
}

void append_all(std::vector<Tracker>& dst, std::vector<Tracker>&& src) {
    // TODO step 2: move them, don't copy them
    for (const auto& t : src) dst.push_back(t);
}

std::string longest_name(const std::vector<Tracker>& v) {
    // TODO step 3: no copies of the Trackers
    std::string best;
    for (auto t : v)   // auto copies each one
        if (t.name.size() > best.size()) best = t.name;
    return best;
}
`,
    decls: '#include "tracker.hpp"\n',
    steps: [
      { title: 'build without copies', brief: 'The starter works, but copies every Tracker into the vector, and the vector moves them again each time it grows. Make it 0 copies and 0 moves: reserve the room first, then build each Tracker right inside the vector.', hints: ['`v.reserve(n);` stops the vector moving things as it grows.', '`v.emplace_back("t" + std::to_string(i));` builds it in place: no temporary to copy or move.'],
        test: String.raw`Tracker::reset(); auto v = build(5); CHECK_INT(v.size(), 5); CHECK_STR(v[4].name, "t4"); CHECK_INT(Tracker::copies, 0); CHECK_INT(Tracker::moves, 0);` },
      { title: 'append_all moves', brief: '`src` is an rvalue reference: the caller is done with it. Move each Tracker into `dst` instead of copying.', hints: ['`dst.reserve(dst.size() + src.size()); for (auto& t : src) dst.push_back(std::move(t));`', 'Or in one go: `dst.insert(dst.end(), std::make_move_iterator(src.begin()), std::make_move_iterator(src.end()));`'],
        test: String.raw`auto a = build(2); auto b = build(3); Tracker::reset(); append_all(a, std::move(b)); CHECK_INT(a.size(), 5); CHECK_STR(a[4].name, "t2"); CHECK_INT(Tracker::copies, 0);` },
      { title: 'look without copying', brief: '`for (auto t : v)` copies every element. Look at them through a reference instead.', hints: ['`for (const auto& t : v)`'],
        test: String.raw`std::vector<Tracker> v; v.reserve(3); v.emplace_back("ab"); v.emplace_back("abcd"); v.emplace_back("a"); Tracker::reset(); CHECK_STR(longest_name(v), "abcd"); CHECK_INT(Tracker::copies, 0);` },
    ],
    solution: String.raw`#include "tracker.hpp"

std::vector<Tracker> build(int n) {
    std::vector<Tracker> v;
    v.reserve(static_cast<std::size_t>(n));
    for (int i = 0; i < n; ++i) v.emplace_back("t" + std::to_string(i));
    return v;
}

void append_all(std::vector<Tracker>& dst, std::vector<Tracker>&& src) {
    dst.reserve(dst.size() + src.size());
    for (auto& t : src) dst.push_back(std::move(t));
}

std::string longest_name(const std::vector<Tracker>& v) {
    std::string best;
    for (const auto& t : v)
        if (t.name.size() > best.size()) best = t.name;
    return best;
}
`,
  },
  {
    id: 'cpp-ranges', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Ranges and views', file: 'ranges.cpp',
    title: 'C++20 ranges and views',
    intro: 'Ranges let you write `v | filter(...) | transform(...)`: a pipeline, read left to right, that does nothing until something uses it. `std::ranges::sort(v)` takes the whole container, no begin/end.',
    starter: String.raw`#include <algorithm>
#include <map>
#include <ranges>
#include <string>
#include <string_view>
#include <vector>

std::vector<int> evens_squared(const std::vector<int>& v) {
    // TODO step 1
    return {};
}

std::vector<std::string> sorted_unique(std::vector<std::string> words) {
    // TODO step 2
    return {};
}

std::map<char, int> letter_counts(std::string_view s) {
    // TODO step 3
    return {};
}
`,
    decls: '#include <map>\n#include <string>\n#include <string_view>\n#include <vector>\nstd::vector<int> evens_squared(const std::vector<int>& v);\nstd::vector<std::string> sorted_unique(std::vector<std::string> words);\nstd::map<char, int> letter_counts(std::string_view s);\n',
    steps: [
      { title: 'evens_squared', brief: 'The squares of the even numbers, in order, with a views pipeline: `v | std::views::filter(...) | std::views::transform(...)`, collected into a vector.', hints: ['`auto r = v | std::views::filter([](int x) { return x % 2 == 0; }) | std::views::transform([](int x) { return x * x; });`', '`return std::vector<int>(r.begin(), r.end());` (C++23 has std::ranges::to)'],
        test: String.raw`CHECK_VEC(evens_squared({1, 2, 3, 4}), (std::vector<int>{4, 16})); CHECK_VEC(evens_squared({}), std::vector<int>{}); CHECK_VEC(evens_squared({-2, 5}), std::vector<int>{4});` },
      { title: 'sorted_unique', brief: 'Sort the words and remove repeats. `std::ranges::sort`, then `std::ranges::unique` returns the leftover tail to erase.', hints: ['`std::ranges::sort(words);`', '`auto tail = std::ranges::unique(words); words.erase(tail.begin(), tail.end()); return words;`'],
        test: String.raw`CHECK_VEC(sorted_unique({"pear", "apple", "pear", "fig", "apple"}), (std::vector<std::string>{"apple", "fig", "pear"})); CHECK_VEC(sorted_unique({}), std::vector<std::string>{});` },
      { title: 'letter_counts', brief: 'How often each letter appears, lowercased, letters only, in a `std::map` (sorted by letter).', hints: ['`for (unsigned char c : s) if (std::isalpha(c)) ++m[static_cast<char>(std::tolower(c))];` (the unsigned char matters: isalpha of a negative char is undefined)'],
        test: String.raw`auto m = letter_counts("Hello, World"); CHECK_INT(m['l'], 3); CHECK_INT(m['h'], 1); CHECK_INT(m.count(','), 0); CHECK_INT(m.size(), 7);` },
    ],
    solution: String.raw`#include <algorithm>
#include <cctype>
#include <map>
#include <ranges>
#include <string>
#include <string_view>
#include <vector>

std::vector<int> evens_squared(const std::vector<int>& v) {
    auto r = v | std::views::filter([](int x) { return x % 2 == 0; }) | std::views::transform([](int x) { return x * x; });
    return std::vector<int>(r.begin(), r.end());
}

std::vector<std::string> sorted_unique(std::vector<std::string> words) {
    std::ranges::sort(words);
    auto tail = std::ranges::unique(words);
    words.erase(tail.begin(), tail.end());
    return words;
}

std::map<char, int> letter_counts(std::string_view s) {
    std::map<char, int> m;
    for (unsigned char c : s)
        if (std::isalpha(c)) ++m[static_cast<char>(std::tolower(c))];
    return m;
}
`,
  },
  {
    id: 'cpp-errors', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Errors: optional and exceptions', file: 'errors.cpp',
    title: 'Errors: std::optional and exceptions',
    intro: 'Two ways to say "it didn\'t work": return `std::optional` (a value or nothing) when failing is normal, or throw an exception when it\'s exceptional and the caller shouldn\'t carry on. Your own exception types derive from std::runtime_error.',
    files: { 'errors.hpp': String.raw`#pragma once
#include <optional>
#include <stdexcept>
#include <string>
#include <string_view>

std::optional<int> parse_int(std::string_view s);   // nothing if it isn't a whole int
int parse_or_throw(std::string_view s);              // throws std::invalid_argument

class InsufficientFunds : public std::runtime_error {
public:
    InsufficientFunds(long needed, long available);
    long needed() const { return needed_; }
private:
    long needed_;
};

class Wallet {
public:
    explicit Wallet(long pence) : pence_(pence) {}
    void pay(long amount);       // throws InsufficientFunds, changes nothing then
    long balance() const { return pence_; }
private:
    long pence_;
};
` },
    starter: String.raw`#include <charconv>
#include "errors.hpp"

std::optional<int> parse_int(std::string_view s) {
    // TODO step 1
    (void)s;
    return 0;
}

int parse_or_throw(std::string_view s) {
    // TODO step 2
    (void)s;
    return 0;
}

InsufficientFunds::InsufficientFunds(long needed, long available)
    : std::runtime_error("not enough money"), needed_(needed) {
    // TODO step 3: a message that says how much: "needed 500, have 120"
    (void)available;
}

void Wallet::pay(long amount) {
    // TODO step 3
    (void)amount;
}
`,
    decls: '#include "errors.hpp"\n',
    steps: [
      { title: 'parse_int', brief: 'Return the number if all of `s` is a whole int (an optional minus, digits, nothing else, and it fits); otherwise `std::nullopt`. `std::from_chars` says exactly where it stopped, and never throws.', hints: ['`int x; auto [p, ec] = std::from_chars(s.data(), s.data() + s.size(), x);`', '`if (ec != std::errc{} || p != s.data() + s.size()) return std::nullopt; return x;`'],
        test: String.raw`CHECK(parse_int("42") == 42); CHECK(parse_int("-7") == -7); CHECK(!parse_int("12x")); CHECK(!parse_int("")); CHECK(!parse_int("99999999999"));` },
      { title: 'parse_or_throw', brief: 'The same, but throw `std::invalid_argument` with a message naming the text when it isn\'t a number. Build it on parse_int.', hints: ['`if (auto v = parse_int(s)) return *v; throw std::invalid_argument("not a number: " + std::string(s));`'],
        test: String.raw`CHECK_INT(parse_or_throw("10"), 10); std::string msg; try { parse_or_throw("ten"); } catch (const std::invalid_argument& e) { msg = e.what(); } CHECK(msg.find("ten") != std::string::npos);` },
      { title: 'your own exception', brief: '`pay` takes the money, or throws `InsufficientFunds` and changes nothing. Its message says `needed 500, have 120`; it also remembers `needed()`. Catching `std::runtime_error&` (or `std::exception&`) catches it too.', hints: ['Constructor: `: std::runtime_error("needed " + std::to_string(needed) + ", have " + std::to_string(available)), needed_(needed) {}`', '`if (amount > pence_) throw InsufficientFunds(amount, pence_); pence_ -= amount;`'],
        test: String.raw`Wallet w(120); w.pay(20); CHECK_INT(w.balance(), 100); std::string msg; long need = 0;
try { w.pay(500); } catch (const InsufficientFunds& e) { msg = e.what(); need = e.needed(); } CHECK_STR(msg, "needed 500, have 100"); CHECK_INT(need, 500); CHECK_INT(w.balance(), 100);
bool base = false; try { w.pay(1000); } catch (const std::runtime_error&) { base = true; } CHECK(base);` },
    ],
    solution: String.raw`#include <charconv>
#include "errors.hpp"

std::optional<int> parse_int(std::string_view s) {
    int x = 0;
    auto [p, ec] = std::from_chars(s.data(), s.data() + s.size(), x);
    if (s.empty() || ec != std::errc{} || p != s.data() + s.size()) return std::nullopt;
    return x;
}

int parse_or_throw(std::string_view s) {
    if (auto v = parse_int(s)) return *v;
    throw std::invalid_argument("not a number: " + std::string(s));
}

InsufficientFunds::InsufficientFunds(long needed, long available)
    : std::runtime_error("needed " + std::to_string(needed) + ", have " + std::to_string(available)), needed_(needed) {}

void Wallet::pay(long amount) {
    if (amount > pence_) throw InsufficientFunds(amount, pence_);
    pence_ -= amount;
}
`,
  },
  {
    id: 'cpp-inheritance', lang: 'cpp', kind: 'functions', track: 'C++, going further', topic: 'Inheritance and virtual functions', file: 'shapes.cpp',
    title: 'Inheritance and virtual functions',
    intro: 'A base class declares virtual functions; each derived class overrides them; code that only knows the base calls the right one. A base class used this way needs a virtual destructor, or deleting through a base pointer is undefined (AddressSanitizer reports it).',
    files: { 'shapes.hpp': String.raw`#pragma once
#include <memory>
#include <string>
#include <vector>

class Shape {
public:
    virtual ~Shape() = default;
    virtual double area() const = 0;            // = 0: every shape must say
    virtual std::string name() const = 0;
    std::string describe() const;               // "a circle of area 3.14"
};

class Circle : public Shape {
public:
    explicit Circle(double r) : r_(r) {}
    double area() const override;
    std::string name() const override;
private:
    double r_;
};

class Rect : public Shape {
public:
    Rect(double w, double h) : w_(w), h_(h) {}
    double area() const override;
    std::string name() const override;
private:
    double w_, h_;
};

double total_area(const std::vector<std::unique_ptr<Shape>>& shapes);
` },
    starter: String.raw`#include <cstdio>
#include "shapes.hpp"

double Circle::area() const { return 0; }          // TODO step 1
std::string Circle::name() const { return ""; }    // TODO step 1
double Rect::area() const { return 0; }            // TODO step 1
std::string Rect::name() const { return ""; }      // TODO step 1

double total_area(const std::vector<std::unique_ptr<Shape>>& shapes) {
    // TODO step 2
    (void)shapes;
    return 0;
}

std::string Shape::describe() const {
    // TODO step 3
    return "";
}
`,
    decls: '#include "shapes.hpp"\n',
    steps: [
      { title: 'the overrides', brief: 'A circle\'s area is π r² (use 3.141592653589793), its name `"circle"`; a rectangle\'s is w × h, `"rectangle"`.', hints: ['`double Circle::area() const { return 3.141592653589793 * r_ * r_; }`'],
        test: String.raw`Circle c(1); CHECK_DBL(c.area(), 3.141592653589793); CHECK_STR(c.name(), "circle"); Rect r(2, 3); CHECK_DBL(r.area(), 6); CHECK_STR(r.name(), "rectangle");` },
      { title: 'total_area', brief: 'Add up the areas of shapes you only know as `Shape`s: the virtual call picks each one\'s own area. The unique_ptrs delete each through a `Shape*`, which is fine because the destructor is virtual.', hints: ['`double t = 0; for (const auto& s : shapes) t += s->area(); return t;`'],
        test: String.raw`std::vector<std::unique_ptr<Shape>> v; v.push_back(std::make_unique<Rect>(2, 2)); v.push_back(std::make_unique<Circle>(1)); v.push_back(std::make_unique<Rect>(1, 0.5));
CHECK_DBL(total_area(v), 4.5 + 3.141592653589793); CHECK_DBL(total_area({}), 0);` },
      { title: 'describe', brief: '`describe()` is written once, in the base class, and calls the virtual functions: `"a circle of area 3.14"` (2 decimals).', hints: ['`char buf[64]; std::snprintf(buf, sizeof buf, "%.2f", area()); return "a " + name() + " of area " + buf;`'],
        test: String.raw`CHECK_STR(Circle(1).describe(), "a circle of area 3.14"); CHECK_STR(Rect(2, 2.5).describe(), "a rectangle of area 5.00");
std::unique_ptr<Shape> s = std::make_unique<Rect>(1, 1); CHECK_STR(s->describe(), "a rectangle of area 1.00");` },
    ],
    solution: String.raw`#include <cstdio>
#include "shapes.hpp"

double Circle::area() const { return 3.141592653589793 * r_ * r_; }
std::string Circle::name() const { return "circle"; }
double Rect::area() const { return w_ * h_; }
std::string Rect::name() const { return "rectangle"; }

double total_area(const std::vector<std::unique_ptr<Shape>>& shapes) {
    double t = 0;
    for (const auto& s : shapes) t += s->area();
    return t;
}

std::string Shape::describe() const {
    char buf[64];
    std::snprintf(buf, sizeof buf, "%.2f", area());
    return "a " + name() + " of area " + buf;
}
`,
  },
];
