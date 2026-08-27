#!/bin/sh
set -e
# Sourced (not executed) by docker-entrypoint.sh — `. ./scripts/fetch-secrets.sh`
# — so the `export`s below land in the entrypoint's own shell and are
# inherited by `exec npm run start:prod` at the end of it. Running this
# file directly (`./fetch-secrets.sh`) would only export into a
# throwaway subshell and do nothing useful.
#
# Deliberately not using `dirname "$0"` to locate fetch-secrets.mjs —
# when this file is *sourced* (not executed), $0 is the invoking shell's
# own name/path (e.g. "sh"), not this script's path, in every POSIX shell
# except bash (which supports $BASH_SOURCE for exactly this, but this
# needs to run under the container's plain /bin/sh). Assumes the caller's
# cwd is the app's WORKDIR, same as docker-entrypoint.sh always runs from.
eval "$(node ./scripts/fetch-secrets.mjs)"
