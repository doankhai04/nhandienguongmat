from app.models import User, FaceEncoding, AttendanceLog
from app.extensions import db, bcrypt # Import bcrypt nếu cần hash pw ở đây
from app.utils.security import hash_password # Hoặc dùng hàm đã tạo
from sqlalchemy.exc import IntegrityError
from flask import url_for, current_app
from sqlalchemy import or_

# --- CRUD Operations ---

def add_user(user_id, full_name, work_status='new', is_admin=False, username=None, password=None):
    """Thêm user mới (nhân viên hoặc admin)."""
    # Kiểm tra xem User ID đã tồn tại chưa
    if User.query.get(user_id):
        return None, f"User ID '{user_id}' already exists. Please choose a different ID."

    # Đối với nhân viên (is_admin=False), username và password nên là None
    # Backend không nên cố gắng gán username cho nhân viên nếu frontend không gửi
    if is_admin:
        if not (username and password):
            return None, "Admin requires username and password."
        if User.query.filter_by(username=username).first():
            return None, f"Admin username '{username}' already exists. Please choose a different username."

    new_user = User(
        id=user_id,
        full_name=full_name,
        work_status=work_status,
        is_admin=is_admin,
        has_face_data=False
    )

    if is_admin:
        new_user.username = username
        new_user.password_hash = hash_password(password)
    # else: # Đối với nhân viên, new_user.username sẽ là None theo mặc định của model

    try:
        db.session.add(new_user)
        db.session.commit()
        return new_user, "User added successfully."
    except IntegrityError as e:
        db.session.rollback()
        db_error_message = str(e.orig).lower() # Lấy thông báo lỗi gốc từ DB và chuyển sang chữ thường để dễ so sánh
        print(f"IntegrityError adding user '{user_id}': {db_error_message}")

        # Phân tích lỗi gốc từ SQL Server để đưa ra thông báo cụ thể hơn
        # SQL Server error for Primary Key violation: "Violation of PRIMARY KEY constraint..."
        # SQL Server error for Unique Key violation: "Violation of UNIQUE KEY constraint..."
        # Tên constraint có thể thay đổi, nên kiểm tra dựa trên từ khóa chính

        if "violation of primary key constraint" in db_error_message:
            # Thường là do User.query.get(user_id) không bắt được (ví dụ: race condition, hoặc ID khác biệt hoa thường mà DB coi là một)
            return None, f"User ID '{user_id}' already exists (Primary Key Violation). Please choose a different ID."
        elif "violation of unique key constraint" in db_error_message:
            # Kiểm tra xem có phải lỗi do username không (nếu constraint tên là 'UQ__users__username' hoặc tương tự)
            # Hoặc nếu thông báo lỗi chứa từ 'username'
            if "username" in db_error_message or (hasattr(e.orig, 'diag') and e.orig.diag and "username" in str(e.orig.diag).lower()):
                 return None, f"Admin username '{username}' already exists (Unique Key Violation). Please choose a different username."
            else:
                 # Một ràng buộc UNIQUE khác bị vi phạm
                 return None, "Error adding user due to a unique data conflict (other than ID or username)."
        elif "duplicate key" in db_error_message: # Một thông báo chung hơn cho duplicate
            if hasattr(e.orig, 'diag') and e.orig.diag and "pkey" in str(e.orig.diag).lower() or "primary key" in db_error_message : # Kiểm tra xem có phải là primary key không
                return None, f"User ID '{user_id}' already exists (Duplicate Key). Please choose a different ID."
            elif hasattr(e.orig, 'diag') and e.orig.diag and "username" in str(e.orig.diag).lower() or "username" in db_error_message:
                return None, f"Admin username '{username}' already exists (Duplicate Key). Please choose a different username."
            else:
                return None, "Error adding user due to duplicate data."
        
        # Thông báo lỗi chung nếu không xác định được cụ thể
        return None, "Error adding user due to data conflict with the database."
    except Exception as e:
        db.session.rollback()
        print(f"Error adding user '{user_id}': {e}")
        return None, "An unexpected database error occurred while adding the user."


def get_user_by_id(user_id):
    """Lấy thông tin một user theo ID."""
    return User.query.get(user_id)

def get_all_users(search_query=None, page=1, per_page=15):
    """Lấy danh sách user (nhân viên) với tìm kiếm và phân trang."""
    query = User.query.filter_by(is_admin=False) # Chỉ lấy nhân viên

    if search_query:
        search = f"%{search_query}%"
        query = query.filter(
            or_(
                User.id.ilike(search),
                User.full_name.ilike(search)
            )
        )

    query = query.order_by(User.id)

    try:
        # Sử dụng paginate của Flask-SQLAlchemy
        paginated_users = query.paginate(page=page, per_page=per_page, error_out=False)
        return paginated_users # Trả về đối tượng Pagination
    except Exception as e:
        print(f"Error getting users: {e}")
        return None


def update_user(user_id, full_name, work_status):
    """Cập nhật thông tin nhân viên (không cho sửa ID, is_admin)."""
    user = User.query.get(user_id)
    if not user or user.is_admin: # Không cho sửa admin qua API này
        return None, "Employee not found"

    try:
        user.full_name = full_name
        user.work_status = work_status
        # updated_at tự động cập nhật nếu dùng trigger hoặc cần set thủ công ở đây
        # user.updated_at = datetime.utcnow()
        db.session.commit()
        return user, "Employee updated successfully"
    except Exception as e:
        db.session.rollback()
        print(f"Error updating user {user_id}: {e}")
        return None, "Database error updating employee"

def delete_user(user_id):
    """Xóa nhân viên (cẩn thận với khóa ngoại)."""
    user = User.query.get(user_id)
    if not user:
        return False, "User not found"
    if user.is_admin:
        return False, "Cannot delete admin user via this function"

    # Kiểm tra ràng buộc khóa ngoại (ví dụ: attendance_logs nếu là NO ACTION/RESTRICT)
    if AttendanceLog.query.filter_by(user_id=user_id).first():
         # Hoặc thay đổi work_status thành 'inactive' thay vì xóa?
         return False, "Cannot delete user with existing attendance logs. Consider deactivating instead."

    # FaceEncodings sẽ tự xóa nếu dùng ON DELETE CASCADE

    try:
        # Xóa user sẽ cascade xóa face encodings
        db.session.delete(user)
        db.session.commit()
        # Cần xóa encoding khỏi cache bộ nhớ của face_service
        from . import face_service # Tránh import vòng tròn
        face_service.remove_user_encodings_from_cache(user_id)
        return True, "User deleted successfully"
    except Exception as e:
        db.session.rollback()
        print(f"Error deleting user {user_id}: {e}")
        return False, "Database error deleting user"


def get_users_with_face_data(search_query=None, page=1, per_page=10):
    """Lấy danh sách user đã có face data và một ảnh đại diện."""
    query = User.query.filter_by(is_admin=False, has_face_data=True)

    if search_query:
        search = f"%{search_query}%"
        query = query.filter(
            or_(
                User.id.ilike(search),
                User.full_name.ilike(search)
            )
        )
    query = query.order_by(User.id)

    try:
        paginated_users = query.paginate(page=page, per_page=per_page, error_out=False)
        results = []
        for user in paginated_users.items:
            # Lấy một ảnh đại diện (ví dụ: ảnh đầu tiên được lưu cho user đó)
            first_encoding = FaceEncoding.query.filter_by(user_id=user.id).first()
            image_url_path = None
            if first_encoding and first_encoding.image_filename:
                # image_filename giờ là 'user_id/filename.jpg'
                # Endpoint API sẽ là /api/faces/image/user_id/filename.jpg
                # Hoặc nếu endpoint chỉ nhận filename, ta cần tách ra
                # Giả sử endpoint nhận path đầy đủ sau /image/
                image_url_path = url_for('faces_api.get_face_image', filename=first_encoding.image_filename, _external=False)
                # _external=False để lấy URL tương đối, frontend sẽ ghép với API_BASE_URL

            results.append({
                "employeeId": user.id,
                "name": user.full_name,
                "imageUrl": image_url_path # Sẽ là /api/faces/image/NV001/face_xyz.jpg
            })
        return results, paginated_users
    except Exception as e:
        current_app.logger.error(f"Error in get_users_with_face_data: {e}", exc_info=True)
        print(f"Error getting users with face data: {e}")
        return [], None