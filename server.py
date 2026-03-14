from flask import Flask, render_template, request
from flask_socketio import SocketIO, emit, disconnect
import threading
import time
import uuid
from datetime import datetime
import socket

# Import modules
from modules.security import failed_attempts, blocked_ips, allowed_ips
from modules.session_manager import active_users
import modules.network_monitor as monitor
# from modules.network_monitor import *

app = Flask(__name__)
app.config['SECRET_KEY'] = 'securelink_secret'
socketio = SocketIO(app, async_mode='threading')

# =========================================
# 🔐 SESSION INITIALIZATION
# =========================================

print("\n=== SECURE LAN SERVER INITIALIZING ===")

SESSION_PASSWORD = input("Set session access key: ").strip()

if not SESSION_PASSWORD:
    print("Access key cannot be empty. Exiting.")
    exit()

hostname = socket.gethostname()
server_ip = socket.gethostbyname(hostname)

print("Session access key set successfully.")
print("Server running on:", server_ip)
print("Waiting for users...\n")


# =========================================
# ROUTE
# =========================================

@app.route("/")
def index():
    return render_template("index.html")


# =========================================
# 🔐 JOIN HANDLER
# =========================================

@socketio.on("join_request")
def handle_join(data):

    username = data.get("username", "").strip()
    password = data.get("password", "").strip()

    sid = request.sid
    client_ip = request.remote_addr
    current_time = datetime.now().strftime("%d-%m-%Y %H:%M:%S")

    # 🚫 Blocked IP
    if client_ip in blocked_ips:
        emit("rejected", {"reason": "IP blocked due to multiple failed attempts"}, room=sid)
        disconnect(sid)
        print("Blocked IP attempted:", client_ip)
        return

    # 🔥 IP whitelist
    if allowed_ips and client_ip not in allowed_ips:
        emit("rejected", {"reason": "IP not authorized"}, room=sid)
        disconnect(sid)
        print("Unauthorized IP:", client_ip)
        return

    if not username:
        emit("rejected", {"reason": "Username required"}, room=sid)
        disconnect(sid)
        return

    # 🔐 Wrong password
    if password != SESSION_PASSWORD:

        failed_attempts[client_ip] = failed_attempts.get(client_ip, 0) + 1

        print("\n⚠ UNAUTHORIZED ACCESS ATTEMPT")
        print("User:", username)
        print("IP:", client_ip)
        print("Time:", current_time)
        print("Attempt count:", failed_attempts[client_ip])

        if failed_attempts[client_ip] >= 3:
            blocked_ips.add(client_ip)
            print("🚫 IP BLOCKED:", client_ip)

        emit("rejected", {"reason": "Invalid access key"}, room=sid)
        return  # ← disconnect(sid) removed so frontend lock resets correctly

    # Reset attempts
    failed_attempts.pop(client_ip, None)

    print(f"\nJoin request from: {username} | IP: {client_ip}")
    decision = input("Approve this user? (y/n): ")

    if decision.lower() == "y":

        active_users[sid] = username

        emit("approved", room=sid)

        socketio.emit("update_users", list(active_users.values()))
        socketio.emit("system_message", f"{username} joined the secure session.")

        print(f"{username} approved.\n")

    else:

        emit("rejected", {"reason": "Admin rejected"}, room=sid)
        disconnect(sid)

        print(f"{username} rejected.\n")


# =========================================
# 💬 MESSAGE HANDLER
# =========================================

@socketio.on("send_message")
def handle_message(data):

    # global total_messages, total_bytes, packet_counter

    message = data.get("message", "").strip()

    if not message:
        return

    username = active_users.get(request.sid, "Unknown")

    monitor.packet_counter += 1
    packet_id = monitor.packet_counter

    monitor.total_messages += 1
    monitor.total_bytes += len(message.encode())

    # # 📦 Packet Simulation
    # packet_counter += 1
    # packet_id = packet_counter

    # # 📊 Network monitoring
    # total_messages += 1
    # total_bytes += len(message.encode())

    msg_id = str(uuid.uuid4())

    socketio.emit("receive_message", {
        "username": username,
        "message": f"[Packet {packet_id}] {message}",
        "id": msg_id
    })

    # ⏳ Auto delete after 10 seconds
    def delete_message(mid):
        time.sleep(10)
        socketio.emit("delete_message", mid)

    threading.Thread(target=delete_message, args=(msg_id,), daemon=True).start()


# =========================================
# 🔄 DISCONNECT HANDLER
# =========================================

@socketio.on("disconnect")
def handle_disconnect():

    user = active_users.pop(request.sid, None)

    if user:

        socketio.emit("update_users", list(active_users.values()))
        socketio.emit("system_message", f"{user} left the secure session.")

        print(f"{user} disconnected")


# =========================================
# 🚀 START SERVER
# =========================================

if __name__ == "__main__":

    try:

        socketio.run(app, host="0.0.0.0", port=5000)

    finally:

        monitor.generate_report(server_ip)
        # generate_report(server_ip)