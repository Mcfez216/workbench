// stats, in C++: a port of the C version.
#include <algorithm>
#include <cstdio>
#include <iostream>
#include <numeric>
#include <vector>

int main()
{
    std::vector<long> v;
    long x;
    while (std::cin >> x) v.push_back(x);
    if (!std::cin.eof()) { std::cerr << "stats: that isn't a whole number\n"; return 1; }
    if (v.empty()) { std::cout << "count 0\n"; return 0; }
    std::sort(v.begin(), v.end());
    double sum = std::accumulate(v.begin(), v.end(), 0.0);   // 0.0: add as doubles
    std::size_t n = v.size();
    double median = n % 2 ? static_cast<double>(v[n / 2]) : (static_cast<double>(v[n / 2 - 1]) + static_cast<double>(v[n / 2])) / 2.0;
    std::printf("count %zu\nmin %ld\nmax %ld\nmean %.2f\nmedian %.1f\n", n, v.front(), v.back(), sum / static_cast<double>(n), median);
    return 0;
}
