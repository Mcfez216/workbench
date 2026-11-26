---
tags: [ccna, cheatsheet, ios]
---
# Cheat Sheet - IOS Commands

> [!abstract] Why this matters
> These are the commands you'll type most, grouped by topic. In an exam lab there's no time to look things up, so the first column is what to do and the second is the command. Every row is a flashcard.

## Moving around

| Task | Command |
|---|---|
| Go to privileged EXEC | `enable` |
| Go to global configuration | `configure terminal` |
| Configure one interface | `interface g0/0` |
| Configure many interfaces | `interface range fa0/1 - 12` |
| Go back to privileged EXEC | `end`, or Ctrl+Z |
| Run a show command from config mode | `do show ip interface brief` |
| Save the configuration | `copy running-config startup-config` |
| Stop typos being looked up in DNS | `no ip domain-lookup` |
| Stop messages breaking your typing | `logging synchronous`, under the line |

## Checking

| Task | Command |
|---|---|
| A summary of every interface | `show ip interface brief` |
| Errors, speed and duplex | `show interfaces g0/0` |
| The routing table | `show ip route` |
| Which route one address uses | `show ip route 10.1.1.5` |
| VLANs and their ports | `show vlan brief` |
| Trunks | `show interfaces trunk` |
| MAC address table | `show mac address-table` |
| ARP table | `show ip arp` |
| Spanning tree | `show spanning-tree` |
| EtherChannels | `show etherchannel summary` |
| Directly connected Cisco neighbours | `show cdp neighbors detail` |
| OSPF neighbours | `show ip ospf neighbor` |
| OSPF interfaces and costs | `show ip ospf interface brief` |
| Routing protocols running | `show ip protocols` |
| HSRP | `show standby brief` |
| DHCP leases given out | `show ip dhcp binding` |
| NAT translations | `show ip nat translations` |
| ACLs and their hit counts | `show access-lists` |
| Port security | `show port-security interface fa0/1` |
| NTP | `show ntp status` |
| IPv6 interfaces | `show ipv6 interface brief` |
| IPv6 routes | `show ipv6 route` |

## Switching

| Task | Command |
|---|---|
| Create and name a VLAN | `vlan 10`, then `name SALES` |
| Make an access port | `switchport mode access`, `switchport access vlan 10` |
| Add a voice VLAN | `switchport voice vlan 150` |
| Make a trunk | `switchport mode trunk` |
| Set the native VLAN | `switchport trunk native vlan 999` |
| Add a VLAN to a trunk | `switchport trunk allowed vlan add 30` |
| Turn off DTP | `switchport nonegotiate` |
| Rapid spanning tree | `spanning-tree mode rapid-pvst` |
| Make a switch the root | `spanning-tree vlan 10 root primary` |
| PortFast and BPDU Guard | `spanning-tree portfast`, `spanning-tree bpduguard enable` |
| LACP EtherChannel | `channel-group 1 mode active` |
| Turn on LLDP | `lldp run` |
| Management address on a switch | `interface vlan 99`, `ip address ...`, `ip default-gateway ...` |

## Routing

| Task | Command |
|---|---|
| Static route | `ip route 10.2.2.0 255.255.255.0 10.0.12.2` |
| Default route | `ip route 0.0.0.0 0.0.0.0 203.0.113.1` |
| Floating static route | `ip route 0.0.0.0 0.0.0.0 198.51.100.1 5` |
| Turn on IPv6 routing | `ipv6 unicast-routing` |
| IPv6 default route | `ipv6 route ::/0 2001:db8:12::2` |
| Start OSPF | `router ospf 1`, `router-id 1.1.1.1` |
| Add networks to OSPF | `network 10.1.1.0 0.0.0.255 area 0` |
| OSPF on one interface | `ip ospf 1 area 0`, under the interface |
| No OSPF Hellos on a LAN port | `passive-interface g0/0` |
| Share the default route in OSPF | `default-information originate` |
| Router on a stick subinterface | `interface g0/0.10`, `encapsulation dot1Q 10` |
| Routing on a Layer 3 switch | `ip routing` |
| Routed port on a Layer 3 switch | `no switchport` |
| HSRP | `standby 1 ip 10.0.0.1`, `standby 1 priority 110`, `standby 1 preempt` |

## Services

| Task | Command |
|---|---|
| Exclude addresses from DHCP | `ip dhcp excluded-address 10.0.0.1 10.0.0.10` |
| A DHCP pool | `ip dhcp pool LAN`, `network ...`, `default-router ...`, `dns-server ...` |
| DHCP relay | `ip helper-address 10.0.0.50` |
| Mark the NAT sides | `ip nat inside`, `ip nat outside` |
| PAT | `ip nat inside source list 1 interface g0/1 overload` |
| Static NAT | `ip nat inside source static 192.168.1.100 203.0.113.10` |
| NTP client | `ntp server 10.0.0.1` |
| Send syslog to a server | `logging host 10.0.0.60` |
| Choose the syslog level | `logging trap warnings` |
| Timestamps on logs | `service timestamps log datetime msec` |
| Back up to TFTP | `copy running-config tftp:` |

## Security

| Task | Command |
|---|---|
| Privileged password | `enable secret ...` |
| Hide plain-text passwords | `service password-encryption` |
| Local user | `username admin secret ...` |
| SSH | `ip domain-name ...`, `crypto key generate rsa`, `ip ssh version 2` |
| SSH only on the VTY lines | `login local`, `transport input ssh` |
| Limit who can SSH | `access-class 5 in`, under the VTY lines |
| Apply an ACL to an interface | `ip access-group NAME in` |
| Port security | `switchport port-security`, `maximum 2`, `mac-address sticky`, `violation restrict` |
| DHCP snooping | `ip dhcp snooping`, `ip dhcp snooping vlan 10`, `ip dhcp snooping trust` |
| Dynamic ARP Inspection | `ip arp inspection vlan 10`, `ip arp inspection trust` |
| Login banner | `banner motd # text #` |
