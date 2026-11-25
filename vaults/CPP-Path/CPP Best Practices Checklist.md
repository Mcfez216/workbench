---
tags: [cpp, hub, checklist]
---
# CPP Best Practices Checklist

> [!abstract] Why this matters
> Good C++ is mostly a set of habits. Go through this list before you call something finished. After a while, you won't need the list.

## Every file

- [ ] It builds with `-Wall -Wextra` and shows no warnings.
- [ ] It's tidied with Ctrl+Shift+O.
- [ ] Names say what things are. For example, `elapsed_ms`, not `t`.

## Memory

- [ ] There's no `new` or `delete` in normal code. Use containers, `std::make_unique`, or plain values instead.
- [ ] Every raw pointer only *uses* something. It never owns it.
- [ ] No pointer or reference lasts longer than the thing it points to. Watch out for local variables, and for vector elements after `push_back`.
- [ ] The program runs with no reports from the checkers. Use a Debug build and Ctrl+F9.

## Functions and classes

- [ ] Small inputs are passed by value. Big ones are passed by `const&`. Results are returned.
- [ ] A constructor always makes a valid object, and member functions keep it valid.
- [ ] You don't write a destructor, copy or move function unless the class manages memory by hand. This is the rule of zero.
- [ ] Everything that doesn't change is marked `const`, including member functions.
- [ ] Functions that replace a base class's version say `override`.
- [ ] Constructors that take one input are marked `explicit`.

## Errors

- [ ] Everything that comes from outside the program is checked. That means files, users and the network.
- [ ] Failures are reported clearly, with exceptions, `std::optional` or `std::expected`. Not with a special number like -1.
- [ ] There's no `catch (...)` that hides a problem.

## Before you commit

- [ ] The tests pass (F7). They include the edge cases: empty, one item, the biggest value, and bad input.
- [ ] clang-tidy (Ctrl+Shift+K) has nothing new to report.
- [ ] You've made a checkpoint, or a commit that says why you made the change.

"Do. Or do not. There is no try." That one's about tests.
