# SecureLink – Secure LAN Communication System

## Overview

SecureLink is a lightweight **LAN-based secure messaging system** designed for communication within a local network without requiring internet connectivity.

The system enables multiple clients connected to the same LAN to communicate through a centralized server while maintaining session control and monitoring network activity.

This project demonstrates concepts from:

* Computer Networks
* Secure Communication Systems
* Client–Server Architecture
* Real-time messaging using WebSockets

---

## Key Features

* Local network messaging (no internet required)
* Real-time communication between clients
* Centralized server session management
* Network activity monitoring
* Basic security checks for sessions
* Lightweight and fast deployment

---

## System Architecture

Client (Browser)
↓
WebSocket Connection
↓
Flask Server
↓
Modules:

* session_manager.py
* security.py
* network_monitor.py

---

## Project Structure

```
SecureLANProject
│
├── modules
│   ├── network_monitor.py
│   ├── security.py
│   └── session_manager.py
│
├── static
│   ├── css
│   │   └── style.css
│   └── js
│       ├── chat.js
│       ├── socket.js
│       └── ui.js
│
├── templates
│   └── index.html
│
├── server.py
├── requirements.txt
├── README.md
└── .gitignore
```

---

## Technologies Used

* Python
* Flask
* Flask-SocketIO
* HTML
* CSS
* JavaScript
* WebSockets

---

## Installation

### 1. Clone the repository

```
git clone https://github.com/AdityaPardhi/Secure-Link.git
```

### 2. Navigate to the project

```
cd SecureLANProject
```

### 3. Install dependencies

```
pip install -r requirements.txt
```

### 4. Run the server

```
python server.py
```

---

## Usage

1. Start the server.
2. Connect devices to the same LAN.
3. Open the server IP in a browser.

Example:

```
http://192.168.x.x:5000
```

Users connected to the same network can now communicate securely.

---

## Future Improvements

* Message encryption
* Admin control panel
* Intrusion detection alerts
* Packet delay and packet loss simulation
* File transfer over LAN
* Network topology visualization

---

## Author

Aditya Pardhi
AI&DS Student
