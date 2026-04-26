# =========================================
# 👥 SESSION MANAGER MODULE
# =========================================

"""
SessionManager — wraps all active-user session state for the
SecureLink LAN Communication System.

Fix #14: class with accessor methods instead of bare mutable globals.
Fix #5:  username_taken() enforces uniqueness before approval.
Fix #13: uses logging instead of print().
Change #2: stores client IP address alongside username.
"""

import logging

logger = logging.getLogger(__name__)


class SessionManager:

    def __init__(self):
        # Key: socket session ID
        # Value: {"username": str, "ip": str}
        self._users: dict = {}

    # ─── Reads ────────────────────────────────────────────────

    def get_username(self, sid: str):
        entry = self._users.get(sid)
        return entry["username"] if entry else None

    def username_taken(self, username: str) -> bool:
        """Fix #5: check uniqueness before admitting a user."""
        return any(v["username"] == username for v in self._users.values())

    def all_usernames(self) -> list:
        """Returns plain list of usernames (used internally)."""
        return [v["username"] for v in self._users.values()]

    def all_users_info(self) -> list:
        """Change #2: returns list of {username, ip, role, muted} dicts for the frontend."""
        return [
            {
                "username": v["username"],
                "ip": v["ip"],
                "role": v.get("role", "user"),
                "muted": v.get("muted", False)
            }
            for v in self._users.values()
        ]


    def find_sid_by_username(self, username: str):
        """Admin controls: look up a SID by username."""
        for sid, entry in self._users.items():
            if entry["username"] == username:
                return sid
        return None

    def get_ip(self, sid: str) -> str:
        """Admin controls: return IP for a given SID."""
        entry = self._users.get(sid)
        return entry["ip"] if entry else ""

    def count(self) -> int:
        return len(self._users)

    def get_role(self, sid: str) -> str:
        entry = self._users.get(sid)
        return entry.get("role", "user") if entry else "user"

    def set_role(self, sid: str, role: str):
        if sid in self._users:
            self._users[sid]["role"] = role

    def is_muted(self, sid: str) -> bool:
        entry = self._users.get(sid)
        return entry.get("muted", False) if entry else False

    def set_muted(self, sid: str, muted: bool):
        if sid in self._users:
            self._users[sid]["muted"] = muted


    # ─── Mutations ────────────────────────────────────────────

    def add(self, sid: str, username: str, ip: str = "", role: str = "user"):
        """Change #2: stores IP alongside username. Added role and muted state."""
        self._users[sid] = {"username": username, "ip": ip, "role": role, "muted": False}
        logger.info("User added: %s @ %s (sid=%s) role=%s", username, ip, sid, role)


    def remove(self, sid: str):
        """Remove and return the username for that sid, or None."""
        entry = self._users.pop(sid, None)
        if entry:
            logger.info("User removed: %s (sid=%s)", entry["username"], sid)
            return entry["username"]
        return None


# ── Module-level singleton ─────────────────────────────────────
sessions = SessionManager()
