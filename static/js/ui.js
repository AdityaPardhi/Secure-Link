/* ============================================================
   SecureLink — ui.js
   Handles UI state, login flow, and user list updates.

   ============================================================ */

const UI = (function () {

    /* ── Login lock — prevents duplicate requests ─────────────── */
    let loginInProgress = false;

    /* ── Inline error helper  ──────────────────────── */
    function showLoginError(msg) {
        const errEl = document.getElementById('login-error');
        if (!errEl) return;
        errEl.textContent = msg;
        errEl.style.display = 'block';
        /* Auto-clear after 4 s */
        setTimeout(function () {
            errEl.style.display = 'none';
            errEl.textContent   = '';
        }, 4000);
    }

    /* ── Login ───────────────────────────────────────────────── */
    function join() {
        if (loginInProgress) return;

        const username = document.getElementById('username').value.trim();
        const password = document.getElementById('password').value.trim();

        console.log('Login attempt:', username);

        /* Validate before locking so empty fields don't block future attempts */
        if (!username || !password) {
            shakeEl(document.querySelector('.login-box'));
            showLoginError('Identifier and Access Key are required.');
            return;
        }

        loginInProgress = true;

        /* store current username for DM direction labels and role detection */
        Chat.setUsername(username);
        _myUsername = username;

        const pending = document.getElementById('pending-overlay');
        if (pending) pending.classList.add('active');

        socket.emit('join_request', { username: username, password: password });
    }

    /* ── Approved ────────────────────────────────────────────── */
    function onApproved() {
        console.log('User approved — secure session started');

        const loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) {
            loginOverlay.style.transition = 'opacity 0.4s';
            loginOverlay.style.opacity = '0';
            setTimeout(function () { loginOverlay.style.display = 'none'; }, 400);
        }

        const pending = document.getElementById('pending-overlay');
        if (pending) pending.classList.remove('active');

        const locked = document.getElementById('locked-panel');
        if (locked) locked.style.display = 'none';

        const chatPanel = document.getElementById('chat-visible');
        if (chatPanel) {
            chatPanel.style.display = 'flex';
            chatPanel.style.flexDirection = 'column';
        }

        Chat.appendSystem('Secure channel established. Welcome.');

        const msgInput = document.getElementById('message');
        if (msgInput) setTimeout(function () { msgInput.focus(); }, 100);
    }

    /* ── Rejected  ──────────────────────────────────── */
    function onRejected(reason) {
        console.warn('Access rejected:', reason);

        /* Reset login lock so user can try again */
        loginInProgress = false;

        const pending = document.getElementById('pending-overlay');
        if (pending) pending.classList.remove('active');

        const loginBox = document.querySelector('.login-box');
        if (loginBox) {
            loginBox.classList.add('rejected');
            setTimeout(function () { loginBox.classList.remove('rejected'); }, 700);
            shakeEl(loginBox);
        }

        /* Clear password field for security */
        const pass = document.getElementById('password');
        if (pass) pass.value = '';

        /* inline error instead of alert() */
        showLoginError('Access Denied: ' + (reason || 'Unauthorized'));
    }

    /* ── User List  (shows IP, online dot, join/leave hints) */
    let _prevUsernames = [];

    function updateUsers(users) {
        const ul = document.getElementById('users');
        if (!ul) return;
        ul.innerHTML = '';

        const names = (users || []).map(function (u) {
            return typeof u === 'object' ? u.username : u;
        });

        /* Announce joins and leaves */
        names.forEach(function (n) {
            if (!_prevUsernames.includes(n)) {
                /* New user appeared — Chat.appendSystem may not exist yet during init */
                if (typeof Chat !== 'undefined' && _prevUsernames.length > 0) {
                    Chat.appendSystem('🟢 ' + n + ' is now online.');
                }
            }
        });
        _prevUsernames.forEach(function (n) {
            if (!names.includes(n)) {
                if (typeof Chat !== 'undefined') {
                    Chat.appendSystem('🔴 ' + n + ' went offline.');
                }
            }
        });
        _prevUsernames = names;

        /* Update sidebar header with live count */
        const section = document.querySelector('.sidebar-section');
        if (section) {
            section.textContent = 'Online Users' + (names.length ? ' (' + names.length + ')' : '');
        }

        if (!users || users.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'no-users';
            empty.style.listStyle = 'none';
            empty.textContent = '— none —';
            ul.appendChild(empty);
        } else {
            users.forEach(function (user) {
                const name = typeof user === 'object' ? user.username : user;
                const ip   = typeof user === 'object' ? user.ip       : '';
                const li = document.createElement('li');
                li.title  = 'Click to send a private message';
                li.style.cursor = 'pointer';
                li.innerHTML =
                    '<span class="user-online-dot" style="display:inline-block;width:7px;height:7px;' +
                        'border-radius:50%;background:var(--accent);margin-right:7px;' +
                        'box-shadow:0 0 6px rgba(0,229,160,0.6);flex-shrink:0;"></span>' +
                    '<span class="user-name">' + escHtml(name) + '</span>' +
                    (ip ? '<span class="user-ip">' + escHtml(ip) + '</span>' : '');

                li.addEventListener('click', function () {
                    const input = document.getElementById('message');
                    if (input) {
                        input.value = '/dm ' + name + ' ';
                        input.focus();
                    }
                });

                ul.appendChild(li);
            });
        }

        /* —— Detect own role from server payload —— */
        if (_myUsername) {
            const me = (users || []).find(function (u) {
                return (typeof u === 'object' ? u.username : u) === _myUsername;
            });
            if (me && typeof me === 'object') {
                const newRole = me.role || 'user';
                if (newRole !== _myRole) {
                    _myRole = newRole;
                    _applyRolePanel();
                }
            }
        }

        /* Sync ctrl panel user list if visible */
        if (_myRole === 'admin' || _myRole === 'moderator') {
            _renderCtrlUserList(users);
        }
    }


    /* ── Utilities ───────────────────────────────────────────── */
    function escHtml(str) {
        return String(str)
            .replace(/&/g, '&amp;')
            .replace(/</g, '&lt;')
            .replace(/>/g, '&gt;')
            .replace(/"/g, '&quot;');
    }

    function shakeEl(el) {
        if (!el) return;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
        el.addEventListener('animationend', function handler() {
            el.classList.remove('shake');
            el.removeEventListener('animationend', handler);
        });
    }

    /* ── Live Stats Panel ───────────────────────── */
    function fmtBytes(b) {
        if (b >= 1048576) return (b / 1048576).toFixed(2) + ' MB';
        if (b >= 1024)    return (b / 1024).toFixed(1)    + ' KB';
        return b + ' B';
    }

    function fmtUptime(secs) {
        const h = Math.floor(secs / 3600);
        const m = Math.floor((secs % 3600) / 60);
        const s = secs % 60;
        return String(h).padStart(2,'0') + ':' +
               String(m).padStart(2,'0') + ':' +
               String(s).padStart(2,'0');
    }

    function updateStats(data) {
        const set = function (id, val) {
            const el = document.getElementById(id);
            if (el) el.textContent = val;
        };
        set('stat-uptime',     fmtUptime(data.uptime   || 0));
        set('stat-messages',   data.messages  || 0);
        set('stat-bytes',      fmtBytes(data.bytes     || 0));
        set('stat-throughput', (data.throughput || 0) + ' B/s');
        set('stat-packets',    data.packets    || 0);
        set('stat-users',      data.users      || 0);
    }

    /* ── Role-based Control Panel ────────────────────────────── */
    let _myRole     = 'user';   // 'user' | 'moderator' | 'admin'
    let _myUsername = null;

    /* Called when server confirms this client is the session admin */
    function onAdminAssigned(username) {
        _myUsername = username || _myUsername;
        _myRole = 'admin';
        Chat.appendSystem('⚡ You are the session admin.');
        _applyRolePanel();
    }

    /* Show / hide the control panel and its sections based on _myRole */
    function _applyRolePanel() {
        const toggleBtn  = document.getElementById('ctrl-toggle-btn');
        const adminOnly  = document.getElementById('ctrl-admin-only');
        const titleEl    = document.getElementById('ctrl-drawer-title');
        const drawer     = document.getElementById('ctrl-drawer');

        if (_myRole === 'admin') {
            if (toggleBtn)  { toggleBtn.style.display = 'inline-flex'; toggleBtn.textContent = '🛡 ADMIN'; }
            if (adminOnly)  adminOnly.style.display = '';
            if (titleEl)    titleEl.textContent = '🛡 Admin Controls';
        } else if (_myRole === 'moderator') {
            if (toggleBtn)  { toggleBtn.style.display = 'inline-flex'; toggleBtn.textContent = '⚙ MOD'; }
            if (adminOnly)  adminOnly.style.display = 'none';
            if (titleEl)    titleEl.textContent = '⚙ Moderator Controls';
        } else {
            /* Regular user — hide button AND forcibly close/hide drawer */
            if (toggleBtn) toggleBtn.style.display = 'none';
            if (drawer) {
                drawer.classList.remove('open');
                drawer.style.display = 'none';
            }
        }
    }

    /* Render the connected-users list in the control panel */
    function _renderCtrlUserList(users) {
        const ul = document.getElementById('ctrl-user-list');
        if (!ul) return;
        ul.innerHTML = '';
        const isAdmin = _myRole === 'admin';
        (users || []).forEach(function (user) {
            const name = typeof user === 'object' ? user.username : user;
            const ip   = typeof user === 'object' ? user.ip   : '';
            const role = typeof user === 'object' ? (user.role || 'user') : 'user';
            if (name === _myUsername) return; // skip self
            const isMod = role === 'moderator';
            const li = document.createElement('li');
            li.className = 'admin-user-item';
            li.innerHTML =
                '<span class="admin-user-info">' +
                    '<span class="admin-user-name">' + escHtml(name) +
                        (isMod ? ' <span class="role-badge mod-badge">🛡 MOD</span>' : '') +
                    '</span>' +
                    '<span class="admin-user-ip">' + escHtml(ip) + '</span>' +
                '</span>' +
                '<span class="admin-user-btns">' +
                    '<button class="kick-btn"  data-user="' + escHtml(name) + '">KICK</button>' +
                    '<button class="mute-btn"  data-user="' + escHtml(name) + '" data-muted="' +
                        (user.muted ? 'true' : 'false') + '">' +
                        (user.muted ? 'UNMUTE' : 'MUTE') +
                    '</button>' +
                    (isAdmin ?
                        '<button class="block-btn" data-user="' + escHtml(name) + '">BLOCK</button>' +
                        '<button class="mod-btn" data-user="' + escHtml(name) + '" data-role="' +
                            (isMod ? 'user' : 'moderator') + '">' +
                            (isMod ? '−MOD' : '+MOD') +
                        '</button>' : '') +
                '</span>';
            ul.appendChild(li);
        });
        if (!ul.children.length) {
            ul.innerHTML = '<li class="admin-no-users">No other users connected.</li>';
        }
    }

    /* Render blocked IPs list (admin only) */
    function updateBlockedList(ips) {
        const ul = document.getElementById('ctrl-blocked-list');
        if (!ul) return;
        ul.innerHTML = '';
        if (!ips || ips.length === 0) {
            ul.innerHTML = '<li class="admin-no-users">No blocked IPs.</li>';
            return;
        }
        ips.forEach(function (ip) {
            const li = document.createElement('li');
            li.className = 'admin-user-item';
            li.innerHTML =
                '<span class="admin-user-info">' +
                    '<span class="admin-user-name blocked-ip-label">🚫 ' + escHtml(ip) + '</span>' +
                '</span>' +
                '<button class="unblock-btn" data-ip="' + escHtml(ip) + '">UNBLOCK</button>';
            ul.appendChild(li);
        });
    }

    function showTerminated(reason) {
        const overlay = document.getElementById('terminated-overlay');
        const msg     = document.getElementById('terminated-msg');
        if (msg)     msg.textContent = reason;
        if (overlay) overlay.classList.add('active');
    }

    function showSecurityAlert(message) {
        const banner = document.getElementById('security-alert-banner');
        const text   = document.getElementById('alert-banner-text');
        if (!banner || !text) return;
        text.textContent = message;
        banner.classList.add('active');
        setTimeout(function () { banner.classList.remove('active'); }, 8000);
    }

    /* ── Key bindings for login form + button listener ────────── */
    document.addEventListener('DOMContentLoaded', function () {
        const usernameInput = document.getElementById('username');
        const passwordInput = document.getElementById('password');

        if (usernameInput) {
            usernameInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') {
                    if (passwordInput) passwordInput.focus();
                }
            });
        }

        if (passwordInput) {
            passwordInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') join();
            });
        }

        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', join);
        }

        /* ── Control Panel toggle ───────────────────────── */
        const ctrlToggle = document.getElementById('ctrl-toggle-btn');
        const ctrlDrawer = document.getElementById('ctrl-drawer');
        const ctrlClose  = document.getElementById('ctrl-close-btn');

        if (ctrlToggle && ctrlDrawer) {
            ctrlToggle.addEventListener('click', function () {
                ctrlDrawer.classList.toggle('open');
                if (ctrlDrawer.classList.contains('open') && _myRole === 'admin') {
                    socket.emit('get_blocked_ips');
                }
            });
        }
        if (ctrlClose && ctrlDrawer) {
            ctrlClose.addEventListener('click', function () { ctrlDrawer.classList.remove('open'); });
        }

        /* ── User list actions (kick / mute / block / mod) ────── */
        const ctrlUserList = document.getElementById('ctrl-user-list');
        if (ctrlUserList) {
            ctrlUserList.addEventListener('click', function (e) {
                const kickBtn  = e.target.closest('.kick-btn');
                const muteBtn  = e.target.closest('.mute-btn');
                const blockBtn = e.target.closest('.block-btn');
                const modBtn   = e.target.closest('.mod-btn');
                if (kickBtn)  socket.emit('kick_user',  { username: kickBtn.dataset.user });
                if (muteBtn) {
                    const nowMuted = muteBtn.dataset.muted === 'true';
                    socket.emit('set_mute', { username: muteBtn.dataset.user, muted: !nowMuted });
                }
                if (blockBtn) socket.emit('block_user', { username: blockBtn.dataset.user });
                if (modBtn)   socket.emit('set_role',   { username: modBtn.dataset.user, role: modBtn.dataset.role });
            });
        }

        /* ── Blocked IPs (admin only) ─────────────────────── */
        const ctrlBlockedList = document.getElementById('ctrl-blocked-list');
        if (ctrlBlockedList) {
            ctrlBlockedList.addEventListener('click', function (e) {
                const btn = e.target.closest('.unblock-btn');
                if (btn) socket.emit('unblock_ip', { ip: btn.dataset.ip });
            });
        }

        /* ── End Session (admin only) ────────────────────── */
        const ctrlEndBtn = document.getElementById('ctrl-end-session-btn');
        if (ctrlEndBtn) {
            ctrlEndBtn.addEventListener('click', function () {
                const m = document.getElementById('ctrl-end-confirm-modal');
                if (m) m.style.display = 'flex';
            });
        }

        const ctrlConfirmYes = document.getElementById('ctrl-end-confirm-yes');
        if (ctrlConfirmYes) {
            ctrlConfirmYes.addEventListener('click', function () {
                document.getElementById('ctrl-end-confirm-modal').style.display = 'none';
                socket.emit('end_session');
            });
        }
        const ctrlConfirmNo = document.getElementById('ctrl-end-confirm-no');
        if (ctrlConfirmNo) {
            ctrlConfirmNo.addEventListener('click', function () {
                document.getElementById('ctrl-end-confirm-modal').style.display = 'none';
            });
        }

        /* ── Alert broadcast (admin only) ─────────────────── */
        const ctrlAlertBtn   = document.getElementById('ctrl-alert-btn');
        const ctrlAlertInput = document.getElementById('ctrl-alert-input');
        if (ctrlAlertBtn && ctrlAlertInput) {
            ctrlAlertBtn.addEventListener('click', function () {
                const msg = ctrlAlertInput.value.trim();
                if (!msg) return;
                socket.emit('broadcast_alert', { message: msg });
                ctrlAlertInput.value = '';
            });
            ctrlAlertInput.addEventListener('keypress', function (e) {
                if (e.key === 'Enter') ctrlAlertBtn.click();
            });
        }

        /* Reconnect button on terminated overlay */
        const reconnectBtn = document.getElementById('reconnect-btn');
        if (reconnectBtn) {
            reconnectBtn.addEventListener('click', function () { window.location.reload(); });
        }
    });

    /* ── Socket listeners for control panel ─────────────────── */
    socket.on('blocked_ips_list', function (data) {
        updateBlockedList(data.ips || []);
    });

    /* ── Reset login lock if socket disconnects ───────────────── */
    socket.on("disconnect", function () {
        loginInProgress = false;

        const pending = document.getElementById("pending-overlay");
        if (pending) pending.classList.remove("active");
    });

    return {
        join:               join,
        onApproved:         onApproved,
        onRejected:         onRejected,
        updateUsers:        updateUsers,
        updateStats:        updateStats,
        onAdminAssigned:    onAdminAssigned,
        showTerminated:     showTerminated,
        showSecurityAlert:  showSecurityAlert,
        shakeEl:            shakeEl,
        updateBlockedList:  updateBlockedList,
    };

})();