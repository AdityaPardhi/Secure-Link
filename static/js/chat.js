/* ============================================================
   SecureLink — chat.js
   Handles message rendering and chat interactions.

   Fix #17: send-btn wired via addEventListener (onclick removed from HTML)
   Fix #19: var → const/let throughout
   Change #9:  sendMessage encrypts; appendMessage decrypts
   Change #11: /dm command and appendPrivateMessage
   Change #13: file transfer via send_file / receive_file
   ============================================================ */

const Chat = (function () {

    let _currentUsername = null;  // set on join (Change #11)

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

    function formatBytes(n) {
        if (n < 1024)      return n + ' B';
        if (n < 1048576)   return (n / 1024).toFixed(1) + ' KB';
        return (n / 1048576).toFixed(1) + ' MB';
    }

    function getFileIcon(type) {
        if (!type) return '📄';
        if (type.startsWith('image/'))       return '🖼';
        if (type === 'application/pdf')      return '📕';
        if (type.includes('zip'))            return '🗜';
        if (type.includes('spreadsheet') || type.includes('csv')) return '📊';
        if (type.includes('word') || type.includes('document'))   return '📝';
        return '📄';
    }

    /* ── Public API ──────────────────────────────────────────── */

    function setUsername(name) { _currentUsername = name; }

    /* appendMessage — Change #9 */
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
                '<span class="msg-enc-badge" title="AES-256-CTR encrypted">🔐</span>' +
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

    /* appendPrivateMessage — Change #11 */
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

    /* appendFileMessage — Change #13 */
    function appendFileMessage(data) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;

        const isSelf = data.from === _currentUsername;
        const wrap   = document.createElement('div');
        wrap.className = 'msg msg-file';
        wrap.id = 'file_' + data.id;

        wrap.innerHTML =
            '<div class="msg-header">' +
                '<span class="file-badge">📎 FILE</span>' +
                '<span class="msg-user">' + escHtml(data.from) + '</span>' +
                '<span class="msg-time">' + timestamp() + '</span>' +
            '</div>' +
            '<div class="file-entry">' +
                '<span class="file-icon">' + getFileIcon(data.type) + '</span>' +
                '<div class="file-info">' +
                    '<div class="file-name">' + escHtml(data.filename) + '</div>' +
                    '<div class="file-status" id="fstatus_' + data.id + '">' +
                        (isSelf ? 'Sent ✓' : 'Decrypting…') +
                    '</div>' +
                '</div>' +
                '<button class="file-dl-btn" id="fdl_' + data.id + '" ' +
                    (isSelf ? '' : 'disabled') + '>' +
                    (isSelf ? '↗ Sent' : '⬇ Saving…') +
                '</button>' +
            '</div>';

        msgs.appendChild(wrap);
        scrollBottom();

        if (isSelf) return; // sender already has the file

        /* Decrypt and enable download */
        if (SecureCrypto.isReady() && data.data) {
            SecureCrypto.decrypt(data.data)
                .then(function (base64FileData) {
                    // Decode base64 → Uint8Array
                    const bin    = atob(base64FileData);
                    const bytes  = new Uint8Array(bin.length);
                    for (let i = 0; i < bin.length; i++) bytes[i] = bin.charCodeAt(i);
                    const blob   = new Blob([bytes], { type: data.type || 'application/octet-stream' });
                    const url    = URL.createObjectURL(blob);

                    const dlBtn  = document.getElementById('fdl_' + data.id);
                    const status = document.getElementById('fstatus_' + data.id);
                    if (dlBtn) {
                        dlBtn.disabled  = false;
                        dlBtn.textContent = '⬇ Download';
                        dlBtn.onclick = function () {
                            const a   = document.createElement('a');
                            a.href    = url;
                            a.download = data.filename;
                            a.click();
                        };
                    }
                    if (status) status.textContent = 'Ready — click to download';
                })
                .catch(function () {
                    const status = document.getElementById('fstatus_' + data.id);
                    if (status) { status.textContent = '⚠ Decrypt failed'; status.style.color = 'var(--danger)'; }
                });
        }
    }

    function deleteMessage(id) {
        const el = document.getElementById('msg_' + id) || document.getElementById('file_' + id);
        if (!el) return;
        el.style.transition = 'opacity 0.35s, transform 0.35s';
        el.style.opacity = '0';
        el.style.transform = 'translateX(-14px)';
        setTimeout(function () { el.remove(); }, 380);
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
        if (msg.length > 500) { appendSystem('⚠ DM too long (max 500 characters).'); return; }
        if (!SecureCrypto.isReady()) { appendSystem('⚠ Encryption not ready.'); return; }
        SecureCrypto.encrypt(msg)
            .then(function (ct) { socket.emit('private_message', { to: to, message: ct }); })
            .catch(function () { appendSystem('⚠ Encryption failed. DM not sent.'); });
    }

    /* sendFile — Change #13 */
    function sendFile(file) {
        if (file.size > 5 * 1024 * 1024) {
            appendSystem('⚠ File too large (max 5 MB): ' + file.name);
            return;
        }
        appendSystem('📎 Encrypting ' + file.name + ' (' + formatBytes(file.size) + ')…');

        const reader = new FileReader();
        reader.onload = function (e) {
            const bytes  = new Uint8Array(e.target.result);

            // Encode raw bytes as base64 (the payload we'll encrypt)
            let bin = '';
            for (let i = 0; i < bytes.length; i++) bin += String.fromCharCode(bytes[i]);
            const rawB64 = btoa(bin);

            if (!SecureCrypto.isReady()) {
                appendSystem('⚠ Encryption not ready.');
                return;
            }

            SecureCrypto.encrypt(rawB64)
                .then(function (encryptedB64) {
                    socket.emit('send_file', {
                        filename: file.name,
                        type:     file.type || 'application/octet-stream',
                        data:     encryptedB64,
                    });
                    appendSystem('📎 Sent: ' + file.name);
                })
                .catch(function () {
                    appendSystem('⚠ File encryption failed.');
                });
        };
        reader.readAsArrayBuffer(file);
    }

    /* sendMessage — Change #9 + #11 */
    function sendMessage() {
        const input = document.getElementById('message');
        if (!input) return;
        const raw = input.value.trim();
        if (!raw) return;

        /* /dm <username> <message> */
        if (raw.startsWith('/dm ')) {
            const remainder = raw.slice(4).trim();
            const spaceIdx  = remainder.indexOf(' ');
            if (spaceIdx === -1) { appendSystem('Usage: /dm <username> <message>'); return; }
            const to  = remainder.slice(0, spaceIdx).trim();
            const msg = remainder.slice(spaceIdx + 1).trim();
            if (!to || !msg) { appendSystem('Usage: /dm <username> <message>'); return; }
            input.value = '';
            input.focus();
            sendPrivateMessage(to, msg);
            return;
        }

        if (raw.length > 500) { appendSystem('⚠ Message too long (max 500 characters).'); return; }
        if (!SecureCrypto.isReady()) { appendSystem('⚠ Encryption not ready.'); return; }

        input.value = '';
        input.focus();
        SecureCrypto.encrypt(raw)
            .then(function (ct) { socket.emit('send_message', { message: ct }); })
            .catch(function (err) {
                console.error('[SecureCrypto] Encryption failed:', err);
                appendSystem('⚠ Encryption failed. Message not sent.');
            });
    }

    /* ── Key bindings + button listeners ─────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {

        const msgInput = document.getElementById('message');
        if (msgInput) {
            msgInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') sendMessage();
            });
        }

        const sendBtn = document.getElementById('send-btn');
        if (sendBtn) sendBtn.addEventListener('click', sendMessage);

        /* Change #13: attach button opens file picker */
        const attachBtn = document.getElementById('attach-btn');
        const fileInput = document.getElementById('file-input');
        if (attachBtn && fileInput) {
            attachBtn.addEventListener('click', function () { fileInput.click(); });
            fileInput.addEventListener('change', function () {
                if (fileInput.files && fileInput.files[0]) {
                    sendFile(fileInput.files[0]);
                    fileInput.value = ''; // reset so same file can be re-selected
                }
            });
        }
    });

    return {
        appendMessage:        appendMessage,
        appendPrivateMessage: appendPrivateMessage,
        appendFileMessage:    appendFileMessage,
        deleteMessage:        deleteMessage,
        appendSystem:         appendSystem,
        sendMessage:          sendMessage,
        setUsername:          setUsername,
    };

})();