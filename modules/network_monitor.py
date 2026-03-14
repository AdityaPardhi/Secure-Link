import time
from datetime import datetime


# =========================================
# 📊 NETWORK MONITORING VARIABLES
# =========================================

total_messages = 0
total_bytes = 0
packet_counter = 0
session_start_time = time.time()


# =========================================
# 📊 SESSION REPORT GENERATOR
# =========================================

def generate_report(server_ip):

    session_end_time = time.time()

    session_duration = session_end_time - session_start_time

    throughput = total_bytes / session_duration if session_duration > 0 else 0


    report = f"""
==============================
 SECURE SESSION REPORT
==============================
Server IP               : {server_ip}
Session Duration        : {round(session_duration, 2)} seconds
Total Messages Sent     : {total_messages}
Total Data Transferred  : {total_bytes} bytes
Average Throughput      : {round(throughput, 2)} bytes/sec
Total Unique Packets    : {packet_counter}
==============================
Session End Time        : {datetime.now().strftime("%d-%m-%Y %H:%M:%S")}
==============================

"""


    print("\n🛑 SECURE SESSION TERMINATED")
    print(report)


    with open("session.txt", "a") as f:
        f.write(report)


    print("📁 Session report saved to session.txt\n")