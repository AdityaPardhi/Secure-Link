# SecureLink - Project Overview

---

## 1. PROJECT OVERVIEW

* **What the project is:** SecureLink is a specialized, lightweight local area network (LAN) communication terminal. It allows users on the same network to chat, send voice notes, and share files securely.
* **What problem it solves:** Standard messaging apps rely on third-party internet servers, which can be a privacy concern or simply unavailable in air-gapped or restricted network environments. SecureLink provides an offline, self-hosted, encrypted communication channel that works entirely within a local network.
* **Type of system:** A Secure LAN Messaging System with an isolated Client-Server architecture.

---

## 2. SYSTEM ARCHITECTURE

* **Overall Architecture:** 
  * **Frontend:** A vanilla HTML/CSS/JavaScript client acting as a terminal interface. It handles AES encryption locally before transmission.
  * **Backend:** A Python Flask server utilizing Flask-SocketIO to manage WebSocket connections, user queues, and message relaying.
  * **Modules:** The backend logic is decoupled into specific modules: `security.py` (access control), `session_manager.py` (state and roles), and `network_monitor.py` (telemetry).
* **Data Flow:** The user inputs data → Frontend JS encrypts it → Encrypted payload is transmitted via Socket.IO → Backend receives ciphertext and broadcasts it (without decrypting) → Receiving clients catch the broadcast → Frontend JS decrypts and renders the content.
* **Technologies Used:** Python, Flask, Flask-SocketIO, HTML5, Vanilla CSS, Vanilla JavaScript, `socket.io.min.js`, and `aes.js` (for client-side cryptography).

---

## 3. FILE-BY-FILE EXPLANATION

### Backend Files
* **`server.py`:** The core entry point of the application. It initializes the Flask app and Socket.IO server, sets the session access key, and defines all WebSocket event handlers (join requests, sending messages, files, voice notes, and admin controls).
* **`modules/security.py`:** Contains the `SecurityManager` class. It is responsible for tracking failed authentication attempts, auto-blocking IPs after repeated failures, and maintaining an optional IP whitelist.
* **`modules/session_manager.py`:** Contains the `SessionManager` class. It manages active user sessions, mapping Socket IDs to usernames and IPs. It also handles Role-Based Access Control (RBAC) states like `role` (user/moderator/admin) and `muted` status.
* **`modules/network_monitor.py`:** A thread-safe statistics tracker. It records total messages, files, bytes transferred, and calculates network throughput. It generates a summary report (`session.txt`) when the server shuts down.

### Frontend Files (static/js)
* **`static/js/chat.js`:** Manages all chat-related UI logic. It handles appending text messages, rendering file downloads, and initializing the `MediaRecorder` for voice messaging. It calls the crypto module before sending data.
* **`static/js/socket.js`:** The Socket.IO event listener map. It listens for server broadcasts (like `receive_message`, `approved`, `kicked`, `update_users`) and routes them to the appropriate UI or Chat functions.
* **`static/js/ui.js`:** Handles the application's interface state. It manages the login/authentication flow, updates the live active users list, updates the network statistics panel, and drives the admin dashboard interactions.
* **`static/js/crypto.js`:** A wrapper around the `aes.js` library. It implements AES-256-CTR encryption and decryption. It handles generating a secure Initialization Vector (IV) using `crypto.getRandomValues()` and packing/unpacking the base64 payload.
* **`static/js/aes.js`:** A pure JavaScript implementation of the Advanced Encryption Standard, allowing encryption to run locally in the browser even without an HTTPS secure context.

### Templates
* **`templates/index.html`:** The main client-facing terminal UI. Contains the login overlay, chat window, active users sidebar, and live network statistics.
* **`templates/admin.html`:** A dedicated dashboard for the session host. It allows the admin to approve/reject pending join requests, kick/block active users, view intrusion alerts, and monitor a decrypted feed of the chat.

---

## 4. CORE FEATURES IMPLEMENTED

* **Real-time chat system:** Low-latency text messaging facilitated by WebSockets.
* **AES encryption:** Uses AES-256 in CTR mode. The backend generates a secure 256-bit key at startup and distributes it only to approved clients. The server only relays ciphertext; encryption and decryption happen exclusively in the browser.
* **Admin approval system:** Users providing the correct password are put in a "pending" queue. They cannot see the chat or receive the AES key until the admin manually clicks "Approve" in the dashboard.
* **IP blocking and intrusion detection:** If an IP fails to authenticate 3 times, it is permanently blocked. The admin dashboard receives live alerts of unauthorized access attempts.
* **Packet simulation:** Every message is assigned a sequential packet ID by the network monitor to simulate packet tracking in a raw network environment.
* **Auto message deletion:** Messages are highly ephemeral. The server spawns a background thread for every message that emits a "delete" command after 10 seconds, removing it from all clients' screens.
* **Session reporting:** Upon server termination, a highly detailed report of throughput, file types, and total data transferred is saved to `session.txt`.
* **File/image transfer:** Files are converted to Base64, encrypted, and transmitted over WebSockets. Receivers decrypt the Base64 string and reconstruct a downloadable `Blob`.
* **Voice messaging:** Uses the browser's `MediaRecorder` API to capture microphone input, packages it as a WebM audio blob, encrypts it, and plays it inline on receiving clients using HTML5 audio tags.
* **Role-based access control:** Admins can promote users to "moderator". Moderators can kick, block, and mute disruptive users, but cannot approve new joins or view the admin dashboard.
* **Reconnection handling:** If a client drops due to a network hiccup, the server remembers their disconnection time. If they rejoin within 5 minutes, they bypass the admin queue and reconnect seamlessly.
* **Max user limit:** The server explicitly caps concurrent connections at 10 to prevent network flooding or bot spam.
* **Timeout-based auto rejection:** If an admin is away and a user requests access, the server will automatically reject the request after 60 seconds to prevent indefinite hanging.

---

## 5. NETWORKING CONCEPTS USED

* **Client–Server architecture:** The system relies on a central Flask server that coordinates the state and relays messages between thin frontend clients.
* **LAN communication:** The server detects its local network interface IP (e.g., `192.168.x.x`) and binds to `0.0.0.0`, restricting usage to devices on the same subnet router.
* **Socket communication:** Employs WebSockets (via Socket.IO) to maintain persistent, full-duplex TCP connections rather than using standard HTTP polling.
* **Packet transmission:** Conceptualizes messages as raw data payloads, counting byte sizes and assigning packet sequence numbers to track data flow.
* **Broadcast vs Unicast:** General chat messages are *broadcast* (sent to all connected sockets). Private messages `/dm` and admin approval tokens are *unicast* (emitted to a specific socket ID).
* **Network security:** Implements firewall-like behavior via application-level IP whitelisting and blocklisting.
* **Intrusion detection:** Monitors connection attempts and triggers real-time telemetry alerts on the admin dashboard when anomalies (like brute-force password guessing) occur.
* **Throughput / monitoring:** Continuously calculates `(Total Bytes Transferred) / (Session Uptime)` to provide real-time bandwidth utilization metrics.

---

## 6. SECURITY FEATURES

* **Password protection:** All users must know a pre-shared access key set by the host at server boot.
* **IP blocking:** Automatic mitigation of brute-force attacks by blacklisting IP addresses.
* **AES encryption:** Symmetric AES-256-CTR. The flow: 
  1. Server generates Key. 
  2. Server sends Key to approved user. 
  3. User encrypts payload using `aes.js` + secure random IV. 
  4. Server relays payload blindly. 
  5. Receiving users decrypt using the Key.
* **Input validation:** Usernames are strictly validated against a Regex pattern (`^[a-zA-Z0-9_\-]+$`) and a length limit (20 chars) to prevent XSS and injection attacks.
* **Vulnerabilities remaining:** 
  * *Key Exchange over HTTP:* Because the system is designed to run locally without SSL certificates, the initial distribution of the AES key happens over plain HTTP WebSockets. If a malicious actor is already running a packet sniffer (MITM) on the LAN, they could intercept the AES key during the approval phase.
  * *Denial of Service (DoS):* The server lacks strict rate-limiting on large file uploads, meaning a rogue approved client could flood the server's RAM with 5MB payloads.

---

## 7. DATA FLOW EXPLANATION

1. **User joins:** User navigates to `http://<LAN-IP>:5000` and enters their username and access key.
2. **Authentication:** The server hashes the provided key and compares it. If correct, the IP is cleared of failures, and the user's socket ID is placed in a `_pending` dictionary. The admin dashboard is pinged.
3. **Approval:** The admin clicks "Approve". The server moves the user to the `SessionManager`, broadcasts the AES-256 key to the user's socket, and alerts the room.
4. **Message sending:** The user types a message. `crypto.js` generates a 16-byte IV, encrypts the text, and concatenates the IV and ciphertext into a Base64 string.
5. **Transmission:** The client emits the Base64 string to the server. The server assigns a packet ID, increments network stats, and broadcasts the exact string.
6. **Decryption:** Receiving clients slice the first 16 bytes (IV) off the Base64 string and use the AES key to decrypt the remaining ciphertext into plain text.
7. **Disconnection:** The user closes the tab. The server triggers a `disconnect` event, records the timestamp for reconnection logic, and informs the room.
8. **Session logging:** When the admin stops the Python script, a `finally` block triggers the `network_monitor` to flush all tracked metrics to a local `session.txt` file.

---

## 8. TESTING IMPLEMENTATION

* **What tests are written:** Two automated unit test suites using Python's built-in `unittest` framework: `test_security.py` and `test_server.py`.
* **What is tested:** 
  * Security: Tests verify that failure counts increment correctly, IPs are blocked precisely on the 3rd attempt, and whitelist rules correctly restrict access.
  * Server: Uses `socketio.test_client()` to mock WebSocket connections, ensuring that missing usernames, invalid formats, and bad passwords trigger the correct `rejected` events.
* **How tests are executed:** By running `python -m unittest discover tests` in the terminal.
* **Why testing is important:** For a security-focused application, regressions in logic (like accidentally allowing an empty password or breaking the IP blocklist) are critical failures. Automated tests ensure core defenses remain intact as new features are added.

---

## 9. STRENGTHS OF THE PROJECT

* **True Zero-Trust Backend:** The backend server never decrypts text messages or files. It acts purely as a blind relay, meaning even if the server code was modified to log messages, it would only capture ciphertext.
* **HTTP-Compatible Cryptography:** By utilizing `aes.js`, the project achieves robust encryption without requiring the browser's native `SubtleCrypto` API, which is strictly disabled by browsers on non-HTTPS connections. This makes the project highly portable for impromptu LAN usage.
* **Strict Gatekeeping:** The combination of an access key *and* manual admin approval prevents unwanted LAN scanners from silently joining the chat.

---

## 10. LIMITATIONS / WEAKNESSES

* **Current limitations:** The 5MB file transfer limit is a hard cap due to the inefficiency of encoding binary files as Base64 strings and sending them over WebSocket frames.
* **Scalability:** Python's Global Interpreter Lock (GIL) and the use of basic threading for Socket.IO means the server will likely struggle if concurrent connections scale beyond 50-100 users heavily transferring files.
* **Vulnerable Key Exchange:** As mentioned, without HTTPS, the AES key is transmitted in plaintext during the approval handshake.

---

## 11. FUTURE IMPROVEMENTS

* **End-to-End Encryption (E2EE):** Implement an Elliptic-Curve Diffie-Hellman (ECDH) key exchange mechanism directly between clients. This ensures the AES key is negotiated peer-to-peer, completely eliminating the MITM vulnerability during the approval phase.
* **File transfer improvements:** Integrate WebRTC. The server can act merely as a signaling server to connect peers, allowing users to transfer files directly (P2P) without limits, bypassing the server entirely.
* **Network simulation (delay/loss):** Enhance the network monitor to actively introduce artificial latency (e.g., `time.sleep()`) or randomly drop packets to test resilience.
* **Admin dashboard UI:** Add visual, graphical charts (using Chart.js) to plot network throughput and user activity over time, rather than just raw numbers.
* **Better scalability:** Migrate the backend from Flask-SocketIO to an asynchronous framework like FastAPI with native WebSockets to handle concurrent I/O operations far more efficiently.
