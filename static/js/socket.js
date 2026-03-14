/* ============================================================
   SecureLink — socket.js
   Handles all Socket.IO event listeners
   ============================================================ */

var socket = io();

/* ── Connection events ─────────────────────────────────────── */
socket.on("connect", function () {
    console.log("Socket connected:", socket.id);

    var pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot"></span> Connected';
        pill.style.color = '';
    }
});

/* Disconnect — includes reason for debugging (improvement #4) */
socket.on("disconnect", function (reason) {
    console.warn("Disconnected:", reason);

    var pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot" style="background:var(--danger);animation:none;box-shadow:none"></span> Disconnected';
        pill.style.color = 'var(--danger)';
    }
});

/* Connection error — server offline or unreachable (improvement #1) */
socket.on("connect_error", function (err) {
    console.warn("Connection error — server may be offline:", err.message);

    var pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot" style="background:var(--danger);animation:none"></span> Connection Error';
        pill.style.color = 'var(--danger)';
    }
});

/* Auto-reconnect notification (improvement #3) */
socket.on("reconnect", function (attempt) {
    console.log("Reconnected to server after", attempt, "attempt(s)");
    Chat.appendSystem("Connection restored.");

    var pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot"></span> Connected';
        pill.style.color = '';
    }
});

/* ── Auth events ───────────────────────────────────────────── */
socket.on("approved", function () {
    UI.onApproved();
});

socket.on("rejected", function (data) {
    UI.onRejected(data.reason);
});

/* ── Chat events ───────────────────────────────────────────── */
socket.on("receive_message", function (data) {
    console.log("Message received:", data);
    Chat.appendMessage(data);
});

socket.on("delete_message", function (id) {
    console.log("Message deleted:", id);
    Chat.deleteMessage(id);
});

socket.on("system_message", function (msg) {
    Chat.appendSystem(msg);
});

socket.on("update_users", function (users) {
    console.log("User list updated:", users);
    UI.updateUsers(users);
});