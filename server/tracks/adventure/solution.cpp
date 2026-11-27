// adventure: a small text adventure. A finished version.
#include <algorithm>
#include <cctype>
#include <iostream>
#include <map>
#include <optional>
#include <sstream>
#include <string>
#include <vector>

enum class Room { Hall, Library, Garden, Vault };

const std::map<Room, std::string> kDesc = {
    {Room::Hall, "You are in the hall. Doors lead north and east."},
    {Room::Library, "You are in the library. Dusty books everywhere. Doors lead north and south."},
    {Room::Garden, "You are in the garden. A path leads west."},
    {Room::Vault, "You are in the vault. Gold everywhere!"},
};
const std::map<std::pair<Room, char>, Room> kWays = {
    {{Room::Hall, 'n'}, Room::Library}, {{Room::Hall, 'e'}, Room::Garden},
    {{Room::Library, 's'}, Room::Hall}, {{Room::Library, 'n'}, Room::Vault},
    {{Room::Garden, 'w'}, Room::Hall},
};

std::optional<char> direction(const std::string& w)
{
    for (const char* d : {"north", "south", "east", "west", "n", "s", "e", "w"})
        if (w == d) return d[0];
    return std::nullopt;
}

std::string list(const std::vector<std::string>& items, bool article)
{
    std::string out;
    for (std::size_t i = 0; i < items.size(); ++i) out += (i ? ", " : "") + std::string(article ? "a " : "") + items[i];
    return out;
}

int main()
{
    std::map<Room, std::vector<std::string>> things = {{Room::Library, {"lamp"}}, {Room::Garden, {"key"}}};
    std::vector<std::string> carried;
    Room room = Room::Hall;
    std::cout << kDesc.at(room) << '\n';
    std::string line;
    while (std::getline(std::cin, line)) {
        std::string lower = line;
        std::transform(lower.begin(), lower.end(), lower.begin(), [](unsigned char c) { return static_cast<char>(std::tolower(c)); });
        std::istringstream in(lower);
        std::vector<std::string> words;
        for (std::string w; in >> w;) words.push_back(w);
        if (words.empty()) continue;
        const std::string& verb = words[0];
        auto dir = verb == "go" ? (words.size() > 1 ? direction(words[1]) : std::optional<char>('?')) : direction(verb);
        if (verb == "look") {
            std::cout << kDesc.at(room) << '\n';
            if (!things[room].empty()) std::cout << "You see: " << list(things[room], true) << ".\n";
        } else if (verb == "quit") {
            std::cout << "Bye.\n";
            break;
        } else if (verb == "inventory" || verb == "i") {
            if (carried.empty()) std::cout << "You carry nothing.\n";
            else std::cout << "You carry: " << list(carried, false) << ".\n";
        } else if (verb == "take" || verb == "drop") {
            bool take = verb == "take";
            if (words.size() < 2) { std::cout << (take ? "Take what?\n" : "Drop what?\n"); continue; }
            auto& from = take ? things[room] : carried;
            auto& to = take ? carried : things[room];
            auto it = std::find(from.begin(), from.end(), words[1]);
            if (it == from.end()) std::cout << (take ? "There is no " + words[1] + " here.\n" : "You don't have a " + words[1] + ".\n");
            else { std::cout << (take ? "Taken: " : "Dropped: ") << *it << ".\n"; to.push_back(*it); from.erase(it); }
        } else if (verb == "go" || dir) {
            if (!dir) { std::cout << "You can't go that way.\n"; continue; }
            if (*dir == '?') { std::cout << "Go where?\n"; continue; }
            auto way = kWays.find({room, *dir});
            if (way == kWays.end()) std::cout << "You can't go that way.\n";
            else if (way->second == Room::Vault) {
                if (std::find(carried.begin(), carried.end(), "key") == carried.end()) { std::cout << "The vault door is locked.\n"; continue; }
                std::cout << "You unlock the vault door with the key.\n" << kDesc.at(Room::Vault) << "\nYou win!\n";
                break;
            } else {
                room = way->second;
                std::cout << kDesc.at(room) << '\n';
            }
        } else {
            auto b = line.find_first_not_of(" \t\r"), e = line.find_last_not_of(" \t\r");
            std::cout << "I don't understand \"" << line.substr(b, e - b + 1) << "\".\n";
        }
    }
    return 0;
}
