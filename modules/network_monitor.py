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

# New counters for file transfers
_total_files    = 0
_total_file_bytes = 0
_image_files    = 0
_pdf_files      = 0
_other_files    = 0


# ─── Public API ───────────────────────────────────────────────

def increment_stats(byte_count: int) -> int:
    """
    Thread-safely increment all counters for a generic message.
    Returns the packet ID assigned to this message (fix #12).
    """
    global _total_messages, _total_bytes, _packet_counter
    with _lock:
        _total_messages += 1
        _total_bytes    += byte_count
        _packet_counter += 1
        return _packet_counter

def increment_file_stats(byte_count: int, file_type: str = "") -> None:
    """Thread‑safe increment for file transfer stats (separate from generic messages)."""
    global _total_files, _total_file_bytes, _image_files, _pdf_files, _other_files
    with _lock:
        _total_files += 1
        _total_file_bytes += byte_count
        
        # Categorize by mime type
        mime = file_type.lower()
        if mime.startswith("image/"):
            _image_files += 1
        elif "pdf" in mime:
            _pdf_files += 1
        else:
            _other_files += 1


def get_stats() -> dict:
    """Return a live snapshot of all network stats (thread-safe)."""
    with _lock:
        elapsed    = time.time() - _session_start
        throughput = _total_bytes / elapsed if elapsed > 0 else 0
        return {
            "messages":   _total_messages,
            "bytes":      _total_bytes,
            "packets":    _packet_counter,
            "files":      _total_files,
            "file_bytes": _total_file_bytes,
            "uptime":     int(elapsed),        # seconds
            "throughput": round(throughput, 2), # bytes/sec
        }



def format_bytes(size: float) -> str:
    """Convert bytes to human-readable string (KB, MB, etc.)."""
    for unit in ["B", "KB", "MB", "GB", "TB"]:
        if size < 1024.0:
            return f"{size:.1f} {unit}".replace(".0 ", " ")
        size /= 1024.0
    return f"{size:.1f} PB"

def generate_report(server_ip: str):
    """Print and save the end-of-session network report (fix #13)."""
    with _lock:
        end_time   = time.time()
        duration   = end_time - _session_start
        total_all_bytes = _total_bytes + _total_file_bytes
        throughput = total_all_bytes / duration if duration > 0 else 0

        report = (
            "\n=============================="
            "\n SECURE SESSION REPORT"
            "\n=============================="
            f"\nServer IP               : {server_ip}"
            f"\nSession Duration        : {int(duration)} seconds"
            "\n"
            f"\nTotal Messages Sent     : {_total_messages}"
            f"\nTotal Files Sent        : {_total_files}"
            "\n"
            "\nFile Statistics"
            "\n----------------"
            f"\nImages Sent             : {_image_files}"
            f"\nPDFs Sent               : {_pdf_files}"
            f"\nOther Files             : {_other_files}"
            "\n"
            f"\nTotal Data Transferred  : {format_bytes(total_all_bytes)}"
            f"\nAverage Throughput      : {format_bytes(throughput)}/s"
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