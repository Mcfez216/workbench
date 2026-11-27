/* rpn: a calculator in reverse Polish notation, a line at a time.
   "3 4 + 2 *" means (3 + 4) * 2: numbers go on a stack, an operator takes
   the top two and puts back the answer. Prints one result per line, or
   "error: ..." for that line and carries on.
     echo '3 4 + 2 *' | rpn   ->  14                                     */
#include <stdio.h>
#include <stdlib.h>
#include <string.h>

#define MAX 64

static const char *eval(char *line, long *result)
{
    long stack[MAX];
    int top = 0;
    for (char *tok = strtok(line, " \t\r\n"); tok; tok = strtok(NULL, " \t\r\n")) {
        char *end;
        long x = strtol(tok, &end, 10);
        if (end != tok && *end == '\0') {
            if (top == MAX) return "too many numbers";
            stack[top++] = x;
            continue;
        }
        if (strlen(tok) != 1 || !strchr("+-*/", tok[0])) return "unknown word";
        if (top < 2) return "not enough numbers";
        long b = stack[--top], a = stack[--top];
        switch (tok[0]) {
        case '+': stack[top++] = a + b; break;
        case '-': stack[top++] = a - b; break;
        case '*': stack[top++] = a * b; break;
        case '/':
            if (b == 0) return "division by zero";
            stack[top++] = a / b;
            break;
        }
    }
    if (top == 0) return "";   /* a blank line */
    if (top > 1) return "too many numbers";
    *result = stack[0];
    return NULL;
}

int main(void)
{
    char line[1024];
    while (fgets(line, sizeof line, stdin)) {
        long result;
        const char *err = eval(line, &result);
        if (!err) printf("%ld\n", result);
        else if (*err) printf("error: %s\n", err);
    }
    return 0;
}
