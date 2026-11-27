// count: lines, words and bytes, like wc. A finished version.
#include <cctype>
#include <fstream>
#include <iostream>
#include <string>
#include <string_view>
#include <vector>

struct Counts {
    long lines = 0, words = 0, bytes = 0;
    Counts& operator+=(const Counts& o) { lines += o.lines; words += o.words; bytes += o.bytes; return *this; }
};

Counts countStream(std::istream& in)
{
    Counts c;
    bool inWord = false;
    char ch;
    while (in.get(ch)) {
        ++c.bytes;
        if (ch == '\n') ++c.lines;
        if (std::isspace(static_cast<unsigned char>(ch))) inWord = false;
        else if (!inWord) { inWord = true; ++c.words; }
    }
    return c;
}

struct Show { bool l = false, w = false, c = false; };

void print(const Counts& c, const Show& s, const std::string& name)
{
    std::vector<long> nums;
    if (s.l) nums.push_back(c.lines);
    if (s.w) nums.push_back(c.words);
    if (s.c) nums.push_back(c.bytes);
    std::string sep;
    for (long n : nums) { std::cout << sep << n; sep = " "; }
    if (!name.empty()) std::cout << sep << name;
    std::cout << '\n';
}

int main(int argc, char** argv)
{
    std::vector<std::string> args(argv + 1, argv + argc);
    Show show;
    std::size_t i = 0;
    for (; i < args.size() && args[i].size() > 1 && args[i][0] == '-'; ++i) {
        for (char c : std::string_view(args[i]).substr(1)) {
            if (c == 'l') show.l = true;
            else if (c == 'w') show.w = true;
            else if (c == 'c') show.c = true;
            else { std::cerr << "count: unknown option -" << c << '\n'; return 2; }
        }
    }
    if (!show.l && !show.w && !show.c) show = {true, true, true};

    if (i == args.size()) { print(countStream(std::cin), show, ""); return 0; }
    Counts total;
    int status = 0, read = 0;
    for (; i < args.size(); ++i) {
        std::ifstream in(args[i], std::ios::binary);
        if (!in) { std::cerr << "count: " << args[i] << ": can't open\n"; status = 1; continue; }
        Counts c = countStream(in);
        print(c, show, args[i]);
        total += c;
        ++read;
    }
    if (read > 1) print(total, show, "total");
    return status;
}
