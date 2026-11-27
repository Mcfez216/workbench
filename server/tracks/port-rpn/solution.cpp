// rpn, in C++: a port of the C version.
#include <iostream>
#include <optional>
#include <sstream>
#include <string>
#include <variant>
#include <vector>

// a result, or the reason there isn't one ("" for a blank line)
std::variant<long, std::string> eval(const std::string& line)
{
    std::vector<long> stack;
    std::istringstream in(line);
    for (std::string tok; in >> tok;) {
        try {
            std::size_t used = 0;
            long x = std::stol(tok, &used);
            if (used == tok.size()) { stack.push_back(x); continue; }
        } catch (const std::exception&) { /* not a number */ }
        if (tok.size() != 1 || std::string("+-*/").find(tok[0]) == std::string::npos) return std::string("unknown word");
        if (stack.size() < 2) return std::string("not enough numbers");
        long b = stack.back(); stack.pop_back();
        long a = stack.back(); stack.pop_back();
        switch (tok[0]) {
        case '+': stack.push_back(a + b); break;
        case '-': stack.push_back(a - b); break;
        case '*': stack.push_back(a * b); break;
        default:
            if (b == 0) return std::string("division by zero");
            stack.push_back(a / b);
        }
    }
    if (stack.empty()) return std::string("");
    if (stack.size() > 1) return std::string("too many numbers");
    return stack[0];
}

int main()
{
    std::string line;
    while (std::getline(std::cin, line)) {
        auto r = eval(line);
        if (auto* v = std::get_if<long>(&r)) std::cout << *v << '\n';
        else if (!std::get<std::string>(r).empty()) std::cout << "error: " << std::get<std::string>(r) << '\n';
    }
    return 0;
}
