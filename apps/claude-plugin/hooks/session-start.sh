#!/bin/sh
# Claude Code SessionStart hook → th0th observation (event: session-start).
# Wire in .claude/settings.json under hooks.SessionStart.
EVENT="session-start"
. "$(dirname "$0")/_post.sh"
