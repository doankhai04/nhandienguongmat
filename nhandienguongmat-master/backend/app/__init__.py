from flask import Flask
from config import Config
from .extensions import db, migrate, bcrypt, cors
from .models import User # Import models để migrate biết
from .services import face_service # Import service để gọi load_known_faces
import os
import logging # Thêm logging

def create_app(config_class=Config):
    app = Flask(__name__)
    app.config.from_object(config_class)

    # Cấu hình logging cơ bản
    if not app.debug: # Chỉ cấu hình khi không ở debug mode (debug mode có logger riêng)
        # Hoặc bạn có thể luôn cấu hình nếu muốn
        logging.basicConfig(level=logging.INFO) # Log ra console
        # Để log ra file:
        # file_handler = logging.FileHandler('app.log')
        # file_handler.setLevel(logging.INFO)
        # app.logger.addHandler(file_handler)
    
    app.logger.info("Flask App Created") # Test logger

    # Khởi tạo Extensions
    db.init_app(app)
    migrate.init_app(app, db)
    bcrypt.init_app(app)
    cors.init_app(app, resources={r"/api/*": {"origins": "*"}}) # Cho phép tất cả các origin

    # Đăng ký Blueprints API
    from .api.auth import auth_bp
    from .api.attendance import attendance_bp
    from .api.users import users_bp
    from .api.faces import faces_bp

    app.register_blueprint(auth_bp)
    app.register_blueprint(attendance_bp)
    app.register_blueprint(users_bp)
    app.register_blueprint(faces_bp)

    with app.app_context():
        # Tải dữ liệu khuôn mặt đã biết vào bộ nhớ khi khởi động ứng dụng
        # Cần đảm bảo DB đã được migrate và có bảng trước khi gọi
        try:
            face_service.load_known_faces()
        except Exception as e:
            app.logger.error(f"Could not load known faces on startup (DB might not be ready): {e}")


        # Tạo thư mục upload nếu chưa có
        upload_dir = app.config['UPLOAD_FOLDER']
        if not os.path.exists(upload_dir):
            try:
                os.makedirs(upload_dir)
                app.logger.info(f"Upload folder created: {upload_dir}")
            except OSError as e:
                app.logger.error(f"Could not create upload folder {upload_dir}: {e}")
    return app
