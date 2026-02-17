#!/bin/sh
# Fix ownership on the mounted volume (Railway mounts volumes as root)
chown -R appuser:appgroup /data

# Drop privileges and run the CMD as appuser
exec su-exec appuser "$@"
