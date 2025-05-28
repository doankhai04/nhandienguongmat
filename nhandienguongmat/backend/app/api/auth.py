from flask import Blueprint, request, jsonify
from app.services import auth_service
from app.utils.security import admin_required # Sử dụng decorator

auth_bp = Blueprint('auth_api', __name__, url_prefix='/api')

@auth_bp.route('/login', methods=['POST'])
def login():
    data = request.get_json()
    if not data or not data.get('username') or not data.get('password'):
        return jsonify({'message': 'Username and password required!'}), 400

    username = data['username']
    password = data['password']

    auth_result = auth_service.authenticate_admin(username, password)

    if auth_result:
        return jsonify(auth_result), 200
    else:
        return jsonify({'message': 'Invalid credentials!'}), 401

@auth_bp.route('/account/change-password', methods=['POST'])
@admin_required # Chỉ admin mới được đổi mật khẩu (của chính mình)
def change_password(current_user_is_admin): # Nhận is_admin từ decorator
    data = request.get_json()
    current_password = data.get('currentPassword')
    new_password = data.get('newPassword')

    if not current_password or not new_password:
        return jsonify({'message': 'Current and new passwords required!'}), 400
    if len(new_password) < 6:
        return jsonify({'message': 'New password must be at least 6 characters!'}), 400

    # Lấy admin_id từ token (cần sửa decorator hoặc lấy từ payload)
    # Giả sử token_required đã lưu payload vào `g` hoặc trả về trực tiếp
    from flask import g # Hoặc cách khác để lấy user_id từ token
    admin_id = g.user_id # Giả định user_id được lưu trong g bởi decorator

    success, message = auth_service.change_admin_password(admin_id, current_password, new_password)

    if success:
        return jsonify({'message': message}), 200
    else:
        # Trả về 401 nếu sai mật khẩu hiện tại, 500 hoặc 400 cho lỗi khác
        status_code = 401 if "Incorrect current password" in message else 400
        return jsonify({'message': message}), status_code

# Lưu ý: Cần sửa decorator token_required để truyền user_id vào function, ví dụ qua `g`
# Hoặc sửa decorator để nhận user_id: def change_password(current_user_id, current_user_is_admin): ...