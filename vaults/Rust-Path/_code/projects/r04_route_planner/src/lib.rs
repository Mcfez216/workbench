//! R04 Route Planner. The note "R04 Route Planner" in the vault says what
//! each part must do; tests/r04_route_planner.rs checks it (▶ in the Tests
//! sidebar). Replace each todo!() with your code.

// Delete this line once everything is written: it hides the warnings
// about things you haven't used yet.
#![allow(unused_variables, unused_imports, dead_code)]

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
        todo!("entry(...).or_default() adds a place the first time")
    }

    /// Every place, in alphabetical order
    pub fn places(&self) -> Vec<&str> {
        todo!()
    }

    /// The places you can get to from `from` (including itself), by any roads.
    /// Empty if `from` isn't on the map.
    pub fn reachable(&self, from: &str) -> BTreeSet<String> {
        todo!("breadth-first search: a VecDeque as the queue, a set of places seen")
    }

    /// The shortest route, by km (Dijkstra's algorithm). None if either place
    /// isn't on the map or there's no way between them.
    pub fn shortest(&self, from: &str, to: &str) -> Option<Route> {
        todo!("Dijkstra: a BinaryHeap of Reverse((distance, place))")
    }
}
