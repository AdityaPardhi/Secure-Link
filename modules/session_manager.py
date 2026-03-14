# =========================================
# 👥 SESSION MANAGER MODULE
# =========================================

"""
This module manages active user sessions
for the SecureLink LAN Communication System.

It stores information about currently connected users
and allows the server to track them.
"""

# =========================================
# 👤 ACTIVE USERS COUNT
# =========================================

# Dictionary storing currently connected users.
# Key   → socket session ID
# Value → username

# Example structure:
# {
#   "sd82h2jks": "User1",
#   "sk29dj39s": "User2"
# }

active_users = {}  
