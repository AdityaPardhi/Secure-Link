/* ============================================================
   SecureLink — socket.js
   Handles all Socket.IO event listeners.

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
socket.on("approved", function (data) {
    if (data && data.key) {
        SecureCrypto.init(data.key)
            .then(function () {
                Chat.appendSystem("🔐 AES-256-GCM encryption active. Messages are end-to-end encrypted.");
                UI.onApproved();
            })
            .catch(function (err) {
                console.error("[SecureCrypto] init failed:", err);
                Chat.appendSystem("⚠ Encryption unavailable (HTTPS required). Messages are unencrypted.");
                UI.onApproved();
            });
    } else {
        UI.onApproved();
    }
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

/* ── Private messaging ───────────────────────────────── */
socket.on("receive_private_message", function (data) {
    Chat.appendPrivateMessage(data);
});

/* ── File transfer ───────────────────────────────────── */
socket.on("receive_file", function (data) {
    Chat.appendFileMessage(data);
});



socket.on("system_message", function (msg) {
    Chat.appendSystem(msg);
});

socket.on("update_users", function (users) {
    console.log("User list updated:", users);
    UI.updateUsers(users);
});

/* ── Live stats ────────────────────────────────── */
socket.on("stats_update", function (data) {
    UI.updateStats(data);
});

/* ── Admin controls  ─────────────────────────── */
socket.on("kicked", function (data) {
    UI.showTerminated(data.reason || "You have been removed from the session.");
});

socket.on("session_terminated", function (data) {
    UI.showTerminated(data.reason || "Session terminated.");
});

socket.on("security_alert", function (data) {
    UI.showSecurityAlert(data.message);
});

/* ── Network simulation feedback ──────────────────── */
socket.on("packet_lost", function (data) {
    Chat.appendSystem("⚠ Your packet was dropped (simulated " + data.pct + "% loss rate).");
});
