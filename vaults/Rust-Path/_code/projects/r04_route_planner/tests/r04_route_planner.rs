//! R04's tests. Work through them from the top.

use r04_route_planner::{Map, Route};

// A small map:
//
//   York --30-- Leeds --40-- Manchester
//    |                        |
//   100                       35
//    |                        |
//   Hull ---------90------- Sheffield        Iona (an island: no roads)
fn north() -> Map {
    let mut m = Map::new();
    m.add_road("York", "Leeds", 30);
    m.add_road("Leeds", "Manchester", 40);
    m.add_road("Manchester", "Sheffield", 35);
    m.add_road("York", "Hull", 100);
    m.add_road("Hull", "Sheffield", 90);
    m
}

fn route(km: u64, places: &[&str]) -> Option<Route> {
    Some(Route { km, places: places.iter().map(|p| p.to_string()).collect() })
}

#[test]
fn roads_add_places() {
    let m = north();
    assert_eq!(m.places(), ["Hull", "Leeds", "Manchester", "Sheffield", "York"]);
}

#[test]
fn reachable_follows_roads_both_ways() {
    let m = north();
    assert_eq!(m.reachable("Sheffield").len(), 5);
    assert!(m.reachable("York").contains("Hull"));
}

#[test]
fn a_neighbour_is_one_road_away() {
    assert_eq!(north().shortest("York", "Leeds"), route(30, &["York", "Leeds"]));
}

#[test]
fn the_shortest_isnt_the_fewest_roads() {
    // York -> Hull -> Sheffield is 2 roads but 190 km;
    // York -> Leeds -> Manchester -> Sheffield is 3 roads and 105 km
    assert_eq!(north().shortest("York", "Sheffield"), route(105, &["York", "Leeds", "Manchester", "Sheffield"]));
}

#[test]
fn roads_go_both_ways() {
    assert_eq!(north().shortest("Sheffield", "York"), route(105, &["Sheffield", "Manchester", "Leeds", "York"]));
}

#[test]
fn of_two_roads_between_the_same_places_the_shorter_counts() {
    let mut m = north();
    m.add_road("York", "Hull", 60);
    assert_eq!(m.shortest("York", "Hull"), route(60, &["York", "Hull"]));
}

#[test]
fn places_not_on_the_map_have_no_route() {
    let m = north();
    assert_eq!(m.shortest("York", "Atlantis"), None);
    assert_eq!(m.shortest("Atlantis", "York"), None);
    assert!(m.reachable("Atlantis").is_empty());
}

#[test]
fn boss_islands_loops_and_long_roads() {
    let mut m = north();
    // a place with no way to it
    m.add_road("Iona", "Mull", 2);
    assert_eq!(m.shortest("York", "Iona"), None);
    assert_eq!(m.reachable("Iona").len(), 2);
    // from a place to itself: no distance at all
    assert_eq!(m.shortest("Leeds", "Leeds"), route(0, &["Leeds"]));
    // a road to itself doesn't confuse it
    m.add_road("Leeds", "Leeds", 5);
    assert_eq!(m.shortest("York", "Leeds"), route(30, &["York", "Leeds"]));
    // very long roads add up past u32::MAX: the total is a u64
    let mut far = Map::new();
    far.add_road("A", "B", u32::MAX);
    far.add_road("B", "C", u32::MAX);
    assert_eq!(far.shortest("A", "C"), route(2 * u32::MAX as u64, &["A", "B", "C"]));
}
