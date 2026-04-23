# =========================================
# 🔐 SECURITY MODULE
# =========================================

"""
SecurityManager — wraps all security state for the
SecureLink LAN Communication System.

Fix #14: class with accessor methods instead of bare mutable globals.
Fix #8:  failed_attempts entry is purged when an IP is blocked (no memory leak).
Fix #13: uses logging instead of print().
"""

import logging

logger = logging.getLogger(__name__)


class SecurityManager:

    def __init__(self):
        # ─── Failed login attempts ────────────────────────────
        # { "192.168.1.10": 2, "192.168.1.15": 1 }
        self._failed: dict = {}

        # ─── Blocked IPs ──────────────────────────────────────
        self._blocked: set = set()

        # ─── Optional IP whitelist ────────────────────────────
        # Empty → all LAN devices allowed
        # Populated → only listed IPs can connect
        self._allowed: list = []

    # ─── Reads ────────────────────────────────────────────────

    def is_blocked(self, ip: str) -> bool:
        return ip in self._blocked

    def is_allowed(self, ip: str) -> bool:
        """True when whitelist is empty (open) OR ip is in the list."""
        return not self._allowed or ip in self._allowed

    def failure_count(self, ip: str) -> int:
        return self._failed.get(ip, 0)

    # ─── Mutations ────────────────────────────────────────────

    def record_failure(self, ip: str) -> int:
        """
        Increment failure count; auto-block at 3 attempts.
        Fix #8: removes failed_attempts entry when blocking.
        Returns current attempt count.
        """
        self._failed[ip] = self._failed.get(ip, 0) + 1
        count = self._failed[ip]
        logger.warning("Failed attempt %d from %s", count, ip)

        if count >= 3:
            self._blocked.add(ip)
            # Fix #8: remove entry to stop dict growing forever
            self._failed.pop(ip, None)
            logger.warning("IP BLOCKED: %s", ip)

        return count

    def clear_failures(self, ip: str):
        """Reset failure count on successful authentication."""
        self._failed.pop(ip, None)

    def add_to_whitelist(self, ip: str):
        if ip not in self._allowed:
            self._allowed.append(ip)

    def unblock(self, ip: str):
        self._blocked.discard(ip)

    def block_ip(self, ip: str):
        """Admin controls: directly block an IP address."""
        if ip:
            self._blocked.add(ip)
            self._failed.pop(ip, None)
            logger.warning("Admin blocked IP: %s", ip)



# ── Module-level singleton ─────────────────────────────────────
security = SecurityManager()