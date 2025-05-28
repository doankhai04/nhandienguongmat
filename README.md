# Nhận Diện Gương Mặt

## Cách chạy :
 1. Import file sql vào SQL server
 2. Cài đăt flask python
 3. Tạo tài khoản admin
    - Trong terminal backend:  `flask shell`
    - Trong Flask Shell: với tk là: **admin**, mk là: **1234567890**
```py
from app import create_app
from app.services import auth_service
from app.extensions import db

app = create_app() # Tạo instance ứng dụng để có app context
with app.app_context():
    # Gọi hàm tạo admin với username và password bạn muốn
    auth_service.create_initial_admin(username='admin', password='1234567890', full_name='Quản Trị Viên Chính', admin_id='ADMIN001')
    
```
4. Kích hoạt môi trường ảo 
- Mở Cmd: chạy tới file backend. Thay đường dẫn thành đường dẫn file backend của bạn
> cd path\to\your\FaceTimeProject\backend
- Kích hoạt môi trường ảo:
>venv\Scripts\activate
5. Cài đặt file requirements.txt:
`pip install -r requirements.txt`
6. Sau khi cài đặt xong, chạy:
`flask run`
7. Trong VSCode, cài extension **Live server**
- Chạy file `index.html` với **Live server**
- Trong trình duyệt, nhập tk với mk của admin ở trên

>**Note:** từ bước 2 đến bước 6 đều chạy trong terminal