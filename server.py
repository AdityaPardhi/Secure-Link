"""
SecureLink — server.py
Flask + SocketIO server for the Secure LAN Communication System.

Fixes applied:
  #1  — SECRET_KEY generated at startup, not hardcoded
  #2  — Session password hashed with SHA-256; only hashes compared
  #4  — 500-character message size limit
  #5  — Username uniqueness enforced before approval
  #7  — Per-user 500 ms message rate limit
  #9  — Reliable LAN IP detection via UDP probe
  #11 — Dead commented-out code removed
  #13 — logging used throughout instead of print()
"""

import os
import secrets
import hashlib
import logging
import threading
import time
import uuid
from datetime import datetime
import socket

from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, disconnect

import modules.network_monitor as monitor
from modules.security       import security
from modules.session_manager import sessions

# =========================================
# 🪵 LOGGING SETUP  (fix #13)
# =========================================

logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# =========================================
# 🔐 APP + SECRET KEY  (fix #1)
# =========================================

app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", secrets.token_hex(32))

socketio = SocketIO(app, async_mode="threading")

# =========================================
# 🔐 SESSION INITIALIZATION  (fix #2, #9)
# =========================================

logger.info("=== SECURE LAN SERVER INITIALIZING ===")

_raw_password = input("Set session access key: ").strip()

if not _raw_password:
    logger.error("Access key cannot be empty. Exiting.")
    raise SystemExit(1)

# Store only the hash — never the plaintext (fix #2)
SESSION_PASSWORD_HASH = hashlib.sha256(_raw_password.encode()).hexdigest()
del _raw_password  # remove plaintext from memory immediately

# Reliable LAN IP detection (fix #9)
try:
    _s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    _s.connect(("8.8.8.8", 80))
    server_ip = _s.getsockname()[0]
    _s.close()
except OSError:
    server_ip = socket.gethostbyname(socket.gethostname())

logger.info("Session access key set successfully.")
logger.info("Server running on: %s", server_ip)
logger.info("Waiting for users...\n")

# ─── Rate limiter (fix #7) ────────────────────────────────────
_last_message_time: dict = {}
_MESSAGE_COOLDOWN = 0.5
_MAX_MESSAGE_LEN  = 500

# Admin session tracking
_admin_sid: str | None = None


# =========================================
# 📊 LIVE STATS BROADCASTER
# =========================================

def _broadcast_stats():
    """Background thread: pushes live network stats to all clients every 2 s."""
    while True:
        time.sleep(2)
        stats = monitor.get_stats()
        stats["users"] = sessions.count()
        socketio.emit("stats_update", stats)

threading.Thread(target=_broadcast_stats, daemon=True).start()


# =========================================
# ROUTE
# =========================================

@app.route("/")
def index():
    return render_template("index.html")


# =========================================
# 🔐 JOIN HANDLER  (fixes #2, #5)
# =========================================

@socketio.on("join_request")
def handle_join(data):

    username  = data.get("username", "").strip()
    password  = data.get("password", "").strip()
    sid       = request.sid
    client_ip = request.remote_addr
    current_time = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

    # ── Blocked IP ────────────────────────────────────────────
    if security.is_blocked(client_ip):
        emit("rejected", {"reason": "IP blocked due to multiple failed attempts"}, room=sid)
        disconnect(sid)
        logger.warning("Blocked IP attempted: %s", client_ip)
        return

    # ── IP whitelist ──────────────────────────────────────────
    if not security.is_allowed(client_ip):
        emit("rejected", {"reason": "IP not authorized"}, room=sid)
        disconnect(sid)
        logger.warning("Unauthorized IP: %s", client_ip)
        return

    # ── Username required ─────────────────────────────────────
    if not username:
        emit("rejected", {"reason": "Username required"}, room=sid)
        disconnect(sid)
        return

    # ── Password check — compare hashes only (fix #2) ─────────
    incoming_hash = hashlib.sha256(password.encode()).hexdigest()
    if incoming_hash != SESSION_PASSWORD_HASH:

        count = security.record_failure(client_ip)

        logger.warning(
            "UNAUTHORIZED ACCESS ATTEMPT | user=%s ip=%s time=%s attempt=%d",
            username, client_ip, current_time, count,
        )

        emit("rejected", {"reason": "Invalid access key"}, room=sid)
        return

    # Reset failure counter on correct password
    security.clear_failures(client_ip)

    # ── Username uniqueness (fix #5) ──────────────────────────
    if sessions.username_taken(username):
        emit("rejected", {"reason": "Username already taken"}, room=sid)
        return

    logger.info("Join request from: %s | IP: %s", username, client_ip)
    decision = input("Approve this user? (y/n): ")

    if decision.lower() == "y":

        sessions.add(sid, username, client_ip)
        emit("approved", room=sid)

        # First approved user becomes admin
        global _admin_sid
        if _admin_sid is None:
            _admin_sid = sid
            emit("admin_assigned", {"username": username}, room=sid)
            logger.info("Admin role assigned to: %s", username)

        socketio.emit("update_users", sessions.all_users_info())
        socketio.emit("system_message", f"{username} joined the secure session.")
        logger.info("%s approved.", username)

    else:

        emit("rejected", {"reason": "Admin rejected"}, room=sid)
        disconnect(sid)

        logger.info("%s rejected.", username)


# =========================================
# 💬 MESSAGE HANDLER  (fixes #4, #7)
# =========================================

@socketio.on("send_message")
def handle_message(data):

    sid = request.sid

    # ── Rate limit (fix #7) ───────────────────────────────────
    now = time.time()
    if now - _last_message_time.get(sid, 0) < _MESSAGE_COOLDOWN:
        return
    _last_message_time[sid] = now

    message = data.get("message", "").strip()

    if not message:
        return

    # ── Size limit (fix #4) ───────────────────────────────────
    if len(message) > _MAX_MESSAGE_LEN:
        emit("error", {"reason": f"Message exceeds {_MAX_MESSAGE_LEN} character limit."})
        return

    username  = sessions.get_username(sid) or "Unknown"
    packet_id = monitor.increment_stats(len(message.encode()))
    msg_id    = str(uuid.uuid4())

    socketio.emit("receive_message", {
        "username": username,
        "message":  f"[Packet {packet_id}] {message}",
        "id":       msg_id,
    })

    # ⏳ Auto-delete after 10 seconds
    def delete_message(mid):
        time.sleep(10)
        socketio.emit("delete_message", mid)

    threading.Thread(target=delete_message, args=(msg_id,), daemon=True).start()


# =========================================
# 🛡️ ADMIN CONTROLS
# =========================================

@socketio.on("kick_user")
def handle_kick(data):
    global _admin_sid
    if request.sid != _admin_sid:
        return
    username   = data.get("username", "").strip()
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid or target_sid == _admin_sid:
        return
    socketio.emit("kicked", {"reason": "Removed by admin."}, room=target_sid)
    sessions.remove(target_sid)
    disconnect(target_sid)
    socketio.emit("update_users", sessions.all_users_info())
    socketio.emit("system_message", f"⚠ {username} was kicked by admin.")
    logger.info("Admin kicked: %s", username)


@socketio.on("block_user")
def handle_block(data):
    global _admin_sid
    if request.sid != _admin_sid:
        return
    username   = data.get("username", "").strip()
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid or target_sid == _admin_sid:
        return
    ip = sessions.get_ip(target_sid)
    security.block_ip(ip)
    socketio.emit("kicked", {"reason": "Blocked by admin."}, room=target_sid)
    sessions.remove(target_sid)
    disconnect(target_sid)
    socketio.emit("update_users", sessions.all_users_info())
    socketio.emit("system_message", f"🚫 {username} ({ip}) has been blocked.")
    logger.info("Admin blocked: %s @ %s", username, ip)


@socketio.on("broadcast_alert")
def handle_alert(data):
    if request.sid != _admin_sid:
        return
    message = data.get("message", "").strip()
    if not message:
        return
    socketio.emit("security_alert", {"message": message})
    logger.info("Admin broadcast alert: %s", message)


# =========================================
# 🔄 DISCONNECT HANDLER
# =========================================

@socketio.on("disconnect")
def handle_disconnect():

    sid  = request.sid
    user = sessions.remove(sid)

    # Clean up rate-limiter entry
    _last_message_time.pop(sid, None)

    if user:
        socketio.emit("update_users", sessions.all_users_info())
        socketio.emit("system_message", f"{user} left the secure session.")
        logger.info("%s disconnected", user)

    # If admin disconnects, terminate the whole session
    global _admin_sid
    if sid == _admin_sid:
        _admin_sid = None
        logger.warning("Admin disconnected — session terminated.")
        socketio.emit("session_terminated", {
            "reason": "Admin has disconnected. Session terminated."
        })



# =========================================
# 🚀 START SERVER
# =========================================

if __name__ == "__main__":

    try:
        socketio.run(app, host="0.0.0.0", port=5000)
    finally:
        monitor.generate_report(server_ip)