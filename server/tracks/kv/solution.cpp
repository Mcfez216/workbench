// kv: a key-value store kept as an append-only log in kv.db. A finished version.
#include <filesystem>
#include <fstream>
#include <iostream>
#include <map>
#include <sstream>
#include <string>
#include <vector>

namespace {

const std::string kDb = "kv.db";
const std::string kUsage = "usage: kv set <key> <value> | get <key> | del <key> | list | compact";

struct Mistake {
    std::string message;
    int code = 1;
};

bool goodKey(const std::string& k) { return !k.empty() && k.find_first_of("=\t \n") == std::string::npos; }

std::vector<std::string> split(const std::string& s, char sep)
{
    std::vector<std::string> out;
    std::string::size_type start = 0, at;
    while ((at = s.find(sep, start)) != std::string::npos) { out.push_back(s.substr(start, at - start)); start = at + 1; }
    out.push_back(s.substr(start));
    return out;
}

// the log replayed: the keys there now, and how many lines it took
struct Store {
    std::map<std::string, std::string> map;
    long lines = 0;
};

Store load()
{
    Store s;
    std::ifstream in(kDb);
    std::string line;
    while (std::getline(in, line)) {
        ++s.lines;
        auto p = split(line, '\t');
        if (p.size() == 3 && p[0] == "set" && goodKey(p[1])) s.map[p[1]] = p[2];
        else if (p.size() == 2 && p[0] == "del" && goodKey(p[1])) s.map.erase(p[1]);
        else throw Mistake{"kv: " + kDb + " line " + std::to_string(s.lines) + " is broken"};
    }
    return s;
}

void append(const std::string& line)
{
    std::ofstream out(kDb, std::ios::app);
    if (!(out << line << '\n')) throw Mistake{"kv: can't write " + kDb};
}

int run(const std::vector<std::string>& a)
{
    const std::string cmd = a.empty() ? "" : a[0];
    bool ok = (cmd == "set" && a.size() >= 3) || ((cmd == "get" || cmd == "del") && a.size() == 2) || ((cmd == "list" || cmd == "compact") && a.size() == 1);
    if (!ok) throw Mistake{kUsage, 2};
    Store s = load();
    if (a.size() >= 2 && !goodKey(a[1])) throw Mistake{"kv: bad key"};
    if (cmd == "set") {
        std::string value;
        for (std::size_t i = 2; i < a.size(); ++i) value += (i > 2 ? " " : "") + a[i];
        if (value.find_first_of("\t\n") != std::string::npos) throw Mistake{"kv: bad value"};
        append("set\t" + a[1] + "\t" + value);
    } else if (cmd == "get" || cmd == "del") {
        auto it = s.map.find(a[1]);
        if (it == s.map.end()) throw Mistake{"kv: no key \"" + a[1] + "\""};
        if (cmd == "get") std::cout << it->second << '\n';
        else append("del\t" + a[1]);
    } else if (cmd == "list") {
        for (const auto& [k, v] : s.map) std::cout << k << '=' << v << '\n';
    } else {
        {
            std::ofstream out(kDb + ".tmp", std::ios::trunc);
            for (const auto& [k, v] : s.map) out << "set\t" << k << '\t' << v << '\n';
            if (!out) throw Mistake{"kv: can't write " + kDb + ".tmp"};
        }
        std::filesystem::rename(kDb + ".tmp", kDb);
        std::cout << "kept " << s.map.size() << ", dropped " << s.lines - static_cast<long>(s.map.size()) << '\n';
    }
    return 0;
}

}  // namespace

int main(int argc, char** argv)
{
    try {
        return run(std::vector<std::string>(argv + 1, argv + argc));
    } catch (const Mistake& m) {
        std::cerr << m.message << '\n';
        return m.code;
    } catch (const std::exception& e) {
        std::cerr << "kv: " << e.what() << '\n';
        return 1;
    }
}
