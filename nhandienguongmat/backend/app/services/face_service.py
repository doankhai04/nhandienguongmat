import face_recognition
import numpy as np
import os
from PIL import Image
import io
import base64
from app.models import FaceEncoding, User # Assuming datetime is not directly used from here for this change
from app.extensions import db
from flask import current_app
from . import user_service


# Lưu trữ encodings đã biết trong bộ nhớ để tăng tốc độ (cần cơ chế cập nhật)
known_face_encodings = []
known_face_user_ids = []
loaded_encodings = False # Flag để biết đã load lần đầu chưa
from datetime import datetime, timezone # Added timezone

def load_known_faces():
    """Tải encodings từ DB vào bộ nhớ."""
    global known_face_encodings, known_face_user_ids, loaded_encodings
    if not current_app: # Kiểm tra xem có app context không
            print("Cannot load known faces: No application context.")
            return
    try:
        encodings_db = FaceEncoding.query.all()
        known_face_encodings = [encoding.encoding for encoding in encodings_db]
        known_face_user_ids = [encoding.user_id for encoding in encodings_db]
        loaded_encodings = True
        print(f"Loaded {len(known_face_encodings)} known face encodings.")
    except Exception as e:
        print(f"Error loading known faces: {e}")
        known_face_encodings = []
        known_face_user_ids = []
        loaded_encodings = False


def add_face_encodings(user_id, photo_data_urls):
    """Thêm encoding mới cho user và lưu ảnh vào thư mục riêng của user."""
    global known_face_encodings, known_face_user_ids

    base_upload_folder = current_app.config['UPLOAD_FOLDER']
    user_specific_folder = os.path.join(base_upload_folder, user_id) # Thư mục con theo user_id

    if not os.path.exists(user_specific_folder):
        try:
            os.makedirs(user_specific_folder)
        except OSError as e:
            print(f"Error creating directory {user_specific_folder}: {e}")
            return False, f"Could not create directory for user {user_id}"

    new_encodings_added_count = 0
    user = User.query.get(user_id)
    if not user:
        return False, "User not found"

    temp_encodings_to_add_to_db = []
    temp_encodings_to_add_to_cache = []
    temp_filenames_to_save = [] # (relative_path, image_object)

    for i, data_url in enumerate(photo_data_urls):
        try:
            header, encoded = data_url.split(",", 1)
            image_data = base64.b64decode(encoded)
            image = Image.open(io.BytesIO(image_data)).convert('RGB') # Đảm bảo là RGB
            image_np = np.array(image)

            face_locations = face_recognition.face_locations(image_np)
            if not face_locations:
                print(f"No face found in image {i+1} for user {user_id}")
                continue

            current_encoding = face_recognition.face_encodings(image_np, [face_locations[0]])[0]
            
            # Tạo tên file duy nhất và đường dẫn tương đối
            timestamp_str = datetime.utcnow().strftime('%Y%m%d%H%M%S%f')
            base_filename = f"face_{timestamp_str}_{i}.jpg"
            relative_image_path = os.path.join(user_id, base_filename) # VD: NV001/face_2023..._0.jpg

            new_encoding_db = FaceEncoding(
                user_id=user_id,
                encoding=current_encoding,
                image_filename=relative_image_path # Lưu đường dẫn tương đối
            )
            temp_encodings_to_add_to_db.append(new_encoding_db)
            temp_encodings_to_add_to_cache.append(current_encoding)
            # Lưu image object để ghi file sau khi commit DB
            temp_filenames_to_save.append({'path': relative_image_path, 'image_obj': image})
            new_encodings_added_count += 1

        except Exception as e:
            print(f"Error processing image {i+1} for user {user_id}: {e}")
            # Không rollback ngay, cho phép các ảnh khác được xử lý
            continue # Bỏ qua ảnh lỗi

    if new_encodings_added_count > 0:
        try:
            db.session.add_all(temp_encodings_to_add_to_db)
            user.has_face_data = True
            db.session.commit()

            # Cập nhật cache và lưu file sau khi commit thành công
            known_face_encodings.extend(temp_encodings_to_add_to_cache)
            known_face_user_ids.extend([user_id] * new_encodings_added_count)

            for item in temp_filenames_to_save:
                try:
                    full_save_path = os.path.join(base_upload_folder, item['path'])
                    item['image_obj'].save(full_save_path, "JPEG")
                except Exception as e_save:
                    print(f"Error saving image file {item['path']}: {e_save}")

            print(f"Successfully added {new_encodings_added_count} encodings for user {user_id}")
            return True, f"Added {new_encodings_added_count} faces"
        except Exception as e:
            db.session.rollback()
            print(f"Database error committing faces for user {user_id}: {e}")
            return False, "Database error saving faces"
    else:
        if not photo_data_urls:
             return False, "No photos submitted"
        return False, "No valid faces found in submitted photos or error processing."

def recognize_face(image_data_url):
    global loaded_encodings
    if not loaded_encodings:
        load_known_faces()

    if not known_face_encodings: # Kiểm tra sau khi load
        print("No known faces loaded for recognition.")
        return None, None

    try:
        header, encoded = image_data_url.split(",", 1)
        image_data = base64.b64decode(encoded)
        image = Image.open(io.BytesIO(image_data)).convert('RGB')
        unknown_image_np = np.array(image)

        unknown_face_locations = face_recognition.face_locations(unknown_image_np)
        if not unknown_face_locations:
            return None, None

        unknown_encoding = face_recognition.face_encodings(unknown_image_np, [unknown_face_locations[0]])[0]
        matches = face_recognition.compare_faces(known_face_encodings, unknown_encoding, tolerance=0.5)
        face_distances = face_recognition.face_distance(known_face_encodings, unknown_encoding)

        best_match_index = -1
        if True in matches:
            best_match_index = np.argmin(face_distances)
            if matches[best_match_index]:
                user_id = known_face_user_ids[best_match_index]
                print(f"Face recognized: User {user_id} with distance {face_distances[best_match_index]}")
                
                # Lưu ảnh nhận diện thành công (tùy chọn, có thể lưu vào thư mục của user đó)
                base_upload_folder = current_app.config['UPLOAD_FOLDER']
                user_specific_folder = os.path.join(base_upload_folder, user_id, "recognized")
                if not os.path.exists(user_specific_folder):
                    os.makedirs(user_specific_folder)

                timestamp_str = datetime.utcnow().strftime('%Y%m%d%H%M%S%f')
                recognized_filename_base = f"recognized_{timestamp_str}.jpg"
                # Đường dẫn tương đối để lưu vào DB (bao gồm thư mục user và recognized)
                relative_recognized_path = os.path.join(user_id, "recognized", recognized_filename_base)
                
                full_recognized_path = os.path.join(base_upload_folder, relative_recognized_path)

                try:
                    image.save(full_recognized_path, "JPEG")
                except Exception as e_save:
                    print(f"Error saving recognized image: {e_save}")
                    relative_recognized_path = None # Không lưu được thì thôi

                return user_id, relative_recognized_path
        
        min_distance = np.min(face_distances) if face_distances.size > 0 else float('inf')
        print(f"No match found. Min distance: {min_distance}")
        return None, None

    except Exception as e:
        print(f"Error during face recognition: {e}")
        return None, None

def get_users_without_face_data():
    """Lấy danh sách user chưa có dữ liệu khuôn mặt."""
    try:
        users = User.query.filter_by(has_face_data=False, is_admin=False).order_by(User.id).all()
        return [{"id": u.id, "name": u.full_name} for u in users]
    except Exception as e:
        print(f"Error getting users without face data: {e}")
        return []

def delete_face_data(user_id):
    """Xóa toàn bộ dữ liệu khuôn mặt và ảnh của user."""
    user = User.query.get(user_id)
    if not user:
        return False, "User not found"

    encodings_to_delete = FaceEncoding.query.filter_by(user_id=user_id).all()
    filenames_to_delete = [enc.image_filename for enc in encodings_to_delete if enc.image_filename]

    if not encodings_to_delete:
         return True, "User has no face data to delete" # Coi như thành công

    try:
        # Xóa khỏi DB trước
        FaceEncoding.query.filter_by(user_id=user_id).delete()
        user.has_face_data = False
        db.session.commit()

        # Xóa khỏi cache bộ nhớ
        remove_user_encodings_from_cache(user_id) # Gọi hàm đã tạo

        # Xóa file ảnh sau khi DB thành công
        upload_folder = current_app.config['UPLOAD_FOLDER']
        for filename in filenames_to_delete:
            try:
                file_path = os.path.join(upload_folder, filename)
                if os.path.exists(file_path):
                    os.remove(file_path)
            except Exception as e_file:
                print(f"Error deleting face image file {filename}: {e_file}") # Log lỗi xóa file

        print(f"Successfully deleted face data for user {user_id}")
        return True, "Face data deleted successfully"
    except Exception as e:
        db.session.rollback()
        print(f"Database error deleting face data for user {user_id}: {e}")
        return False, "Database error deleting face data"

# Hàm mới để xóa encoding khỏi cache khi user bị xóa
def remove_user_encodings_from_cache(user_id):
    """Xóa encoding của user khỏi cache bộ nhớ."""
    global known_face_encodings, known_face_user_ids
    indices_to_remove = [i for i, uid in enumerate(known_face_user_ids) if uid == user_id]
    if not indices_to_remove:
        return

    # Xóa theo thứ tự index giảm dần để không bị lỗi index
    for index in sorted(indices_to_remove, reverse=True):
         if index < len(known_face_encodings): # Kiểm tra index hợp lệ
             del known_face_encodings[index]
         if index < len(known_face_user_ids):
             del known_face_user_ids[index]
    print(f"Removed encodings for user {user_id} from memory cache.")
# (Thêm các service khác: user_service.py, attendance_service.py tương tự)