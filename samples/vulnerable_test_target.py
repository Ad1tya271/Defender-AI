"""
DefenderAI Sample Vulnerability Test Target
============================================
This file contains realistic security flaws intended for testing DefenderAI's:
1. Semgrep SAST detection & normalization
2. AI Vulnerability Explanation (Root Cause, Attack Vector, Impact)
3. AI Remediation Patch Generation (Unified Diff)
4. Ephemeral AST Sandbox Verification

HOW TO USE IN DEFENDERAI:
1. Open http://localhost:3000 -> Login to Console
2. Go to Projects -> Open or Create a Project
3. In "Project Source", select "Paste Code"
4. Set Filename: vulnerable_target.py
5. Copy and paste this file's code -> Click "Save Code Snippet"
6. Click "Launch Automated Scan" (Semgrep SAST or Hybrid)
"""

import os
import sqlite3
import pickle
import hashlib
import subprocess
from flask import Flask, request, jsonify

app = Flask(__name__)

# ==============================================================================
# Flaw 1: CWE-798 - Hardcoded Sensitive JWT / Cryptographic Secret
# ==============================================================================
APP_SECRET_KEY = "super_secret_production_jwt_signing_key_never_share"
DATABASE_PATH = "production_users.db"


def get_db():
    conn = sqlite3.connect(DATABASE_PATH)
    conn.row_factory = sqlite3.Row
    return conn


# ==============================================================================
# Flaw 2: CWE-89 - SQL Injection via Raw String Concatenation
# ==============================================================================
@app.route("/api/user", methods=["GET"])
def get_user_profile():
    user_id = request.args.get("id", "")
    db = get_db()
    
    # [VULNERABILITY] Untrusted input concatenated directly into SQL statement
    query = f"SELECT id, username, email, role FROM users WHERE id = '{user_id}'"
    cursor = db.cursor()
    cursor.execute(query)
    user = cursor.fetchone()
    
    if not user:
        return jsonify({"error": "User not found"}), 404
        
    return jsonify(dict(user))


# ==============================================================================
# Flaw 3: CWE-78 - OS Command Injection via Shell Execution
# ==============================================================================
@app.route("/api/network/ping", methods=["POST"])
def ping_host():
    data = request.get_json() or {}
    host = data.get("host", "127.0.0.1")
    
    # [VULNERABILITY] User parameter executed directly in system shell
    command = f"ping -c 1 {host}"
    output = subprocess.check_output(command, shell=True, text=True)
    
    return jsonify({"output": output})


# ==============================================================================
# Flaw 4: CWE-502 - Insecure Deserialization via Python Pickle
# ==============================================================================
@app.route("/api/session/load", methods=["POST"])
def load_session_state():
    raw_payload = request.data
    
    # [VULNERABILITY] Arbitrary code execution via untrusted pickle payload
    session_data = pickle.loads(raw_payload)
    
    return jsonify({"status": "loaded", "session": str(session_data)})


# ==============================================================================
# Flaw 5: CWE-22 - Path Traversal (Arbitrary File Read)
# ==============================================================================
@app.route("/api/reports/view", methods=["GET"])
def view_report_document():
    filename = request.args.get("doc", "summary.txt")
    
    # [VULNERABILITY] User input controls path without directory traversal containment
    file_path = os.path.join("/var/log/reports", filename)
    with open(file_path, "r", encoding="utf-8") as f:
        content = f.read()
        
    return jsonify({"document": filename, "content": content})


# ==============================================================================
# Flaw 6: CWE-327 - Broken / Weak Cryptographic Hash (MD5 for Passwords)
# ==============================================================================
def hash_user_password(password: str) -> str:
    # [VULNERABILITY] Broken MD5 cryptographic hash function used for passwords
    hasher = hashlib.md5()
    hasher.update(password.encode("utf-8"))
    return hasher.hexdigest()


if __name__ == "__main__":
    app.run(host="0.0.0.0", port=5000, debug=True)
