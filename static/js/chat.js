/* ============================================================
   SecureLink — chat.js
   Handles message rendering and chat interactions.

   Fix #17: send-btn wired via addEventListener (onclick removed from HTML)
   Fix #19: var → const/let throughout
   Change #9: sendMessage encrypts before emit; appendMessage decrypts on receipt
   Change #11: /dm command and appendPrivateMessage for direct messaging
   ============================================================ */

const Chat = (function () {

    let _currentUsername = null;  // set on join

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

    function setUsername(name) { _currentUsername = name; }

    /**
     * appendMessage — Change #9:
     * data.message is ciphertext. Decrypts async, shows placeholder first.
     */
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
            textEl.textContent = '[Encrypted] ' + data.message.substring(0, 40) + '…';
            textEl.classList.remove('msg-decrypting');
        }
    }

    /**
     * appendPrivateMessage — Change #11:
     * Renders a DM with purple styling and direction label (you → Bob / Alice → you).
     */
    function appendPrivateMessage(data) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;

        const isSelf    = data.from === _currentUsername;
        const direction = isSelf
            ? escHtml(data.from) + ' → ' + escHtml(data.to)
            : escHtml(data.from) + ' → you';

        const wrap = document.createElement('div');
        wrap.className = 'msg msg-private';
        wrap.id = 'msg_' + data.id;

        wrap.innerHTML =
            '<div class="msg-header">' +
                '<span class="dm-badge">🔒 DM</span>' +
                '<span class="msg-user">' + direction + '</span>' +
                '<span class="msg-time">' + timestamp() + '</span>' +
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
                    textEl.textContent = '[⚠ Could not decrypt DM]';
                    textEl.classList.remove('msg-decrypting');
                    textEl.style.color = 'var(--danger)';
                });
        } else {
            textEl.textContent = '[Encrypted DM]';
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

    /* ── Send helpers ─────────────────────────────────────────── */
    function sendPrivateMessage(to, msg) {
        if (msg.length > 500) {
            appendSystem('⚠ DM too long (max 500 characters).');
            return;
        }
        if (!SecureCrypto.isReady()) {
            appendSystem('⚠ Encryption not ready.');
            return;
        }
        SecureCrypto.encrypt(msg)
            .then(function (ciphertext) {
                socket.emit('private_message', { to: to, message: ciphertext });
            })
            .catch(function () {
                appendSystem('⚠ Encryption failed. DM not sent.');
            });
    }

    /**
     * sendMessage — Change #9 + #11:
     * Detects /dm command for DMs; otherwise encrypts and broadcasts.
     */
    function sendMessage() {
        const input = document.getElementById('message');
        if (!input) return;
        const raw = input.value.trim();
        if (!raw) return;

        /* ── /dm <username> <message> command ── */
        if (raw.startsWith('/dm ')) {
            const remainder = raw.slice(4).trim();
            const spaceIdx  = remainder.indexOf(' ');
            if (spaceIdx === -1) {
                appendSystem('Usage: /dm <username> <message>');
                return;
            }
            const to  = remainder.slice(0, spaceIdx).trim();
            const msg = remainder.slice(spaceIdx + 1).trim();
            if (!to || !msg) {
                appendSystem('Usage: /dm <username> <message>');
                return;
            }
            input.value = '';
            input.focus();
            sendPrivateMessage(to, msg);
            return;
        }

        /* ── Regular broadcast message ── */
        if (raw.length > 500) {
            appendSystem('⚠ Message too long (max 500 characters).');
            return;
        }
        if (!SecureCrypto.isReady()) {
            appendSystem('⚠ Encryption not ready. Message not sent.');
            return;
        }
        input.value = '';
        input.focus();
        SecureCrypto.encrypt(raw)
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

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) {
            sendBtn.addEventListener('click', sendMessage);
        }
    });

    return {
        appendMessage:        appendMessage,
        appendPrivateMessage: appendPrivateMessage,
        deleteMessage:        deleteMessage,
        appendSystem:         appendSystem,
        sendMessage:          sendMessage,
        setUsername:          setUsername,
    };

})();