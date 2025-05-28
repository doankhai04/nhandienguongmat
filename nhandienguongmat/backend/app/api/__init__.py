from flask import Blueprint

# Import các blueprint khác
from .auth import auth_bp
from .attendance import attendance_bp
from .users import users_bp # Giả sử bạn tạo file này
from .faces import faces_bp


# Có thể tạo 1 blueprint tổng hợp hoặc đăng ký riêng lẻ trong create_app
api_bp = Blueprint('api', __name__)

# Đăng ký các blueprint con nếu muốn gộp
api_bp.register_blueprint(auth_bp)
api_bp.register_blueprint(attendance_bp)
api_bp.register_blueprint(users_bp)
api_bp.register_blueprint(faces_bp)