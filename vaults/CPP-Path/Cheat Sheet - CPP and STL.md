---
tags: [cpp, cheatsheet]
---
# Cheat Sheet - CPP and STL

> [!abstract] Why this matters
> The things you look up every day, in one place. Every table row is also a flashcard in Revise.

## Passing things to functions

| You want to | Write | Why |
|---|---|---|
| Read a small value | `void f(int x)` | copying an int is free |
| Read a big object | `void f(const std::string& s)` | no copy, can't change it |
| Change the caller's object | `void f(std::string& s)` | a reference to theirs |
| Maybe nothing | `void f(const Widget* w)` | nullptr means "none" |
| Take ownership | `void f(std::unique_ptr<W> w)` | the caller hands it over with std::move |
| Return a result | `std::string f()` | returned values are moved (or built in place), not copied |

## Which container

| Need | Use | Watch out |
|---|---|---|
| A list of things, by position | `std::vector` | push_back may move every element: pointers into it dangle |
| A fixed number of things | `std::array` | size is part of the type |
| Lookup by key, in order | `std::map` | `m[key]` inserts when missing: use find or contains to just look |
| Lookup by key, fastest | `std::unordered_map` | iteration order is anything |
| Unique values | `std::set` / `std::unordered_set` | |
| Add and remove at both ends | `std::deque` | |
| Maybe a value | `std::optional` | `*opt` on an empty one is undefined: check first |
| One of several types | `std::variant` | use std::visit |

## Algorithms (`<algorithm>`, `<numeric>`)

| Task | Call |
|---|---|
| Sort | `std::sort(v.begin(), v.end())` or `std::ranges::sort(v)` |
| Find a value | `std::find(v.begin(), v.end(), x)`: compare with `v.end()` |
| Find by condition | `std::find_if(..., [](int x) { return x > 3; })` |
| Count | `std::count_if(...)` |
| Sum | `std::accumulate(v.begin(), v.end(), 0LL)` |
| Remove matching | `std::erase_if(v, pred)` (C++20) |
| Min and max | `std::minmax_element(...)` |

## Ownership in one line each

| Thing | Means |
|---|---|
| `T` (a value) | I own it, it's mine, copied when assigned |
| `T&` / `const T&` | I'm using yours, it outlives me |
| `T*` | I'm using yours, and it might be nothing |
| `std::unique_ptr<T>` | I'm the one owner; it's freed when I go |
| `std::shared_ptr<T>` | we share it; the last of us frees it |
