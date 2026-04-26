"""
SecureLink — server.py

Two-URL architecture:
  Users  → http://<LAN_IP>:5000/
  Admin  → http://<LAN_IP>:5000/admin/<ADMIN_TOKEN>  (printed at startup)

No input() anywhere — admin approves/rejects from the browser dashboard.
"""

import os
import secrets
import hashlib
import logging
import threading
import time
import uuid
import random
from datetime import datetime
import socket
import re

from flask import Flask, render_template, request, abort
from flask_socketio import SocketIO, emit, disconnect

import modules.network_monitor as monitor
from modules.security        import security
from modules.session_manager import sessions

# ── Logging ───────────────────────────────────────────────────
logging.basicConfig(
    level=logging.INFO,
    format="%(asctime)s [%(levelname)s] %(message)s",
)
logger = logging.getLogger(__name__)

# ── App ───────────────────────────────────────────────────────
app = Flask(__name__)
app.config["SECRET_KEY"] = os.environ.get("SECRET_KEY", secrets.token_hex(32))
socketio = SocketIO(app, async_mode="threading", max_http_buffer_size=10_000_000)

# ── Session setup ─────────────────────────────────────────────
logger.info("=== SECURE LAN SERVER INITIALIZING ===")

_raw_password = input("Set session access key: ").strip()
if not _raw_password:
    logger.error("Access key cannot be empty. Exiting.")
    raise SystemExit(1)

SESSION_PASSWORD_HASH = hashlib.sha256(_raw_password.encode()).hexdigest()
del _raw_password

# Generate admin token, AES session key, and detect LAN IP
ADMIN_TOKEN = secrets.token_urlsafe(16)
AES_KEY     = secrets.token_hex(32)          # 256-bit key, distributed to approved users

try:
    _s = socket.socket(socket.AF_INET, socket.SOCK_DGRAM)
    _s.connect(("8.8.8.8", 80))
    server_ip = _s.getsockname()[0]
    _s.close()
except OSError:
    server_ip = socket.gethostbyname(socket.gethostname())

logger.info("Access key set. Server IP: %s", server_ip)
logger.info("=" * 50)
logger.info("  USER  URL : http://%s:5000/", server_ip)
logger.info("  ADMIN URL : http://%s:5000/admin/%s", server_ip, ADMIN_TOKEN)
logger.info("=" * 50)

# ── State ─────────────────────────────────────────────────────
_admin_sid:          str | None  = None
_pending:            dict        = {}   # sid → {username, ip, time}
_pending_lock                    = threading.Lock()
_recent_disconnects: dict        = {}   # username → time
_last_message_time:  dict        = {}

_MESSAGE_COOLDOWN                = 0.5
_MAX_MESSAGE_LEN    = 500
_MAX_CIPHERTEXT_LEN = 1500
_MAX_FILE_SIZE      = 5 * 1024 * 1024  # 5 MB plaintext limit
MAX_USERS           = 10

# Per-media-type auto-delete delays (seconds)
_DELETE_DELAYS = {
    'image': 30,
    'audio': 30,
    'other': 30,
    'pdf':   60,
}


# ── Stats broadcaster ─────────────────────────────────────────
def _broadcast_stats():
    while True:
        time.sleep(2)
        stats = monitor.get_stats()
        stats["users"] = sessions.count()
        socketio.emit("stats_update", stats)

threading.Thread(target=_broadcast_stats, daemon=True).start()


def _intrusion_alert(alert_type: str, ip: str, username: str = "", count: int = 0):
    """Push a real-time intrusion event to the admin dashboard."""
    if _admin_sid:
        socketio.emit("intrusion_alert", {
            "type":     alert_type,
            "ip":       ip,
            "username": username,
            "count":    count,
            "time":     datetime.now().strftime("%H:%M:%S"),
        }, room=_admin_sid)
    logger.warning("INTRUSION [%s] ip=%s user=%s attempt=%s", alert_type, ip, username, count)


# =========================================
# ROUTES
# =========================================

@app.route("/")
def index():
    return render_template("index.html")


@app.route("/admin/<token>")
def admin_dashboard(token):
    if token != ADMIN_TOKEN:
        abort(403)
    return render_template("admin.html", token=token, server_ip=server_ip)


# =========================================
# 🔐 JOIN HANDLER
# =========================================

@socketio.on("join_request")
def handle_join(data):
    username  = data.get("username", "").strip()
    password  = data.get("password", "").strip()
    sid       = request.sid
    client_ip = request.remote_addr

    if security.is_blocked(client_ip):
        _intrusion_alert("blocked_ip_retry", client_ip, username)
        emit("rejected", {"reason": "IP blocked due to multiple failed attempts"})
        return

    if not security.is_allowed(client_ip):
        _intrusion_alert("unauthorized_ip", client_ip, username)
        emit("rejected", {"reason": "IP not authorized"})
        return

    if not username:
        emit("rejected", {"reason": "Username required"})
        return

    if len(username) > 20 or not re.match(r'^[a-zA-Z0-9_\-]+$', username):
        emit("rejected", {"reason": "Invalid username format"})
        return

    if sessions.count() >= MAX_USERS:
        emit("rejected", {"reason": "Session full"})
        return

    if hashlib.sha256(password.encode()).hexdigest() != SESSION_PASSWORD_HASH:
        count   = security.record_failure(client_ip)
        blocked = security.is_blocked(client_ip)
        alert_type = "ip_blocked" if blocked else "bad_password"
        _intrusion_alert(alert_type, client_ip, username, count)
        if blocked:
            # IP is now blocked — reject hard and do NOT enter approval flow
            emit("rejected", {"reason": "IP blocked due to multiple failed attempts"})
            _broadcast_blocked_ips()
        else:
            emit("rejected", {"reason": "Invalid access key"})
        return

    security.clear_failures(client_ip)

    if sessions.username_taken(username):
        emit("rejected", {"reason": "Username already taken"})
        return

    last_disconnect = _recent_disconnects.get(username)
    if last_disconnect and time.time() - last_disconnect < 300:
        sessions.add(sid, username, client_ip)
        socketio.emit("approved", {"key": AES_KEY}, room=sid)
        socketio.emit("update_users",  sessions.all_users_info())
        socketio.emit("system_message", f"{username} reconnected seamlessly.")
        logger.info("%s reconnected seamlessly.", username)
        return

    if _admin_sid is None:
        emit("rejected", {"reason": "Admin is not connected yet. Try again shortly."})
        return

    # Queue request and notify admin
    req_time = datetime.now().strftime("%H:%M:%S")
    with _pending_lock:
        _pending[sid] = {"username": username, "ip": client_ip, "time": req_time}

    emit("pending")
    socketio.emit("approval_request", {
        "sid": sid, "username": username, "ip": client_ip, "time": req_time
    }, room=_admin_sid)
    logger.info("Join request queued: %s @ %s", username, client_ip)

    def auto_reject_task(target_sid, target_username):
        time.sleep(60)
        with _pending_lock:
            pending_data = _pending.pop(target_sid, None)
        if pending_data:
            socketio.emit("rejected", {"reason": "Approval timed out"}, room=target_sid)
            socketio.emit("approval_resolved", {"sid": target_sid}, room=_admin_sid)
            logger.info("Join request timed out for: %s", target_username)

    threading.Thread(target=auto_reject_task, args=(sid, username), daemon=True).start()


# =========================================
# 🔐 ADMIN AUTHENTICATION
# =========================================

@socketio.on("admin_connect")
def handle_admin_connect(data):
    global _admin_sid
    if data.get("token") != ADMIN_TOKEN:
        emit("admin_auth_failed", {"reason": "Invalid admin token."})
        return

    _admin_sid = request.sid
    logger.info("Admin dashboard connected (sid=%s)", request.sid)

    with _pending_lock:
        pending_list = [
            {"sid": s, **v} for s, v in _pending.items()
        ]

    emit("admin_auth_ok", {
        "server_ip": server_ip,
        "users":     sessions.all_users_info(),
        "pending":   pending_list,
        "key":       AES_KEY,          # so admin can decrypt chat messages
    })


# =========================================
# ✅ ADMIN DECISION
# =========================================

@socketio.on("admin_decision")
def handle_admin_decision(data):
    if request.sid != _admin_sid:
        return

    target_sid = data.get("sid", "")
    approved   = bool(data.get("approved", False))

    with _pending_lock:
        pending_data = _pending.pop(target_sid, None)

    if not pending_data:
        return

    username  = pending_data["username"]
    client_ip = pending_data["ip"]

    if approved:
        sessions.add(target_sid, username, client_ip)
        socketio.emit("approved", {"key": AES_KEY}, room=target_sid)
        socketio.emit("update_users",  sessions.all_users_info())
        socketio.emit("system_message", f"{username} joined the secure session.")
        logger.info("Admin approved: %s", username)
    else:
        socketio.emit("rejected", {"reason": "Admin rejected your request."}, room=target_sid)
        disconnect(target_sid)
        logger.info("Admin rejected: %s", username)

    socketio.emit("approval_resolved", {"sid": target_sid}, room=_admin_sid)


# =========================================
# 🛡️ ADMIN / MODERATOR ACTIONS
# =========================================

@socketio.on("kick_user")
def handle_kick(data):
    if request.sid != _admin_sid and sessions.get_role(request.sid) != "moderator":
        return
    username   = data.get("username", "").strip()
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid:
        return
    socketio.emit("kicked",         {"reason": "Removed by admin/moderator."},  room=target_sid)
    sessions.remove(target_sid)
    disconnect(target_sid)
    socketio.emit("update_users",   sessions.all_users_info())
    socketio.emit("system_message", f"⚠ {username} was kicked.")
    logger.info("Kicked: %s", username)


@socketio.on("block_user")
def handle_block(data):
    if request.sid != _admin_sid and sessions.get_role(request.sid) != "moderator":
        return
    username   = data.get("username", "").strip()
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid:
        return
    ip = sessions.get_ip(target_sid)
    security.block_ip(ip)
    _broadcast_blocked_ips()
    socketio.emit("kicked",         {"reason": "Blocked by admin/moderator."},  room=target_sid)
    sessions.remove(target_sid)
    disconnect(target_sid)
    socketio.emit("update_users",   sessions.all_users_info())
    socketio.emit("system_message", f"🚫 {username} ({ip}) blocked.")
    logger.info("Blocked: %s @ %s", username, ip)


@socketio.on("broadcast_alert")
def handle_alert(data):
    if request.sid != _admin_sid and sessions.get_role(request.sid) != "moderator":
        return
    message = data.get("message", "").strip()
    if message:
        socketio.emit("security_alert", {"message": message})
        logger.info("Alert broadcast: %s", message)


@socketio.on("set_role")
def handle_set_role(data):
    if request.sid != _admin_sid:
        return
    username = data.get("username", "").strip()
    role     = data.get("role", "user").strip()
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid:
        return
    sessions.set_role(target_sid, role)
    socketio.emit("update_users", sessions.all_users_info())
    socketio.emit("system_message", f"👑 {username} is now a {role}.")
    logger.info("Role changed: %s -> %s", username, role)


@socketio.on("set_mute")
def handle_set_mute(data):
    if request.sid != _admin_sid and sessions.get_role(request.sid) != "moderator":
        return
    username = data.get("username", "").strip()
    muted    = bool(data.get("muted", False))
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid:
        return
    sessions.set_muted(target_sid, muted)
    socketio.emit("update_users", sessions.all_users_info())
    state = "muted" if muted else "unmuted"
    socketio.emit("system_message", f"🔇 {username} was {state}.")
    logger.info("Mute state: %s -> %s", username, muted)


@socketio.on("transfer_admin")
def handle_transfer_admin(data):
    if request.sid != _admin_sid:
        return
    username = data.get("username", "").strip()
    target_sid = sessions.find_sid_by_username(username)
    if not target_sid:
        return
    admin_url = f"http://{server_ip}:5000/admin/{ADMIN_TOKEN}"
    socketio.emit("admin_handoff", {"url": admin_url}, room=target_sid)
    socketio.emit("system_message", f"👑 Admin rights offered to {username}.")
    logger.info("Admin handoff to %s", username)


# =========================================
# 🚫 BLOCKED IP MANAGEMENT
# =========================================

@socketio.on("get_blocked_ips")
def handle_get_blocked_ips():
    sid = request.sid
    if sid != _admin_sid and sessions.get_role(sid) not in ("moderator", "admin"):
        return
    blocked_list = list(security._blocked)
    emit("blocked_ips_list", {"ips": blocked_list})


def _broadcast_blocked_ips():
    payload = {"ips": list(security._blocked)}
    if _admin_sid:
        socketio.emit("blocked_ips_list", payload, room=_admin_sid)
    for sid, info in sessions._users.items():
        if info.get("role") in ("moderator", "admin"):
            socketio.emit("blocked_ips_list", payload, room=sid)

@socketio.on("unblock_ip")
def handle_unblock_ip(data):
    sid = request.sid
    if sid != _admin_sid and sessions.get_role(sid) not in ("moderator", "admin"):
        return
    ip = data.get("ip", "").strip()
    if ip:
        security.unblock(ip)
        _broadcast_blocked_ips()
        socketio.emit("system_message", f"✅ IP {ip} has been unblocked.")
        logger.info("Admin unblocked IP: %s", ip)


# =========================================
# 🔴 END SESSION (Admin only)
# =========================================

@socketio.on("end_session")
def handle_end_session():
    if request.sid != _admin_sid:
        return
    logger.info("Admin triggered end_session")
    _terminate_session("Admin ended the session.")


def _terminate_session(reason: str):
    """Gracefully terminate the session: emit report, disconnect all, then exit."""
    report_str = monitor.generate_report(server_ip)
    if _admin_sid:
        socketio.emit("session_report", {"report": report_str}, room=_admin_sid)
    socketio.emit("session_terminated", {"reason": reason})
    logger.info("Session terminated: %s", reason)
    security.save()

    def _shutdown():
        import time as _t
        _t.sleep(2)          # give sockets time to deliver the events
        import os as _os
        _os.kill(_os.getpid(), 15)   # SIGTERM — triggers finally: block in __main__

    threading.Thread(target=_shutdown, daemon=True).start()




# =========================================
# 🔒 PRIVATE MESSAGE HANDLER
# =========================================

@socketio.on("private_message")
def handle_private_message(data):
    sid = request.sid
    if sessions.is_muted(sid):
        emit("error", {"reason": "You are muted."})
        return
    now = time.time()
    if now - _last_message_time.get(sid, 0) < _MESSAGE_COOLDOWN:
        return
    _last_message_time[sid] = now

    recipient = data.get("to", "").strip()
    message   = data.get("message", "").strip()

    if not message or len(message) > _MAX_CIPHERTEXT_LEN:
        return

    sender = sessions.get_username(sid)
    if not sender:
        return

    target_sid = sessions.find_sid_by_username(recipient)
    if not target_sid:
        emit("error", {"reason": f"User '{recipient}' not found or offline."})
        return

    packet_id = monitor.increment_stats(len(message.encode()))
    msg_id    = str(uuid.uuid4())

    dm_payload = {
        "from":      sender,
        "to":        recipient,
        "message":   message,      # AES-256-GCM ciphertext
        "packet_id": packet_id,
        "id":        msg_id,
    }

    # Deliver to recipient, echo to sender, and copy to admin monitor
    socketio.emit("receive_private_message", dm_payload, room=target_sid)
    socketio.emit("receive_private_message", dm_payload, room=sid)
    if _admin_sid and _admin_sid not in (target_sid, sid):
        socketio.emit("receive_private_message", dm_payload, room=_admin_sid)
    logger.info("DM: %s → %s [Packet %d]", sender, recipient, packet_id)

    def delete_later(mid):
        time.sleep(10)
        socketio.emit("delete_message", mid)

    threading.Thread(target=delete_later, args=(msg_id,), daemon=True).start()




# =========================================
# 💬 MESSAGE HANDLER
# =========================================

@socketio.on("send_message")
def handle_message(data):
    sid = request.sid
    if sessions.is_muted(sid):
        emit("error", {"reason": "You are muted."})
        return
    now = time.time()
    if now - _last_message_time.get(sid, 0) < _MESSAGE_COOLDOWN:
        return
    _last_message_time[sid] = now

    message = data.get("message", "").strip()
    if not message:
        return
    if len(message) > _MAX_CIPHERTEXT_LEN:
        emit("error", {"reason": "Message too large."})
        return

    username  = sessions.get_username(sid) or "Unknown"
    packet_id = monitor.increment_stats(len(message.encode()))
    msg_id    = str(uuid.uuid4())

    # Relay ciphertext — server never decrypts
    socketio.emit("receive_message", {
        "username":  username,
        "message":   message,       # AES-256-GCM ciphertext (base64)
        "packet_id": packet_id,     # separated so client can label after decryption
        "id":        msg_id,
    })
    # Intentionally omitted logger.info for text messages to keep terminal clean

    def delete_later(mid):
        time.sleep(10)
        socketio.emit("delete_message", mid)

    threading.Thread(target=delete_later, args=(msg_id,), daemon=True).start()


# =========================================
# 📤 FILE TRANSFER HANDLER
# =========================================

@socketio.on("send_file")
def handle_file(data):
    sid = request.sid
    if sessions.is_muted(sid):
        emit("error", {"reason": "You are muted."})
        return
    sender = sessions.get_username(sid)
    if not sender:
        return

    filename      = str(data.get("filename", "file"))[:255]
    file_data     = data.get("data", "")       # base64-encoded (AES-encrypted) bytes
    file_type     = data.get("type", "application/octet-stream")
    media_category = data.get("mediaCategory", "other")  # image|audio|pdf|other
    if media_category not in _DELETE_DELAYS:
        media_category = "other"

    # Limit: base64 of 5 MB ≈ 7 MB
    if len(file_data) > 7_000_000:
        emit("error", {"reason": "File too large (max 5 MB)"})
        return

    file_id = str(uuid.uuid4())
    payload = {
        "from":     sender,
        "filename": filename,
        "type":     file_type,
        "data":     file_data,
        "id":       file_id,
    }

    socketio.emit("receive_file", payload)

    # Increment file stats with the mime type
    monitor.increment_file_stats(len(file_data), file_type)

    # Auto-delete based on media category
    delay = _DELETE_DELAYS.get(media_category, _DELETE_DELAYS['other'])

    def delete_file_later(fid, wait):
        time.sleep(wait)
        socketio.emit("delete_message", fid)

    threading.Thread(target=delete_file_later, args=(file_id, delay), daemon=True).start()


# =========================================
# 🎤 VOICE MESSAGE HANDLER
# =========================================

@socketio.on("send_voice")
def handle_voice(data):
    sid    = request.sid
    if sessions.is_muted(sid):
        emit("error", {"reason": "You are muted."})
        return
    sender = sessions.get_username(sid)
    if not sender:
        return

    voice_data = data.get("data", "")      # base64-encoded AES-encrypted audio
    mime_type  = data.get("mimeType", "audio/webm")[:64]

    # Enforce same ceiling as files (~5 MB audio → ~7 MB base64)
    if len(voice_data) > 7_000_000:
        emit("error", {"reason": "Voice message too large (max ~5 MB)"})
        return

    voice_id = str(uuid.uuid4())
    payload  = {
        "from":     sender,
        "data":     voice_data,
        "mimeType": mime_type,
        "id":       voice_id,
    }

    socketio.emit("receive_voice", payload)
    logger.info("Voice message: %s (%d bytes b64)", sender, len(voice_data))

    # Auto-delete voice after 30 s
    def delete_voice_later(vid):
        time.sleep(_DELETE_DELAYS['audio'])
        socketio.emit("delete_message", vid)

    threading.Thread(target=delete_voice_later, args=(voice_id,), daemon=True).start()




# =========================================
# 🔄 DISCONNECT HANDLER
# =========================================

@socketio.on("disconnect")
def handle_disconnect():
    global _admin_sid
    sid  = request.sid
    user = sessions.remove(sid)
    _last_message_time.pop(sid, None)

    with _pending_lock:
        _pending.pop(sid, None)

    if user:
        _recent_disconnects[user] = time.time()
        socketio.emit("update_users",   sessions.all_users_info())
        socketio.emit("system_message", f"{user} left the secure session.")
        logger.info("%s disconnected", user)

    if sid == _admin_sid:
        _admin_sid = None
        logger.warning("Admin disconnected.")

    # ── Session lifecycle: terminate if no admin AND no moderators remain ──
    remaining_roles = [sessions.get_role(s) for s in sessions._users]
    has_moderator   = "moderator" in remaining_roles

    if _admin_sid is None and not has_moderator and sessions.count() > 0:
        logger.warning("No admin or moderator remaining — auto-terminating session.")
        _terminate_session("Session ended: no admin or moderator remaining.")


# =========================================
# 🚀 START
# =========================================

if __name__ == "__main__":
    try:
        socketio.run(app, host="0.0.0.0", port=5000)
    finally:
        monitor.generate_report(server_ip)
        security.save()