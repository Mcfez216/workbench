---
tags: [ccna, hub, gates]
---
# CCNA Phase Gates

> [!abstract] Why this matters
> A gate is a short, honest check before you move on. Can you answer these, and do the task, without looking? If yes, take the rank. If not, the linked note has the answer. There are no marks and no timer.

## Gate 0

> [!question]- Name the IOS modes from user EXEC to interface configuration, with the prompt for each.
> User EXEC is Router>. Privileged EXEC is Router#. Global configuration is Router(config)#. Interface configuration is Router(config-if)#. See [[0.3 The Cisco IOS Command Line]].

**Task:** from a blank workspace, connect two PCs through a router and make them ping each other.

> [!rank] Cable Runner
> You can build a network in Packet Tracer and configure a device from its command line.

## Gate 1

> [!question]- What are the network, broadcast and usable range of 10.20.30.140/27?
> The network is 10.20.30.128, the broadcast is 10.20.30.159, and the usable hosts are 10.20.30.129 to 10.20.30.158. See [[1.04 Subnetting]].

> [!question]- Shorten 2001:0db8:0000:0000:0001:0000:0000:0010.
> 2001:db8::1:0:0:10. The first run of zeros is the same length as the second, so the first is shortened. See [[1.05 IPv6 Addressing]].

> [!question]- What does a switch do with a frame whose destination MAC isn't in its table?
> It floods the frame out of every port in that VLAN except the one it came in on. See [[1.07 How Switches Learn - MAC Addresses and ARP]].

> [!question]- What happens to the IP and MAC addresses as a packet crosses a router?
> The IP addresses stay the same and the MAC addresses change at every hop. See [[1.07 How Switches Learn - MAC Addresses and ARP]].

**Task:** split 172.16.0.0/24 with VLSM for 60, 28 and 12 hosts and two router links. Then build it.

## Gate 2

> [!question]- Two switches are connected, but VLAN 20 doesn't work across the link while VLAN 10 does. What do you check?
> Check that VLAN 20 exists on both switches, that the link is a trunk, and that VLAN 20 is in the trunk's allowed list, with show vlan brief and show interfaces trunk. See [[2.02 Trunks and 802.1Q]].

> [!question]- How is the STP root bridge chosen, and how do you choose it yourself?
> The lowest bridge ID wins, which is the priority then the MAC address. You choose it with spanning-tree vlan X root primary, or by setting a lower priority. See [[2.04 Spanning Tree Protocol]].

> [!question]- Which pairs of LACP modes form an EtherChannel?
> Active with active, and active with passive. Passive with passive does not form one. See [[2.05 EtherChannel]].

**Task:** two switches, two VLANs, a trunk, and a Layer 3 switch routing between the VLANs.

> [!rank] Switch Tech
> You can build and fix a switched network with VLANs, trunks and spanning tree.

## Gate 3

> [!question]- A router has routes to 10.0.0.0/8 by static route and 10.1.0.0/16 by OSPF. Which does 10.1.5.5 use, and why?
> It uses the OSPF route to 10.1.0.0/16, because the longest prefix match is checked before administrative distance. See [[3.01 The Routing Table]].

> [!question]- Name five things that stop two routers becoming OSPF neighbours.
> A different area, a different subnet, different hello or dead timers, a passive interface, and the same router ID on both. Mismatched authentication also stops it. See [[3.03 OSPF Single Area]].

> [!question]- How do you make a static route that's only used if OSPF loses its route?
> Give the static route an administrative distance above 110, for example ip route 10.2.0.0 255.255.0.0 10.0.99.2 130. See [[3.02 Static Routes]].

**Task:** three routers in OSPF area 0 with a default route shared from one of them, and HSRP on one LAN.

> [!rank] Router Tech
> You can route between networks with static routes and OSPF, and find out why a route is missing.

## Gate 4

> [!question]- PCs in VLAN 20 get 169.254 addresses, but VLAN 10 works. The DHCP server is on another network. What's the likely cause?
> The VLAN 20 gateway interface is missing ip helper-address pointing at the DHCP server. See [[4.01 DHCP]].

> [!question]- Explain inside local and inside global.
> Inside local is the real private address of an inside device. Inside global is the public address it appears as on the outside. See [[4.02 NAT and PAT]].

> [!question]- What are the four things SSH needs on a Cisco device?
> A hostname, a domain name, RSA keys and a user account, with the VTY lines set to login local and transport input ssh. See [[4.04 Remote Access with SSH]].

**Task:** an office network with DHCP, PAT to an internet router, NTP, syslog and SSH.

> [!rank] Network Tech
> You can run the services a small office needs.

## Gate 5

> [!question]- Where do standard and extended ACLs go, and why?
> Standard ACLs go close to the destination because they only check the source. Extended ACLs go close to the source because they can match the destination exactly. See [[5.02 Standard ACLs]] and [[5.03 Extended ACLs]].

> [!question]- What are the port security violation modes, and what does each one do?
> Protect drops bad frames silently. Restrict drops them and logs and counts them. Shutdown, the default, puts the port in err-disabled. See [[5.04 Port Security]].

> [!question]- What does DHCP snooping drop on an untrusted port?
> It drops DHCP server messages, Offer and Acknowledge, because they can only come from a rogue server. See [[5.05 DHCP Snooping and Dynamic ARP Inspection]].

**Task:** do capstone L04 from [[Labs/Capstone Labs]].

## Gate 6

> [!question]- What do the northbound and southbound APIs connect?
> The northbound API connects the controller to the programs above it. The southbound API connects the controller to the network devices below it. See [[6.01 SDN and Controllers]].

> [!question]- What does HTTP 401 mean, and how is it different from 403?
> 401 means you are not authenticated. 403 means you are authenticated but not allowed to do that. See [[6.02 REST APIs and JSON]].

> [!question]- How is Ansible different from Puppet?
> Ansible is agentless and pushes changes over SSH, using YAML playbooks. Puppet uses an agent on each device that pulls its configuration from a server. See [[6.03 Configuration Management Tools]].

> [!rank] Network Engineer
> You know every CCNA topic. Now book the exam, and use [[CCNA Exam Checklist]] for the last weeks.
