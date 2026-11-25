---
tags: [cpp, cheatsheet]
---
# Cheat Sheet - CPP and STL

> [!abstract] Why this matters
> These are the things you look up every day, in one place. Every table row is also a flashcard in Revise.

## Passing things to functions

| You want to | Write | Why |
|---|---|---|
| Read a small value | `void f(int x)` | Copying an int costs nothing. |
| Read a big object | `void f(const std::string& s)` | No copy is made, and the function can't change it. |
| Change the caller's object | `void f(std::string& s)` | A reference gives the function the caller's own object. |
| Allow "nothing" | `void f(const Widget* w)` | `nullptr` means "there isn't one". |
| Take ownership | `void f(std::unique_ptr<W> w)` | The caller hands it over with `std::move`. |
| Give back a result | `std::string f()` | The result is moved out, not copied. |

## Which container

| You need | Use | Watch out |
|---|---|---|
| A list of things, in order | `std::vector` | `push_back` may move every element, so old pointers into it stop working. |
| A fixed number of things | `std::array` | The size is part of the type. |
| Look up by key, sorted | `std::map` | `m[key]` adds the key if it's missing. Use `find` or `contains` to just look. |
| Look up by key, fastest | `std::unordered_map` | The order is random. |
| Each value once | `std::set` or `std::unordered_set` | |
| Add and remove at both ends | `std::deque` | |
| Maybe a value | `std::optional` | Check it has a value before you use `*opt`. |
| One of several types | `std::variant` | Use `std::visit` to handle each type. |

## Algorithms (`<algorithm>`, `<numeric>`)

| Task | Call |
|---|---|
| Sort | `std::sort(v.begin(), v.end())`, or `std::ranges::sort(v)` |
| Find a value | `std::find(v.begin(), v.end(), x)`. If the result equals `v.end()`, it wasn't found. |
| Find by a test | `std::find_if(..., [](int x) { return x > 3; })` |
| Count | `std::count_if(...)` |
| Add them all up | `std::accumulate(v.begin(), v.end(), 0LL)` |
| Remove matching values | `std::erase_if(v, test)` (C++20) |
| Smallest and biggest | `std::minmax_element(...)` |

## Who owns what

| Thing | What it means |
|---|---|
| `T` (a value) | I own it. Assigning it makes a copy. |
| `T&` or `const T&` | I'm using yours. It lasts longer than I do. |
| `T*` | I'm using yours, and there might not be one. |
| `std::unique_ptr<T>` | I'm the only owner. It's freed when I'm destroyed. |
| `std::shared_ptr<T>` | We share it. The last one of us frees it. |
