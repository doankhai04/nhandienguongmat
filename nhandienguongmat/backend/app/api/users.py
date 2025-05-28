from flask import Blueprint, request, jsonify
from app.services import user_service
from app.utils.security import admin_required

users_bp = Blueprint('users_api', __name__, url_prefix='/api/users')

# GET /api/users - Lấy danh sách nhân viên (phân trang, tìm kiếm)
@users_bp.route('', methods=['GET'])
@admin_required
def get_users(current_user_is_admin):
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 15, type=int)
    search_query = request.args.get('search', None)

    pagination = user_service.get_all_users(search_query=search_query, page=page, per_page=per_page)

    if pagination:
        users_data = [
            {
                "id": user.id,
                "name": user.full_name,
                "workStatus": user.work_status,
                "hasFaceData": user.has_face_data
            } for user in pagination.items
        ]
        return jsonify({
            "users": users_data,
            "pagination": {
                "currentPage": pagination.page,
                "totalPages": pagination.pages,
                "totalItems": pagination.total,
                "perPage": pagination.per_page
            }
        }), 200
    else:
        return jsonify({"message": "Could not retrieve users"}), 500


# POST /api/users - Thêm nhân viên mới
@users_bp.route('', methods=['POST'])
@admin_required
def create_user(current_user_is_admin):
    data = request.get_json()
    user_id = data.get('id')
    full_name = data.get('name') # Đảm bảo frontend gửi 'name' thay vì 'fullname'
    work_status = data.get('status', 'new') # Lấy status từ frontend

    if not user_id or not full_name:
        return jsonify({"message": "User ID and Full Name are required"}), 400

    user, message = user_service.add_user(
        user_id=user_id,
        full_name=full_name,
        work_status=work_status,
        is_admin=False # Luôn là nhân viên khi tạo qua API này
    )

    if user:
        return jsonify({
            "message": message,
            "user": {
                "id": user.id,
                "name": user.full_name,
                "workStatus": user.work_status,
                "hasFaceData": user.has_face_data
            }
        }), 201
    else:
        status_code = 409 if "exists" in message else 400 # 409 Conflict nếu trùng
        return jsonify({"message": message}), status_code


# PUT /api/users/<user_id> - Cập nhật nhân viên
@users_bp.route('/<string:user_id>', methods=['PUT'])
@admin_required
def update_user_route(current_user_is_admin, user_id):
    data = request.get_json()
    full_name = data.get('name')
    work_status = data.get('status')

    if not full_name or not work_status:
        return jsonify({"message": "Full Name and Work Status are required"}), 400

    user, message = user_service.update_user(user_id, full_name, work_status)

    if user:
        return jsonify({
            "message": message,
            "user": {
                "id": user.id,
                "name": user.full_name,
                "workStatus": user.work_status,
                "hasFaceData": user.has_face_data
            }
        }), 200
    else:
        status_code = 404 if "not found" in message else 400
        return jsonify({"message": message}), status_code


# DELETE /api/users/<user_id> - Xóa nhân viên
@users_bp.route('/<string:user_id>', methods=['DELETE'])
@admin_required
def delete_user_route(current_user_is_admin, user_id):
    success, message = user_service.delete_user(user_id)
    if success:
        return jsonify({"message": message}), 200
    else:
        status_code = 404 if "not found" in message else 400
        # Có thể là 409 nếu không cho xóa do còn log điểm danh
        if "attendance logs" in message:
             status_code = 409
        return jsonify({"message": message}), status_code