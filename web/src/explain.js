// "Explain this": a compiler error, a linker error, or what a sanitizer
// said, in plain words. Every explanation has the same four parts, always in
// the same order, so you know where to look:
//   What happened · Why it happens · Try this · (for the flashcards) a question
// The rules are matched against the message; the first that fits wins.
// Whenever one is shown for a problem in your code, it's remembered, and the
// "Your mistakes" flashcard deck in Revise is made from them.

import { call } from './rpc.js';
import { h } from './ui.js';

const R = (id, re, title, what, why, tryThis, q) => ({ id, re, title, what, why, try: tryThis, q });

export const RULES = [
  // ---- the sanitizers (at run time)
  R('asan-heap-uaf', /heap-use-after-free/, 'Use after free',
    'Your program read or wrote memory after it had been freed.',
    'Once memory is freed it belongs to the allocator again; it may be handed to someone else at any moment. A pointer to it still holds the old address (a "dangling pointer"), but nothing valid lives there.',
    'Look at the two other places Problems lists: where it was freed and where it was allocated. Make sure nothing uses the pointer after the free; set it to NULL / nullptr right after freeing; in C++ let a unique_ptr or a container own it.',
    'What is a use-after-free, and two ways to avoid one?'),
  R('asan-heap-overflow', /heap-buffer-overflow/, 'Heap buffer overflow',
    'Your program read or wrote just outside a block from malloc / new.',
    'The block has a fixed size; the index or the length you used went past its end (or before its start). Often it\'s an off-by-one: <= where < was meant, or forgetting room for the \'\\0\'.',
    'Check the loop bound and the size you allocated. For strings, allocate strlen + 1. Problems shows where the block was allocated: compare its size with the index.',
    'What usually causes a heap-buffer-overflow?'),
  R('asan-stack-overflow-buf', /stack-buffer-overflow/, 'Stack buffer overflow',
    'Your program wrote or read past the end of an array that lives on the stack (a local variable).',
    'Local arrays sit next to other locals and the function\'s return address. Writing past one is the classic exploitable bug: it can overwrite whatever comes next.',
    'Bound every copy into a local array by its size: snprintf instead of sprintf/strcpy, fgets instead of gets, and check indexes against sizeof array / sizeof array[0].',
    'Why is a stack buffer overflow dangerous, not just a crash?'),
  R('asan-stack-uar', /stack-use-after-(return|scope)/, 'Using a variable that no longer exists',
    'A pointer or reference to a local variable was used after the variable\'s function (or block) ended.',
    'Locals live only until the end of their scope; returning their address hands back a pointer to memory that gets reused by the next call.',
    'Return the value itself, or memory that outlives the function (malloc / a std::string / a std::vector), not the address of a local.',
    'Why can\'t a function return a pointer to one of its local variables?'),
  R('asan-double-free', /double-free|attempting double-free/, 'Double free',
    'The same block was freed twice.',
    'After the first free the allocator may already have given the block to someone else; freeing it again corrupts the allocator\'s bookkeeping, which attackers can exploit.',
    'Make one owner responsible for freeing. Set the pointer to NULL after free (free(NULL) is harmless). In C++, use unique_ptr.',
    'What is a double free, and what simple habit prevents most of them?'),
  R('asan-bad-free', /attempting free on address which was not malloc|bad-free|alloc-dealloc-mismatch/, 'Freeing the wrong thing',
    'free / delete got a pointer that didn\'t come from the matching allocation: a local, a pointer into the middle of a block, or new paired with free / malloc with delete / new[] with delete.',
    'Each allocator only knows how to release what it handed out, from the start of the block.',
    'Pair them: malloc/free, new/delete, new[]/delete[]. Free the pointer malloc returned, not one you moved along the block.',
    'Which allocation and deallocation calls go together in C and C++?'),
  R('asan-null', /SEGV on unknown address (0x0+\b|0x000000000000)|null pointer|SEGV.*address 0x0/, 'NULL pointer',
    'Your program used a NULL pointer: there was nothing there to read or write.',
    'Functions like malloc, fopen and strchr return NULL when they fail or find nothing; using the result without checking crashes.',
    'Check the pointer before using it: if (p == NULL) { ... }. Problems shows the line; look at where that pointer came from.',
    'Which common C functions return NULL, and what should you do with their result?'),
  R('asan-segv', /SEGV|Segmentation fault/, 'Segmentation fault',
    'Your program touched memory it isn\'t allowed to: not its own, or not there at all.',
    'Usually a pointer that was never set, already freed, or an index far past the end of an array.',
    'Problems shows the line. Look at every pointer and index on it; the memory view (Tools → Visualise memory) shows what each one points at.',
    'What does a segmentation fault mean, and the three usual causes?'),
  R('lsan-leak', /detected memory leaks|LeakSanitizer|definitely lost/, 'Memory leak',
    'Memory was allocated and never freed before the program ended.',
    'Every malloc / new needs a matching free / delete; when the last pointer to a block is lost or overwritten, nobody can free it any more.',
    'Problems shows where the leaked block was allocated. Follow that pointer: who should free it, and when? In C++, a container or smart pointer frees it for you.',
    'What is a memory leak, and how do C++ smart pointers prevent them?'),
  R('ubsan-signed-overflow', /signed integer overflow/, 'Signed integer overflow',
    'An int (or long...) calculation went past the biggest (or smallest) value the type can hold.',
    'In C and C++ signed overflow is undefined behaviour: the compiler may assume it never happens and optimise accordingly, so the result can be anything, not just a wrap-around.',
    'Use a bigger type (long long), check before calculating (a > INT_MAX - b), or __builtin_add_overflow / __builtin_mul_overflow.',
    'Why is signed integer overflow worse than just "it wraps around"?'),
  R('ubsan-shift', /shift exponent|left shift of/, 'Bad bit shift',
    'A shift by too many bits (>= the type\'s width, or negative), or a left shift of a negative number.',
    'Shifts past the type\'s width are undefined, not zero.',
    'Shift an unsigned value, and keep the amount below its width (e.g. 1u << n with n < 32).',
    'What makes a bit shift undefined behaviour?'),
  R('ubsan-div-zero', /division by zero/, 'Division by zero',
    'Something was divided by 0.',
    'For integers it\'s undefined behaviour (often a crash); there is no answer to give back.',
    'Check the divisor before dividing, and decide what the function should do instead.',
    'What should code do before dividing by a value it didn\'t choose?'),
  R('ubsan-misc', /runtime error: (load of|store to|index \d+ out of bounds|member access within)/, 'Undefined behaviour',
    'UBSan caught an operation the C/C++ standard leaves undefined (an out-of-range index, a misaligned or null access, a value that isn\'t valid for its type).',
    'Undefined behaviour means the compiler promises nothing: it may work today and fail with another compiler or flag.',
    'Read the rest of the message for which value and which line; fix that operation rather than the symptom.',
    'What does "undefined behaviour" mean in C and C++?'),
  R('valgrind-uninit', /uninitialised value|Conditional jump or move depends on uninitialised/, 'Using an uninitialised value',
    'Your program made a decision based on memory it never set.',
    'Local variables and malloc\'d memory start with whatever bytes were there before: garbage, different every run.',
    'Give every variable a value when you create it (int x = 0;), use calloc for zeroed memory, and check every path sets what it should.',
    'What value does an uninitialised local variable have in C?'),
  R('valgrind-invalid', /Invalid (read|write) of size/, 'Invalid memory access',
    'Valgrind saw a read or write outside any valid block: past the end of an allocation, or into freed memory.',
    'The same family of bugs as ASan\'s buffer overflow and use-after-free.',
    'The first frame in your code is the line; Valgrind also says which block was nearby ("Address ... is 0 bytes after a block of size 16").',
    'What does Valgrind\'s "Invalid write of size 4" tell you?'),

  // ---- the linker
  R('ld-main', /undefined reference to `main'/, 'No main()',
    'The program has no main function to start from.',
    'Every program needs exactly one main; a file with only functions is a library part, not a program.',
    'Add int main(void) { ... }, or build this file as part of a library and test it from a program that has main.',
    'Where does a C program start running?'),

  R('ld-undefined', /undefined reference to/, 'Undefined reference (the linker)',
    'Your code compiles, but at the end the linker can\'t find the function or variable named in the message.',
    'A declaration (a prototype, a header) promises something exists; the linker then looks for its definition in the files and libraries it was given. It\'s missing: never written, misspelt, in a file that isn\'t compiled, a library that isn\'t linked (-lm for math), or a C function called from C++ without extern "C".',
    'Check the spelling and parameters match exactly; make sure the .c / .cpp with it is in the build (CMakeLists.txt add_executable / add_library); link the library (target_link_libraries).',
    'What is the difference between a declaration and a definition, and what does "undefined reference" mean?'),
  R('ld-multiple', /multiple definition of/, 'Defined twice (the linker)',
    'Two files both define the same function or global variable.',
    'Usually a definition (with a body, or a global with a value) sits in a header that several .c files include.',
    'Headers declare (int f(void); extern int g;), one .c file defines. Or make it static / inline if each file should have its own.',
    'Why should a header contain declarations but not definitions?'),
  // ---- the compiler: errors
  R('cc-undeclared', /(was not declared in this scope|undeclared \(first use|use of undeclared identifier|implicit declaration of function)/, 'Not declared',
    'You used a name the compiler hasn\'t seen yet: a variable, function or type.',
    'C and C++ read top to bottom; a name must be declared before its first use. For library functions, that\'s what the #include is for.',
    'Check the spelling and capitals; add the #include (printf: <stdio.h>, malloc: <stdlib.h>, strlen: <string.h>, std::cout: <iostream>); declare a function before calling it, or put a prototype at the top.',
    'Why must a function be declared before it is called in C?'),
  R('cc-expected-semi', /expected ';'|expected ‘;’|expected ';' before/, 'Missing semicolon',
    'The compiler expected a ; and found something else.',
    'Every statement ends with ;. The line it points at is often the one after the real culprit.',
    'Look at the end of the line before the one in the message.',
    'When the compiler says "expected ;", which line is usually wrong?'),
  R('cc-expected-brace', /expected '\}'|expected declaration or statement at end of input|expected ‘\}’/, 'Unbalanced braces',
    'A { has no matching }, so the file ended inside a block.',
    'The compiler only notices at the end of the file, far from the real mistake.',
    'Format the file (Ctrl+Shift+O): the indentation shows where the block structure goes wrong. Fold blocks in the gutter to find the unclosed one.',
    'How do you find an unbalanced brace quickly?'),
  R('cc-incompatible', /incompatible (pointer )?type|invalid conversion from|cannot convert|incompatible integer to pointer|makes (pointer from integer|integer from pointer)/, 'Wrong type',
    'A value of one type was used where another was needed: an int where a pointer is expected, a pointer of the wrong kind, a struct where a pointer to it is wanted.',
    'C is quiet about some of these (only a warning), C++ refuses. Either way the code means something other than what you think.',
    'Read the two types in the message. Often you need & (address of) or * (what it points at), or a different variable.',
    'When do you need & and when * when passing a variable to a function?'),
  R('cc-too-few', /too (few|many) arguments/, 'Wrong number of arguments',
    'A call passes a different number of arguments than the function takes.',
    'The declaration the compiler saw decides; maybe it changed, or another function has the same name.',
    'Compare the call with the function\'s declaration (F12 jumps to it).',
    ''),
  R('cc-no-member', /has no member named|no member named/, 'No such member',
    'The struct or class doesn\'t have a member with that name.',
    'A typo, the wrong type, or a pointer where you need -> instead of . (or the other way round).',
    'Use . on a struct value, -> on a pointer to one. Check the spelling against the definition.',
    'When do you use . and when -> to reach a struct member?'),
  R('cc-redefinition', /redefinition of|conflicting types for/, 'Defined twice, or differently',
    'The same name is defined twice, or declared two different ways.',
    'Often a header included twice without an include guard, or a prototype that doesn\'t match the function.',
    'Add an include guard (#ifndef X_H / #define X_H / #endif) or #pragma once to headers; make the prototype and the definition match exactly.',
    'What does an include guard do?'),
  R('cc-lvalue', /lvalue required|expression is not assignable|assignment of read-only/, 'Can\'t assign to that',
    'The left side of = isn\'t something you can change: a constant, an expression like a + b, or something declared const.',
    'Only variables (and things a pointer points at) can be assigned.',
    'Did you mean == (compare) in a condition? Or is the variable const on purpose?',
    ''),
  R('cpp-no-matching', /no matching function for call|no matching (constructor|member function)/, 'No matching function (C++)',
    'No version of the function (or constructor) accepts the arguments you gave.',
    'C++ picks among overloads by argument types; the "candidate" notes list what exists and why each didn\'t fit.',
    'Open the notes under the problem (▸): compare your argument types with each candidate. A const, a missing &, or a different type is usual.',
    ''),
  R('cpp-template', /required from here|instantiated from|In instantiation of/, 'Template error (C++)',
    'An error inside a template (often deep in the standard library), caused by how your code used it.',
    'The compiler reports where the template broke, then the chain of "required from" back to your line. The first line in your own file is the one that matters.',
    'Problems already jumps to your line; the notes underneath are the library\'s side. Usually a type doesn\'t support something the container needs (comparison for std::map, copying...).',
    'In a long template error, which line should you read first?'),
  R('cpp-deleted', /use of deleted function|call to deleted/, 'Copying something that can\'t be copied (C++)',
    'You copied an object whose type forbids copying: a unique_ptr, a stream, a thread, a mutex.',
    'Those types own something that must have exactly one owner.',
    'Move it instead (std::move(x)), pass it by reference (T&), or keep a pointer / reference to it.',
    'Why can\'t a std::unique_ptr be copied, and what do you do instead?'),

  // ---- the compiler: warnings worth reading
  R('w-uninit', /may be used uninitialized|is used uninitialized|variable '.*' is uninitialized/, 'Maybe used before it has a value',
    'A variable might be read before anything was stored in it.',
    'Locals start as garbage in C and C++. On some path through the code, nothing sets it.',
    'Initialise it where you declare it (int count = 0;), and check every if / switch branch.',
    'What does a local variable contain before you assign to it?'),
  R('w-format', /format '.*' expects|format specifies type|format not a string literal|-Wformat/, 'printf format doesn\'t match',
    'A printf / scanf conversion doesn\'t match the argument (or the format itself isn\'t a fixed string).',
    'printf trusts the format: %d with a long, %s with a number or a missing argument reads the wrong bytes. A format that comes from the user is a security bug (%n writes memory).',
    'Match them: %d int, %ld long, %zu size_t, %f double, %s char*, %p pointer. Never printf(user_text): printf("%s", user_text).',
    'Why is printf(user_input) a security bug?'),
  R('w-sign-compare', /comparison of integer expressions of different signedness|comparison of integers of different signs/, 'Signed vs unsigned comparison',
    'A signed and an unsigned number are compared: the signed one is converted to unsigned first.',
    '-1 becomes a huge number, so -1 < sizeof(x) is false. Loops over size_t with an int index meet this all the time.',
    'Use size_t for indexes and sizes, or cast deliberately after checking the value isn\'t negative.',
    'Why is -1 < (size_t)1 false in C?'),
  R('w-unused', /unused (variable|parameter)/, 'Unused variable',
    'Something is declared but never used.',
    'Harmless, but often a sign of a typo (you meant to use it) or leftover code.',
    'Remove it, or use it. For a parameter you must keep, (void)name; says it\'s on purpose.',
    ''),
  R('w-return', /control reaches end of non-void function|non-void function does not return a value/, 'Missing return',
    'A function that should return a value can reach its end without a return.',
    'The caller then gets garbage (it\'s undefined behaviour).',
    'Make sure every path ends in return something; add one at the end for the "none of the above" case.',
    ''),
  R('w-implicit-fallthrough', /this statement may fall through/, 'switch falls through',
    'A case in a switch has no break, so it runs on into the next case.',
    'Sometimes intended, very often a forgotten break.',
    'Add break; or, if you meant it, [[fallthrough]]; (C++17, C23) or a /* fall through */ comment.',
    ''),
  R('w-dangling', /returns address of local|address of stack memory|reference to local variable/, 'Returning a local\'s address',
    'The function returns a pointer or reference to one of its own local variables.',
    'They stop existing as the function returns; the caller gets a dangling pointer.',
    'Return the value, or allocate (malloc / std::string / std::vector), or have the caller pass in a buffer.',
    'Why can\'t a function return a pointer to one of its local variables?'),

  // ---- secure-coding checks (clang-tidy cert-*, cppcheck, the banned list)
  R('sec-banned', /\b(gets|strcpy|strcat|sprintf|vsprintf)\b.*(unsafe|insecure|deprecated|banned|buffer overflow)|cert-(msc24|err33|str31|str34)|insecureAPI/, 'An unsafe function',
    'This function can write past the end of a buffer, because it doesn\'t know how big the buffer is.',
    'gets, strcpy, strcat, sprintf copy until the source ends, however small the destination. That\'s the classic buffer overflow.',
    'Use the bounded versions: fgets, snprintf (for strcpy / strcat / sprintf too), and always pass sizeof the destination.',
    'Name two C functions that can never be used safely with untrusted input, and their replacements.'),
  R('sec-cert', /\[cert-[\w-]+\]/, 'A secure-coding rule (CERT)',
    'clang-tidy found code that breaks one of the SEI CERT secure-coding rules (the check name is in brackets).',
    'CERT rules are a catalogue of the coding mistakes behind real vulnerabilities: unchecked return values, bad conversions, unsafe functions.',
    'The bracketed name ([cert-err33-c] and so on) is the rule; search it on wiki.sei.cmu.edu for the reasoning and a compliant example.',
    ''),
  R('tidy-analyzer', /\[clang-analyzer-[\w.-]+\]/, 'Found by the static analyser',
    'clang\'s analyser followed a path through your code where something goes wrong (the notes show the path, step by step).',
    'It reasons about every branch without running the program, so it finds bugs on paths your tests never take.',
    'Open the notes (▸) and follow the numbered steps: they are the exact path. Then decide whether that path can really happen, and guard against it.',
    ''),
];

export function explain(message) {
  const m = String(message || '');
  return RULES.find((r) => r.re.test(m)) || null;
}

// The four parts, always the same layout
export function explanationBox(rule, { compact = false } = {}) {
  if (!rule) return h('div', { class: 'explain muted' }, 'No explanation for this one yet. Read the message from the start; the first problem in your own file is the one to fix first.');
  return h('div', { class: 'explain' + (compact ? ' compact' : '') },
    h('div', { class: 'ex-title' }, rule.title),
    h('div', { class: 'ex-part' }, h('span', { class: 'ex-label' }, 'What happened'), h('span', {}, rule.what)),
    h('div', { class: 'ex-part' }, h('span', { class: 'ex-label' }, 'Why'), h('span', {}, rule.why)),
    h('div', { class: 'ex-part' }, h('span', { class: 'ex-label' }, 'Try this'), h('span', {}, rule.try)));
}

// Remembered for the "Your mistakes" deck: one per kind, with a count
export async function remember(rule, sample) {
  if (!rule || !rule.q) return;
  const all = await call('state.get', { key: 'mistakes', fallback: {} });
  const m = all[rule.id] || { count: 0, first: Date.now() };
  m.count++; m.last = Date.now(); m.sample = String(sample || '').slice(0, 200);
  all[rule.id] = m;
  call('state.set', { key: 'mistakes', value: all });
}

// Flashcards from your own mistakes, most frequent first
export async function mistakeCards() {
  const all = await call('state.get', { key: 'mistakes', fallback: {} });
  return Object.entries(all).map(([id, m]) => ({ rule: RULES.find((r) => r.id === id), m })).filter((x) => x.rule && x.rule.q)
    .sort((a, b) => b.m.count - a.m.count)
    .map(({ rule, m }) => ({ note: `${rule.title} · seen ${m.count} time${m.count === 1 ? '' : 's'}`, phase: null, q: rule.q,
      a: `**What happens:** ${rule.what}\n\n**Why:** ${rule.why}\n\n**Avoid it:** ${rule.try}${m.sample ? `\n\n*Last time:* \`${m.sample.replace(/`/g, "'")}\`` : ''}` }));
}
