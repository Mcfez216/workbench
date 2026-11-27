'use strict';
// "Predict the output": a short program; you write down what it prints;
// then it's compiled and run for real, and the explanation says why. The
// surprises are the point: integer division, promotions, precedence,
// sizeof, fall-through, references, virtual calls, object lifetimes...
// Nothing here is undefined behaviour: each prints the same everywhere MHDE
// runs (64-bit, two's complement). `answer` is checked against a real run
// by the tests.

const C = (id, topic, code, answer, explain) => ({ id, lang: 'c', topic, code, answer, explain });
const P = (id, topic, code, answer, explain) => ({ id, lang: 'cpp', topic, code, answer, explain });

module.exports = [
  C('c-int-division', 'Integer division', String.raw`#include <stdio.h>

int main(void) {
    printf("%d %d %d\n", 7 / 2, -7 / 2, 7 % -3);
    return 0;
}
`, '3 -3 1', 'Dividing two ints gives an int: the fraction is thrown away, rounding towards zero, so -7 / 2 is -3 (not -4). The remainder takes the sign of the left side: 7 % -3 is 1. Want 3.5? Make one side a double: 7 / 2.0.'),
  C('c-signed-unsigned', 'Signed meets unsigned', String.raw`#include <stdio.h>

int main(void) {
    unsigned int u = 1;
    int i = -1;
    printf("%s\n", i < u ? "less" : "not less");
    return 0;
}
`, 'not less', 'When an int meets an unsigned int, the int is converted to unsigned: -1 becomes 4294967295, which is bigger than 1. -Wall warns ("comparison of integer expressions of different signedness"). Keep sizes and counts unsigned, and compare like with like.'),
  C('c-char-arith', 'chars are numbers', String.raw`#include <stdio.h>

int main(void) {
    char c = 'A' + 2;
    printf("%c %d\n", c, c);
    return 0;
}
`, 'C 67', 'A char is a small integer: \'A\' is 65 in ASCII, so \'A\' + 2 is 67, which is \'C\'. %c prints it as a letter, %d as a number.'),
  C('c-increments', 'i++ and ++i', String.raw`#include <stdio.h>

int main(void) {
    int i = 5;
    int a = i++;
    int b = ++i;
    printf("%d %d %d\n", a, b, i);
    return 0;
}
`, '5 7 7', 'i++ gives the old value, then adds one (a is 5, i becomes 6). ++i adds one first, then gives the new value (i becomes 7, b is 7). Never use both on the same variable in one expression: that is undefined.'),
  C('c-sizeof-array-param', 'sizeof an array parameter', String.raw`#include <stdio.h>

size_t size_in(int a[10]) {
    return sizeof a;
}

int main(void) {
    int a[10];
    printf("%zu %zu\n", sizeof a / sizeof a[0], size_in(a));
    return 0;
}
`, '10 8', 'In main, a is an array: sizeof gives all 40 bytes, so the count is 10. As a parameter, int a[10] is really int *a: the array "decays" to a pointer, and sizeof gives the pointer\'s 8 bytes. That\'s why C functions take a length as well. (-Wall warns about it.)'),
  C('c-sizeof-string', 'sizeof a string', String.raw`#include <stdio.h>
#include <string.h>

int main(void) {
    printf("%zu %zu\n", sizeof "hello", strlen("hello"));
    return 0;
}
`, '6 5', 'A string literal is an array of chars ending in \'\\0\': "hello" is 6 bytes. strlen counts the characters before the \'\\0\': 5. Forgetting the +1 for the \'\\0\' is the classic buffer overflow.'),
  C('c-short-circuit', '&& and || stop early', String.raw`#include <stdio.h>

static int calls = 0;
static int check(void) { calls++; return 1; }

int main(void) {
    if (0 && check()) { }
    if (1 || check()) { }
    if (1 && check()) { }
    printf("%d\n", calls);
    return 0;
}
`, '1', '&& stops at the first false, and || at the first true: the right side isn\'t even run. Only the third if calls check(). That\'s what makes p != NULL && p->x safe.'),
  C('c-fallthrough', 'switch falls through', String.raw`#include <stdio.h>

int main(void) {
    switch (2) {
    case 1: printf("one ");
    case 2: printf("two ");
    case 3: printf("three ");
        break;
    default: printf("other ");
    }
    printf("\n");
    return 0;
}
`, 'two three', 'A case is only a label to jump to: after case 2, the program carries on into case 3 until a break. Forgetting a break is a famous bug; -Wimplicit-fallthrough (in -Wextra) warns.'),
  C('c-pointer-arith', 'Pointer arithmetic', String.raw`#include <stdio.h>

int main(void) {
    int a[] = {10, 20, 30, 40};
    int *p = a + 1;
    printf("%d %d %td\n", *p, p[2], &a[3] - p);
    return 0;
}
`, '20 40 2', 'a + 1 points one int further on (4 bytes, not 1), at 20. p[2] is *(p + 2): two further, 40. Subtracting pointers counts elements between them: 2.'),
  C('c-static-local', 'A static local', String.raw`#include <stdio.h>

int next_id(void) {
    static int id = 0;
    return ++id;
}

int main(void) {
    int a = next_id();
    int b = next_id();
    int c = next_id();
    printf("%d %d %d\n", a, b, c);
    return 0;
}
`, '1 2 3', 'A static local variable is set to 0 once, when the program starts, and keeps its value between calls. A plain local would start again at each call.'),
  C('c-float-equal', '0.1 + 0.2', String.raw`#include <stdio.h>

int main(void) {
    printf("%d %.17f\n", 0.1 + 0.2 == 0.3, 0.1 + 0.2);
    return 0;
}
`, '0 0.30000000000000004', '0.1, 0.2 and 0.3 can\'t be stored exactly in binary, so 0.1 + 0.2 is a hair more than 0.3, and == says no. Compare floating point with a tolerance (fabs(a - b) < 1e-9), and keep money in whole pence.'),
  C('c-unsigned-wrap', 'Unsigned wrap-around', String.raw`#include <stdio.h>

int main(void) {
    unsigned char c = 250;
    c += 10;
    unsigned int u = 0;
    u = u - 1;
    printf("%d %u\n", c, u);
    return 0;
}
`, '4 4294967295', 'Unsigned arithmetic wraps around: 250 + 10 is 260, which doesn\'t fit in 8 bits, so it\'s 260 - 256 = 4. 0 - 1 is the biggest unsigned int. Well defined, but a length that wraps like this is how buffer overflows start. (Signed overflow is different: undefined.)'),
  C('c-precedence', 'Precedence', String.raw`#include <stdio.h>

int main(void) {
    int x = 1 << 2 + 1;
    int y = 6 & 3 == 3;
    printf("%d %d\n", x, y);
    return 0;
}
`, '8 0', '+ binds tighter than <<, so it\'s 1 << 3 = 8, not (1 << 2) + 1 = 5. And == binds tighter than &: 6 & (3 == 3) is 6 & 1 = 0. When in doubt, add brackets: -Wall warns about both.'),
  C('c-bitwise-logical', '& or &&?', String.raw`#include <stdio.h>

int main(void) {
    printf("%d %d %d %d\n", 6 & 3, 6 && 3, 6 | 3, 6 ^ 3);
    return 0;
}
`, '2 1 7 5', '& works bit by bit: 110 & 011 = 010, 2. && is logical: both non-zero, so 1. | sets bits: 111, 7. ^ keeps the bits that differ: 101, 5.'),

  P('cpp-references', 'References', String.raw`#include <iostream>

int main() {
    int a = 1;
    int& r = a;
    r = 5;
    int b = r;
    b = 9;
    std::cout << a << ' ' << b << '\n';
}
`, '5 9', 'r is another name for a: setting r sets a. But b is a new int that starts as a copy of r\'s value; changing b changes nothing else.'),
  P('cpp-range-for-copy', 'auto or auto&?', String.raw`#include <iostream>
#include <vector>

int main() {
    std::vector<int> v{1, 2, 3};
    for (auto x : v) x *= 10;
    for (auto& y : v) y += 1;
    for (int z : v) std::cout << z << ' ';
    std::cout << '\n';
}
`, '2 3 4', 'for (auto x : v) gives each element as a copy: x *= 10 changes the copy and nothing else. for (auto& y : v) gives the elements themselves. Reading only? const auto& avoids copies of big elements.'),
  P('cpp-virtual', 'virtual or not', String.raw`#include <iostream>

struct Base {
    virtual void v() const { std::cout << "Base::v "; }
    void nv() const { std::cout << "Base::nv "; }
    virtual ~Base() = default;
};
struct Derived : Base {
    void v() const override { std::cout << "Derived::v "; }
    void nv() const { std::cout << "Derived::nv "; }
};

int main() {
    Derived d;
    const Base& b = d;
    b.v();
    b.nv();
    std::cout << '\n';
}
`, 'Derived::v Base::nv', 'A virtual call looks at the real object (a Derived) and runs its version. A non-virtual call goes by the type of the reference (Base), so Derived::nv only hides it. override makes the compiler check you really are overriding something.'),
  P('cpp-lifetime', 'Construction and destruction order', String.raw`#include <iostream>

struct A { A() { std::cout << "A "; } ~A() { std::cout << "~A "; } };
struct B { B() { std::cout << "B "; } ~B() { std::cout << "~B "; } };

int main() {
    {
        A a;
        B b;
    }
    std::cout << '\n';
}
`, 'A B ~B ~A', 'Objects are destroyed at the end of their scope in reverse order: the last made goes first. That\'s what makes RAII safe: b might depend on a, so a must outlive it.'),
  P('cpp-auto-division', 'auto and integer division', String.raw`#include <iostream>

int main() {
    auto x = 5 / 2 * 2.0;
    auto y = 5 / 2.0 * 2;
    std::cout << x << ' ' << y << '\n';
}
`, '4 5', 'Left to right: 5 / 2 is integer division, 2, then 2 * 2.0 = 4.0. In y, 5 / 2.0 is 2.5, then 2.5 * 2 = 5.0. auto picks double for both, but the damage was done before it got there. (cout prints 4.0 as 4.)'),
  P('cpp-map-brackets', 'map[] inserts', String.raw`#include <iostream>
#include <map>
#include <string>

int main() {
    std::map<std::string, int> m;
    m["apples"]++;
    if (m["pears"] == 0) { }
    std::cout << m.size() << ' ' << m["apples"] << '\n';
}
`, '2 1', 'm[key] inserts the key (with 0) if it isn\'t there: even just looking at m["pears"] added it. To ask without adding, use m.contains(key) (C++20), m.find(key) or m.count(key).'),
  P('cpp-reserve', 'size and capacity', String.raw`#include <iostream>
#include <vector>

int main() {
    std::vector<int> v;
    v.reserve(100);
    std::vector<int> w(3);
    std::cout << v.size() << ' ' << (v.capacity() >= 100) << ' ' << w.size() << ' ' << w[2] << '\n';
}
`, '0 1 3 0', 'reserve(100) makes room for 100 but adds none: size stays 0 (v[0] would be out of bounds). vector<int> w(3) makes 3 elements, all 0. Watch the difference between w(3) and w{3}: the second is one element, 3.'),
  P('cpp-lambda-capture', 'Capturing by value or by reference', String.raw`#include <iostream>

int main() {
    int x = 1;
    auto by_value = [x] { return x; };
    auto by_ref = [&x] { return x; };
    x = 5;
    std::cout << by_value() << ' ' << by_ref() << '\n';
}
`, '1 5', '[x] copies x when the lambda is made (1). [&x] refers to x itself, so it sees the later change (5). A reference capture that outlives the variable dangles: that\'s why std::thread and callbacks usually capture by value.'),
  P('cpp-overloads', 'Which overload?', String.raw`#include <iostream>

void f(int) { std::cout << "int "; }
void f(double) { std::cout << "double "; }
void f(char) { std::cout << "char "; }

int main() {
    f(3);
    f('a');
    f(2.5f);
    f(true);
    std::cout << '\n';
}
`, 'int char double int', 'The exact match wins: 3 is an int, \'a\' a char. 2.5f is a float: there\'s no f(float), and float to double is a "promotion", better than any other conversion. bool promotes to int.'),
  P('cpp-char-promotion', 'A char plus one', String.raw`#include <iostream>

int main() {
    char c = 'A';
    std::cout << c << ' ' << c + 1 << ' ' << char(c + 1) << '\n';
}
`, 'A 66 B', 'c on its own prints as a letter. But c + 1 is arithmetic: the char is promoted to int, and an int prints as a number. Cast back to char to get a letter.'),
  P('cpp-truncation', 'Converting to int', String.raw`#include <cmath>
#include <iostream>

int main() {
    std::cout << int(2.9) << ' ' << int(-2.9) << ' ' << std::lround(2.5) << ' ' << std::floor(-2.5) << '\n';
}
`, '2 -2 3 -3', 'Converting a double to int cuts off the fraction, towards zero: 2.9 gives 2, -2.9 gives -2. To round, std::lround (2.5 rounds away from zero: 3). std::floor always goes down: -3.'),
  P('cpp-string-size', 'string size and the \\0', String.raw`#include <iostream>
#include <string>

int main() {
    std::string s = "ab";
    s += 'c';
    s += "de";
    std::string t("x\0y", 3);
    std::cout << s.size() << ' ' << s.back() << ' ' << t.size() << '\n';
}
`, '5 e 3', 'A std::string knows its length: "ab" + \'c\' + "de" is 5 characters, the last \'e\'. Unlike a C string it can even hold a \'\\0\' in the middle: t has 3 characters (given the length; from "x\\0y" alone it would stop at the \\0).'),
];
