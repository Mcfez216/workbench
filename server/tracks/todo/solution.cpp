// todo: a to-do list kept in todo.txt. A finished version.
#include <algorithm>
#include <cstdlib>
#include <fstream>
#include <iostream>
#include <optional>
#include <string>
#include <vector>

namespace {

const char* const kFile = "todo.txt";
const char* const kUsage = "usage: todo add <title> | list | done <id> | rm <id>\n";

struct Task {
    long id;
    bool done;
    std::string title;
};

struct List {
    long next = 1;
    std::vector<Task> tasks;
};

// a mistake: what to say, and the exit code
struct Mistake {
    std::string message;
    int code = 1;
};

std::optional<long> parseId(const std::string& s)
{
    if (s.empty() || s.size() > 9 || !std::all_of(s.begin(), s.end(), [](unsigned char c) { return c >= '0' && c <= '9'; }))
        return std::nullopt;
    return std::stol(s);
}

List load()
{
    List list;
    std::ifstream in(kFile);
    if (!in) return list;
    std::string line;
    long n = 0;
    bool seenNext = false;
    auto broken = [&] { return Mistake{std::string("todo: ") + kFile + " line " + std::to_string(n) + " is broken"}; };
    while (std::getline(in, line)) {
        ++n;
        if (line.empty()) continue;
        if (!seenNext) {
            auto id = line.rfind("next ", 0) == 0 ? parseId(line.substr(5)) : std::nullopt;
            if (!id) throw broken();
            list.next = *id;
            seenNext = true;
            continue;
        }
        auto tab = line.find('\t');
        if (tab == std::string::npos) throw broken();
        auto id = parseId(line.substr(0, tab));
        std::string rest = line.substr(tab + 1);
        if (!id || rest.size() < 5 || (rest.rfind("[ ] ", 0) != 0 && rest.rfind("[x] ", 0) != 0)) throw broken();
        list.tasks.push_back({*id, rest[1] == 'x', rest.substr(4)});
    }
    if (n > 0 && !seenNext) { n = 1; throw broken(); }
    return list;
}

void save(const List& list)
{
    std::ofstream out(kFile, std::ios::trunc);
    out << "next " << list.next << '\n';
    for (const auto& t : list.tasks) out << t.id << "\t[" << (t.done ? 'x' : ' ') << "] " << t.title << '\n';
}

std::vector<Task>::iterator find(List& list, const std::string& arg)
{
    auto id = parseId(arg);
    if (!id) throw Mistake{"todo: \"" + arg + "\" isn't a task number"};
    auto it = std::find_if(list.tasks.begin(), list.tasks.end(), [&](const Task& t) { return t.id == *id; });
    if (it == list.tasks.end()) throw Mistake{"todo: no task " + std::to_string(*id)};
    return it;
}

int run(const std::vector<std::string>& args)
{
    if (args.empty()) throw Mistake{kUsage, 2};
    const std::string& cmd = args[0];
    List list = load();
    if (cmd == "add") {
        std::string title;
        for (std::size_t i = 1; i < args.size(); ++i) title += (i > 1 ? " " : "") + args[i];
        if (title.empty()) throw Mistake{"todo: a task needs a title"};
        list.tasks.push_back({list.next, false, title});
        std::cout << "Added " << list.next << ": " << title << '\n';
        ++list.next;
        save(list);
    } else if (cmd == "list" && (args.size() == 1 || (args.size() == 2 && args[1] == "--pending"))) {
        bool pending = args.size() == 2;
        int shown = 0;
        for (const auto& t : list.tasks) {
            if (pending && t.done) continue;
            std::cout << t.id << " [" << (t.done ? 'x' : ' ') << "] " << t.title << '\n';
            ++shown;
        }
        if (!shown) std::cout << "Nothing to do.\n";
    } else if (cmd == "done" && args.size() == 2) {
        auto it = find(list, args[1]);
        if (it->done) throw Mistake{"todo: task " + std::to_string(it->id) + " is already done"};
        it->done = true;
        std::cout << "Done " << it->id << ": " << it->title << '\n';
        save(list);
    } else if (cmd == "rm" && args.size() == 2) {
        auto it = find(list, args[1]);
        std::cout << "Removed " << it->id << ": " << it->title << '\n';
        list.tasks.erase(it);
        save(list);
    } else {
        throw Mistake{kUsage, 2};
    }
    return 0;
}

}  // namespace

int main(int argc, char** argv)
{
    try {
        return run(std::vector<std::string>(argv + 1, argv + argc));
    } catch (const Mistake& m) {
        std::cerr << m.message << (m.message.back() == '\n' ? "" : "\n");
        return m.code;
    }
}
