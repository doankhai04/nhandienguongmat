import os
from dotenv import load_dotenv

load_dotenv()

class Config:
    SECRET_KEY = os.environ.get('SECRET_KEY') or 'you-will-never-guess'
    # Đảm bảo DATABASE_URL của bạn cho SQL Server là chính xác
    SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL')
        # Bạn có thể thêm một giá trị mặc định nếu DATABASE_URL không được tìm thấy,
        # ví dụ cho SQLite để dễ dàng test ban đầu, nhưng lỗi của bạn cho thấy nó đang là None.
        # SQLALCHEMY_DATABASE_URI = os.environ.get('DATABASE_URL') or 'sqlite:///app.db'


    SQLALCHEMY_TRACK_MODIFICATIONS = False
    UPLOAD_FOLDER = os.environ.get('UPLOAD_FOLDER') or 'uploads/face_images'
    JWT_SECRET_KEY = os.environ.get('JWT_SECRET_KEY') or 'a_default_fallback_jwt_secret'
    # ...