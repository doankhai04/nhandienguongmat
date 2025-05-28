from flask import Blueprint, request, jsonify
from app.services import face_service, attendance_service
from app.utils.security import token_required, admin_required # Có thể không cần nếu điểm danh không cần login?

attendance_bp = Blueprint('attendance_api', __name__, url_prefix='/api/attendance')

# Sửa endpoint lấy lịch sử để nhận và trả về thông tin phân trang
@attendance_bp.route('/history', methods=['GET'])
@admin_required
def get_history(current_user_is_admin):
    date_from = request.args.get('dateFrom')
    date_to = request.args.get('dateTo')
    employee_query = request.args.get('employee')
    page = request.args.get('page', 1, type=int)
    per_page = request.args.get('per_page', 15, type=int) # Số dòng trên mỗi trang lịch sử

    results, pagination = attendance_service.get_attendance_history(
        date_from, date_to, employee_query, page=page, per_page=per_page
    )

    if pagination:
         return jsonify({
            "logs": results, # Service đã format
            "pagination": {
                "currentPage": pagination.page,
                "totalPages": pagination.pages,
                "totalItems": pagination.total,
                "perPage": pagination.per_page
            }
         }), 200
    else:
         return jsonify({"logs": [], "pagination": None, "message": "Could not retrieve attendance history"}), 500

# Sửa endpoint recognize để trả về cấu trúc rõ ràng hơn
@attendance_bp.route('/recognize', methods=['POST'])
def recognize_and_log():
    data = request.get_json()
    image_data_url = data.get('imageDataUrl')

    if not image_data_url:
        return jsonify({'message': 'Image data required!'}), 400

    user_id, recognized_filename = face_service.recognize_face(image_data_url)

    response_data = {'recognized': False, 'log': None, 'message': 'No match found'}
    status_code = 200

    if user_id:
        response_data['recognized'] = True
        success, result = attendance_service.log_attendance(user_id, recognized_filename)
        if success:
            response_data['log'] = result # log chứa thông tin {timestamp, employeeId, employeeName}
            response_data['message'] = 'Check-in successful'
            status_code = 200
        else:
            # result ở đây là dict chứa message và log cũ nếu đã checkin
            response_data['message'] = result.get('message', 'Check-in failed')
            response_data['log'] = result.get('log')
            status_code = 409 if "Already checked in" in response_data['message'] else 500

    return jsonify(response_data), status_code
    date_from = request.args.get('dateFrom')
    date_to = request.args.get('dateTo')
    employee_query = request.args.get('employee') # ID hoặc tên
    # page = request.args.get('page', 1, type=int)
    # per_page = request.args.get('per_page', 10, type=int)

    logs = attendance_service.get_attendance_history(date_from, date_to, employee_query)

    # Nếu dùng phân trang, cấu trúc trả về sẽ khác
    return jsonify({"logs": logs}), 200 # pagination info