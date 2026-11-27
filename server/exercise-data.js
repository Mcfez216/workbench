'use strict';
// The exercises: small, one step at a time, each step with its own tests.
//
//   kind 'functions'  you write functions; the app's test program calls them
//                     (compiled together with the sanitizers on, so a memory
//                     bug fails a step just like a wrong answer)
//   kind 'program'    you write a whole program; each step feeds it input and
//                     compares what it prints
//   kind 'ctf'        a small program to take apart (strings, objdump, gdb, a
//                     crafted input); the step passes when you enter its flag
//
// Step types: tests (default), reflect (a question you answer in your own
// words; a model answer appears afterwards).
//
// Code is in String.raw`...` so C's \n stays \n. Briefs are Markdown.

module.exports = [
  // ================================================================== C basics
  {
    id: 'c-first-functions', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Functions', file: 'first.c',
    title: 'First functions',
    intro: 'A function takes some values in, and gives one value back. Each step adds one function. The tests call your function with a few inputs. If an answer is wrong, they tell you exactly what came back.',
    starter: String.raw`/* Write each function where it says TODO. F7 (or "Check my code") runs the tests. */

int add(int a, int b) {
    /* TODO step 1 */
    return 0;
}

int max3(int a, int b, int c) {
    /* TODO step 2 */
    return 0;
}

int clamp(int x, int lo, int hi) {
    /* TODO step 3 */
    return 0;
}
`,
    decls: 'int add(int a, int b);\nint max3(int a, int b, int c);\nint clamp(int x, int lo, int hi);\n',
    steps: [
      { title: 'add', brief: 'Make `add(a, b)` return the sum of `a` and `b`.', hints: ['`return a + b;`'],
        test: String.raw`CHECK_INT(add(2, 3), 5); CHECK_INT(add(-4, 4), 0); CHECK_INT(add(-2, -3), -5);` },
      { title: 'max3', brief: 'Make `max3(a, b, c)` return the biggest of the three numbers.', hints: ['Start with `int m = a;`. Compare `m` with `b`, then with `c`. Keep whichever is bigger.'],
        test: String.raw`CHECK_INT(max3(1, 2, 3), 3); CHECK_INT(max3(9, 2, 3), 9); CHECK_INT(max3(1, 8, 3), 8); CHECK_INT(max3(-5, -2, -9), -2);` },
      { title: 'clamp', brief: '`clamp(x, lo, hi)` keeps `x` between `lo` and `hi`. If `x` is below `lo`, return `lo`. If it\'s above `hi`, return `hi`. Otherwise, return `x`.', hints: ['You need two `if`s. One checks for too small, and one checks for too big.'],
        test: String.raw`CHECK_INT(clamp(5, 0, 10), 5); CHECK_INT(clamp(-3, 0, 10), 0); CHECK_INT(clamp(42, 0, 10), 10); CHECK_INT(clamp(10, 0, 10), 10);` },
    ],
    solution: String.raw`int add(int a, int b) { return a + b; }

int max3(int a, int b, int c) {
    int m = a;
    if (b > m) m = b;
    if (c > m) m = c;
    return m;
}

int clamp(int x, int lo, int hi) {
    if (x < lo) return lo;
    if (x > hi) return hi;
    return x;
}
`,
  },
  {
    id: 'c-loops', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Loops', file: 'loops.c',
    title: 'Loops',
    intro: '`for` and `while` loops repeat work. Be careful with the edge cases. Those are zero, one, and negative numbers.',
    starter: String.raw`long sum_to(int n) {
    /* TODO step 1: 1 + 2 + ... + n (0 when n < 1) */
    return 0;
}

int count_digits(long n) {
    /* TODO step 2: how many digits n has (0 has one; the minus sign doesn't count) */
    return 0;
}

int is_prime(int n) {
    /* TODO step 3: 1 if n is prime, 0 if not */
    return 0;
}
`,
    decls: 'long sum_to(int n);\nint count_digits(long n);\nint is_prime(int n);\n',
    steps: [
      { title: 'sum_to', brief: '`sum_to(n)` adds up 1 + 2 + ... + n. If `n` is less than 1, return 0.', hints: ['`long total = 0; for (int i = 1; i <= n; ++i) total += i;`'],
        test: String.raw`CHECK_INT(sum_to(1), 1); CHECK_INT(sum_to(4), 10); CHECK_INT(sum_to(0), 0); CHECK_INT(sum_to(-5), 0); CHECK_INT(sum_to(100000), 5000050000L);` },
      { title: 'count_digits', brief: '`count_digits(n)` counts the digits in `n`. 7 has 1 digit, 1234 has 4, 0 has 1, and -56 has 2.', hints: ['Keep dividing by 10 until the number reaches 0, and count how many times you divided. 0 is a special case.', 'Make the number positive first. Work with its absolute value, which is the number without its minus sign.'],
        test: String.raw`CHECK_INT(count_digits(7), 1); CHECK_INT(count_digits(1234), 4); CHECK_INT(count_digits(0), 1); CHECK_INT(count_digits(-56), 2); CHECK_INT(count_digits(1000000000L), 10);` },
      { title: 'is_prime', brief: 'Return true if `n` is a prime number. A prime can only be divided evenly by 1 and by itself. 2, 3, 5 and 7 are primes. 0, 1, 4 and 9 are not.', hints: ['Try dividing by every number d, starting at 2, while d * d <= n. If any of them divides evenly, it\'s not a prime.'],
        test: String.raw`CHECK_INT(is_prime(2), 1); CHECK_INT(is_prime(17), 1); CHECK_INT(is_prime(1), 0); CHECK_INT(is_prime(0), 0); CHECK_INT(is_prime(-7), 0); CHECK_INT(is_prime(91), 0); CHECK_INT(is_prime(7919), 1);` },
    ],
    solution: String.raw`long sum_to(int n) {
    long total = 0;
    for (int i = 1; i <= n; ++i) total += i;
    return total;
}

int count_digits(long n) {
    if (n == 0) return 1;
    int count = 0;
    while (n != 0) { n /= 10; ++count; }
    return count;
}

int is_prime(int n) {
    if (n < 2) return 0;
    for (int d = 2; (long)d * d <= n; ++d)
        if (n % d == 0) return 0;
    return 1;
}
`,
  },
  {
    id: 'c-arrays', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Arrays', file: 'arrays.c',
    title: 'Arrays',
    intro: 'In C, a function gets an array as a pointer to its first element. It can\'t find the length by itself, so the length is passed in too. Reading one element past the end is a classic bug. The sanitizer will catch it if you do.',
    starter: String.raw`#include <stddef.h>

int array_max(const int *a, size_t n) {
    /* TODO step 1 (n is at least 1) */
    return 0;
}

double average(const int *a, size_t n) {
    /* TODO step 2 (0.0 for an empty array) */
    return 0.0;
}

void reverse(int *a, size_t n) {
    /* TODO step 3: reverse the array in place */
}
`,
    decls: '#include <stddef.h>\nint array_max(const int *a, size_t n);\ndouble average(const int *a, size_t n);\nvoid reverse(int *a, size_t n);\n',
    steps: [
      { title: 'array_max', brief: 'Return the biggest element of `a`. The array always has at least one element.', hints: ['Start with `a[0]` as the biggest so far. Then look at `a[1]` up to `a[n - 1]`.'],
        test: String.raw`int x[] = {3, 9, 2}; CHECK_INT(array_max(x, 3), 9); int y[] = {-5, -2, -8}; CHECK_INT(array_max(y, 3), -2); int z[] = {4}; CHECK_INT(array_max(z, 1), 4);` },
      { title: 'average', brief: 'Return the average as a `double`. If the array is empty, so `n` is 0, return 0.0. Be careful: dividing an int by an int throws away the decimals.', hints: ['Add the numbers up in a `long`. Then `return (double)sum / n;`'],
        test: String.raw`int x[] = {1, 2}; CHECK_DBL(average(x, 2), 1.5); int y[] = {5, 5, 6}; CHECK_DBL(average(y, 3), 16.0 / 3); CHECK_DBL(average(x, 0), 0.0);` },
      { title: 'reverse', brief: 'Reverse the array, in the same memory. So {1, 2, 3} becomes {3, 2, 1}. Don\'t read or write past the end.', hints: ['Swap `a[i]` with `a[n - 1 - i]`, for every i below n / 2.'],
        test: String.raw`int x[] = {1, 2, 3, 4}; reverse(x, 4); CHECK(x[0] == 4 && x[1] == 3 && x[2] == 2 && x[3] == 1); int y[] = {1, 2, 3}; reverse(y, 3); CHECK(y[0] == 3 && y[1] == 2 && y[2] == 1); int *heap = malloc(sizeof(int)); heap[0] = 7; reverse(heap, 1); CHECK_INT(heap[0], 7); reverse(heap, 0); free(heap);` },
    ],
    solution: String.raw`#include <stddef.h>

int array_max(const int *a, size_t n) {
    int m = a[0];
    for (size_t i = 1; i < n; ++i) if (a[i] > m) m = a[i];
    return m;
}

double average(const int *a, size_t n) {
    if (n == 0) return 0.0;
    long sum = 0;
    for (size_t i = 0; i < n; ++i) sum += a[i];
    return (double)sum / n;
}

void reverse(int *a, size_t n) {
    for (size_t i = 0; i < n / 2; ++i) {
        int t = a[i];
        a[i] = a[n - 1 - i];
        a[n - 1 - i] = t;
    }
}
`,
  },
  {
    id: 'c-strings', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Strings', file: 'strings.c',
    title: 'Strings by hand',
    intro: 'A C string is an array of `char` that ends with a zero byte, written `\'\\0\'`. To find its length, you walk along it until you reach that zero.',
    starter: String.raw`#include <stddef.h>

size_t my_strlen(const char *s) {
    /* TODO step 1: without calling strlen */
    return 0;
}

int count_char(const char *s, char c) {
    /* TODO step 2 */
    return 0;
}

void to_upper(char *s) {
    /* TODO step 3: change a-z to A-Z, in place */
}
`,
    decls: '#include <stddef.h>\nsize_t my_strlen(const char *s);\nint count_char(const char *s, char c);\nvoid to_upper(char *s);\n',
    steps: [
      { title: 'my_strlen', brief: 'Count the characters before the `\'\\0\'`. Don\'t use `strlen`.', hints: ['`size_t n = 0; while (s[n] != \'\\0\') ++n;`'],
        test: String.raw`CHECK_INT(my_strlen("hello"), 5); CHECK_INT(my_strlen(""), 0); CHECK_INT(my_strlen("a b"), 3);` },
      { title: 'count_char', brief: 'Count how many times the character `c` appears in the string `s`.', hints: ['Walk along the string with a pointer: `for (; *s; ++s)`. The loop stops at the `\'\\0\'`.'],
        test: String.raw`CHECK_INT(count_char("banana", 'a'), 3); CHECK_INT(count_char("banana", 'z'), 0); CHECK_INT(count_char("", 'a'), 0);` },
      { title: 'to_upper', brief: 'Turn small letters into capitals. Leave everything else as it is.', hints: ['If a character is between \'a\' and \'z\', subtract (\'a\' - \'A\') from it. Or use `toupper` from `<ctype.h>`, and cast the character to unsigned char first.'],
        test: String.raw`char s[] = "Hello, world 42!"; to_upper(s); CHECK_STR(s, "HELLO, WORLD 42!"); char e[] = ""; to_upper(e); CHECK_STR(e, "");` },
    ],
    solution: String.raw`#include <stddef.h>

size_t my_strlen(const char *s) {
    size_t n = 0;
    while (s[n] != '\0') ++n;
    return n;
}

int count_char(const char *s, char c) {
    int n = 0;
    for (; *s; ++s) if (*s == c) ++n;
    return n;
}

void to_upper(char *s) {
    for (; *s; ++s) if (*s >= 'a' && *s <= 'z') *s = (char)(*s - ('a' - 'A'));
}
`,
  },
  {
    id: 'c-pointers', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Pointers', file: 'pointers.c',
    title: 'Pointers',
    intro: 'A pointer holds the address of a variable. If you give a function a pointer, the function can change your variable. It can also use pointers to give back more than one answer. Tip: open Tools → Visualise memory to see the pointers as arrows.',
    starter: String.raw`#include <stddef.h>

void swap(int *a, int *b) {
    /* TODO step 1 */
}

void min_max(const int *a, size_t n, int *min, int *max) {
    /* TODO step 2. The array always has at least 1 number in it. */
}

int *find(int *a, size_t n, int x) {
    /* TODO step 3. Give back a pointer to the first number that equals x. If there isn't one, give back NULL. */
    return NULL;
}
`,
    decls: '#include <stddef.h>\nvoid swap(int *a, int *b);\nvoid min_max(const int *a, size_t n, int *min, int *max);\nint *find(int *a, size_t n, int x);\n',
    steps: [
      { title: 'swap', brief: '`a` and `b` point to two numbers. Swap them, so each one ends up holding the other\'s value.', hints: ['You need a spare variable to hold one value for a moment.', '`int t = *a; *a = *b; *b = t;`'],
        test: String.raw`int x = 1, y = 2; swap(&x, &y); CHECK_INT(x, 2); CHECK_INT(y, 1); swap(&x, &x); CHECK_INT(x, 2);` },
      { title: 'min_max', brief: 'Find the smallest and the biggest number in the array. Put the smallest into `*min` and the biggest into `*max`. This is how one function can give back two answers.', hints: ['Start with `int lo = a[0], hi = a[0];` and loop over the rest.', 'At the end, write the answers through the pointers: `*min = lo; *max = hi;`'],
        test: String.raw`int a[] = {4, -1, 9, 3}; int lo = 0, hi = 0; min_max(a, 4, &lo, &hi); CHECK_INT(lo, -1); CHECK_INT(hi, 9); int b[] = {5}; min_max(b, 1, &lo, &hi); CHECK_INT(lo, 5); CHECK_INT(hi, 5);` },
      { title: 'find', brief: 'Look for the first number in the array that equals `x`. Return its address, so the caller can change it. If no number matches, return `NULL`.', hints: ['Loop over the array. When `a[i] == x`, return `&a[i]`, the address of that number.', 'After the loop, nothing matched, so `return NULL;`'],
        test: String.raw`int a[] = {3, 7, 7}; int *p = find(a, 3, 7); CHECK(p == &a[1]); *p = 0; CHECK_INT(a[1], 0); CHECK(find(a, 3, 42) == NULL); CHECK(find(a, 0, 3) == NULL);` },
    ],
    solution: String.raw`#include <stddef.h>

void swap(int *a, int *b) { int t = *a; *a = *b; *b = t; }

void min_max(const int *a, size_t n, int *min, int *max) {
    int lo = a[0], hi = a[0];
    for (size_t i = 1; i < n; ++i) {
        if (a[i] < lo) lo = a[i];
        if (a[i] > hi) hi = a[i];
    }
    *min = lo;
    *max = hi;
}

int *find(int *a, size_t n, int x) {
    for (size_t i = 0; i < n; ++i) if (a[i] == x) return &a[i];
    return NULL;
}
`,
  },
  {
    id: 'c-memory', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Heap memory', file: 'memory.c',
    title: 'malloc, realloc, free',
    intro: 'Memory from `malloc` lasts until you `free` it, exactly once. AddressSanitizer is turned on. If you write past the end, or use memory after freeing it, the step fails.',
    starter: String.raw`#include <stdlib.h>
#include <string.h>

int *make_range(int n) {
    /* TODO step 1: a new array {0, 1, ..., n-1}; NULL when n <= 0 */
    return NULL;
}

char *dup_string(const char *s) {
    /* TODO step 2: a new copy of s (the caller frees it) */
    return NULL;
}

int *grow(int *a, size_t old_n, size_t new_n) {
    /* TODO step 3: make a hold new_n ints, the new ones set to 0 */
    return a;
}
`,
    decls: '#include <stddef.h>\nint *make_range(int n);\nchar *dup_string(const char *s);\nint *grow(int *a, size_t old_n, size_t new_n);\n',
    steps: [
      { title: 'make_range', brief: 'Get memory for `n` ints with `malloc`. Fill it with 0, 1, ..., n-1, and return it. If `n` is 0 or less, return `NULL`.', hints: ['`int *a = malloc(n * sizeof *a);` Then check that `a` isn\'t NULL.'],
        test: String.raw`int *r = make_range(4); CHECK(r != NULL); if (r) { CHECK(r[0] == 0 && r[3] == 3); free(r); } CHECK(make_range(0) == NULL); CHECK(make_range(-1) == NULL);` },
      { title: 'dup_string', brief: 'Return a copy of `s` in new memory from `malloc`. Remember the `\'\\0\'` at the end: "hi" needs 3 bytes.', hints: ['`size_t len = strlen(s) + 1;` Then `malloc(len)`, and copy the text with `memcpy`.'],
        test: String.raw`const char *src = "workbench"; char *d = dup_string(src); CHECK(d != NULL && d != src); if (d) { CHECK_STR(d, "workbench"); free(d); } char *e = dup_string(""); if (e) { CHECK_STR(e, ""); free(e); } else CHECK(e != NULL);` },
      { title: 'grow', brief: 'Use `realloc` to make the array hold `new_n` ints. Set the new places to 0. Return the pointer `realloc` gave you, because the array may have moved. Never use the old pointer after that.', hints: ['`int *b = realloc(a, new_n * sizeof *b); if (!b) return NULL;` Then set `b[old_n]` up to `b[new_n - 1]` to 0.'],
        test: String.raw`int *a = make_range(3); a = grow(a, 3, 6); CHECK(a != NULL); if (a) { CHECK(a[0] == 0 && a[2] == 2); CHECK(a[3] == 0 && a[5] == 0); a[5] = 9; free(a); }` },
    ],
    solution: String.raw`#include <stdlib.h>
#include <string.h>

int *make_range(int n) {
    if (n <= 0) return NULL;
    int *a = malloc((size_t)n * sizeof *a);
    if (a == NULL) return NULL;
    for (int i = 0; i < n; ++i) a[i] = i;
    return a;
}

char *dup_string(const char *s) {
    size_t len = strlen(s) + 1;
    char *d = malloc(len);
    if (d) memcpy(d, s, len);
    return d;
}

int *grow(int *a, size_t old_n, size_t new_n) {
    int *b = realloc(a, new_n * sizeof *b);
    if (b == NULL) return NULL;
    for (size_t i = old_n; i < new_n; ++i) b[i] = 0;
    return b;
}
`,
  },
  {
    id: 'c-structs', lang: 'c', kind: 'functions', track: 'C basics', topic: 'Structs', file: 'points.c',
    title: 'Structs',
    intro: 'A `struct` groups several values into one type. You can pass it to a function as a copy, or pass a pointer so the function uses the original.',
    files: { 'point.h': String.raw`#ifndef POINT_H
#define POINT_H
#include <stddef.h>

struct Point { int x, y; };

int manhattan(struct Point a, struct Point b);
struct Point midpoint(struct Point a, struct Point b);
void sort_by_x(struct Point *p, size_t n);

#endif
` },
    starter: String.raw`#include "point.h"

int manhattan(struct Point a, struct Point b) {
    /* TODO step 1: |ax - bx| + |ay - by| */
    return 0;
}

struct Point midpoint(struct Point a, struct Point b) {
    /* TODO step 2: halfway (integer division is fine) */
    struct Point m = {0, 0};
    return m;
}

void sort_by_x(struct Point *p, size_t n) {
    /* TODO step 3: smallest x first (qsort, or a simple loop) */
}
`,
    decls: '#include "point.h"\n',
    steps: [
      { title: 'manhattan', brief: 'Return the "taxi" distance between two points. That\'s how far apart they are across, plus how far apart they are up and down.', hints: ['Use `abs()` from `<stdlib.h>` to make each difference positive.'],
        test: String.raw`struct Point a = {1, 2}, b = {4, -2}; CHECK_INT(manhattan(a, b), 7); CHECK_INT(manhattan(a, a), 0);` },
      { title: 'midpoint', brief: 'Return the point halfway between `a` and `b`. Its x is (a.x + b.x) / 2, and its y works the same way.', hints: ['`struct Point m = { (a.x + b.x) / 2, (a.y + b.y) / 2 };`'],
        test: String.raw`struct Point a = {0, 0}, b = {4, 10}; struct Point m = midpoint(a, b); CHECK_INT(m.x, 2); CHECK_INT(m.y, 5);` },
      { title: 'sort_by_x', brief: 'Sort the array so that x goes up. Use `qsort`. It needs a compare function that returns a negative number, 0, or a positive number.', hints: ['Write `static int by_x(const void *a, const void *b)`. Inside it, cast both to `const struct Point *`. Then `return (pa->x > pb->x) - (pa->x < pb->x);`'],
        test: String.raw`struct Point p[] = {{5, 0}, {-1, 1}, {3, 2}}; sort_by_x(p, 3); CHECK(p[0].x == -1 && p[1].x == 3 && p[2].x == 5); CHECK_INT(p[0].y, 1);` },
    ],
    solution: String.raw`#include "point.h"
#include <stdlib.h>

int manhattan(struct Point a, struct Point b) { return abs(a.x - b.x) + abs(a.y - b.y); }

struct Point midpoint(struct Point a, struct Point b) {
    struct Point m = { (a.x + b.x) / 2, (a.y + b.y) / 2 };
    return m;
}

static int by_x(const void *a, const void *b) {
    const struct Point *pa = a, *pb = b;
    return (pa->x > pb->x) - (pa->x < pb->x);
}

void sort_by_x(struct Point *p, size_t n) { qsort(p, n, sizeof *p, by_x); }
`,
  },
  {
    id: 'c-hello-io', lang: 'c', kind: 'program', track: 'C basics', topic: 'Input and output', file: 'hello.c',
    title: 'Talking to the user',
    intro: 'This time you write a whole program. It reads what\'s typed on the keyboard, and prints to the screen. Each step runs your program with some input, and compares what it prints with the right answer.',
    starter: String.raw`#include <stdio.h>

int main(void) {
    /* TODO */
    return 0;
}
`,
    steps: [
      { title: 'Hello', brief: 'Print exactly `Hello, World!`, then a new line.', hints: ['`printf("Hello, World!\\n");`'],
        cases: [{ input: '', expected: 'Hello, World!\n' }] },
      { title: 'Hello, you', brief: 'Read a name, one word long. Then print `Hello, <name>!`. This replaces step 1: now the greeting uses the name you read.', hints: ['`char name[64]; if (scanf("%63s", name) == 1) printf("Hello, %s!\\n", name);` The 63 stops a long name writing past the end of the array.'],
        cases: [{ input: 'Ada\n', expected: 'Hello, Ada!\n' }, { input: 'Linus\n', expected: 'Hello, Linus!\n' }] },
      { title: 'Add them up', brief: 'Read a number n. Then read n whole numbers, and print their total. Print nothing else.', hints: ['Start with `long sum = 0;`. Loop n times, reading each number with `scanf("%d", &x)`. Check that scanf returned 1 each time.'],
        cases: [{ input: '3\n1 2 3\n', expected: '6\n' }, { input: '0\n', expected: '0\n' }, { input: '2\n-5 100\n', expected: '95\n' }] },
    ],
    solution: String.raw`#include <stdio.h>

int main(void) {
    int n;
    if (scanf("%d", &n) != 1) return 1;
    long sum = 0;
    for (int i = 0; i < n; ++i) {
        int x;
        if (scanf("%d", &x) != 1) return 1;
        sum += x;
    }
    printf("%ld\n", sum);
    return 0;
}
`,
    // the final solution only does the last step; the earlier ones each had their own
    solutions: [String.raw`#include <stdio.h>
int main(void) { printf("Hello, World!\n"); return 0; }
`, String.raw`#include <stdio.h>
int main(void) { char name[64]; if (scanf("%63s", name) == 1) printf("Hello, %s!\n", name); return 0; }
`],
  },

  // ================================================================== C++
  {
    id: 'cpp-strings-vectors', lang: 'cpp', kind: 'functions', track: 'C++ basics', topic: 'string and vector', file: 'basics.cpp',
    title: 'std::string and std::vector',
    intro: 'These are the same jobs as the C exercises, done the C++ way. C++ containers look after their own memory, and know their own size.',
    starter: String.raw`#include <string>
#include <vector>

std::string greet(const std::string& name) {
    // TODO step 1
    return "";
}

int sum(const std::vector<int>& v) {
    // TODO step 2
    return 0;
}

std::vector<int> evens(const std::vector<int>& v) {
    // TODO step 3: the even numbers, in order
    return {};
}
`,
    decls: '#include <string>\n#include <vector>\nstd::string greet(const std::string& name);\nint sum(const std::vector<int>& v);\nstd::vector<int> evens(const std::vector<int>& v);\n',
    steps: [
      { title: 'greet', brief: '`greet("Ada")` returns `"Hello, Ada!"`. You can join strings with `+`.', hints: ['`return "Hello, " + name + "!";`'],
        test: String.raw`CHECK_STR(greet("Ada"), "Hello, Ada!"); CHECK_STR(greet(""), "Hello, !");` },
      { title: 'sum', brief: 'Add up all the numbers in the vector. A loop like `for (int x : v)` goes through every element.', hints: ['Or use `std::accumulate(v.begin(), v.end(), 0)` from `<numeric>`.'],
        test: String.raw`CHECK_INT(sum({1, 2, 3}), 6); CHECK_INT(sum({}), 0); CHECK_INT(sum({-4, 4, 10}), 10);` },
      { title: 'evens', brief: 'Return a new vector with only the even numbers, in the same order. Negative even numbers count too.', hints: ['`std::vector<int> out; for (int x : v) if (x % 2 == 0) out.push_back(x);`'],
        test: String.raw`CHECK_VEC(evens({1, 2, 3, 4, -6}), (std::vector<int>{2, 4, -6})); CHECK_VEC(evens({1, 3}), std::vector<int>{});` },
    ],
    solution: String.raw`#include <string>
#include <vector>

std::string greet(const std::string& name) { return "Hello, " + name + "!"; }

int sum(const std::vector<int>& v) {
    int total = 0;
    for (int x : v) total += x;
    return total;
}

std::vector<int> evens(const std::vector<int>& v) {
    std::vector<int> out;
    for (int x : v) if (x % 2 == 0) out.push_back(x);
    return out;
}
`,
  },
  {
    id: 'cpp-class-counter', lang: 'cpp', kind: 'functions', track: 'C++ basics', topic: 'Classes', file: 'counter.cpp',
    title: 'A first class',
    intro: 'A class keeps its data private. It offers member functions that keep the data valid. The header file, counter.hpp, lists what the class has. You write what each function does.',
    files: { 'counter.hpp': String.raw`#pragma once

class Counter {
public:
    Counter() = default;
    explicit Counter(int start);

    int value() const;
    void increment();
    void add(int n);      // negative n is ignored
    void reset();

private:
    int count_ = 0;
};
` },
    starter: String.raw`#include "counter.hpp"

Counter::Counter(int start) {
    // TODO step 1 (a negative start counts as 0)
}

int Counter::value() const {
    // TODO step 1
    return 0;
}

void Counter::increment() {
    // TODO step 2
}

void Counter::add(int n) {
    // TODO step 2
}

void Counter::reset() {
    // TODO step 3
}
`,
    decls: '#include "counter.hpp"\n',
    steps: [
      { title: 'construct and read', brief: 'A new `Counter` starts at 0. `Counter c(5)` starts at 5. A negative start counts as 0. `value()` returns the current count.', hints: ['Set the member before the constructor\'s body runs: `Counter::Counter(int start) : count_(start < 0 ? 0 : start) {}`'],
        test: String.raw`Counter a; CHECK_INT(a.value(), 0); Counter b(5); CHECK_INT(b.value(), 5); Counter c(-3); CHECK_INT(c.value(), 0);` },
      { title: 'increment and add', brief: '`increment()` adds one. `add(n)` adds n, but ignores n if it\'s negative, because a counter never goes down.', hints: ['`if (n > 0) count_ += n;`'],
        test: String.raw`Counter c; c.increment(); c.increment(); CHECK_INT(c.value(), 2); c.add(10); CHECK_INT(c.value(), 12); c.add(-5); CHECK_INT(c.value(), 12);` },
      { title: 'reset', brief: '`reset()` sets the count back to 0.', hints: ['`count_ = 0;`'],
        test: String.raw`Counter c(9); c.reset(); CHECK_INT(c.value(), 0); c.increment(); CHECK_INT(c.value(), 1);` },
    ],
    solution: String.raw`#include "counter.hpp"

Counter::Counter(int start) : count_(start < 0 ? 0 : start) {}
int Counter::value() const { return count_; }
void Counter::increment() { ++count_; }
void Counter::add(int n) { if (n > 0) count_ += n; }
void Counter::reset() { count_ = 0; }
`,
  },
  {
    id: 'cpp-text', lang: 'cpp', kind: 'functions', track: 'C++ basics', topic: 'The standard library', file: 'text.cpp',
    title: 'Splitting and counting words',
    intro: 'Real programs work with a lot of text. `std::string`, `std::vector` and `std::map` do the hard work for you.',
    starter: String.raw`#include <map>
#include <memory>
#include <string>
#include <vector>

std::unique_ptr<int> make_value(int v) {
    // TODO step 1
    return nullptr;
}

std::vector<std::string> split(const std::string& s, char sep) {
    // TODO step 2
    return {};
}

std::map<std::string, int> word_count(const std::string& text) {
    // TODO step 3
    return {};
}
`,
    decls: '#include <map>\n#include <memory>\n#include <string>\n#include <vector>\nstd::unique_ptr<int> make_value(int v);\nstd::vector<std::string> split(const std::string& s, char sep);\nstd::map<std::string, int> word_count(const std::string& text);\n',
    steps: [
      { title: 'make_value', brief: 'Return a `std::unique_ptr<int>` that owns a new int with the value `v`. You don\'t need `new` or `delete`. The unique_ptr frees the memory itself.', hints: ['`return std::make_unique<int>(v);`'],
        test: String.raw`auto p = make_value(42); CHECK(p != nullptr); if (p) CHECK_INT(*p, 42);` },
      { title: 'split', brief: '`split("a,b,,c", \',\')` gives `{"a", "b", "", "c"}`. Empty pieces count. An empty string gives one empty piece.', hints: ['Remember where the current piece starts. At every separator, add `s.substr(start, i - start)`. Do it once more at the end.'],
        test: String.raw`auto v = split("a,b,,c", ','); CHECK_INT(v.size(), 4); if (v.size() == 4) { CHECK_STR(v[0], "a"); CHECK_STR(v[2], ""); CHECK_STR(v[3], "c"); } CHECK_INT(split("", ',').size(), 1); CHECK_INT(split("one", ' ').size(), 1);` },
      { title: 'word_count', brief: 'Count how many times each word appears in the text. Words are separated by spaces. Several spaces in a row are fine.', hints: ['`std::istringstream in(text); std::string w; while (in >> w) ++counts[w];`'],
        test: String.raw`auto m = word_count("the cat  and the hat"); CHECK_INT(m["the"], 2); CHECK_INT(m["cat"], 1); CHECK_INT(m.size(), 4); CHECK_INT(word_count("").size(), 0);` },
    ],
    solution: String.raw`#include <map>
#include <memory>
#include <sstream>
#include <string>
#include <vector>

std::unique_ptr<int> make_value(int v) { return std::make_unique<int>(v); }

std::vector<std::string> split(const std::string& s, char sep) {
    std::vector<std::string> out;
    std::size_t start = 0;
    for (std::size_t i = 0; i < s.size(); ++i)
        if (s[i] == sep) { out.push_back(s.substr(start, i - start)); start = i + 1; }
    out.push_back(s.substr(start));
    return out;
}

std::map<std::string, int> word_count(const std::string& text) {
    std::map<std::string, int> counts;
    std::istringstream in(text);
    std::string w;
    while (in >> w) ++counts[w];
    return counts;
}
`,
  },
  {
    id: 'cpp-algorithms', lang: 'cpp', kind: 'functions', track: 'C++ basics', topic: 'Algorithms and lambdas', file: 'algos.cpp',
    title: 'Algorithms and lambdas',
    intro: '`<algorithm>` has ready-made sorting, searching and counting. A lambda, a small function written in place, says how to compare things or what to look for.',
    starter: String.raw`#include <algorithm>
#include <optional>
#include <vector>

void sort_desc(std::vector<int>& v) {
    // TODO step 1: biggest first
}

int count_greater(const std::vector<int>& v, int limit) {
    // TODO step 2
    return 0;
}

std::optional<int> first_negative(const std::vector<int>& v) {
    // TODO step 3: the first negative number, or nothing
    return std::nullopt;
}
`,
    decls: '#include <optional>\n#include <vector>\nvoid sort_desc(std::vector<int>& v);\nint count_greater(const std::vector<int>& v, int limit);\nstd::optional<int> first_negative(const std::vector<int>& v);\n',
    steps: [
      { title: 'sort_desc', brief: 'Sort the numbers with the biggest first. Use `std::sort` with your own comparison.', hints: ['`std::sort(v.begin(), v.end(), [](int a, int b) { return a > b; });` or `std::greater<>()`.'],
        test: String.raw`std::vector<int> v{3, 1, 4, 1, 5}; sort_desc(v); CHECK_VEC(v, (std::vector<int>{5, 4, 3, 1, 1}));` },
      { title: 'count_greater', brief: 'Count how many numbers are greater than `limit`. Use `std::count_if` with a lambda that captures `limit`.', hints: ['`[limit](int x) { return x > limit; }`'],
        test: String.raw`CHECK_INT(count_greater({1, 5, 7, 2}, 4), 2); CHECK_INT(count_greater({}, 0), 0);` },
      { title: 'first_negative', brief: 'Return the first negative number. If there isn\'t one, return `std::nullopt`. `std::optional` means "maybe a value", so you don\'t need a special number like -1.', hints: ['`auto it = std::find_if(...); if (it == v.end()) return std::nullopt; return *it;`'],
        test: String.raw`auto a = first_negative({3, -2, -9}); CHECK(a.has_value()); if (a) CHECK_INT(*a, -2); CHECK(!first_negative({1, 2}).has_value());` },
    ],
    solution: String.raw`#include <algorithm>
#include <functional>
#include <optional>
#include <vector>

void sort_desc(std::vector<int>& v) { std::sort(v.begin(), v.end(), std::greater<>()); }

int count_greater(const std::vector<int>& v, int limit) {
    return static_cast<int>(std::count_if(v.begin(), v.end(), [limit](int x) { return x > limit; }));
}

std::optional<int> first_negative(const std::vector<int>& v) {
    auto it = std::find_if(v.begin(), v.end(), [](int x) { return x < 0; });
    if (it == v.end()) return std::nullopt;
    return *it;
}
`,
  },

  // ================================================================== Security: memory safety lab
  {
    id: 'sec-overflow', lang: 'c', kind: 'functions', track: 'Security lab', topic: 'Buffer overflows', file: 'names.c',
    title: 'Fix the buffer overflow',
    intro: 'This code works for short names, but overflows for long ones. This kind of bug has been used in attacks for decades. Find it and fix it. AddressSanitizer is watching, so the tests show whether your fix works. Then explain it in your own words.',
    starter: String.raw`#include <stddef.h>
#include <string.h>

/* Copies src into dst, which has room for dstsz bytes. */
void copy_name(char *dst, size_t dstsz, const char *src) {
    strcpy(dst, src);      /* what if src is longer than dst? */
}

/* Reads a[i] into *out. Returns 0 on success, -1 if i is out of range. */
int read_index(const int *a, size_t n, long i, int *out) {
    *out = a[i];
    return 0;
}
`,
    decls: '#include <stddef.h>\nvoid copy_name(char *dst, size_t dstsz, const char *src);\nint read_index(const int *a, size_t n, long i, int *out);\n',
    steps: [
      { title: 'Bound the copy', brief: '`copy_name` must never write more than `dstsz` bytes. It must always end the string with `\'\\0\'`, even if it has to cut the name short. The test gives it a name that\'s too long.', hints: ['`snprintf(dst, dstsz, "%s", src)` does both jobs at once.', 'Or copy at most dstsz - 1 bytes, then add the `\'\\0\'` yourself. Only do this if dstsz is more than 0.'],
        test: String.raw`char *buf = malloc(8); copy_name(buf, 8, "Ada"); CHECK_STR(buf, "Ada"); copy_name(buf, 8, "Bartholomew-the-very-long"); CHECK_STR(buf, "Barthol"); free(buf);` },
      { title: 'Why it matters', type: 'reflect', brief: 'In your own words: with the original `strcpy` version, what could someone do by typing a very long name? Imagine `dst` is on the stack, next to other data.',
        answer: 'The person typing decides how many bytes get written. So they can write past the end of the array, into whatever is stored next to it. That could be other variables, like an "is_admin" flag. It could also be the function\'s return address, which says where to go when the function ends. If they overwrite that, they choose where the program goes next. That\'s how this bug lets an attacker run their own code. Modern protections make it harder. Copying with a size limit removes the bug completely.' },
      { title: 'Check the index', brief: '`read_index` trusts `i` without checking it. Make it return -1 if `i` is negative, or if it\'s `n` or more. In that case, don\'t change `*out`. Note that `i` can be negative, and -1 is a likely attack.', hints: ['`if (i < 0 || (size_t)i >= n) return -1;` Check for negative first. Turning -1 into a size_t makes it a huge number.'],
        test: String.raw`int *a = malloc(3 * sizeof *a); a[0] = 10; a[1] = 20; a[2] = 30; int v = 7; CHECK_INT(read_index(a, 3, 1, &v), 0); CHECK_INT(v, 20); v = 7; CHECK_INT(read_index(a, 3, 3, &v), -1); CHECK_INT(read_index(a, 3, -1, &v), -1); CHECK_INT(read_index(a, 3, 1L << 40, &v), -1); CHECK_INT(v, 7); free(a);` },
    ],
    solution: String.raw`#include <stddef.h>
#include <stdio.h>

void copy_name(char *dst, size_t dstsz, const char *src) {
    if (dstsz == 0) return;
    snprintf(dst, dstsz, "%s", src);
}

int read_index(const int *a, size_t n, long i, int *out) {
    if (i < 0 || (size_t)i >= n) return -1;
    *out = a[i];
    return 0;
}
`,
  },
  {
    id: 'sec-integers', lang: 'c', kind: 'functions', track: 'Security lab', topic: 'Integer overflow', file: 'sizes.c',
    title: 'When numbers wrap',
    intro: 'Integers have a fixed size. When a number gets too big, it wraps around to a small one. So a big multiplication can make `malloc` give you a tiny block when you asked for a huge one. UBSan is turned on. It stops the program if a signed number overflows.',
    starter: String.raw`#include <stddef.h>
#include <stdint.h>

/* count * each, or 0 if that doesn't fit in a size_t */
size_t total_size(size_t count, size_t each) {
    return count * each;
}

/* *out = a + b. Returns 0, or -1 (and leaves *out alone) if it would overflow. */
int safe_add(int a, int b, int *out) {
    *out = a + b;
    return 0;
}
`,
    decls: '#include <stddef.h>\nsize_t total_size(size_t count, size_t each);\nint safe_add(int a, int b, int *out);\n',
    steps: [
      { title: 'Spot the wrap', brief: 'Make `total_size` return 0 if `count * each` is too big to fit in a `size_t`. Unsigned numbers wrap around without any warning, and no sanitizer will catch it.', hints: ['It\'s too big exactly when `each != 0 && count > SIZE_MAX / each`.'],
        test: String.raw`CHECK_INT(total_size(10, 4), 40); CHECK_INT(total_size(0, 99), 0); CHECK(total_size(SIZE_MAX / 2 + 2, 2) == 0); CHECK(total_size(SIZE_MAX / 3, 4) == 0); CHECK(total_size(SIZE_MAX, 1) == SIZE_MAX);` },
      { title: 'Add without undefined behaviour', brief: 'In C, a signed number going past its limit is undefined behaviour. The compiler is allowed to assume it never happens. So check before you add.', hints: ['`if ((b > 0 && a > INT_MAX - b) || (b < 0 && a < INT_MIN - b)) return -1;` (`<limits.h>`)', 'Or use `__builtin_add_overflow(a, b, out)`, which gcc and clang both have.'],
        test: String.raw`int r = 5; CHECK_INT(safe_add(2, 3, &r), 0); CHECK_INT(r, 5); r = 1; CHECK_INT(safe_add(INT_MAX, 1, &r), -1); CHECK_INT(r, 1); CHECK_INT(safe_add(INT_MIN, -1, &r), -1); CHECK_INT(safe_add(INT_MAX, -1, &r), 0); CHECK_INT(r, INT_MAX - 1);` },
      { title: 'From a number to a memory bug', type: 'reflect', brief: 'Explain how `malloc(count * each)` can lead to a heap overflow, if an attacker chooses `count`.',
        answer: 'If count * each wraps around, malloc gets a small number, so it returns a small block. But the code that fills the block still loops count times. It writes far past the end of the block. That\'s a heap buffer overflow, and the attacker chooses how far it goes. Checking for overflow before calling malloc fixes it. calloc does this check for you.' },
    ],
    solution: String.raw`#include <limits.h>
#include <stddef.h>
#include <stdint.h>

size_t total_size(size_t count, size_t each) {
    if (each != 0 && count > SIZE_MAX / each) return 0;
    return count * each;
}

int safe_add(int a, int b, int *out) {
    if ((b > 0 && a > INT_MAX - b) || (b < 0 && a < INT_MIN - b)) return -1;
    *out = a + b;
    return 0;
}
`,
  },
  {
    id: 'sec-use-after-free', lang: 'c', kind: 'functions', track: 'Security lab', topic: 'Use after free', file: 'list.c',
    title: 'Use after free',
    intro: 'Using memory after freeing it is undefined behaviour. Attackers love this bug, because the freed memory can be handed out again, filled with their data. This list code has two bugs like that.',
    files: { 'list.h': String.raw`#ifndef LIST_H
#define LIST_H

struct Node { int value; struct Node *next; };

struct Node *push(struct Node *head, int value);   /* new node in front */
void destroy(struct Node *head);                   /* frees every node */
char *make_label(int value);                       /* "item <value>", the caller frees it */

#endif
` },
    starter: String.raw`#include "list.h"
#include <stdio.h>
#include <stdlib.h>

struct Node *push(struct Node *head, int value) {
    struct Node *n = malloc(sizeof *n);
    if (n == NULL) return head;
    n->value = value;
    n->next = head;
    return n;
}

void destroy(struct Node *head) {
    for (struct Node *n = head; n != NULL; n = n->next)
        free(n);           /* ...and then the loop reads n->next */
}

char *make_label(int value) {
    char buf[32];
    snprintf(buf, sizeof buf, "item %d", value);
    char *result = buf;    /* buf dies when this function returns */
    return result;
}
`,
    decls: '#include "list.h"\n',
    steps: [
      { title: 'Free the list safely', brief: '`destroy` reads `n->next` from a node it has just freed. Fix it, so it frees every node without touching memory that\'s already been freed.', hints: ['Save `next` before you free the node: `struct Node *next = n->next; free(n); n = next;`'],
        test: String.raw`struct Node *h = NULL; for (int i = 0; i < 5; ++i) h = push(h, i); CHECK_INT(h->value, 4); destroy(h); destroy(NULL);` },
      { title: 'Don\'t return a dead buffer', brief: '`make_label` returns a pointer to a local array. That array is destroyed when the function returns. Return memory that lasts instead. The caller will `free` it.', hints: ['Get 32 bytes with `malloc(32)`, and write the label into it with `snprintf`.'],
        test: String.raw`char *a = make_label(7); char *b = make_label(42); CHECK(a != NULL && b != NULL); if (a && b) { CHECK_STR(a, "item 7"); CHECK_STR(b, "item 42"); } free(a); free(b);` },
      { title: 'Why attackers like it', type: 'reflect', brief: 'Why can an attacker often use a use-after-free bug, instead of it just crashing the program?',
        answer: 'After a block is freed, the next malloc of a similar size can be given the same block. If the attacker can make that happen with their own data, like a string they send, the old pointer now reads the attacker\'s bytes. Those bytes can pretend to be a struct, a function pointer, or a length. When the program trusts them, the attacker gets control of it.' },
    ],
    solution: String.raw`#include "list.h"
#include <stdio.h>
#include <stdlib.h>

struct Node *push(struct Node *head, int value) {
    struct Node *n = malloc(sizeof *n);
    if (n == NULL) return head;
    n->value = value;
    n->next = head;
    return n;
}

void destroy(struct Node *head) {
    struct Node *n = head;
    while (n != NULL) {
        struct Node *next = n->next;
        free(n);
        n = next;
    }
}

char *make_label(int value) {
    char *buf = malloc(32);
    if (buf) snprintf(buf, 32, "item %d", value);
    return buf;
}
`,
  },
  {
    id: 'sec-format-string', lang: 'c', kind: 'functions', track: 'Security lab', topic: 'Format strings', file: 'logging.c',
    title: 'The format string bug',
    intro: 'If you pass the user\'s text to printf as its *format*, the user can type `%x` to read memory, or `%n` to write to it. The compiler even warns about this, with -Wformat-security.',
    starter: String.raw`#include <stdio.h>
#include <stddef.h>

/* Puts "[user] <message>" into out (size sz). */
void log_message(char *out, size_t sz, const char *message) {
    char tmp[256];
    snprintf(tmp, sizeof tmp, message);    /* the message is used as a format! */
    snprintf(out, sz, "[user] %s", tmp);
}
`,
    decls: '#include <stddef.h>\nvoid log_message(char *out, size_t sz, const char *message);\n',
    steps: [
      { title: 'Text is data, not a format', brief: 'A message like `50% off %d` must be printed exactly as it\'s written. Pass the user\'s text as an argument to printf. Never use it as the format.', hints: ['Do it in one line: `snprintf(out, sz, "[user] %s", message);`'],
        test: String.raw`char out[64]; log_message(out, sizeof out, "hello"); CHECK_STR(out, "[user] hello"); log_message(out, sizeof out, "50% off %d %s"); CHECK_STR(out, "[user] 50% off %d %s");` },
      { title: 'What %x and %n do', type: 'reflect', brief: 'In the original code, what could a user learn or change by sending `%x %x %x %x`, or `%n`?',
        answer: 'printf looks for its values in the next places in memory. If you didn\'t give it any values, each %x just prints whatever is there. That can show addresses, which helps an attacker, and sometimes secrets. %n writes to memory. With careful input, an attacker can write numbers they choose to places they choose. So always pass the user\'s text as a value, with a fixed format.' },
    ],
    solution: String.raw`#include <stdio.h>
#include <stddef.h>

void log_message(char *out, size_t sz, const char *message) {
    snprintf(out, sz, "[user] %s", message);
}
`,
  },

  // ================================================================== Capture the flag (local, offline)
  {
    id: 'ctf-strings', lang: 'c', kind: 'ctf', track: 'Capture the flag', topic: 'Reading binaries', file: 'vault',
    title: 'The vault: strings',
    intro: 'A program called `vault` asks for a password. You don\'t have its code. Find the password without guessing. A compiled program still contains its text. Run it in the terminal with `./vault`. Look inside it with Tools → Inspect a binary, or with `strings vault`.',
    steps: [{ title: 'Get in', brief: 'Type in the flag the vault prints when you give it the right password. It looks like FLAG{...}.', hints: ['Run `strings vault | less`. Look for something that could be a password, near the program\'s messages.', 'The Strings tab in the binary inspector shows the same thing.'] }],
    source: String.raw`#include <stdio.h>
#include <string.h>
int main(void) {
    char pw[64];
    printf("vault v1. password: ");
    fflush(stdout);
    if (!fgets(pw, sizeof pw, stdin)) return 1;
    pw[strcspn(pw, "\n")] = 0;
    if (strcmp(pw, "hunter2-but-longer") == 0) puts("FLAG{strings_tell_all}");
    else puts("wrong.");
    return 0;
}
`,
    build: ['-O0'],
  },
  {
    id: 'ctf-xor', lang: 'c', kind: 'ctf', track: 'Capture the flag', topic: 'Debugging a binary', file: 'vault2',
    title: 'The vault: hidden in plain sight',
    intro: 'vault2 has learned its lesson. `strings` finds nothing useful this time. But when it checks your password, the real one must be in memory somewhere. Stop the program at that moment with gdb, and look.',
    steps: [{ title: 'Get in', brief: 'Type in the flag vault2 prints when you give it the right password.', hints: ['Start with `gdb ./vault2`. Type `break check`, then `run`, and type any password. When it stops, look at what `check` compares your password with.', 'Inside `check`, the real password is decoded into memory just before the comparison. Type `break memcmp` (or `break strcmp`), then `run`. When it stops, `x/s $rsi` and `x/s $rdi` show both passwords.', 'The Disassemble tab in the binary inspector shows `check` too. The password\'s bytes are scrambled with XOR 0x5A.'] }],
    source: String.raw`#include <stdio.h>
#include <string.h>
static const unsigned char secret[] = {0x35,0x2a,0x3f,0x34,0x05,0x29,0x3f,0x29,0x3b,0x37,0x3f};   /* the password, XORed with 0x5A */
static const unsigned char flag[] = {0x1c,0x16,0x1b,0x1d,0x21,0x3d,0x3e,0x38,0x05,0x29,0x3f,0x3f,0x29,0x05,0x3f,0x2c,0x3f,0x28,0x23,0x2e,0x32,0x33,0x34,0x3d,0x27};
__attribute__((noinline)) int check(const char *pw) {
    char real[sizeof secret + 1];
    for (size_t i = 0; i < sizeof secret; ++i) real[i] = (char)(secret[i] ^ 0x5A);
    real[sizeof secret] = 0;
    return strlen(pw) == sizeof secret && memcmp(pw, real, sizeof secret) == 0;
}
int main(void) {
    char pw[64];
    printf("vault v2. password: ");
    fflush(stdout);
    if (!fgets(pw, sizeof pw, stdin)) return 1;
    pw[strcspn(pw, "\n")] = 0;
    if (check(pw)) { for (size_t i = 0; i < sizeof flag; ++i) putchar(flag[i] ^ 0x5A); putchar('\n'); }
    else puts("wrong.");
    return 0;
}
`,
    build: ['-O0', '-g0'],
  },
  {
    id: 'ctf-overflow', lang: 'c', kind: 'ctf', track: 'Capture the flag', topic: 'Exploiting an overflow', file: 'login',
    title: 'Become admin',
    intro: 'This time you have the code. It\'s in `login.c`, next to the program. There\'s no password to find. The only way to the flag is through the bug. Read the code, work out what to type, then run `./login`.',
    showSource: true,
    steps: [{ title: 'Admin', brief: 'Type in the flag `login` prints when you\'re the admin.', hints: ['`name` holds 16 bytes, but the loop reads up to 64. What\'s stored straight after `name` in the struct?', 'Type 16 letters, then one more character. That last one lands in `is_admin`.'] }],
    source: String.raw`#include <stdio.h>

struct session {
    char name[16];
    int is_admin;
};

int main(void) {
    struct session s = { "", 0 };
    printf("name: ");
    fflush(stdout);
    int c, i = 0;
    /* reads a line into s.name, "carefully" stopping at 64 characters */
    while ((c = getchar()) != EOF && c != '\n' && i < 64) ((char *)&s)[i++] = (char)c;
    if (i < 16) s.name[i] = 0;
    if (s.is_admin) puts("welcome, admin: FLAG{bounds_matter}");
    else printf("hello, %.16s. you are not admin.\n", s.name);
    return 0;
}
`,
    build: ['-O0', '-fno-stack-protector'],
  },
  {
    id: 'ctf-integer', lang: 'c', kind: 'ctf', track: 'Capture the flag', topic: 'Exploiting integer overflow', file: 'shop',
    title: 'Buy the flag',
    intro: 'The shop sells flags for 1000 coins each, and you only have 500. You have the code, in `shop.c`. Look closely: it works out the price using an `int`.',
    showSource: true,
    steps: [{ title: 'Afford it', brief: 'Type in the flag the shop prints when your purchase works.', hints: ['`total = quantity * 1000` is an int. What happens when it goes past 2147483647, the biggest int?', 'You need a quantity whose total wraps around to a negative number, or to a small number under 500. Try 2147484, and work it out on paper first.'] }],
    source: String.raw`#include <stdio.h>

int main(void) {
    int coins = 500, quantity;
    printf("flags cost 1000 coins. you have %d. how many? ", coins);
    fflush(stdout);
    if (scanf("%d", &quantity) != 1 || quantity <= 0) { puts("no."); return 1; }
    int total = quantity * 1000;          /* wraps (built with -fwrapv) */
    if (total > coins) { printf("that costs %d. you can't afford it.\n", total); return 0; }
    printf("charged %d coins. here you go: FLAG{wraparound}\n", total);
    return 0;
}
`,
    build: ['-O0', '-fwrapv'],
  },
];

// The flags are checked by their SHA-256, so they aren't sitting here in plain text
const FLAG_HASHES = {
  'ctf-strings': 'b3e1da9a58fa6eb5f64efb0fd94b8dd2bace9386cfa5034f9cbdefa90a91d459',
  'ctf-xor': '3575c4b010b50f375e7ce8444ea6b260ff4bfe9053127cbdb61d66bc3255c086',
  'ctf-overflow': '1cad08c0ee6caae5a2989d4660e579bb9708230aa86343fca6ce7fb74660303a',
  'ctf-integer': '69043e05298d44370c11398e78716ffb54a09d9eb80d57532cff0f40ee965d25',
};
for (const ex of module.exports) if (ex.kind === 'ctf') ex.flagHash = FLAG_HASHES[ex.id];

// The Rust exercises live in their own file
module.exports.push(...require('./exercise-data-rust'));
module.exports.push(...require('./exercise-data-rust-more'));
module.exports.push(...require('./exercise-data-cc'));
