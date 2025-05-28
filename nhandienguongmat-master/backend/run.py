from app import create_app

app = create_app()

if __name__ == '__main__':
    # Chạy với server development của Flask
    # host='0.0.0.0' để truy cập từ máy khác trong mạng
    app.run(host='0.0.0.0', port=5000)
    # Khi deploy production, dùng gunicorn:
    # gunicorn --bind 0.0.0.0:5000 run:app