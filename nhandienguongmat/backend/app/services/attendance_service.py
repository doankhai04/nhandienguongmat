from app.models import AttendanceLog, User
from app.extensions import db
from datetime import datetime, date, timedelta
from sqlalchemy import or_

def log_attendance(user_id, recognized_image_filename=None):
    """Ghi nhận log check-in cho user."""
    # Kiểm tra xem hôm nay user đã check-in chưa
    today_start = datetime.combine(date.today(), datetime.min.time())
    today_end = datetime.combine(date.today(), datetime.max.time())
    existing_log = AttendanceLog.query.filter(
        AttendanceLog.user_id == user_id,
        AttendanceLog.timestamp >= today_start,
        AttendanceLog.timestamp <= today_end
    ).first()

    if existing_log:
        print(f"User {user_id} already checked in today at {existing_log.timestamp}.")
        # Trả về thông tin cũ để frontend biết là đã checkin
        user = User.query.get(user_id)
        return False, {
             "message": "Already checked in today",
             "log": {
                 "timestamp": existing_log.timestamp.isoformat(),
                 "employeeId": user.id,
                 "employeeName": user.full_name
             }
        }

    user = User.query.get(user_id)
    if not user:
         return False, {"message": "User not found"}

    new_log = AttendanceLog(
        user_id=user_id,
        timestamp=datetime.utcnow(), # Thời gian hiện tại UTC
        recognized_image_filename=recognized_image_filename
    )
    db.session.add(new_log)
    try:
        db.session.commit()
        print(f"Attendance logged for user {user_id} at {new_log.timestamp}")
        # Trả về thông tin để hiển thị log gần đây trên UI
        return True, {
            "timestamp": new_log.timestamp.isoformat(),
            "employeeId": user.id,
            "employeeName": user.full_name
        }
    except Exception as e:
        db.session.rollback()
        print(f"Database error logging attendance for {user_id}: {e}")
        return False, {"message": "Database error logging attendance"}

def get_attendance_history(date_from=None, date_to=None, employee_query=None, page=1, per_page=15):
    """Lấy lịch sử check-in với filter và phân trang."""
    query = db.session.query(
        AttendanceLog.timestamp,
        User.id.label('employeeId'),
        User.full_name.label('employeeName')
    ).join(User, AttendanceLog.user_id == User.id)

    try:
        if date_from:
            start_date = datetime.strptime(date_from, '%Y-%m-%d')
            # Đảm bảo so sánh ở đầu ngày
            start_date = datetime.combine(start_date.date(), datetime.min.time())
            query = query.filter(AttendanceLog.timestamp >= start_date)
        if date_to:
            end_date = datetime.strptime(date_to, '%Y-%m-%d')
            # Đảm bảo so sánh đến hết ngày (sát ngày hôm sau)
            end_date = datetime.combine(end_date.date(), datetime.max.time())
            query = query.filter(AttendanceLog.timestamp <= end_date)
    except ValueError:
        # Bỏ qua filter ngày nếu định dạng sai
        print("Invalid date format received for history filter.")
        pass

    if employee_query:
        search = f"%{employee_query}%"
        query = query.filter(
            or_(
                User.id.ilike(search),
                User.full_name.ilike(search)
            )
        )

    # Sắp xếp mới nhất lên trước
    query = query.order_by(AttendanceLog.timestamp.desc())

    try:
        paginated_logs = query.paginate(page=page, per_page=per_page, error_out=False)

        results = [
            {
                # Nên chuyển đổi timezone về giờ địa phương trước khi format
                # Ví dụ: log.timestamp.astimezone(local_tz).strftime('%d/%m/%Y')
                "date": log.timestamp.strftime('%d/%m/%Y'), # Hiện tại là UTC
                "employeeId": log.employeeId,
                "employeeName": log.employeeName,
                "checkInTime": log.timestamp.strftime('%H:%M:%S') # Hiện tại là UTC
            } for log in paginated_logs.items
        ]
        return results, paginated_logs # Trả về list và đối tượng pagination
    except Exception as e:
        print(f"Error getting attendance history: {e}")
        return [], None