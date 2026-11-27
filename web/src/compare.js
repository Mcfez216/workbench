// C, C++ and Rust side by side: the same job three ways, with what's
// different and why. Each opens in the sandbox to try.

import { h } from './ui.js';
import { tabs, command } from './layout.js';
import { highlightToHtml } from './highlight.js';

const PAIRS = [
  { title: 'Hello and reading input', note: 'C has printf/scanf, which trust you to match the format to the types. C++ streams pick the conversion from the type, so a mismatch is a compile error, not a crash.',
    c: '#include <stdio.h>\n\nint main(void) {\n    char name[64];\n    int age;\n    if (scanf("%63s %d", name, &age) != 2) return 1;\n    printf("%s is %d\\n", name, age);\n    return 0;\n}\n',
    cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::string name;\n    int age;\n    if (!(std::cin >> name >> age)) return 1;\n    std::cout << name << " is " << age << \'\\n\';\n    return 0;\n}\n',
    rust: "use std::io::Read;\n\nfn main() {\n    let mut input = String::new();\n    std::io::stdin().read_to_string(&mut input).expect(\"couldn't read input\");\n    let mut words = input.split_whitespace();\n    let (Some(name), Some(age)) = (words.next(), words.next()) else { std::process::exit(1) };\n    let Ok(age) = age.parse::<u32>() else { std::process::exit(1) }; // a bad number is an Err, not garbage\n    println!(\"{name} is {age}\");\n}\n",
    rustNote: "Rust reads input as text and parses it: parse() gives a Result, so a bad number is something you have to handle, not garbage in a variable." },
  { title: 'Strings', note: 'A C string is a char array ending in \'\\0\': you decide its size and must never write past it. std::string grows by itself and knows its length (size() is instant; strlen walks the whole string).',
    c: '#include <stdio.h>\n#include <string.h>\n\nint main(void) {\n    char full[32];\n    snprintf(full, sizeof full, "%s %s", "Ada", "Lovelace");   /* bounded */\n    printf("%s has %zu letters\\n", full, strlen(full));\n    return 0;\n}\n',
    cpp: '#include <iostream>\n#include <string>\n\nint main() {\n    std::string full = std::string("Ada") + " " + "Lovelace";   // grows as needed\n    std::cout << full << " has " << full.size() << " letters\\n";\n    return 0;\n}\n',
    rust: "fn main() {\n    let full = format!(\"{} {}\", \"Ada\", \"Lovelace\"); // a String: grows as needed\n    // len() is bytes; chars().count() is letters (they differ for \u00e9)\n    println!(\"{full} has {} letters\", full.chars().count());\n}\n",
    rustNote: "A Rust String owns UTF-8 text and grows like std::string. len() counts bytes; chars() gives letters, and slicing in the middle of a letter is a panic, not corrupted text." },
  { title: 'A list that grows', note: 'In C you track the size and capacity yourself and call realloc (and check it). std::vector does exactly that inside, and frees the memory when it goes out of scope.',
    c: '#include <stdio.h>\n#include <stdlib.h>\n\nint main(void) {\n    size_t n = 0, cap = 2;\n    int *v = malloc(cap * sizeof *v);\n    if (!v) return 1;\n    for (int i = 1; i <= 5; ++i) {\n        if (n == cap) {\n            int *bigger = realloc(v, 2 * cap * sizeof *v);\n            if (!bigger) { free(v); return 1; }\n            v = bigger;\n            cap *= 2;\n        }\n        v[n++] = i * i;\n    }\n    for (size_t i = 0; i < n; ++i) printf("%d ", v[i]);\n    printf("\\n");\n    free(v);\n    return 0;\n}\n',
    cpp: '#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v;\n    for (int i = 1; i <= 5; ++i) v.push_back(i * i);   // grows itself\n    for (int x : v) std::cout << x << \' \';\n    std::cout << \'\\n\';\n    return 0;   // v frees its memory here\n}\n',
    rust: "fn main() {\n    let mut v = Vec::new();\n    for i in 1..=5 {\n        v.push(i * i); // grows itself\n    }\n    for x in &v {\n        print!(\"{x} \");\n    }\n    println!();\n} // v frees its memory here\n",
    rustNote: "Vec is Rust's std::vector: it grows itself and frees itself. The difference: while you hold a reference into it, the borrow checker won't let you push, which is how C++'s dangling iterators are ruled out." },
  { title: 'Grouping data: struct and class', note: 'Both group fields. A C++ class adds functions that belong to it and private data only those functions can change, so the object can\'t get into an invalid state (here: a negative balance).',
    c: '#include <stdio.h>\n\nstruct Account { char owner[32]; long balance; };\n\nint withdraw(struct Account *a, long amount) {\n    if (amount <= 0 || amount > a->balance) return -1;\n    a->balance -= amount;\n    return 0;\n}\n\nint main(void) {\n    struct Account a = { "Ada", 100 };\n    a.balance = -5;   /* nothing stops this */\n    printf("%d\\n", withdraw(&a, 10));\n    return 0;\n}\n',
    cpp: '#include <iostream>\n#include <string>\n\nclass Account {\npublic:\n    explicit Account(std::string owner) : owner_(std::move(owner)) {}\n    bool withdraw(long amount) {\n        if (amount <= 0 || amount > balance_) return false;\n        balance_ -= amount;\n        return true;\n    }\n    long balance() const { return balance_; }\nprivate:\n    std::string owner_;\n    long balance_ = 100;   // only the member functions can change it\n};\n\nint main() {\n    Account a("Ada");\n    std::cout << a.withdraw(10) << \' \' << a.balance() << \'\\n\';\n    return 0;\n}\n',
    rust: "mod bank {\n    pub struct Account {\n        pub owner: String,\n        balance: i64, // private: only this module can change it\n    }\n\n    impl Account {\n        pub fn new(owner: &str) -> Self {\n            Account { owner: owner.to_string(), balance: 100 }\n        }\n        pub fn withdraw(&mut self, amount: i64) -> bool {\n            if amount <= 0 || amount > self.balance {\n                return false;\n            }\n            self.balance -= amount;\n            true\n        }\n        pub fn balance(&self) -> i64 {\n            self.balance\n        }\n    }\n}\n\nfn main() {\n    let mut a = bank::Account::new(\"Ada\");\n    // a.balance = -5;   would not compile: the field is private\n    let ok = a.withdraw(10);\n    println!(\"{} {ok} {}\", a.owner, a.balance());\n}\n",
    rustNote: "Rust's privacy is per module: a struct's fields are private unless pub, so only the module's own functions can break the rule. Here the borrow checker also refused my first version: using a.owner while a.withdraw changed a." },
  { title: 'Who frees it?', note: 'In C every malloc needs exactly one free, on every path out (an early return is the classic leak). In C++ the owner (unique_ptr, a container) frees it in its destructor, whichever way the scope ends: RAII.',
    c: '#include <stdio.h>\n#include <stdlib.h>\n\nint work(int fail) {\n    int *buf = malloc(100 * sizeof *buf);\n    if (!buf) return -1;\n    if (fail) { free(buf); return -1; }   /* forget this free: a leak */\n    buf[0] = 42;\n    printf("%d\\n", buf[0]);\n    free(buf);\n    return 0;\n}\n\nint main(void) { work(0); work(1); return 0; }\n',
    cpp: '#include <iostream>\n#include <memory>\n\nint work(bool fail) {\n    auto buf = std::make_unique<int[]>(100);\n    if (fail) return -1;   // freed anyway\n    buf[0] = 42;\n    std::cout << buf[0] << \'\\n\';\n    return 0;              // and here\n}\n\nint main() { work(false); work(true); return 0; }\n',
    rust: "struct Image {\n    pixels: Vec<u8>,\n}\n\nfn load(ok: bool) -> Option<Image> {\n    let img = Box::new(Image { pixels: vec![0; 1024] }); // on the heap\n    if !ok {\n        return None; // img is freed here: no leak\n    }\n    Some(*img)\n}\n\nfn main() {\n    if let Some(img) = load(true) {\n        println!(\"{} bytes\", img.pixels.len());\n    } // freed here, exactly once\n    let _ = load(false);\n}\n",
    rustNote: "Every value has exactly one owner, freed when the owner goes: no free() to forget and no destructor to write. Box is unique_ptr; there's no way to use it after it's freed." },
  { title: 'When something goes wrong', note: 'C returns an error code and you must check it everywhere. C++ can do the same, return std::optional (a value or nothing), or throw an exception that can\'t be silently ignored.',
    c: '#include <errno.h>\n#include <stdio.h>\n#include <stdlib.h>\n\n/* 0 on success, -1 if s isn\'t a whole number */\nint parse_int(const char *s, long *out) {\n    char *end;\n    errno = 0;\n    long v = strtol(s, &end, 10);\n    if (errno || end == s || *end != \'\\0\') return -1;\n    *out = v;\n    return 0;\n}\n\nint main(void) {\n    long v;\n    if (parse_int("42", &v) == 0) printf("%ld\\n", v);\n    if (parse_int("4x2", &v) != 0) printf("not a number\\n");\n    return 0;\n}\n',
    cpp: '#include <charconv>\n#include <iostream>\n#include <optional>\n#include <string_view>\n\nstd::optional<long> parse_int(std::string_view s) {\n    long v;\n    auto [end, ec] = std::from_chars(s.data(), s.data() + s.size(), v);\n    if (ec != std::errc() || end != s.data() + s.size()) return std::nullopt;\n    return v;\n}\n\nint main() {\n    if (auto v = parse_int("42")) std::cout << *v << \'\\n\';\n    if (!parse_int("4x2")) std::cout << "not a number\\n";\n    return 0;\n}\n',
    rust: "use std::fs;\n\n// Result: the caller can't use the value without dealing with the error\nfn first_line(path: &str) -> Result<String, std::io::Error> {\n    let text = fs::read_to_string(path)?; // ? passes the error up\n    Ok(text.lines().next().unwrap_or(\"\").to_string())\n}\n\nfn main() {\n    match first_line(\"/etc/hostname\") {\n        Ok(line) => println!(\"{line}\"),\n        Err(e) => eprintln!(\"couldn't read it: {e}\"),\n    }\n}\n",
    rustNote: "Result is in the return type, so you can't use the value without facing the error; ? passes it up in one character. No exceptions: every place that can fail is visible." },
  { title: 'Code for any type', note: 'C gets generic code with void* and a size (as qsort does), checked by nobody, or with macros. C++ templates write a version for each type you use, checked by the compiler.',
    c: '#include <stdio.h>\n#include <string.h>\n\n/* swap any two objects of the same size */\nvoid swap_any(void *a, void *b, size_t size) {\n    unsigned char tmp[64];\n    if (size > sizeof tmp) return;\n    memcpy(tmp, a, size); memcpy(a, b, size); memcpy(b, tmp, size);\n}\n\nint main(void) {\n    int x = 1, y = 2;\n    swap_any(&x, &y, sizeof x);\n    printf("%d %d\\n", x, y);\n    return 0;\n}\n',
    cpp: '#include <iostream>\n#include <string>\n\ntemplate <class T>\nvoid swap_any(T& a, T& b) { T tmp = a; a = b; b = tmp; }   // (std::swap does this)\n\nint main() {\n    int x = 1, y = 2;\n    std::string s = "a", t = "b";\n    swap_any(x, y);\n    swap_any(s, t);\n    std::cout << x << y << s << t << \'\\n\';\n    return 0;\n}\n',
    rust: "// T: PartialOrd + Copy says what the code needs; the compiler checks every use\nfn largest<T: PartialOrd + Copy>(v: &[T]) -> Option<T> {\n    let mut best = *v.first()?;\n    for &x in v {\n        if x > best {\n            best = x;\n        }\n    }\n    Some(best)\n}\n\nfn main() {\n    println!(\"{:?} {:?}\", largest(&[3, 9, 2]), largest(&[1.5, 0.5]));\n    println!(\"{:?}\", largest::<i32>(&[]));\n}\n",
    rustNote: "Generics like C++ templates, but the bounds (T: PartialOrd + Copy) say up front what T must do, so a mistake is reported at the function, in one line, not deep inside the template." },
  { title: 'Sorting', note: 'qsort calls a comparison through a function pointer with void* arguments; std::sort takes a lambda the compiler can inline, and knows the element type.',
    c: '#include <stdio.h>\n#include <stdlib.h>\n\nstatic int desc(const void *a, const void *b) {\n    int x = *(const int *)a, y = *(const int *)b;\n    return (x < y) - (x > y);\n}\n\nint main(void) {\n    int v[] = {3, 1, 4, 1, 5};\n    qsort(v, 5, sizeof v[0], desc);\n    for (int i = 0; i < 5; ++i) printf("%d ", v[i]);\n    printf("\\n");\n    return 0;\n}\n',
    cpp: '#include <algorithm>\n#include <iostream>\n#include <vector>\n\nint main() {\n    std::vector<int> v{3, 1, 4, 1, 5};\n    std::sort(v.begin(), v.end(), [](int a, int b) { return a > b; });\n    for (int x : v) std::cout << x << \' \';\n    std::cout << \'\\n\';\n    return 0;\n}\n',
    rust: "fn main() {\n    let mut v = vec![5, 3, 9, 1];\n    v.sort(); // the element type is known: no casts, no function pointers\n    let mut people = vec![(\"Ada\", 36), (\"Linus\", 21)];\n    people.sort_by_key(|&(_, age)| age); // a closure, which the compiler can inline\n    println!(\"{v:?} {people:?}\");\n}\n",
    rustNote: "sort() knows the element type like std::sort, and is stable (equal items keep their order). sort_by_key takes a closure; f64 needs sort_by with partial_cmp, because NaN has no order." },
];

function openCompare() {
  tabs.open({
    id: 'compare', kind: 'compare', title: 'C, C++, Rust', session: { kind: 'page:learn.compare' },
    render(el) {
      const page = h('div', { class: 'page compare' });
      page.append(h('h1', {}, 'The same thing in C, C++ and Rust'), h('p', { class: 'muted' }, 'C++ grew out of C: almost every C program idea has a C++ way that hands the bookkeeping to the language. Rust goes one step further and checks the bookkeeping while compiling. Knowing all three tells you what that bookkeeping is.'));
      const nav = h('ol', { class: 'cmp-nav' }, PAIRS.map((p, i) => h('li', {}, h('a', { href: '#', onclick: (e) => { e.preventDefault(); page.querySelector(`#cmp-${i}`).scrollIntoView({ block: 'start' }); } }, p.title))));
      page.append(nav);
      PAIRS.forEach((p, i) => {
        const side = (lang, code) => {
          const pre = h('pre', { class: 'cmp-code' });
          pre.innerHTML = highlightToHtml(code, lang);
          return h('div', { class: 'cmp-side' }, h('div', { class: 'code-tools' }, h('span', { class: 'code-lang' }, { c: 'C', cpp: 'C++', rust: 'Rust' }[lang]),
            h('button', { type: 'button', onclick: async () => { const { sandboxWith } = await import('./build.js'); sandboxWith(code, lang); } }, 'Try in sandbox')), pre);
        };
        page.append(h('section', { class: 'cmp-pair', id: `cmp-${i}` }, h('h2', {}, p.title), h('p', {}, p.note), p.rustNote ? h('p', {}, h('strong', {}, 'Rust: '), p.rustNote) : null,
          h('div', { class: 'cmp-grid' }, side('c', p.c), side('cpp', p.cpp), p.rust ? side('rust', p.rust) : null)));
      });
      el.append(page);
    },
  });
}

export function initCompare() {
  command('learn.compare', 'C, C++ and Rust, side by side', [], openCompare);
}
