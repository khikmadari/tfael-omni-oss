#!/bin/bash
set -a
source .env
set +a
python3 backend/server.py 8080
