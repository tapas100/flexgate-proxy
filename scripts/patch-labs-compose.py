#!/usr/bin/env python3
"""
patch-labs-compose.py
Reads flexgate-labs/podman-compose.services.yml, adds the flexgate-ci
bridge network to every service, rewrites relative build context paths
to absolute paths (so the output file can live at /tmp without breaking
Containerfile lookups), and writes the result to a separate output file.

The original tracked file is NEVER modified — avoids git pull conflicts.

Usage:
    python3 scripts/patch-labs-compose.py <input-compose> [output-compose]

    input-compose   path to the original podman-compose.services.yml
    output-compose  where to write the patched version
                    (default: /tmp/podman-compose.services.ci.yml)
"""
import sys
import re
import os

if len(sys.argv) < 2:
    print("Usage: patch-labs-compose.py <input-compose> [output-compose]")
    sys.exit(1)

input_path  = os.path.abspath(sys.argv[1])
output_path = sys.argv[2] if len(sys.argv) > 2 else "/tmp/podman-compose.services.ci.yml"
labs_dir    = os.path.dirname(input_path)

with open(input_path, "r") as f:
    content = f.read()

# Rewrite relative build context paths to absolute so the compose file
# can live anywhere (e.g. /tmp) and still find the Containerfiles.
# Matches lines like:  context: ./services/api-users
def make_context_absolute(m):
    rel = m.group(1)
    abs_path = os.path.normpath(os.path.join(labs_dir, rel))
    return "context: " + abs_path

content = re.sub(r'context:\s*(\./\S+)', make_context_absolute, content)

# Add "networks: [flexgate-ci]" after every "container_name:" line
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
