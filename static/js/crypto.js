/* ============================================================
   SecureLink — crypto.js
   AES-256-GCM encryption using the browser's Web Crypto API.
   No external libraries — works fully offline.

   Change #9: End-to-end encryption.
   The server never sees plaintext — it relays ciphertext only.
   ============================================================ */

const SecureCrypto = (function () {

    let _key = null;  // CryptoKey object, set on approval

    /* ── Helpers ─────────────────────────────────────────────── */
    function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    function bytesToBase64(bytes) {
        let bin = '';
        bytes.forEach(function (b) { bin += String.fromCharCode(b); });
        return btoa(bin);
    }

    function base64ToBytes(b64) {
        return Uint8Array.from(atob(b64), function (c) { return c.charCodeAt(0); });
    }

    /* ── Public API ──────────────────────────────────────────── */

    /**
     * Import the raw AES key (hex string from server).
     * Must be called before encrypt/decrypt.
     */
    function init(hexKey) {
        const keyBytes = hexToBytes(hexKey);
        return crypto.subtle.importKey(
            'raw',
            keyBytes,
            { name: 'AES-GCM' },
            false,                          // not extractable
            ['encrypt', 'decrypt']
        ).then(function (cryptoKey) {
            _key = cryptoKey;
            console.log('[SecureCrypto] AES-256-GCM key loaded.');
        });
    }

    /**
     * Encrypt plaintext → base64(IV + ciphertext).
     * Each call generates a fresh random 12-byte IV.
     */
    function encrypt(plaintext) {
        if (!_key) return Promise.reject(new Error('Crypto not initialized'));
        const iv       = crypto.getRandomValues(new Uint8Array(12));
        const encoded  = new TextEncoder().encode(plaintext);
        return crypto.subtle.encrypt({ name: 'AES-GCM', iv: iv }, _key, encoded)
            .then(function (ciphertext) {
                const combined = new Uint8Array(12 + ciphertext.byteLength);
                combined.set(iv, 0);
                combined.set(new Uint8Array(ciphertext), 12);
                return bytesToBase64(combined);
            });
    }

    /**
     * Decrypt base64(IV + ciphertext) → plaintext string.
     */
    function decrypt(b64) {
        if (!_key) return Promise.reject(new Error('Crypto not initialized'));
        const combined  = base64ToBytes(b64);
        const iv        = combined.slice(0, 12);
        const ciphertext = combined.slice(12);
        return crypto.subtle.decrypt({ name: 'AES-GCM', iv: iv }, _key, ciphertext)
            .then(function (decrypted) {
                return new TextDecoder().decode(decrypted);
            });
    }

    function isReady() { return _key !== null; }

    return { init: init, encrypt: encrypt, decrypt: decrypt, isReady: isReady };

})();
