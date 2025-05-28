from app.extensions import db
from datetime import datetime, timezone, timedelta

# Tạo một đối tượng timezone cho UTC+7 (có thể dùng lại từ user.py nếu import chung)
vn_timezone = timezone(timedelta(hours=7))

class AttendanceLog(db.Model):
    __tablename__ = 'attendance_logs'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False)
    timestamp = db.Column(db.DateTime, default=lambda: datetime.now(vn_timezone), nullable=False) # Chỉ lưu thời gian check-in với múi giờ +7
    # type = db.Column(db.String(10), default='check-in', nullable=False) # Có thể bỏ nếu chỉ có check-in
    recognized_image_filename = db.Column(db.String(512)) # Ảnh chụp lúc nhận diện thành công (tùy chọn)

    def __repr__(self):
        return f'<AttendanceLog {self.id} for User {self.user_id} at {self.timestamp}>'
