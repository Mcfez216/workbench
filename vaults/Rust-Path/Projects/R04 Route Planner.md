---
phase: 5
tags: [rust, project, algorithms]
time: 2-3 hours
---
# R04 Route Planner

> [!abstract] Why this matters
> Maps, networks and dependencies are all graphs. You'll store one, find everything reachable from a place, and find the shortest route by distance with Dijkstra's algorithm, the way a sat-nav does.

## What you'll build

A `Map` of places joined by roads (both ways, each a number of km):

| Method | Does |
|---|---|
| `add_road(a, b, km)` | a road between `a` and `b`; new places are added |
| `places()` | every place, A to Z |
| `reachable(from)` | every place you can get to (breadth-first search) |
| `shortest(from, to)` | `Some(Route { km, places })`: the shortest route, or `None` if there isn't one |

## How to start

Tests sidebar → **R04 Route Planner** → ▶. Code: `_code/projects/r04_route_planner/`. Read [[5.03 Graphs]] first.

## Hints

> [!tip]- Hint 1: storing the map
> `HashMap<String, Vec<(String, u32)>>`: each place and its neighbours. `self.roads.entry(a.to_string()).or_default().push(...)` adds a place the first time you see it. Add each road twice, once from each end.

> [!tip]- Hint 2: reachable
> A `VecDeque` as a queue and a `BTreeSet` of places seen. Take a place from the front, add each neighbour you haven't seen to the back. `set.insert(x)` returns `true` if `x` is new: one call to check and add.

> [!tip]- Hint 3: Dijkstra
> Keep the best distance found so far for each place, and a `BinaryHeap` of `(distance, place)` to visit next. A `BinaryHeap` gives the **biggest** first, so wrap entries in `std::cmp::Reverse` to get the smallest. Pop one; if it's `to`, you're done. Otherwise, for each neighbour, if going through here is shorter than what you knew, remember it and push it.

> [!tip]- Hint 4: the route, not just the distance
> When you improve a place's distance, remember where you came from: `came_from.insert(neighbour, place)`. At the end, follow `came_from` back from `to` to `from`, and reverse.

> [!boss] Boss fight
> `boss_islands_loops_and_long_roads`: a place with no way to it, a route from a place to itself (0 km), a road from a place to itself, and two roads of `u32::MAX` km. The total doesn't fit a `u32`: keep distances as `u64`.

> [!sith] The dark side
> Breadth-first search for the shortest route. It finds the route with the fewest roads, which isn't the shortest in km: the York test catches it.

## Check yourself

> [!question]- Why does Dijkstra's algorithm need Reverse with Rust's BinaryHeap?
> BinaryHeap is a max-heap: pop gives the largest item. Dijkstra needs the place with the smallest distance next, and wrapping entries in Reverse flips the ordering so the smallest comes out first.

> [!question]- Why can an old entry for a place still be in the heap, and what do you do with it?
> When a shorter way to a place is found, a new entry is pushed but the old, longer one isn't removed. When the old one is popped later, its distance is bigger than the best known, so it's skipped.

Done? Write a line in [[Rust Done Log]]. Next: [[R05 Packet Parser]]
