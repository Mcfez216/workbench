/* caesar: shift every letter by a number of places, wrapping round the
   alphabet. Reads standard input, writes standard output.
     echo 'Hello' | caesar 3     ->  Khoor
     echo 'Khoor' | caesar -3    ->  Hello                                */
#include <ctype.h>
#include <errno.h>
#include <stdio.h>
#include <stdlib.h>

int main(int argc, char **argv)
{
    if (argc != 2) {
        fprintf(stderr, "usage: caesar <shift>\n");
        return 2;
    }
    char *end;
    errno = 0;
    long shift = strtol(argv[1], &end, 10);
    if (end == argv[1] || *end != '\0' || errno == ERANGE) {
        fprintf(stderr, "caesar: the shift must be a number\n");
        return 2;
    }
    shift = ((shift % 26) + 26) % 26;   /* 0..25, even for negative shifts */

    int ch;
    while ((ch = getchar()) != EOF) {
        if (isupper(ch))
            ch = 'A' + (ch - 'A' + shift) % 26;
        else if (islower(ch))
            ch = 'a' + (ch - 'a' + shift) % 26;
        putchar(ch);   /* everything else unchanged, bytes included */
    }
    return 0;
}
