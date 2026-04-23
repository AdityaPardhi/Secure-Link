/* ============================================================
   SecureLink — chat.js
   Handles message rendering and chat interactions.

   Fix #17: send-btn wired via addEventListener (onclick removed from HTML)
   Fix #19: var → const/let throughout
   ============================================================ */

const Chat = (function () {

    /* ── Helpers ─────────────────────────────────────────────── */
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function timestamp() {
        const now = new Date();
        return now.getHours().toString().padStart(2, '0') +
               ':' +
               now.getMinutes().toString().padStart(2, '0') +
               ':' +
               now.getSeconds().toString().padStart(2, '0');
    }

    function scrollBottom() {
        const msgs = document.getElementById('messages');
        if (msgs) msgs.scrollTop = msgs.scrollHeight;
    }

    /* ── Public API ──────────────────────────────────────────── */
    function appendMessage(data) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;

        const wrap = document.createElement('div');
        wrap.className = 'msg';
        wrap.id = 'msg_' + data.id;

        wrap.innerHTML =
            '<div class="msg-header">' +
                '<span class="msg-user">' + escHtml(data.username) + '</span>' +
                '<span class="msg-time">' + timestamp() + '</span>' +
            '</div>' +
            '<div class="msg-text">' + escHtml(data.message) + '</div>';

        msgs.appendChild(wrap);
        scrollBottom();
    }

    function deleteMessage(id) {
        const msg = document.getElementById('msg_' + id);
        if (!msg) return;
        msg.style.transition = 'opacity 0.35s, transform 0.35s';
        msg.style.opacity = '0';
        msg.style.transform = 'translateX(-14px)';
        setTimeout(function () { msg.remove(); }, 380);
    }

    function appendSystem(text) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;
        const div = document.createElement('div');
        div.className = 'system-msg';
        div.textContent = text;
        msgs.appendChild(div);
        scrollBottom();
    }

    function sendMessage() {
        const input = document.getElementById('message');
        if (!input) return;
        const msg = input.value.trim();
        if (!msg) return;
        socket.emit('send_message', { message: msg });
        input.value = '';
        input.focus();
    }

    /* ── Key bindings + button listener (fix #17) ────────────── */
    document.addEventListener('DOMContentLoaded', function () {

        const msgInput = document.getElementById('message');
        if (msgInput) {
            msgInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') sendMessage();
            });
        }

        /* Fix #17: addEventListener replaces inline onclick */
        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }
    });

    return {
        appendMessage: appendMessage,
        deleteMessage:  deleteMessage,
        appendSystem:   appendSystem,
        sendMessage:    sendMessage,
    };

})();