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

    function bytesToBase64(bytes) {
        let bin = '';
        for (let i = 0; i < bytes.length; i++) {
            bin += String.fromCharCode(bytes[i]);
        }
        return btoa(bin);
    }

    function base64ToBytes(b64) {
        const bin  = atob(b64);
        const bytes = new Uint8Array(bin.length);
        for (let i = 0; i < bin.length; i++) {
            bytes[i] = bin.charCodeAt(i);
        }
        return bytes;
    }

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

            const textBytes    = aesjs.utils.utf8.toBytes(plaintext);
            const aesCtr       = new aesjs.ModeOfOperation.ctr(
                Array.from(_keyBytes),
                new aesjs.Counter(Array.from(iv))
            );
            const encryptedBytes = aesCtr.encrypt(textBytes);

            // Pack: IV(16) + ciphertext
            const combined = new Uint8Array(16 + encryptedBytes.length);
            combined.set(iv, 0);
            combined.set(encryptedBytes, 16);

            return Promise.resolve(bytesToBase64(combined));
        } catch (e) {
            return Promise.reject(e);
        }
    }

    /**
     * Decrypt base64(IV[16] + ciphertext) → plaintext string.
     */
    function decrypt(b64) {
        if (!_keyBytes) return Promise.reject(new Error('Crypto not initialized'));
        try {
            const combined       = base64ToBytes(b64);
            const iv             = combined.slice(0, 16);
            const ciphertext     = combined.slice(16);

            const aesCtr         = new aesjs.ModeOfOperation.ctr(
                Array.from(_keyBytes),
                new aesjs.Counter(Array.from(iv))
            );
            const decryptedBytes = aesCtr.decrypt(ciphertext);

            return Promise.resolve(aesjs.utils.utf8.fromBytes(decryptedBytes));
        } catch (e) {
            return Promise.reject(e);
        }
    }

    function isReady() { return _keyBytes !== null; }

    return { init: init, encrypt: encrypt, decrypt: decrypt, isReady: isReady };

})();
