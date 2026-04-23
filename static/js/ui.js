/* ============================================================
   SecureLink — ui.js
   Handles UI state, login flow, and user list updates.

   Fix #17: login-btn wired via addEventListener (onclick removed from HTML)
   Fix #18: alert() replaced with inline #login-error element
   Fix #19: var → const/let throughout
   ============================================================ */

const UI = (function () {

    /* ── Login lock — prevents duplicate requests ─────────────── */
    let loginInProgress = false;

    /* ── Inline error helper (fix #18) ──────────────────────── */
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

    /* ── Rejected (fix #18) ──────────────────────────────────── */
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

        /* Fix #18: inline error instead of alert() */
        showLoginError('Access Denied: ' + (reason || 'Unauthorized'));
    }

    /* ── User List ───────────────────────────────────────────── */
    function updateUsers(users) {
        const ul = document.getElementById('users');
        if (!ul) return;
        ul.innerHTML = '';

        /* Update sidebar header with live count */
        const section = document.querySelector('.sidebar-section');
        if (section) {
            section.textContent = 'Online Users' + (users && users.length ? ' (' + users.length + ')' : '');
        }

        if (!users || users.length === 0) {
            const empty = document.createElement('li');
            empty.className = 'no-users';
            empty.style.listStyle = 'none';
            empty.textContent = '— none —';
            ul.appendChild(empty);
            return;
        }

        users.forEach(function (user) {
            const li = document.createElement('li');
            li.textContent = user;
            ul.appendChild(li);
        });
    }

    /* ── Utilities ───────────────────────────────────────────── */
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

    /* ── Live Stats Panel (Change #1) ───────────────────────── */
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

    /* ── Key bindings for login form + button listener (fix #17) */
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

        /* Fix #17: addEventListener replaces inline onclick */
        const loginBtn = document.getElementById('login-btn');
        if (loginBtn) {
            loginBtn.addEventListener('click', join);
        }
    });

    /* ── Reset login lock if socket disconnects ───────────────── */
    socket.on("disconnect", function () {
        loginInProgress = false;

        const pending = document.getElementById("pending-overlay");
        if (pending) pending.classList.remove("active");
    });

    return {
        join:        join,
        onApproved:  onApproved,
        onRejected:  onRejected,
        updateUsers: updateUsers,
        updateStats: updateStats,
        shakeEl:     shakeEl,
    };

})();