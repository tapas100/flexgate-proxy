#!/bin/bash

# FlexGate - Restart All Services

echo "Restarting FlexGate..."
./scripts/stop-all.sh
sleep 2
./scripts/start-all.sh
