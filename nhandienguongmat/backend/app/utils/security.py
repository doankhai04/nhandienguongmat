import jwt
from datetime import datetime, timedelta, timezone
from flask import current_app, request, jsonify
from functools import wraps
from app.extensions import bcrypt
from app.models import User

def hash_password(password):
    return bcrypt.generate_password_hash(password).decode('utf-8')

def check_password(hashed_password, password):
    return bcrypt.check_password_hash(hashed_password, password)

def generate_token(user_id, is_admin):
    payload = {
        'sub': user_id, # Subject (user ID)
        'is_admin': is_admin,
        'iat': datetime.now(timezone.utc), # Issued at
        'exp': datetime.now(timezone.utc) + timedelta(hours=24) # Expires in 24 hours
    }
    return jwt.encode(payload, current_app.config['JWT_SECRET_KEY'], algorithm='HS256')

def decode_token(token):
    try:
        payload = jwt.decode(token, current_app.config['JWT_SECRET_KEY'], algorithms=['HS256'])
        return payload
    except jwt.ExpiredSignatureError:
        return 'Token expired. Please log in again.'
    except jwt.InvalidTokenError:
        return 'Invalid token. Please log in again.'

# Decorator để yêu cầu token xác thực
def token_required(f):
    @wraps(f)
    def decorated(*args, **kwargs):
        token = None
        if 'Authorization' in request.headers:
            auth_header = request.headers['Authorization']
            try:
                token = auth_header.split(" ")[1]
            except IndexError:
                return jsonify({'message': 'Bearer token malformed!'}), 401

        if not token:
            return jsonify({'message': 'Token is missing!'}), 401

        payload = decode_token(token)
        if isinstance(payload, str): # Check if decode_token returned an error string
            return jsonify({'message': payload}), 401

        # Lưu thông tin user vào context request (tùy chọn)
        current_user_id = payload.get('sub')
        is_admin = payload.get('is_admin')
        if not current_user_id:
             return jsonify({'message': 'Token is invalid!'}), 401

        # kwargs['current_user_id'] = current_user_id
        kwargs['current_user_is_admin'] = is_admin

        return f(*args, **kwargs)
    return decorated

# Decorator để yêu cầu quyền Admin
def admin_required(f):
    @wraps(f)
    @token_required # Đảm bảo đã login trước
    def decorated(*args, **kwargs):
        if not kwargs.get('current_user_is_admin'):
            return jsonify({'message': 'Admin privilege required!'}), 403
        return f(*args, **kwargs)
    return decorated