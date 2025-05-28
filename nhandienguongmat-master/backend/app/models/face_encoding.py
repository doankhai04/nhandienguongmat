from app.extensions import db
from datetime import datetime

class FaceEncoding(db.Model):
    __tablename__ = 'face_encodings'

    id = db.Column(db.Integer, primary_key=True)
    user_id = db.Column(db.String(50), db.ForeignKey('users.id'), nullable=False)
    # Lưu encoding dưới dạng bytes (BLOB) hoặc chuyển thành list/string để lưu dạng TEXT/JSON
    encoding = db.Column(db.PickleType, nullable=False) # PickleType tiện lợi nhưng cân nhắc về security/portability
    # Hoặc: encoding = db.Column(db.Text, nullable=False) # Lưu dạng JSON string của list
    image_filename = db.Column(db.String(512)) # Tên file ảnh gốc đã lưu
    created_at = db.Column(db.DateTime, default=datetime.utcnow)

    def __repr__(self):
        return f'<FaceEncoding {self.id} for User {self.user_id}>'