/* ============================================================
   SecureLink — socket.js
   Handles all Socket.IO event listeners.

   Fix #19: var → const/let throughout
   ============================================================ */

const socket = io();

/* ── Connection events ─────────────────────────────────────── */
socket.on("connect", function () {
    console.log("Socket connected:", socket.id);

    const pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot"></span> Connected';
        pill.style.color = '';
    }
});

/* Disconnect — includes reason for debugging */
socket.on("disconnect", function (reason) {
    console.warn("Disconnected:", reason);

    const pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot" style="background:var(--danger);animation:none;box-shadow:none"></span> Disconnected';
        pill.style.color = 'var(--danger)';
    }
});

/* Connection error — server offline or unreachable */
socket.on("connect_error", function (err) {
    console.warn("Connection error — server may be offline:", err.message);

    const pill = document.getElementById("conn-status");
    if (pill) {
        pill.innerHTML = '<span class="status-dot" style="background:var(--danger);animation:none"></span> Connection Error';
        pill.style.color = 'var(--danger)';
    }
});

/* Auto-reconnect notification */
socket.on("reconnect", function (attempt) {
    console.log("Reconnected to server after", attempt, "attempt(s)");
    Chat.appendSystem("Connection restored.");

    const pill = document.getElementById("conn-status");
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