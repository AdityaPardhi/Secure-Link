# =========================================
# 📊 NETWORK MONITOR MODULE
# =========================================

"""
Thread-safe network statistics tracker.

Fix #12: All counters are protected by threading.Lock to prevent
         race conditions when SocketIO dispatches across threads.
Fix #13: Uses logging instead of print().
"""

import time
import threading
import logging
from datetime import datetime

logger = logging.getLogger(__name__)

# ─── Private state ────────────────────────────────────────────

_lock           = threading.Lock()
_total_messages = 0
_total_bytes    = 0
_packet_counter = 0
_session_start  = time.time()


# ─── Public API ───────────────────────────────────────────────

def increment_stats(byte_count: int) -> int:
    """
    Thread-safely increment all counters.
    Returns the packet ID assigned to this message (fix #12).
    """
    global _total_messages, _total_bytes, _packet_counter
    with _lock:
        _total_messages += 1
        _total_bytes    += byte_count
        _packet_counter += 1
        return _packet_counter


def generate_report(server_ip: str):
    """Print and save the end-of-session network report (fix #13)."""
    with _lock:
        end_time   = time.time()
        duration   = end_time - _session_start
        throughput = _total_bytes / duration if duration > 0 else 0

        report = (
            "\n=============================="
            "\n SECURE SESSION REPORT"
            "\n=============================="
            f"\nServer IP               : {server_ip}"
            f"\nSession Duration        : {round(duration, 2)} seconds"
            f"\nTotal Messages Sent     : {_total_messages}"
            f"\nTotal Data Transferred  : {_total_bytes} bytes"
            f"\nAverage Throughput      : {round(throughput, 2)} bytes/sec"
            f"\nTotal Unique Packets    : {_packet_counter}"
            "\n=============================="
            f"\nSession End Time        : {datetime.now().strftime('%d-%m-%Y %H:%M:%S')}"
            "\n==============================\n"
        )

    logger.info("SECURE SESSION TERMINATED")
    logger.info(report)

    try:
        with open("session.txt", "a") as f:
            f.write(report)
        logger.info("Session report saved to session.txt")
    except OSError as exc:
        logger.error("Could not write session report: %s", exc)