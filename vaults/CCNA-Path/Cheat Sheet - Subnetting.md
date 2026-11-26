---
tags: [ccna, cheatsheet, subnetting]
---
# Cheat Sheet - Subnetting

> [!abstract] Why this matters
> Subnetting questions are quick marks on the exam if you're fast, and lost time if you're not. Learn these tables until you don't need to work them out. Every row is also a flashcard.

## The prefix table

| Prefix | Mask | Magic number | Usable hosts |
|---|---|---|---|
| /16 | 255.255.0.0 | 256 in the 3rd octet | 65,534 |
| /17 | 255.255.128.0 | 128 in the 3rd octet | 32,766 |
| /18 | 255.255.192.0 | 64 in the 3rd octet | 16,382 |
| /19 | 255.255.224.0 | 32 in the 3rd octet | 8,190 |
| /20 | 255.255.240.0 | 16 in the 3rd octet | 4,094 |
| /21 | 255.255.248.0 | 8 in the 3rd octet | 2,046 |
| /22 | 255.255.252.0 | 4 in the 3rd octet | 1,022 |
| /23 | 255.255.254.0 | 2 in the 3rd octet | 510 |
| /24 | 255.255.255.0 | 256 in the 4th octet | 254 |
| /25 | 255.255.255.128 | 128 | 126 |
| /26 | 255.255.255.192 | 64 | 62 |
| /27 | 255.255.255.224 | 32 | 30 |
| /28 | 255.255.255.240 | 16 | 14 |
| /29 | 255.255.255.248 | 8 | 6 |
| /30 | 255.255.255.252 | 4 | 2 |
| /31 | 255.255.255.254 | 2 | 2, point-to-point links only |
| /32 | 255.255.255.255 | 1 | 1 host |

## Wildcard masks

| Prefix | Wildcard |
|---|---|
| /8 | 0.255.255.255 |
| /16 | 0.0.255.255 |
| /24 | 0.0.0.255 |
| /25 | 0.0.0.127 |
| /26 | 0.0.0.63 |
| /27 | 0.0.0.31 |
| /28 | 0.0.0.15 |
| /29 | 0.0.0.7 |
| /30 | 0.0.0.3 |
| /32 | 0.0.0.0, or the word host |

## Hosts needed to prefix

| Hosts needed | Smallest prefix |
|---|---|
| 2 | /30 |
| 6 | /29 |
| 14 | /28 |
| 30 | /27 |
| 62 | /26 |
| 126 | /25 |
| 254 | /24 |
| 510 | /23 |
| 1,022 | /22 |

## The method

1. Find the interesting octet, where the mask isn't 255 or 0.
2. Magic number = 256 − that mask octet.
3. The network is the biggest multiple of the magic number that's not above the address's octet.
4. The broadcast is the next network minus one.
5. The first host is the network plus one. The last host is the broadcast minus one.

## Daily drills

Do five a day. Cover the answer, work it out, then check. Answers are network, broadcast, and host range.

| Address | Answer |
|---|---|
| 192.168.1.77/26 | 192.168.1.64, 192.168.1.127, hosts .65 to .126 |
| 10.10.10.200/27 | 10.10.10.192, 10.10.10.223, hosts .193 to .222 |
| 172.16.5.33/28 | 172.16.5.32, 172.16.5.47, hosts .33 to .46 |
| 192.168.100.9/29 | 192.168.100.8, 192.168.100.15, hosts .9 to .14 |
| 10.0.0.130/25 | 10.0.0.128, 10.0.0.255, hosts .129 to .254 |
| 172.20.77.1/20 | 172.20.64.0, 172.20.79.255, hosts 172.20.64.1 to 172.20.79.254 |
| 10.45.200.5/18 | 10.45.192.0, 10.45.255.255, hosts 10.45.192.1 to 10.45.255.254 |
| 192.168.33.250/30 | 192.168.33.248, 192.168.33.251, hosts .249 to .250 |
| 172.31.130.40/23 | 172.31.130.0, 172.31.131.255, hosts 172.31.130.1 to 172.31.131.254 |
| 10.200.3.99/22 | 10.200.0.0, 10.200.3.255, hosts 10.200.0.1 to 10.200.3.254 |

For more practice, make up your own addresses and check them with `show ip route` after giving them to a router in Packet Tracer.
