// caesar, in C++: a port of the C version.
#include <charconv>
#include <iostream>
#include <string>
#include <string_view>

int main(int argc, char** argv)
{
    if (argc != 2) { std::cerr << "usage: caesar <shift>\n"; return 2; }
    std::string_view arg = argv[1];
    long shift = 0;
    auto [ptr, ec] = std::from_chars(arg.data(), arg.data() + arg.size(), shift);
    if (ec != std::errc{} || ptr != arg.data() + arg.size() || arg.empty()) {
        std::cerr << "caesar: the shift must be a number\n";
        return 2;
    }
    shift = ((shift % 26) + 26) % 26;
    char ch;
    while (std::cin.get(ch)) {
        if (ch >= 'A' && ch <= 'Z') ch = static_cast<char>('A' + (ch - 'A' + shift) % 26);
        else if (ch >= 'a' && ch <= 'z') ch = static_cast<char>('a' + (ch - 'a' + shift) % 26);
        std::cout.put(ch);
    }
    return 0;
}
