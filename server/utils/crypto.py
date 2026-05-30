import os
import base64

JWT_SECRET = os.getenv("JWT_SECRET") or "default_fallback_jwt_secret_value_for_auris_production"

def encrypt_string(data: str) -> str:
    """Symmetric XOR encryption helper for store credentials."""
    if not data:
        return ""
    key_bytes = JWT_SECRET.encode('utf-8')
    data_bytes = data.encode('utf-8')
    encrypted = bytes([b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(data_bytes)])
    return base64.b64encode(encrypted).decode('utf-8')

def decrypt_string(data: str) -> str:
    """Symmetric XOR decryption helper for store credentials."""
    if not data:
        return ""
    try:
        key_bytes = JWT_SECRET.encode('utf-8')
        encrypted = base64.b64decode(data.encode('utf-8'))
        decrypted = bytes([b ^ key_bytes[i % len(key_bytes)] for i, b in enumerate(encrypted)])
        return decrypted.decode('utf-8')
    except Exception:
        return ""
