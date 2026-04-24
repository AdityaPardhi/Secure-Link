/* ============================================================
   SecureLink — chat.js
   Handles message rendering and chat interactions.

   Fix #17: send-btn wired via addEventListener (onclick removed from HTML)
   Fix #19: var → const/let throughout
   Change #9: sendMessage encrypts before emit; appendMessage decrypts on receipt
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

    /**
     * appendMessage — Change #9:
     * data.message is ciphertext (base64). Decrypts asynchronously,
     * shows "decrypting…" placeholder until ready.
     */
    function appendMessage(data) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;

        const wrap = document.createElement('div');
        wrap.className = 'msg';
        wrap.id = 'msg_' + data.id;

        /* Header always rendered immediately */
        wrap.innerHTML =
            '<div class="msg-header">' +
                '<span class="msg-user">' + escHtml(data.username) + '</span>' +
                '<span class="msg-time">' + timestamp() + '</span>' +
                '<span class="msg-enc-badge" title="AES-256-GCM encrypted">🔐</span>' +
            '</div>' +
            '<div class="msg-text msg-decrypting">// decrypting…</div>';

        msgs.appendChild(wrap);
        scrollBottom();

        const textEl = wrap.querySelector('.msg-text');

        if (SecureCrypto.isReady()) {
            SecureCrypto.decrypt(data.message)
                .then(function (plaintext) {
                    const label = data.packet_id ? '[Packet ' + data.packet_id + '] ' : '';
                    textEl.textContent = label + plaintext;
                    textEl.classList.remove('msg-decrypting');
                })
                .catch(function () {
                    textEl.textContent = '[⚠ Could not decrypt message]';
                    textEl.classList.remove('msg-decrypting');
                    textEl.style.color = 'var(--danger)';
                });
        } else {
            /* Crypto not ready — show raw (should not happen normally) */
            textEl.textContent = '[Encrypted] ' + data.message.substring(0, 40) + '…';
            textEl.classList.remove('msg-decrypting');
        }
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

    /**
     * sendMessage — Change #9:
     * Validates plaintext length, then encrypts before emitting.
     * Input is cleared immediately for UX; emit happens after encrypt resolves.
     */
    function sendMessage() {
        const input = document.getElementById('message');
        if (!input) return;
        const msg = input.value.trim();
        if (!msg) return;

        if (msg.length > 500) {
            appendSystem('⚠ Message too long (max 500 characters).');
            return;
        }

        if (!SecureCrypto.isReady()) {
            appendSystem('⚠ Encryption not ready. Message not sent.');
            return;
        }

        /* Clear input immediately for a snappy UX */
        input.value = '';
        input.focus();

        SecureCrypto.encrypt(msg)
            .then(function (ciphertext) {
                socket.emit('send_message', { message: ciphertext });
            })
            .catch(function (err) {
                console.error('[SecureCrypto] Encryption failed:', err);
                appendSystem('⚠ Encryption failed. Message not sent.');
            });
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