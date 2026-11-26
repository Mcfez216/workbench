---
tags: [ccna, labs, projects]
---
# Capstone Labs

> [!abstract] Why this matters
> The notes walk you through each topic in steps. Real work, and the exam's lab questions, give you a short brief and no steps. These labs join many topics in one network. If you can build them from a blank workspace, you're ready.

## How to do a capstone

1. Read the brief. Draw the network on paper first, with every address.
2. Build it in a new, empty Packet Tracer file.
3. Don't look at the notes unless you're stuck for more than 15 minutes. Then look, and write down what you looked up.
4. Check every item in **Done when**.
5. Save it, close it, and a week later rebuild it from scratch. Faster the second time means you've learned it.

| Lab | What you'll use | When to do it |
|---|---|---|
| L01 Small Office | VLANs, trunk, router on a stick, DHCP, NAT | After Phase 4 |
| L02 Campus | Layer 3 switch, STP, EtherChannel, HSRP, OSPF | After Phase 3 |
| L03 Two Sites | OSPF, static default, NAT, IPv6 | After Phase 4 |
| L04 Locked Down | SSH, ACLs, port security, DHCP snooping, syslog, NTP | After Phase 5 |
| L05 Fix It | Troubleshooting a network someone else broke | After Phase 5 |

## L01 Small Office

**Brief.** One router, one switch. Staff in VLAN 10, guests in VLAN 20, printers in VLAN 30. You have `192.168.0.0/24` to split. Staff need 100 addresses, guests 50, printers 10. Everyone gets addresses by DHCP, except the printers. Everyone can reach the internet through PAT. Guests can't reach staff or printers.

**Done when:**
- [ ] Your VLSM plan has no overlaps.
- [ ] Every staff and guest PC gets the right address by DHCP.
- [ ] Every PC can ping a server on the "internet" router.
- [ ] A guest PC can't ping a staff PC or a printer.
- [ ] `show ip nat translations` shows PAT working.

## L02 Campus

**Brief.** Two 3560 distribution switches, DS1 and DS2, joined by a 2-link LACP EtherChannel trunk. Two 2960 access switches, each with uplinks to both DS1 and DS2. VLANs 10 and 20. DS1 is the STP root for VLAN 10, and DS2 for VLAN 20. Both distribution switches are gateways, sharing the address with HSRP. DS1 is active for VLAN 10, DS2 for VLAN 20. Both run OSPF to a core router.

**Done when:**
- [ ] `show etherchannel summary` shows `Po1(SU)` with both ports `P`.
- [ ] `show spanning-tree vlan 10` shows DS1 as root, and `vlan 20` shows DS2.
- [ ] `show standby brief` shows the active and standby routers as planned.
- [ ] Shutting down DS1 keeps VLAN 10 PCs working, after a short pause.
- [ ] The core router learns both VLANs through OSPF.

## L03 Two Sites

**Brief.** Two offices, each with a router and a LAN, plus an ISP router. The offices are joined by a direct link and both connect to the ISP. They run OSPF area 0 between them. Only office A connects to the internet. It shares its default route into OSPF. Every LAN and link also has IPv6, with static IPv6 routes.

**Done when:**
- [ ] `show ip ospf neighbor` is FULL on both offices.
- [ ] Office B has an `O*E2` default route.
- [ ] A PC in office B can reach the internet server through office A's NAT.
- [ ] IPv6 pings work between both LANs.

## L04 Locked Down

**Brief.** Take your L01 network and secure it.

**Done when:**
- [ ] Every device has `enable secret`, a banner, and SSH version 2 only, with local users.
- [ ] Only staff can SSH to the devices. Use a VTY access-class.
- [ ] Every access port has port security, with sticky MAC and restrict.
- [ ] Unused ports are shut down and put in an unused VLAN.
- [ ] DHCP snooping is on, and a fake DHCP server on a guest port gets no clients.
- [ ] Every device sends syslog and takes its time from NTP on one server.
- [ ] An extended ACL lets guests use only web and DNS.

## L05 Fix It

**Brief.** Ask a study partner to take one of your capstones and make five faults in it, without telling you what they are. Or do it yourself and wait a week. Then fix it.

**Done when:**
- [ ] Everything in the original lab's **Done when** list works again.
- [ ] For each fault, you've written the symptom, the command that showed the cause, and the fix. Use [[Templates/Lab Template]].
