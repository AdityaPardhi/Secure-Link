# =========================================
# 👥 SESSION MANAGER MODULE
# =========================================

"""
SessionManager — wraps all active-user session state for the
SecureLink LAN Communication System.

Fix #14: class with accessor methods instead of bare mutable globals.
Fix #5:  username_taken() enforces uniqueness before approval.
Fix #13: uses logging instead of print().
"""

import logging

logger = logging.getLogger(__name__)


class SessionManager:

    def __init__(self):
        # Key: socket session ID  →  Value: username
        self._users: dict = {}

    # ─── Reads ────────────────────────────────────────────────

    def get_username(self, sid: str):
        return self._users.get(sid)

    def username_taken(self, username: str) -> bool:
        """Fix #5: check uniqueness before admitting a user."""
        return username in self._users.values()

    def all_usernames(self) -> list:
        return list(self._users.values())

    def count(self) -> int:
        return len(self._users)

    # ─── Mutations ────────────────────────────────────────────

    def add(self, sid: str, username: str):
        self._users[sid] = username
        logger.info("User added: %s (sid=%s)", username, sid)

    def remove(self, sid: str):
        """Remove and return the username for that sid, or None."""
        username = self._users.pop(sid, None)
        if username:
            logger.info("User removed: %s (sid=%s)", username, sid)
        return username


# ── Module-level singleton ─────────────────────────────────────
sessions = SessionManager()
