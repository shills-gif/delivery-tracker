# Van Map — Private Travel Tracker (Raspberry Pi + Dawarich)

## Overview

**Van Map** is a private, self-hosted travel tracking system designed to record, visualise, and share travel location history with family members in a secure and controlled way.

The system runs entirely on a **Raspberry Pi** and uses **Dawarich** to provide maps, timelines, trips, and analytics.  
Access is restricted via **Tailscale**, meaning nothing is exposed to the public internet.

This project is being built incrementally, with an emphasis on:
- Privacy by default
- Reproducibility
- Clear operational understanding (not “magic” setup)
- Low maintenance while travelling

---

## High-Level Architecture

Phone / Laptop  
→ Encrypted Tailscale mesh VPN  
→ Raspberry Pi (van-map)  
→ Docker  
→ Dawarich + Postgres/PostGIS  

---

## Core Components

### Hardware
- Raspberry Pi (arm64)
- microSD storage (~117 GB usable)

### Software Stack
- OS: Debian GNU/Linux 12 (Bookworm, 64-bit)
- Containerisation: Docker + Docker Compose v2
- Application: Dawarich
- Database: PostgreSQL + PostGIS
- Networking: Tailscale with MagicDNS

---

## Project Goals

- Track current and historical location privately
- Visualise routes, stops, trips, and statistics
- Import historical data (Google Timeline, GPX, etc.)
- Allow family access without public exposure
- Maintain full ownership of location data

---

## Security & Privacy Model

- No public ports exposed
- No router port forwarding
- Access only via Tailscale tailnet
- Device-level authentication
- SSH and web access restricted to approved devices

---

## Current Status

### Module 1 — Pi Readiness
- Debian 12 (arm64) installed and updated
- Timezone and locale configured
- Hostname set
- Disk, memory, temperature verified
- Log growth limited
- Preflight snapshot saved

### Module 2 — Docker & Compose
- Docker Engine installed and enabled
- Docker Compose v2 installed
- Logging limits configured
- Test containers verified

### Module 3 — Tailscale & MagicDNS
- Tailscale installed and enabled
- Pi joined to tailnet
- Friendly hostname assigned (van-map)
- MagicDNS enabled
- SSH connectivity verified
- Stale device records resolved

---

## Known Caveats

- Stale Tailscale device records can cause hostname conflicts
- ICMP ping is not reliable for connectivity testing
- Tailscale ACL syntax differs between classic ACLs and grants

---

## Next Steps

- Module 4: Project scaffold (folders, env files)
- Module 5: Dawarich + Postgres/PostGIS deployment
- Enable weather overlays and data imports

---

## Access (once deployed)

http://van-map.<tailnet>.ts.net:3000

---

## Philosophy

Privacy-first, reproducible, and understandable infrastructure.
