from app.models import User
from app.utils.security import check_password, generate_token, hash_password
from app.extensions import db

def authenticate_admin(username, password):
    admin = User.query.filter_by(username=username, is_admin=True).first()
    if admin and check_password(admin.password_hash, password):
        token = generate_token(user_id=admin.id, is_admin=True)
        return {'token': token, 'user': {'name': admin.full_name, 'avatar': 'AD'}} # Simplified avatar
    return None

def change_admin_password(admin_id, current_password, new_password):
    admin = User.query.filter_by(id=admin_id, is_admin=True).first()
    if not admin:
        return False, "Admin not found"
    if not check_password(admin.password_hash, current_password):
        return False, "Incorrect current password"

    admin.password_hash = hash_password(new_password)
    try:
        db.session.commit()
        return True, "Password changed successfully"
    except Exception as e:
        db.session.rollback()
        print(f"Error changing password: {e}") # Log the error
        return False, "Database error changing password"

# Service để tạo admin ban đầu (chạy 1 lần thủ công hoặc qua command)
def create_initial_admin(username, password, full_name="Admin", admin_id="ADMIN001"):
     if User.query.filter_by(username=username).first():
         print(f"Admin user '{username}' already exists.")
         return
     admin = User(
         id=admin_id,
         username=username,
         password_hash=hash_password(password),
         full_name=full_name,
         is_admin=True,
         work_status='active'
     )
     db.session.add(admin)
     try:
        db.session.commit()
        print(f"Admin user '{username}' created successfully.")
     except Exception as e:
        db.session.rollback()
        print(f"Error creating admin user: {e}")