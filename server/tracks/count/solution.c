/* count: lines, words and bytes, like wc. A finished version. */
#include <ctype.h>
#include <stdio.h>
#include <string.h>

struct counts {
    long lines, words, bytes;
};

static struct counts count_stream(FILE *in)
{
    struct counts c = {0, 0, 0};
    int ch;
    int in_word = 0;
    while ((ch = getc(in)) != EOF) {
        c.bytes++;
        if (ch == '\n')
            c.lines++;
        if (isspace(ch)) {
            in_word = 0;
        } else if (!in_word) {
            in_word = 1;
            c.words++;
        }
    }
    return c;
}

static int show_l = 0, show_w = 0, show_c = 0;

static void print_counts(struct counts c, const char *name)
{
    const char *sep = "";
    if (show_l) { printf("%s%ld", sep, c.lines); sep = " "; }
    if (show_w) { printf("%s%ld", sep, c.words); sep = " "; }
    if (show_c) { printf("%s%ld", sep, c.bytes); sep = " "; }
    if (name)
        printf("%s%s", sep, name);
    printf("\n");
}

int main(int argc, char **argv)
{
    int i = 1;
    for (; i < argc && argv[i][0] == '-' && argv[i][1] != '\0'; i++) {
        for (const char *p = argv[i] + 1; *p; p++) {
            if (*p == 'l') show_l = 1;
            else if (*p == 'w') show_w = 1;
            else if (*p == 'c') show_c = 1;
            else {
                fprintf(stderr, "count: unknown option -%c\n", *p);
                return 2;
            }
        }
    }
    if (!show_l && !show_w && !show_c)
        show_l = show_w = show_c = 1;

    if (i == argc) {
        print_counts(count_stream(stdin), NULL);
        return 0;
    }
    struct counts total = {0, 0, 0};
    int status = 0, read = 0;
    for (; i < argc; i++) {
        FILE *f = fopen(argv[i], "rb");
        if (!f) {
            fprintf(stderr, "count: %s: can't open\n", argv[i]);
            status = 1;
            continue;
        }
        struct counts c = count_stream(f);
        fclose(f);
        print_counts(c, argv[i]);
        total.lines += c.lines;
        total.words += c.words;
        total.bytes += c.bytes;
        read++;
    }
    if (read > 1)
        print_counts(total, "total");
    return status;
}
