// adventure: a small text adventure. A finished version.
use std::collections::HashMap;
use std::io::BufRead;

#[derive(Clone, Copy, PartialEq, Eq, Hash)]
enum Room {
    Hall,
    Library,
    Garden,
    Vault,
}

fn describe(r: Room) -> &'static str {
    match r {
        Room::Hall => "You are in the hall. Doors lead north and east.",
        Room::Library => "You are in the library. Dusty books everywhere. Doors lead north and south.",
        Room::Garden => "You are in the garden. A path leads west.",
        Room::Vault => "You are in the vault. Gold everywhere!",
    }
}

fn way(r: Room, dir: char) -> Option<Room> {
    match (r, dir) {
        (Room::Hall, 'n') => Some(Room::Library),
        (Room::Hall, 'e') => Some(Room::Garden),
        (Room::Library, 's') => Some(Room::Hall),
        (Room::Library, 'n') => Some(Room::Vault),
        (Room::Garden, 'w') => Some(Room::Hall),
        _ => None,
    }
}

fn direction(w: &str) -> Option<char> {
    match w {
        "north" | "n" => Some('n'),
        "south" | "s" => Some('s'),
        "east" | "e" => Some('e'),
        "west" | "w" => Some('w'),
        _ => None,
    }
}

fn main() {
    let mut things: HashMap<Room, Vec<String>> = HashMap::new();
    things.insert(Room::Library, vec!["lamp".into()]);
    things.insert(Room::Garden, vec!["key".into()]);
    let mut carried: Vec<String> = Vec::new();
    let mut room = Room::Hall;
    println!("{}", describe(room));
    for line in std::io::stdin().lock().lines() {
        let Ok(line) = line else { break };
        let lower = line.to_lowercase();
        let words: Vec<&str> = lower.split_whitespace().collect();
        let Some(&verb) = words.first() else { continue };
        match verb {
            "look" => {
                println!("{}", describe(room));
                let here = things.entry(room).or_default();
                if !here.is_empty() {
                    let list: Vec<String> = here.iter().map(|t| format!("a {t}")).collect();
                    println!("You see: {}.", list.join(", "));
                }
            }
            "quit" => {
                println!("Bye.");
                break;
            }
            "inventory" | "i" => {
                if carried.is_empty() {
                    println!("You carry nothing.");
                } else {
                    println!("You carry: {}.", carried.join(", "));
                }
            }
            "take" | "drop" => {
                let take = verb == "take";
                let Some(&what) = words.get(1) else {
                    println!("{}", if take { "Take what?" } else { "Drop what?" });
                    continue;
                };
                let here = things.entry(room).or_default();
                let (from, to) = if take { (here, &mut carried) } else { (&mut carried, here) };
                match from.iter().position(|t| t == what) {
                    Some(i) => {
                        let t = from.remove(i);
                        println!("{} {t}.", if take { "Taken:" } else { "Dropped:" });
                        to.push(t);
                    }
                    None if take => println!("There is no {what} here."),
                    None => println!("You don't have a {what}."),
                }
            }
            _ if verb == "go" || direction(verb).is_some() => {
                let dir = if verb == "go" {
                    match words.get(1) {
                        None => {
                            println!("Go where?");
                            continue;
                        }
                        Some(w) => direction(w),
                    }
                } else {
                    direction(verb)
                };
                match dir.and_then(|d| way(room, d)) {
                    None => println!("You can't go that way."),
                    Some(Room::Vault) if !carried.iter().any(|t| t == "key") => println!("The vault door is locked."),
                    Some(Room::Vault) => {
                        println!("You unlock the vault door with the key.");
                        println!("{}", describe(Room::Vault));
                        println!("You win!");
                        break;
                    }
                    Some(r) => {
                        room = r;
                        println!("{}", describe(room));
                    }
                }
            }
            _ => println!("I don't understand \"{}\".", line.trim()),
        }
    }
}
