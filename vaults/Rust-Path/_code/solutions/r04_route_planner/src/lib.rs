//! R04 Route Planner: the finished version.

use std::cmp::Reverse;
use std::collections::{BTreeSet, BinaryHeap, HashMap, VecDeque};

#[derive(Debug, Default)]
pub struct Map {
    /// place -> [(neighbour, km)]
    roads: HashMap<String, Vec<(String, u32)>>,
}

#[derive(Debug, PartialEq, Eq)]
pub struct Route {
    pub km: u64,
    pub places: Vec<String>,
}

impl Map {
    pub fn new() -> Self {
        Map::default()
    }

    /// A road both ways between `a` and `b`. Both places are added if new.
    pub fn add_road(&mut self, a: &str, b: &str, km: u32) {
        self.roads.entry(a.to_string()).or_default().push((b.to_string(), km));
        self.roads.entry(b.to_string()).or_default().push((a.to_string(), km));
    }

    /// Every place, in alphabetical order
    pub fn places(&self) -> Vec<&str> {
        let mut p: Vec<&str> = self.roads.keys().map(String::as_str).collect();
        p.sort();
        p
    }

    /// The places you can get to from `from` (including itself), by any roads.
    /// Empty if `from` isn't on the map.
    pub fn reachable(&self, from: &str) -> BTreeSet<String> {
        let mut seen = BTreeSet::new();
        if !self.roads.contains_key(from) {
            return seen;
        }
        let mut queue = VecDeque::from([from.to_string()]);
        seen.insert(from.to_string());
        while let Some(p) = queue.pop_front() {
            for (n, _) in &self.roads[&p] {
                if seen.insert(n.clone()) {
                    queue.push_back(n.clone());
                }
            }
        }
        seen
    }

    /// The shortest route, by km (Dijkstra's algorithm). None if either place
    /// isn't on the map or there's no way between them.
    pub fn shortest(&self, from: &str, to: &str) -> Option<Route> {
        if !self.roads.contains_key(from) || !self.roads.contains_key(to) {
            return None;
        }
        let mut best: HashMap<&str, u64> = HashMap::from([(from, 0)]);
        let mut came_from: HashMap<&str, &str> = HashMap::new();
        // BinaryHeap is a max-heap: Reverse makes the smallest distance come out first
        let mut heap = BinaryHeap::from([Reverse((0u64, from))]);
        while let Some(Reverse((d, p))) = heap.pop() {
            if p == to {
                let mut places = vec![to.to_string()];
                let mut at = to;
                while let Some(&prev) = came_from.get(at) {
                    places.push(prev.to_string());
                    at = prev;
                }
                places.reverse();
                return Some(Route { km: d, places });
            }
            if d > best[p] {
                continue; // an old, longer entry for p
            }
            for (n, km) in &self.roads[p] {
                let nd = d + *km as u64;
                if best.get(n.as_str()).is_none_or(|&old| nd < old) {
                    best.insert(n, nd);
                    came_from.insert(n, p);
                    heap.push(Reverse((nd, n)));
                }
            }
        }
        None
    }
}
