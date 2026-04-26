/* ============================================================
   SecureLink — crypto.js
   AES-256-CTR encryption using aes-js (pure JavaScript).
   Works over plain HTTP — no browser secure-context restriction.
   ============================================================ */

const SecureCrypto = (function () {

    let _keyBytes = null;   // Uint8Array (32 bytes = 256-bit key)

    /* ── Helpers ─────────────────────────────────────────────── */
    function hexToBytes(hex) {
        const bytes = new Uint8Array(hex.length / 2);
        for (let i = 0; i < bytes.length; i++) {
            bytes[i] = parseInt(hex.substr(i * 2, 2), 16);
        }
        return bytes;
    }

    // Helpers removed to use native async browser functions

    /* ── Public API ──────────────────────────────────────────── */

    /**
     * Import the raw AES key (hex string from server).
     * Returns a resolved Promise for API compatibility with socket.js.
     */
    function init(hexKey) {
        try {
            _keyBytes = hexToBytes(hexKey);
            console.log('[SecureCrypto] AES-256-CTR key loaded (aes-js, HTTP-safe).');
            return Promise.resolve();
        } catch (e) {
            return Promise.reject(e);
        }
    }

    /**
     * Encrypt plaintext → base64(IV[16] + ciphertext).
     * Uses crypto.getRandomValues() for IV — this DOES work over HTTP.
     */
    function encrypt(plaintext) {
        if (!_keyBytes) return Promise.reject(new Error('Crypto not initialized'));
        try {
            const iv = new Uint8Array(16);
            crypto.getRandomValues(iv);   // safe over HTTP (only subtle is restricted)

            const textBytes    = new TextEncoder().encode(plaintext);
            const aesCtr       = new aesjs.ModeOfOperation.ctr(
                Array.from(_keyBytes),
                new aesjs.Counter(Array.from(iv))
            );
            const encryptedBytes = aesCtr.encrypt(textBytes);

            // Pack: IV(16) + ciphertext
            const combined = new Uint8Array(16 + encryptedBytes.length);
            combined.set(iv, 0);
            combined.set(encryptedBytes, 16);

            return new Promise(function(resolve, reject) {
                const blob = new Blob([combined], { type: 'application/octet-stream' });
                const reader = new FileReader();
                reader.onload = function(e) {
                    const dataUrl = e.target.result;
                    resolve(dataUrl.substring(dataUrl.indexOf(',') + 1));
                };
                reader.onerror = reject;
                reader.readAsDataURL(blob);
            });
        } catch (e) {
            return Promise.reject(e);
        }
    }

    /**
     * Decrypt base64(IV[16] + ciphertext) → plaintext string.
     */
    function decrypt(b64) {
        if (!_keyBytes) return Promise.reject(new Error('Crypto not initialized'));
        return fetch('data:application/octet-stream;base64,' + b64)
            .then(function(res) { return res.arrayBuffer(); })
            .then(function(buffer) {
                const combined = new Uint8Array(buffer);
                const iv             = combined.slice(0, 16);
                const ciphertext     = combined.slice(16);

                const aesCtr         = new aesjs.ModeOfOperation.ctr(
                    Array.from(_keyBytes),
                    new aesjs.Counter(Array.from(iv))
                );
                const decryptedBytes = aesCtr.decrypt(ciphertext);

                return new TextDecoder().decode(decryptedBytes);
            });
    }

    function isReady() { return _keyBytes !== null; }

    return { init: init, encrypt: encrypt, decrypt: decrypt, isReady: isReady };

})();
