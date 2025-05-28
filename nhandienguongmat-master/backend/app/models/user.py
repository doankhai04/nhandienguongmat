from app.extensions import db
from datetime import datetime, timezone, timedelta

# Tạo một đối tượng timezone cho UTC+7
vn_timezone = timezone(timedelta(hours=7))

class User(db.Model):
    __tablename__ = 'users'

    id = db.Column(db.String(50), primary_key=True) # Mã NV
    username = db.Column(db.String(100), unique=True, nullable=True) # Chỉ admin mới có username, nhân viên có thể null
    password_hash = db.Column(db.String(255), nullable=True) # Nullable vì nhân viên không login bằng pw
    full_name = db.Column(db.String(255), nullable=False)
    work_status = db.Column(db.String(50), default='active', nullable=False) # active, inactive, new
    has_face_data = db.Column(db.Boolean, default=False, nullable=False)
    is_admin = db.Column(db.Boolean, default=False, nullable=False) # Phân biệt admin
    # Sử dụng lambda để đảm bảo hàm được gọi mỗi khi tạo/cập nhật, với múi giờ +7
    created_at = db.Column(db.DateTime, default=lambda: datetime.now(vn_timezone))
    updated_at = db.Column(db.DateTime, default=lambda: datetime.now(vn_timezone), onupdate=lambda: datetime.now(vn_timezone))

    face_encodings = db.relationship('FaceEncoding', backref='user', lazy=True, cascade="all, delete-orphan")
    attendance_logs = db.relationship('AttendanceLog', backref='user', lazy=True, cascade="all, delete-orphan")

    def __repr__(self):
        return f'<User {self.id} - {self.full_name}>'

    # Có thể thêm các phương thức khác (ví dụ: set_password, check_password cho admin)