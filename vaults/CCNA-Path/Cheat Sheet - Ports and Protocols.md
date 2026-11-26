---
tags: [ccna, cheatsheet, ports]
---
# Cheat Sheet - Ports and Protocols

> [!abstract] Why this matters
> ACL, firewall and NAT questions all need port numbers. Administrative distances and multicast addresses come up in routing questions. Every row here is a flashcard.

## Well-known ports

| Protocol | Port | TCP or UDP |
|---|---|---|
| FTP data | 20 | TCP |
| FTP control | 21 | TCP |
| SSH, SCP, SFTP | 22 | TCP |
| Telnet | 23 | TCP |
| SMTP | 25 | TCP |
| DNS | 53 | UDP, and TCP for large replies |
| DHCP server | 67 | UDP |
| DHCP client | 68 | UDP |
| TFTP | 69 | UDP |
| HTTP | 80 | TCP |
| POP3 | 110 | TCP |
| NTP | 123 | UDP |
| IMAP | 143 | TCP |
| SNMP | 161 | UDP |
| SNMP traps | 162 | UDP |
| HTTPS | 443 | TCP |
| Syslog | 514 | UDP |
| RADIUS | 1812 and 1813 | UDP |
| TACACS+ | 49 | TCP |
| CAPWAP | 5246 and 5247 | UDP |
| RDP | 3389 | TCP |

## Administrative distance

| Route source | AD |
|---|---|
| Connected | 0 |
| Static | 1 |
| eBGP | 20 |
| Internal EIGRP | 90 |
| OSPF | 110 |
| RIP | 120 |
| External EIGRP | 170 |
| iBGP | 200 |
| Unknown or unusable | 255 |

## Multicast addresses

| Address | Used by |
|---|---|
| 224.0.0.1 | All hosts on the link |
| 224.0.0.2 | All routers, and HSRP version 1 |
| 224.0.0.5 | All OSPF routers |
| 224.0.0.6 | OSPF DR and BDR |
| 224.0.0.10 | EIGRP |
| 224.0.0.18 | VRRP |
| 224.0.0.102 | HSRP version 2 |
| FF02::1 | All IPv6 nodes |
| FF02::2 | All IPv6 routers |
| FF02::5 | All OSPFv3 routers |

## Default timers

| Timer | Default |
|---|---|
| OSPF hello on Ethernet | 10 seconds |
| OSPF dead on Ethernet | 40 seconds |
| HSRP hello | 3 seconds |
| HSRP hold | 10 seconds |
| STP hello | 2 seconds |
| STP forward delay | 15 seconds |
| STP max age | 20 seconds |
| CDP send | 60 seconds |
| CDP hold | 180 seconds |
| LLDP send | 30 seconds |
| LLDP hold | 120 seconds |
| MAC address table aging | 300 seconds |
| ARP cache on a Cisco router | 4 hours |

## Number ranges

| Thing | Range |
|---|---|
| Standard ACL numbers | 1 to 99, and 1300 to 1999 |
| Extended ACL numbers | 100 to 199, and 2000 to 2699 |
| Normal VLANs | 1 to 1005 |
| Extended VLANs | 1006 to 4094 |
| STP priority | 0 to 61440, in steps of 4096 |
| OSPF priority | 0 to 255. 0 never becomes DR. |
| HSRP priority | 0 to 255. The default is 100. |
| Syslog levels | 0, emergency, to 7, debugging |
