#!/usr/bin/env python3
"""
patch-labs-compose.py
Reads flexgate-labs/podman-compose.services.yml, adds the flexgate-ci
bridge network to every service, and writes the result to a SEPARATE
output file (default: /tmp/podman-compose.services.ci.yml) so the
original tracked file is never modified (avoids git pull conflicts).

Usage:
    python3 scripts/patch-labs-compose.py <input-compose> [output-compose]

    input-compose   path to the original podman-compose.services.yml
    output-compose  where to write the patched version
                    (default: /tmp/podman-compose.services.ci.yml)
"""
import sys
import re

if len(sys.argv) < 2:
    print("Usage: patch-labs-compose.py <input-compose> [output-compose]")
    sys.exit(1)

input_path  = sys.argv[1]
output_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/podman-compose.services.ci.yml"

with open(input_path, "r") as f:
    content = f.read()

# Add "networks: [flexgate-ci]" after every "container_name:" line if not already there
if "flexgate-ci" not in content:
    content = re.sub(
        r'(container_name:\s*\S+)',
        r'\1\n    networks: [flexgate-ci]',
        content
    )
    content += "\nnetworks:\n  flexgate-ci:\n    external: true\n"
    print("  Patched: added flexgate-ci network")
else:
    print("  flexgate-ci already present, copying as-is")

with open(output_path, "w") as f:
    f.write(content)

print("  Written to: " + output_path)
