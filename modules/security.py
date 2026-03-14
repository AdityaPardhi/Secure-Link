# =========================================
# 🔐 SECURITY MODULE
# =========================================

"""
This module manages all security-related variables
for the SecureLink LAN Communication System.

It stores:
- Failed login attempts
- Blocked IP addresses
- Optional IP whitelist
"""

# =========================================
# 🚨 FAILED LOGIN ATTEMPTS
# =========================================

# Dictionary to track failed login attempts
# Format:
# {
#   "192.168.1.10": 2,
#   "192.168.1.15": 1
# }

failed_attempts = {}


# =========================================
# 🚫 BLOCKED IP ADDRESSES
# =========================================

# Set storing IPs blocked after multiple
# unauthorized access attempts

blocked_ips = set()


# =========================================
# 🔒 OPTIONAL IP WHITELIST
# =========================================

"""
If this list is empty → all LAN devices allowed

If IPs are added → only those IPs can connect

Example:
allowed_ips = ["192.168.1.5", "192.168.1.7"]
"""

allowed_ips = []