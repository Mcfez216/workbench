---
tags: [cpp, hub, checklist]
---
# CPP Best Practices Checklist

> [!abstract] Why this matters
> Good C++ is mostly a set of habits. Tick through this before you call something finished; over time you won't need to.

## Every file
- [ ] Builds with `-Wall -Wextra` and no warnings
- [ ] Formatted (Ctrl+Shift+O)
- [ ] Names say what things are: `elapsed_ms`, not `t`

## Ownership and memory
- [ ] No `new` / `delete` in normal code: containers, `std::make_unique`, values
- [ ] Every raw pointer means "using, not owning"
- [ ] No pointer or reference outlives what it points at (locals, vector elements after push_back)
- [ ] Runs clean under the sanitizers (Debug build, Ctrl+F9)

## Functions and classes
- [ ] Small inputs by value, big ones by `const&`, outputs as return values
- [ ] Constructors make a valid object; members keep it valid (invariants)
- [ ] Rule of zero: no destructor / copy / move written unless the class owns a raw resource
- [ ] `const` on everything that doesn't change, member functions included
- [ ] `override` on overriding functions; a `virtual` destructor in a base class meant for `delete` through a base pointer
- [ ] `explicit` on one-argument constructors

## Errors
- [ ] Every input from outside (files, users, the network) is checked
- [ ] Failures are reported: exceptions, `std::optional`, or `std::expected`, not magic values
- [ ] No `catch (...)` that hides a problem

## Before you commit
- [ ] Tests pass (F7), including the edge cases: empty, one element, the biggest value, bad input
- [ ] clang-tidy (Ctrl+Shift+K) has nothing new to say
- [ ] A checkpoint (or a commit with a subject line that says why)

"Do. Or do not. There is no try." That one's about tests.
