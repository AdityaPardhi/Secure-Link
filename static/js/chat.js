/* ============================================================
   SecureLink — chat.js
   Handles message rendering and chat interactions.
   ============================================================ */

const Chat = (function () {

    let _currentUsername = null; 

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

    /* Categorise MIME type into one of: image | audio | pdf | other */
    function getMediaCategory(mimeType) {
        if (!mimeType) return 'other';
        if (mimeType.startsWith('image/'))  return 'image';
        if (mimeType.startsWith('audio/'))  return 'audio';
        if (mimeType === 'application/pdf') return 'pdf';
        return 'other';
    }

    /* ── Public API ──────────────────────────────────────────── */

    function setUsername(name) { _currentUsername = name; }

    /* appendMessage  */
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
            '<div class="msg-text msg-decrypting"> decrypting…</div>';

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

    /* appendPrivateMessage */
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
            '<div class="msg-text msg-decrypting"> decrypting…</div>';

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

    /* appendFileMessage — renders image / audio / pdf / generic based on MIME type */
    function appendFileMessage(data) {
        const msgs = document.getElementById('messages');
        if (!msgs) return;

        const isSelf   = data.from === _currentUsername;
        const category = getMediaCategory(data.type);
        const wrap     = document.createElement('div');
        wrap.className = 'msg msg-file';
        wrap.id        = 'file_' + data.id;

        /* ── Badge label by category ── */
        const badgeMap = { image: '🖼 IMAGE', audio: '🔊 AUDIO', pdf: '📕 PDF', other: '📎 FILE' };
        const badge    = badgeMap[category] || '📎 FILE';

        wrap.innerHTML =
            '<div class="msg-header">' +
                '<span class="file-badge">' + badge + '</span>' +
                '<span class="msg-user">' + escHtml(data.from) + '</span>' +
                '<span class="msg-time">' + timestamp() + '</span>' +
            '</div>' +
            '<div id="fmedia_' + data.id + '" class="file-media-area">' +
                (isSelf
                    ? '<span class="file-sent-label">↗ Sent ✓</span>'
                    : '<span class="file-status" id="fstatus_' + data.id + '">Decrypting…</span>') +
            '</div>';

        msgs.appendChild(wrap);
        scrollBottom();

        if (isSelf) return; /* sender already has the file */

        if (!SecureCrypto.isReady() || !data.data) return;

        SecureCrypto.decrypt(data.data)
            .then(function (base64FileData) {
                return fetch('data:application/octet-stream;base64,' + base64FileData);
            })
            .then(function (res) { return res.blob(); })
            .then(function (rawBlob) {
                const mime  = data.type || 'application/octet-stream';
                const blob  = new Blob([rawBlob], { type: mime });
                const url   = URL.createObjectURL(blob);

                const area   = document.getElementById('fmedia_' + data.id);
                const status = document.getElementById('fstatus_' + data.id);
                if (!area) return;
                area.innerHTML = ''; /* clear "Decrypting…" */

                /* helper: build a standard download anchor */
                function makeDlBtn(label) {
                    const btn = document.createElement('a');
                    btn.href      = url;
                    btn.download  = data.filename;
                    btn.className = 'file-dl-btn';
                    btn.textContent = label || '⬇ Download';
                    return btn;
                }

                if (category === 'image') {
                    /* ── Inline image preview with download overlay ── */
                    const wrapper = document.createElement('div');
                    wrapper.className = 'img-preview-wrap';

                    const img = document.createElement('img');
                    img.src   = url;
                    img.alt   = escHtml(data.filename);
                    img.className = 'chat-img-preview';

                    const dlBtn = makeDlBtn('⬇ Download');
                    dlBtn.className = 'img-dl-btn';

                    wrapper.appendChild(img);
                    wrapper.appendChild(dlBtn);
                    area.appendChild(wrapper);

                } else if (category === 'audio') {
                    /* ── HTML5 audio player ── */
                    const player = document.createElement('audio');
                    player.controls = true;
                    player.src      = url;
                    player.className = 'chat-audio-player';

                    const dlBtn = makeDlBtn('⬇ Download Audio');
                    dlBtn.className = 'file-dl-btn audio-dl-btn';

                    area.appendChild(player);
                    area.appendChild(dlBtn);

                } else if (category === 'pdf') {
                    /* ── PDF: icon + open + download ── */
                    const row = document.createElement('div');
                    row.className = 'file-entry';

                    const icon = document.createElement('span');
                    icon.className   = 'file-icon';
                    icon.textContent = '📕';

                    const info = document.createElement('div');
                    info.className = 'file-info';

                    const name = document.createElement('div');
                    name.className   = 'file-name';
                    name.textContent = data.filename;

                    const openBtn = document.createElement('a');
                    openBtn.href      = url;
                    openBtn.target    = '_blank';
                    openBtn.rel       = 'noopener';
                    openBtn.className = 'pdf-open-link';
                    openBtn.textContent = '🔍 Open PDF';

                    info.appendChild(name);
                    info.appendChild(openBtn);
                    row.appendChild(icon);
                    row.appendChild(info);
                    row.appendChild(makeDlBtn('⬇ Download'));
                    area.appendChild(row);

                } else {
                    /* ── Generic: icon + filename + download button ── */
                    const row = document.createElement('div');
                    row.className = 'file-entry';

                    const icon = document.createElement('span');
                    icon.className   = 'file-icon';
                    icon.textContent = getFileIcon(data.type);

                    const info = document.createElement('div');
                    info.className = 'file-info';

                    const name = document.createElement('div');
                    name.className   = 'file-name';
                    name.textContent = data.filename;

                    const sz = document.createElement('div');
                    sz.className   = 'file-status';
                    sz.textContent = 'Ready';

                    info.appendChild(name);
                    info.appendChild(sz);
                    row.appendChild(icon);
                    row.appendChild(info);
                    row.appendChild(makeDlBtn('⬇ Download'));
                    area.appendChild(row);
                }

                scrollBottom();
            })
            .catch(function () {
                const status = document.getElementById('fstatus_' + data.id);
                if (status) {
                    status.textContent = '⚠ Decrypt failed';
                    status.style.color = 'var(--danger)';
                }
            });
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

    /* sendFile */
    function sendFile(file) {
        if (file.size > 5 * 1024 * 1024) {
            appendSystem('⚠ File too large (max 5 MB): ' + file.name);
            return;
        }
        appendSystem('📎 Encrypting ' + file.name + ' (' + formatBytes(file.size) + ')…');

        const reader = new FileReader();
        reader.onload = function (e) {
            const dataUrl = e.target.result;
            const rawB64 = dataUrl.substring(dataUrl.indexOf(',') + 1);

            if (!SecureCrypto.isReady()) {
                appendSystem('⚠ Encryption not ready.');
                return;
            }

            SecureCrypto.encrypt(rawB64)
                .then(function (encryptedB64) {
                    socket.emit('send_file', {
                        filename:      file.name,
                        type:          file.type || 'application/octet-stream',
                        mediaCategory: getMediaCategory(file.type), /* image|audio|pdf|other */
                        data:          encryptedB64,
                    });
                    appendSystem('📎 Sent: ' + file.name);
                })
                .catch(function () {
                    appendSystem('⚠ File encryption failed.');
                });
        };
        reader.readAsDataURL(file);
    }

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