/* ============================================================
   SecureLink — ui.js
   Handles UI state, login flow, and user list updates
   ============================================================ */

var UI = (function () {

    /* ── Login lock — prevents duplicate requests (improvement #1) */
    var loginInProgress = false;

    /* ── Login ───────────────────────────────────────────────── */
    function join() {
        /* Block if a request is already in flight (improvement #1) */
        if (loginInProgress) return;

        var username = document.getElementById('username').value.trim();
        var password = document.getElementById('password').value.trim();

        console.log('Login attempt:', username); /* debug log (improvement #2) */

        /* Validate BEFORE locking — so empty fields don't block future attempts */
        if (!username || !password) {
            shakeEl(document.querySelector('.login-box'));
            return;
        }

        loginInProgress = true; /* Lock only after validation passes */

        // Show pending overlay
        var pending = document.getElementById('pending-overlay');
        if (pending) pending.classList.add('active');

        socket.emit('join_request', { username: username, password: password });
    }

    /* ── Approved ────────────────────────────────────────────── */
    function onApproved() {
        console.log('User approved — secure session started'); /* debug log (improvement #2) */

        // Hide login & pending overlays
        var loginOverlay = document.getElementById('login-overlay');
        if (loginOverlay) {
            loginOverlay.style.transition = 'opacity 0.4s';
            loginOverlay.style.opacity = '0';
            setTimeout(function () { loginOverlay.style.display = 'none'; }, 400);
        }

        var pending = document.getElementById('pending-overlay');
        if (pending) pending.classList.remove('active');

        // Swap locked panel -> chat panel
        var locked = document.getElementById('locked-panel');
        if (locked) locked.style.display = 'none';

        var chatPanel = document.getElementById('chat-visible');
        if (chatPanel) {
            chatPanel.style.display = 'flex';
            chatPanel.style.flexDirection = 'column';
        }

        // System welcome message
        Chat.appendSystem('Secure channel established. Welcome.');

        // Focus input
        var msgInput = document.getElementById('message');
        if (msgInput) setTimeout(function () { msgInput.focus(); }, 100);
    }

    /* ── Rejected ────────────────────────────────────────────── */
    function onRejected(reason) {
        console.warn('Access rejected:', reason); /* debug log (improvement #2) */

        /* Reset login lock so user can try again (improvement #1) */
        loginInProgress = false;

        var pending = document.getElementById('pending-overlay');
        if (pending) pending.classList.remove('active');

        var loginBox = document.querySelector('.login-box');
        if (loginBox) {
            loginBox.classList.add('rejected');
            setTimeout(function () { loginBox.classList.remove('rejected'); }, 700);
            shakeEl(loginBox);
        }

        /* Clear password field for security (improvement #4) */
        var pass = document.getElementById('password');
        if (pass) pass.value = '';

        setTimeout(function () {
            alert('Access Denied: ' + (reason || 'Unauthorized'));
        }, 100);
    }

    /* ── User List ───────────────────────────────────────────── */
    function updateUsers(users) {
        var ul = document.getElementById('users');
        if (!ul) return;
        ul.innerHTML = '';

        /* Update sidebar header with live count (improvement #3) */
        var section = document.querySelector('.sidebar-section');
        if (section) {
            section.textContent = 'Online Users' + (users && users.length ? ' (' + users.length + ')' : '');
        }

        if (!users || users.length === 0) {
            var empty = document.createElement('li');
            empty.className = 'no-users';
            empty.style.listStyle = 'none';
            empty.textContent = '— none —';
            ul.appendChild(empty);
            return;
        }

        users.forEach(function (user) {
            var li = document.createElement('li');
            li.textContent = user;
            ul.appendChild(li);
        });
    }

    /* ── Utilities ───────────────────────────────────────────── */
    function shakeEl(el) {
        if (!el) return;
        el.classList.remove('shake');
        // Force reflow to restart animation
        void el.offsetWidth;
        el.classList.add('shake');
        el.addEventListener('animationend', function handler() {
            el.classList.remove('shake');
            el.removeEventListener('animationend', handler);
        });
    }

    /* ── Key bindings for login form ─────────────────────────── */
    document.addEventListener('DOMContentLoaded', function () {
        var usernameInput = document.getElementById('username');
        var passwordInput = document.getElementById('password');

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
    });

    /* ── Reset login lock if socket disconnects ───────────────── */
    socket.on("disconnect", function () {

        loginInProgress = false;

        var pending = document.getElementById("pending-overlay");
        if (pending) pending.classList.remove("active");

    });

    return {
        join:        join,
        onApproved:  onApproved,
        onRejected:  onRejected,
        updateUsers: updateUsers,
        shakeEl:     shakeEl
    };

})();