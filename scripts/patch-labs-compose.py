#!/usr/bin/env python3
"""
patch-labs-compose.py
Idempotently patches flexgate-labs/podman-compose.services.yml to join
the flexgate-ci bridge network so containers are reachable from the
Jenkins container by container-name DNS.

Usage:
    python3 scripts/patch-labs-compose.py <path/to/podman-compose.services.yml>
"""
import sys
import re

if len(sys.argv) < 2:
    print("Usage: patch-labs-compose.py <path-to-compose-file>")
    sys.exit(1)

path = sys.argv[1]

with open(path, "r") as f:
    content = f.read()

# Already patched — nothing to do
if "flexgate-ci" in content:
    print("  flexgate-ci network already present, skipping patch")
    sys.exit(0)

# Append the external network declaration at the end of the file
network_block = "\nnetworks:\n  flexgate-ci:\n    external: true\n"
content += network_block

# Add "networks: [flexgate-ci]" after every "container_name:" line
content = re.sub(
    r'(container_name:\s*\S+)',
    r'\1\n    networks: [flexgate-ci]',
    content
)

with open(path, "w") as f:
    f.write(content)

print("  Patched: " + path)
