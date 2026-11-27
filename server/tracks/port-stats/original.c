/* stats: read whole numbers from standard input (any whitespace between
   them) and print how many, the smallest, the largest, the mean and the
   median. Something that isn't a number stops it with an error.
     printf '3 1 2' | stats   ->  count 3
                                  min 1
                                  max 3
                                  mean 2.00
                                  median 2.0                             */
#include <stdio.h>
#include <stdlib.h>

static int by_value(const void *a, const void *b)
{
    long x = *(const long *)a, y = *(const long *)b;
    return (x > y) - (x < y);   /* not x - y: that can overflow */
}

int main(void)
{
    size_t n = 0, cap = 16;
    long *v = malloc(cap * sizeof *v);
    if (!v) return 1;
    long x;
    int r;
    while ((r = scanf("%ld", &x)) == 1) {
        if (n == cap) {
            long *bigger = realloc(v, 2 * cap * sizeof *v);
            if (!bigger) { free(v); return 1; }
            v = bigger;
            cap *= 2;
        }
        v[n++] = x;
    }
    if (r != EOF) {
        fprintf(stderr, "stats: that isn't a whole number\n");
        free(v);
        return 1;
    }
    if (n == 0) {
        printf("count 0\n");
        free(v);
        return 0;
    }
    qsort(v, n, sizeof *v, by_value);
    double sum = 0;
    for (size_t i = 0; i < n; i++) sum += (double)v[i];
    double median = n % 2 ? (double)v[n / 2] : ((double)v[n / 2 - 1] + (double)v[n / 2]) / 2.0;
    printf("count %zu\nmin %ld\nmax %ld\nmean %.2f\nmedian %.1f\n", n, v[0], v[n - 1], sum / (double)n, median);
    free(v);
    return 0;
}
