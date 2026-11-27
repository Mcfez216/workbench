// jsonq: parse JSON by hand, print the value a path picks. A finished version.
#include <cstdio>
#include <iostream>
#include <iterator>
#include <memory>
#include <string>
#include <utility>
#include <vector>

namespace {

constexpr int kMaxDepth = 1000;

struct Value {
    enum Kind { Number, String, Literal, Array, Object } kind;
    std::string text;                                  // a number or literal as written; a string decoded
    std::vector<Value> items;                          // an array's items
    std::vector<std::pair<std::string, Value>> fields; // an object's keys and values, in order
};

struct BadJson {
    std::size_t at;
};

class Parser {
public:
    explicit Parser(const std::string& s) : s_(s) {}

    Value document()
    {
        Value v = value(0);
        ws();
        if (i_ != s_.size()) fail();
        return v;
    }

private:
    const std::string& s_;
    std::size_t i_ = 0;

    [[noreturn]] void fail() const { throw BadJson{i_}; }
    bool more() const { return i_ < s_.size(); }
    char peek() const { return more() ? s_[i_] : '\0'; }
    static bool digit(char c) { return c >= '0' && c <= '9'; }
    void ws() { while (more() && (peek() == ' ' || peek() == '\t' || peek() == '\n' || peek() == '\r')) ++i_; }
    void expect(char c) { if (peek() != c) fail(); ++i_; }

    Value value(int depth)
    {
        if (depth > kMaxDepth) fail();
        ws();
        if (!more()) fail();
        char c = peek();
        if (c == '"') return {Value::String, string(), {}, {}};
        if (c == '-' || digit(c)) return number();
        if (c == '[') {
            Value v{Value::Array, "", {}, {}};
            ++i_;
            ws();
            if (peek() == ']') { ++i_; return v; }
            for (;;) {
                v.items.push_back(value(depth + 1));
                ws();
                if (peek() == ',') { ++i_; continue; }
                expect(']');
                return v;
            }
        }
        if (c == '{') {
            Value v{Value::Object, "", {}, {}};
            ++i_;
            ws();
            if (peek() == '}') { ++i_; return v; }
            for (;;) {
                ws();
                if (peek() != '"') fail();
                std::string key = string();
                ws();
                expect(':');
                v.fields.emplace_back(std::move(key), value(depth + 1));
                ws();
                if (peek() == ',') { ++i_; continue; }
                expect('}');
                return v;
            }
        }
        for (const char* w : {"true", "false", "null"}) {
            std::string word = w;
            if (s_.compare(i_, word.size(), word) == 0) { i_ += word.size(); return {Value::Literal, word, {}, {}}; }
        }
        fail();
    }

    Value number()
    {
        std::size_t start = i_;
        if (peek() == '-') ++i_;
        if (peek() == '0') ++i_;
        else if (digit(peek())) while (digit(peek())) ++i_;
        else fail();
        if (peek() == '.') { ++i_; if (!digit(peek())) fail(); while (digit(peek())) ++i_; }
        if (peek() == 'e' || peek() == 'E') {
            ++i_;
            if (peek() == '+' || peek() == '-') ++i_;
            if (!digit(peek())) fail();
            while (digit(peek())) ++i_;
        }
        return {Value::Number, s_.substr(start, i_ - start), {}, {}};
    }

    unsigned hex4()
    {
        if (i_ + 4 > s_.size()) fail();
        unsigned v = 0;
        for (int k = 0; k < 4; ++k) {
            char c = s_[i_++];
            v <<= 4;
            if (digit(c)) v |= static_cast<unsigned>(c - '0');
            else if (c >= 'a' && c <= 'f') v |= static_cast<unsigned>(c - 'a' + 10);
            else if (c >= 'A' && c <= 'F') v |= static_cast<unsigned>(c - 'A' + 10);
            else fail();
        }
        return v;
    }

    static void utf8(std::string& out, unsigned long cp)
    {
        if (cp < 0x80) out += static_cast<char>(cp);
        else if (cp < 0x800) { out += static_cast<char>(0xC0 | (cp >> 6)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
        else if (cp < 0x10000) { out += static_cast<char>(0xE0 | (cp >> 12)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
        else { out += static_cast<char>(0xF0 | (cp >> 18)); out += static_cast<char>(0x80 | ((cp >> 12) & 0x3F)); out += static_cast<char>(0x80 | ((cp >> 6) & 0x3F)); out += static_cast<char>(0x80 | (cp & 0x3F)); }
    }

    std::string string()
    {
        expect('"');
        std::string out;
        for (;;) {
            if (!more()) fail();
            auto c = static_cast<unsigned char>(s_[i_]);
            if (c == '"') { ++i_; return out; }
            if (c < 0x20) fail();
            ++i_;
            if (c != '\\') { out += static_cast<char>(c); continue; }
            if (!more()) fail();
            switch (s_[i_++]) {
            case '"': out += '"'; break;
            case '\\': out += '\\'; break;
            case '/': out += '/'; break;
            case 'b': out += '\b'; break;
            case 'f': out += '\f'; break;
            case 'n': out += '\n'; break;
            case 'r': out += '\r'; break;
            case 't': out += '\t'; break;
            case 'u': {
                unsigned long cp = hex4();
                if (cp >= 0xD800 && cp <= 0xDBFF) {
                    if (s_.compare(i_, 2, "\\u") != 0) fail();
                    i_ += 2;
                    unsigned long lo = hex4();
                    if (lo < 0xDC00 || lo > 0xDFFF) fail();
                    cp = 0x10000 + ((cp - 0xD800) << 10) + (lo - 0xDC00);
                } else if (cp >= 0xDC00 && cp <= 0xDFFF) {
                    fail();
                }
                utf8(out, cp);
                break;
            }
            default: fail();
            }
        }
    }
};

void printString(std::string& out, const std::string& s)
{
    out += '"';
    for (unsigned char c : s) {
        switch (c) {
        case '"': out += "\\\""; break;
        case '\\': out += "\\\\"; break;
        case '\n': out += "\\n"; break;
        case '\t': out += "\\t"; break;
        case '\r': out += "\\r"; break;
        case '\b': out += "\\b"; break;
        case '\f': out += "\\f"; break;
        default:
            if (c < 0x20) { char buf[8]; std::snprintf(buf, sizeof buf, "\\u%04x", c); out += buf; }
            else out += static_cast<char>(c);
        }
    }
    out += '"';
}

void print(std::string& out, const Value& v)
{
    switch (v.kind) {
    case Value::Number:
    case Value::Literal: out += v.text; break;
    case Value::String: printString(out, v.text); break;
    case Value::Array:
        out += '[';
        for (std::size_t i = 0; i < v.items.size(); ++i) { if (i) out += ','; print(out, v.items[i]); }
        out += ']';
        break;
    case Value::Object:
        out += '{';
        for (std::size_t i = 0; i < v.fields.size(); ++i) {
            if (i) out += ',';
            printString(out, v.fields[i].first);
            out += ':';
            print(out, v.fields[i].second);
        }
        out += '}';
        break;
    }
}

struct PathError {
    std::string message;
};

const Value& walk(const Value& root, const std::string& path)
{
    if (path == ".") return root;
    if (path.empty() || (path[0] != '.' && path[0] != '[')) throw PathError{"a path starts with . or ["};
    const Value* at = &root;
    std::size_t i = 0;
    while (i < path.size()) {
        if (path[i] == '.') {
            std::size_t end = path.find_first_of(".[", i + 1);
            std::string key = path.substr(i + 1, end == std::string::npos ? std::string::npos : end - i - 1);
            if (key.empty()) throw PathError{"an empty key in the path"};
            if (at->kind != Value::Object) throw PathError{"asked for ." + key + " of something that isn't an object"};
            const Value* found = nullptr;
            for (const auto& [k, v] : at->fields) if (k == key) found = &v;
            if (!found) throw PathError{"no key \"" + key + "\""};
            at = found;
            i = end == std::string::npos ? path.size() : end;
        } else if (path[i] == '[') {
            std::size_t close = path.find(']', i);
            std::string num = path.substr(i + 1, close == std::string::npos ? 0 : close - i - 1);
            if (close == std::string::npos || num.empty() || num.size() > 9 || num.find_first_not_of("0123456789") != std::string::npos)
                throw PathError{"an index is a number: [0]"};
            std::size_t n = std::stoul(num);
            if (at->kind != Value::Array) throw PathError{"asked for [" + num + "] of something that isn't an array"};
            if (n >= at->items.size()) throw PathError{"index " + num + " is past the end (" + std::to_string(at->items.size()) + " items)"};
            at = &at->items[n];
            i = close + 1;
        } else {
            throw PathError{"a path is .key and [index] steps"};
        }
    }
    return *at;
}

}  // namespace

int main(int argc, char** argv)
{
    if (argc != 2) { std::cerr << "usage: jsonq <path>   (for example: jsonq .users[0].name < data.json)\n"; return 2; }
    std::string input((std::istreambuf_iterator<char>(std::cin)), std::istreambuf_iterator<char>());
    try {
        Value root = Parser(input).document();
        std::string out;
        print(out, walk(root, argv[1]));
        std::cout << out << '\n';
        return 0;
    } catch (const BadJson& e) {
        std::cerr << "jsonq: bad JSON at byte " << e.at << '\n';
        return 2;
    } catch (const PathError& e) {
        std::cerr << "jsonq: " << e.message << '\n';
        return 1;
    }
}
