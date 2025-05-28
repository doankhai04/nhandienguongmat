from flask import Blueprint, request, jsonify, send_from_directory, current_app
from app.services import face_service, user_service # user_service được dùng ở GET /
from app.utils.security import admin_required
import os

faces_bp = Blueprint('faces_api', __name__, url_prefix='/api/faces')

@faces_bp.route('', methods=['POST'])
@admin_required
def add_faces(current_user_is_admin): # Tham số từ decorator phải có
    data = request.get_json()
    user_id = data.get('employeeId')
    photo_data_urls = data.get('photos')

    if not user_id or not photo_data_urls or not isinstance(photo_data_urls, list):
        return jsonify({'message': 'Employee ID and a list of photos are required!'}), 400

    success, message = face_service.add_face_encodings(user_id, photo_data_urls)

    if success:
        return jsonify({'message': message, "status": "success"}), 201 # Trả về thêm status
    else:
        return jsonify({'message': message, "status": "error"}), 400

@faces_bp.route('/users-without-faces', methods=['GET'])
@admin_required
def get_users_without_faces(current_user_is_admin): # Tham số từ decorator
    users = face_service.get_users_without_face_data()
    return jsonify(users), 200

@faces_bp.route('/<string:user_id>', methods=['DELETE'])
@admin_required
def delete_faces(current_user_is_admin, user_id): # Tham số từ decorator
    success, message = face_service.delete_face_data(user_id)
    if success:
        return jsonify({'message': message}), 200
    else:
        status_code = 404 if "not found" in message.lower() else 500
        return jsonify({'message': message}), status_code

# SỬA LỖI METHOD NOT ALLOWED VÀ CẬP NHẬT LOGIC
@faces_bp.route('', methods=['GET'])
@admin_required
def get_faces_grid(current_user_is_admin): # Tham số từ decorator
    current_app.logger.info(f"Attempting to get faces grid. Admin: {current_user_is_admin}")
    try:
        page = request.args.get('page', 1, type=int)
        per_page = request.args.get('per_page', 10, type=int)
        search_query = request.args.get('search', None)

        # Gọi hàm từ user_service để lấy user đã có face data
        results, pagination_obj = user_service.get_users_with_face_data(
            search_query=search_query, page=page, per_page=per_page
        )

        if pagination_obj is not None: # Kiểm tra pagination_obj không phải None
            return jsonify({
                "faces": results, # results đã được format trong service
                "pagination": {
                    "currentPage": pagination_obj.page,
                    "totalPages": pagination_obj.pages,
                    "totalItems": pagination_obj.total,
                    "perPage": pagination_obj.per_page
                }
            }), 200
        else:
            # Lỗi xảy ra trong user_service.get_users_with_face_data
            current_app.logger.error("get_users_with_face_data returned None for pagination_obj or empty results")
            # Trả về mảng rỗng nếu không có lỗi cụ thể nhưng không có dữ liệu
            return jsonify({"faces": [], "pagination": None, "message": "No face data found or error retrieving list."}), 200

    except Exception as e:
        current_app.logger.error(f"Critical error in get_faces_grid: {e}", exc_info=True)
        return jsonify({"message": "Internal server error processing face grid."}), 500


# Endpoint để serve ảnh (filename giờ có thể là 'user_id/image_name.jpg')
@faces_bp.route('/image/<path:filename>')
# @admin_required # Cân nhắc bảo mật cho endpoint này
def get_face_image(filename): # Bỏ current_user_is_admin nếu không dùng admin_required
    # Validate filename để tránh path traversal
    if '..' in filename or filename.startswith('/') or filename.startswith('\\'):
        current_app.logger.warning(f"Invalid image filename requested: {filename}")
        return jsonify({"message": "Invalid filename"}), 400

    # Thư mục cha chứa tất cả ảnh
    base_upload_folder = current_app.config['UPLOAD_FOLDER']
    
    # Tạo đường dẫn tuyệt đối đến file ảnh
    # filename đã bao gồm user_id/ten_file.jpg
    image_full_path = os.path.join(base_upload_folder, filename)

    # Kiểm tra xem file có tồn tại không trước khi gửi
    if not os.path.isfile(image_full_path):
        current_app.logger.warning(f"Image not found: {image_full_path}")
        # Có thể trả về ảnh placeholder mặc định nếu muốn
        # return send_from_directory(os.path.join(current_app.static_folder, 'images'), 'placeholder.png')
        return jsonify({"message": "Image not found"}), 404
    
    # send_from_directory cần thư mục chứa file và tên file (không bao gồm thư mục đó)
    # Vì filename đã là 'user_id/ten_file.jpg', base_upload_folder là thư mục cha
    # Chúng ta cần tách thư mục và tên file nếu send_from_directory không xử lý path lồng nhau tốt
    directory = os.path.dirname(image_full_path)
    actual_filename = os.path.basename(image_full_path)

    try:
        # current_app.logger.debug(f"Serving image: directory='{directory}', filename='{actual_filename}'")
        # Hoặc đơn giản hơn nếu UPLOAD_FOLDER là thư mục gốc của tất cả các ảnh
        return send_from_directory(base_upload_folder, filename, as_attachment=False)
    except FileNotFoundError:
        current_app.logger.error(f"File not found by send_from_directory: {filename}")
        return jsonify({"message": "Image not found by server"}), 404
    except Exception as e:
        current_app.logger.error(f"Error serving image {filename}: {e}", exc_info=True)
        return jsonify({"message": "Error serving image"}), 500

