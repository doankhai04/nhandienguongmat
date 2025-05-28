/**
 * FaceTime Minimal - Frontend Application Logic
 * Handles UI interactions, page loading, camera streams,
 * and communication with the backend API.
 */
document.addEventListener('DOMContentLoaded', () => {
    try { // Thêm try...catch bao quanh để bắt lỗi sớm
        // --- Configuration ---
        const API_BASE_URL = 'http://localhost:5000/api'; // Địa chỉ backend API

        // --- DOM Elements ---
        const loginPage = document.getElementById('login-page');
        const mainLayout = document.getElementById('main-layout');
        const sidebar = document.getElementById('sidebar'); // Cần có element này trong index.html
        const content = document.getElementById('content');
        const pageContentArea = document.getElementById('page-content-area');
        const loadingIndicator = document.getElementById('loading-indicator');
        const toggleSidebarButton = document.getElementById('toggle-sidebar');
        const userDropdownToggle = document.getElementById('user-dropdown-toggle');
        const userDropdownMenu = document.getElementById('user-dropdown-menu');
        const sidebarOverlay = document.getElementById('sidebar-overlay');
        const allMenuLinks = document.querySelectorAll('.menu-link');
        const loginForm = document.getElementById('loginForm');
        const logoutLink = document.getElementById('logout-link');
        const logoutDropdownLink = document.getElementById('logout-dropdown-link');
        const currentYearSpan = document.getElementById('current-year');

        // !!! KIỂM TRA CÁC PHẦN TỬ HTML CỐT LÕI !!!
        if (!loginPage) {
            console.error("CRITICAL ERROR: Element with ID 'login-page' not found! Check your index.html.");
            document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:50px;'>Lỗi nghiêm trọng: Không tìm thấy 'login-page'.</h1>";
            return;
        }
        if (!mainLayout) {
            console.error("CRITICAL ERROR: Element with ID 'main-layout' not found! Check your index.html.");
            document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:50px;'>Lỗi nghiêm trọng: Không tìm thấy 'main-layout'.</h1>";
            return;
        }
        if (!pageContentArea) {
            console.error("CRITICAL ERROR: Element with ID 'page-content-area' not found! Check your index.html.");
            document.body.innerHTML = "<h1 style='color:red;text-align:center;margin-top:50px;'>Lỗi nghiêm trọng: Không tìm thấy 'page-content-area'.</h1>";
            return;
        }


        // --- State & Cache ---
        let attendanceCameraStream = null;
        let faceDataCameraStream = null;
        let recognitionActive = false;
        let recognitionIntervalId = null; // ID cho interval nhận diện
        const pageCache = {}; // Cache nội dung trang HTML

        // --- Helper function for API calls ---
        async function apiFetch(endpoint, options = {}) {
            const url = `${API_BASE_URL}${endpoint}`;
            const token = localStorage.getItem('authToken');

            const defaultHeaders = { 'Content-Type': 'application/json', };
            if (token) {
                defaultHeaders['Authorization'] = `Bearer ${token}`;
            }
            options.headers = { ...defaultHeaders, ...options.headers };

            try {
                const response = await fetch(url, options);
                if (response.status === 401) {
                    console.error('API call failed: Unauthorized (401)');
                    handleLogout(); // Tự động đăng xuất
                    throw new Error('Phiên đăng nhập hết hạn hoặc không hợp lệ.');
                }
                let data = null;
                const contentType = response.headers.get("content-type");
                // Chỉ parse JSON nếu có content và là JSON, và không phải status 204 No Content
                if (contentType && contentType.indexOf("application/json") !== -1 && response.status !== 204) {
                    data = await response.json();
                }
                if (!response.ok) {
                    const errorPayload = data || { message: response.statusText };
                    console.error(`API Error ${response.status} for ${url}:`, errorPayload);
                    throw new Error(errorPayload.message || `Request failed with status ${response.status}`);
                }
                return data; // Trả về data (có thể là null cho 204)
            } catch (error) {
                console.error(`Fetch error for ${url}:`, error);
                throw error; // Ném lại lỗi để nơi gọi xử lý
            }
        }

        // --- Core Functions ---
        async function loadPageContent(pageId, forceRefresh = false) {
            if (!pageId || pageId === '#') pageId = 'attendance'; // Trang mặc định

            allMenuLinks.forEach(link => link.classList.remove('active'));
            const activeLink = document.querySelector(`.menu-link[href="#${pageId}"]`);
            if (activeLink) activeLink.classList.add('active');

            if (window.innerWidth <= 576 && sidebar?.classList.contains('show')) toggleMobileSidebar(false);
            if (userDropdownMenu?.classList.contains('show')) userDropdownMenu.classList.remove('show');

            if (loadingIndicator) loadingIndicator.style.display = 'block';
            pageContentArea.innerHTML = ''; // Đã kiểm tra pageContentArea ở trên
            if (content) content.scrollTop = 0;

            if (!forceRefresh && pageCache[pageId]) {
                pageContentArea.innerHTML = pageCache[pageId];
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                initializePageScripts(pageId);
                handleCameraOnPageChange(pageId);
                console.log(`Page ${pageId} loaded from cache.`);
                return;
            }

            try {
                const response = await fetch(`pages/${pageId}.html?t=${Date.now()}`);
                if (!response.ok) {
                    throw new Error(`HTTP error! status: ${response.status} for pages/${pageId}.html. Make sure this file exists in the 'pages' folder.`);
                }
                const htmlContent = await response.text();
                pageCache[pageId] = htmlContent;
                pageContentArea.innerHTML = htmlContent;
                console.log(`Page ${pageId} loaded from server.`);
            } catch (error) {
                console.error('Error fetching page:', error);
                pageContentArea.innerHTML = `<div class="card"><div class="card-body" style="text-align: center; padding: 40px;"><i class="fas fa-exclamation-triangle fa-2x" style="color: var(--danger); margin-bottom: 15px;"></i><p style="font-weight: 500;">Lỗi khi tải trang '${pageId}'</p><p style="color: var(--gray); font-size: 13px;">${error.message}</p><button class="button button-primary button-sm" onclick="window.location.hash='#attendance'"> Về Trang Điểm danh</button></div></div>`;
                if (pageId !== 'attendance') {
                    allMenuLinks.forEach(link => link.classList.remove('active'));
                    document.querySelector(`.menu-link[href="#attendance"]`)?.classList.add('active');
                }
            } finally {
                if (loadingIndicator) loadingIndicator.style.display = 'none';
                initializePageScripts(pageId);
                handleCameraOnPageChange(pageId);
            }
        }

        function handleLogin(event) {
            event.preventDefault();
            const usernameInput = document.getElementById('username');
            const passwordInput = document.getElementById('password');
            const username = usernameInput?.value.trim();
            const password = passwordInput?.value;

            if (!username || !password) {
                showToast('Vui lòng nhập tên đăng nhập và mật khẩu.', 'warning');
                return;
            }

            apiFetch('/login', {
                method: 'POST',
                body: JSON.stringify({ username, password })
            })
            .then(data => {
                if (data && data.token) {
                    localStorage.setItem('authToken', data.token);
                    localStorage.setItem('userName', data.user?.name || 'Admin');
                    localStorage.setItem('userAvatar', data.user?.avatar || 'AD');
                    setupMainLayout();
                } else {
                    // Lỗi này ít khi xảy ra nếu backend trả 401 đúng cách
                    showToast('Tên đăng nhập hoặc mật khẩu không đúng!', 'error');
                    if (passwordInput) passwordInput.value = '';
                }
            })
            .catch(error => {
                // apiFetch đã xử lý 401 bằng cách logout, chỉ hiển thị lỗi khác
                if (error.message !== 'Phiên đăng nhập hết hạn hoặc không hợp lệ.') {
                     showToast(`Lỗi đăng nhập: ${error.message}`, 'error');
                }
                 if (passwordInput) passwordInput.value = '';
            });
        }

        function handleLogout() {
            localStorage.removeItem('authToken');
            localStorage.removeItem('userName');
            localStorage.removeItem('userAvatar');
            stopAttendanceCamera();
            stopFaceDataCamera();
            if(mainLayout) mainLayout.style.display = 'none';
            if(loginPage) loginPage.style.display = 'flex';
            console.log("User logged out.");
            window.location.hash = ''; // Về trang login
        }

        function setupMainLayout() {
            if(loginPage) loginPage.style.display = 'none';
            if(mainLayout) mainLayout.style.display = 'flex';
            updateUserInfoDisplay();
            const initialPage = window.location.hash.substring(1) || 'attendance';
            loadPageContent(initialPage);
        }

        function updateUserInfoDisplay() {
            const userName = localStorage.getItem('userName') || 'Admin';
            const userAvatar = localStorage.getItem('userAvatar') || '?';
            const avatarElement = mainLayout?.querySelector('.user-info .avatar');
            const userNameElement = mainLayout?.querySelector('.user-info .user-name');
            if (avatarElement) avatarElement.textContent = userAvatar;
            if (userNameElement) userNameElement.textContent = userName;
        }

        function toggleDesktopSidebar(forceCollapse) {
            if (!sidebar || !content) return;
            const shouldCollapse = forceCollapse !== undefined ? forceCollapse : !sidebar.classList.contains('sidebar-collapsed');
            sidebar.classList.toggle('sidebar-collapsed', shouldCollapse);
            content.classList.toggle('content-expanded', shouldCollapse);
        }

        function toggleMobileSidebar(show) {
            if (!sidebar || !sidebarOverlay) return;
            sidebar.classList.toggle('show', show);
            sidebarOverlay.classList.toggle('show', show);
        }

        function initializePageScripts(pageId) {
            console.log(`Initializing scripts for page: ${pageId}`);
            stopRecognitionInterval(); // Dừng nhận diện khi chuyển trang

            if (pageId === 'attendance') {
                const toggleRecognitionBtn = pageContentArea?.querySelector('#toggle-recognition');
                const stopCameraBtn = pageContentArea?.querySelector('#stop-camera');
                const filterForm = pageContentArea?.querySelector('#filter-attendance-form');
                const historyTbody = pageContentArea?.querySelector('#attendance-history-log');
                if (toggleRecognitionBtn) toggleRecognitionBtn.onclick = toggleRecognition;
                if (stopCameraBtn) stopCameraBtn.onclick = stopAttendanceCamera;
                if (filterForm) filterForm.addEventListener('submit', handleAttendanceFilter);
                loadAttendanceHistory(historyTbody);
                startAttendanceCamera();
            } else if (pageId === 'face-data') {
                const addBtn = pageContentArea?.querySelector('#add-new-face-btn');
                const addNewCard = pageContentArea?.querySelector('#add-new-face-card');
                const addEditFaceForm = pageContentArea?.querySelector('#add-edit-face-form');
                const captureBtn = pageContentArea?.querySelector('#capture-face-btn');
                const stopFaceCamBtn = pageContentArea?.querySelector('#stop-face-camera-btn');
                const closeFormBtn = pageContentArea?.querySelector('#close-face-form-btn');
                const cancelFormBtn = pageContentArea?.querySelector('#cancel-face-form-btn');
                const employeeSelect = pageContentArea?.querySelector('#face-employee-select');
                const faceGridContainer = pageContentArea?.querySelector('.face-grid');
                const searchInput = pageContentArea?.querySelector('.search-input');
                const searchButton = pageContentArea?.querySelector('.search-button');

                if (addBtn) addBtn.onclick = () => toggleFaceForm(true);
                if (addNewCard) addNewCard.onclick = () => toggleFaceForm(true);
                if (captureBtn) captureBtn.onclick = captureFacePhoto;
                if (stopFaceCamBtn) stopFaceCamBtn.onclick = stopFaceDataCamera;
                if (closeFormBtn) closeFormBtn.onclick = () => toggleFaceForm(false);
                if (cancelFormBtn) cancelFormBtn.onclick = () => toggleFaceForm(false);
                if (addEditFaceForm) addEditFaceForm.addEventListener('submit', handleFaceFormSubmit);

                loadFaceGrid(faceGridContainer);
                loadUsersWithoutFaces(employeeSelect);

                const triggerSearch = () => loadFaceGrid(faceGridContainer, 1, searchInput?.value || '');
                if(searchButton) searchButton.onclick = triggerSearch;
                if(searchInput) searchInput.onkeypress = (e) => { if (e.key === 'Enter') triggerSearch(); };

                faceGridContainer?.addEventListener('click', (e) => {
                    const deleteButton = e.target.closest('.face-button.delete');
                    if (deleteButton) {
                        const card = deleteButton.closest('.face-card');
                        const employeeId = card?.dataset.employeeId;
                        const employeeName = card?.querySelector('.face-name')?.textContent || 'này';
                        if (employeeId && confirm(`Bạn chắc chắn muốn xóa dữ liệu khuôn mặt của ${employeeName} (ID: ${employeeId})?`)) {
                            deleteFaceData(employeeId, card);
                        }
                    }
                });
            } else if (pageId === 'user-data') {
                const addBtn = pageContentArea?.querySelector('#add-new-user-btn');
                const addEditUserForm = pageContentArea?.querySelector('#add-edit-user-form');
                const closeFormBtn = pageContentArea?.querySelector('#close-user-form-btn');
                const cancelFormBtn = pageContentArea?.querySelector('#cancel-user-form-btn');
                const userTableTbody = pageContentArea?.querySelector('.data-table tbody');
                const searchInput = pageContentArea?.querySelector('.search-input');
                const searchButton = pageContentArea?.querySelector('.search-button');

                if (addBtn) addBtn.onclick = () => toggleUserForm(true);
                if (closeFormBtn) closeFormBtn.onclick = () => toggleUserForm(false);
                if (cancelFormBtn) cancelFormBtn.onclick = () => toggleUserForm(false);
                if (addEditUserForm) addEditUserForm.addEventListener('submit', handleUserFormSubmit);

                loadUserTable(userTableTbody);

                const triggerSearch = () => loadUserTable(userTableTbody, 1, searchInput?.value || '');
                if(searchButton) searchButton.onclick = triggerSearch;
                if(searchInput) searchInput.onkeypress = (e) => { if (e.key === 'Enter') triggerSearch(); };

                userTableTbody?.addEventListener('click', (e) => {
                    const button = e.target.closest('.action-button');
                    if (!button) return;
                    const row = button.closest('tr');
                    const userId = row?.cells[0]?.textContent;
                    const userName = row?.cells[1]?.textContent;
                    if (button.title === 'Sửa' && userId) {
                        const statusElement = row?.cells[2];
                        const userStatus = statusElement?.dataset.statusValue || 'active';
                        toggleUserForm(true, { id: userId, name: userName, status: userStatus });
                    } else if (button.title === 'Xóa' && userId) {
                        if (confirm(`Bạn chắc chắn muốn xóa nhân viên ${userName} (ID: ${userId})?`)) {
                            deleteUser(userId, row);
                        }
                    } else if (button.classList.contains('add-face-data-link') && userId) {
                        navigateAndOpenFaceForm(userId);
                    }
                });
            } else if (pageId === 'account') {
                const changePasswordForm = pageContentArea?.querySelector('#change-password-form');
                if (changePasswordForm) changePasswordForm.addEventListener('submit', handleChangePassword);
            }
        }

        // --- Data Loading and Rendering Functions ---
        async function loadUserTable(tbody, page = 1, searchTerm = '') {
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
            renderPagination(tbody.closest('.card-body'), null, null);

            try {
                const endpoint = `/users?page=${page}&search=${encodeURIComponent(searchTerm)}`;
                const data = await apiFetch(endpoint);
                tbody.innerHTML = '';
                if (data && data.users && data.users.length > 0) {
                    data.users.forEach(user => {
                        const row = tbody.insertRow();
                        row.insertCell().textContent = user.id;
                        row.insertCell().textContent = user.name;
                        const statusCell = row.insertCell();
                        statusCell.dataset.statusValue = user.workStatus;
                        const statusBadge = document.createElement('span'); statusBadge.classList.add('badge');
                        let statusText = user.workStatus;
                        if(user.workStatus === 'active') { statusBadge.classList.add('badge-success'); statusText = 'Đang làm việc'; }
                        else if(user.workStatus === 'inactive') { statusBadge.classList.add('badge-danger'); statusText = 'Nghỉ việc'; }
                        else if(user.workStatus === 'new') { statusBadge.classList.add('badge-primary'); statusText = 'Mới'; }
                        statusBadge.textContent = statusText;
                        statusCell.appendChild(statusBadge);
                        const faceCell = row.insertCell();
                        const faceBadge = document.createElement('span'); faceBadge.classList.add('badge');
                        if (user.hasFaceData) { faceBadge.classList.add('badge-success'); faceBadge.textContent = 'Đã có'; }
                        else { faceBadge.classList.add('badge-warning'); faceBadge.textContent = 'Chưa có'; }
                        faceCell.appendChild(faceBadge);
                        const actionCell = row.insertCell();
                        actionCell.innerHTML = `<button class="action-button" title="Sửa"><i class="fas fa-edit"></i></button> <button class="action-button" title="Xóa"><i class="fas fa-trash"></i></button> ${!user.hasFaceData ? '<button class="action-button add-face-data-link" title="Thêm dữ liệu khuôn mặt"><i class="fas fa-camera-retro" style="color: var(--success);"></i></button>' : ''}`;
                    });
                } else {
                     tbody.innerHTML = '<tr><td colspan="5" style="text-align:center; padding:20px;">Không tìm thấy nhân viên nào.</td></tr>';
                }
                renderPagination(tbody.closest('.card-body'), data?.pagination, (newPage) => loadUserTable(tbody, newPage, searchTerm));
            } catch (error) {
                console.error("Failed to load user table:", error);
                tbody.innerHTML = `<tr><td colspan="5" style="text-align:center; padding:20px; color: var(--danger);">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
                renderPagination(tbody.closest('.card-body'), null, null);
            }
        }

       async function loadFaceGrid(gridContainer, page = 1, searchTerm = '') {
            if (!gridContainer) return;
            const addNewCard = gridContainer.querySelector('.add-new');
            gridContainer.innerHTML = '<p style="text-align:center; padding:20px; grid-column: 1 / -1;"><i class="fas fa-spinner fa-spin"></i> Đang tải...</p>';
            if(addNewCard) gridContainer.appendChild(addNewCard);
            renderPagination(gridContainer.closest('.card-body'), null, null);

            try {
                const endpoint = `/faces?page=${page}&search=${encodeURIComponent(searchTerm)}`;
                const data = await apiFetch(endpoint); // apiFetch đã có API_BASE_URL
                
                const loadingPara = gridContainer.querySelector('p');
                if(loadingPara) loadingPara.remove();
                Array.from(gridContainer.querySelectorAll('.face-card:not(.add-new)')).forEach(card => card.remove());

                if (data && data.faces) {
                    if (data.faces.length === 0) {
                        const message = searchTerm ? "Không tìm thấy kết quả phù hợp." : "Chưa có dữ liệu khuôn mặt nào được thêm.";
                        gridContainer.insertAdjacentHTML('afterbegin', `<p style="text-align:center; padding:20px; grid-column: 1 / -1;">${message}</p>`);
                    } else {
                        data.faces.forEach(face => {
                            const card = document.createElement('div');
                            card.classList.add('face-card');
                            card.dataset.employeeId = face.employeeId;
                            
                            // imageUrl từ backend nên là đường dẫn tương đối tới API, vd: /api/faces/image/NV001/img.jpg
                            // Hoặc nếu backend trả về chỉ user_id/img.jpg, thì cần ghép ở đây
                            let finalImageUrl = `https://via.placeholder.com/160x160/EEEEEE/AAAAAA?text=${face.employeeId}`; // Placeholder
                            if (face.imageUrl) {
                                // Nếu imageUrl trả về là đường dẫn đầy đủ từ API (bao gồm /api/...)
                                if (face.imageUrl.startsWith('/api/')) {
                                     finalImageUrl = `${API_BASE_URL.replace('/api', '')}${face.imageUrl}`; // Loại bỏ /api trùng lặp nếu API_BASE_URL đã có
                                } else if (face.imageUrl.startsWith('http')) { // Nếu là URL tuyệt đối
                                    finalImageUrl = face.imageUrl;
                                }
                                // Nếu backend trả về chỉ 'NV001/file.jpg' và API_BASE_URL là 'http://localhost:5000/api'
                                // thì cần endpoint /faces/image/ để ghép:
                                // finalImageUrl = `${API_BASE_URL}/faces/image/${face.imageUrl}`; // Cần đảm bảo face.imageUrl là 'NV001/file.jpg'
                                // Với cấu trúc hiện tại, backend trả về url_for('faces_api.get_face_image', filename=...)
                                // nên nó sẽ là /api/faces/image/NV001/ten_file.jpg.
                                // API_BASE_URL là http://localhost:5000/api.
                                // Vậy finalImageUrl = http://localhost:5000/api/faces/image/NV001/ten_file.jpg
                                // Điều này đúng nếu API_BASE_URL không có /api ở cuối, hoặc url_for không bao gồm /api
                                // Hiện tại url_for của Flask sẽ tạo path từ root của app, vd: /api/faces/image/...
                                // Vậy chỉ cần ghép với origin của backend.
                                // API_BASE_URL = 'http://localhost:5000/api'
                                // finalImageUrl = `${API_BASE_URL.substring(0, API_BASE_URL.lastIndexOf('/api'))}${face.imageUrl}`;
                                // Hoặc đơn giản là:
                                finalImageUrl = `${window.location.origin.replace(/:[0-9]+$/, '')}:${new URL(API_BASE_URL).port || window.location.port}${face.imageUrl}`;
                                // Cách an toàn hơn là backend trả về URL đầy đủ hoặc frontend biết cách ghép chính xác.
                                // Giả sử backend trả về path /api/faces/image/NV001/img.jpg
                                // và API_BASE_URL là http://localhost:5000/api
                                // Ta cần http://localhost:5000/api/faces/image/NV001/img.jpg
                                // Nếu face.imageUrl là "/api/faces/image/NV001/img.jpg"
                                // thì finalImageUrl = API_BASE_URL.split('/api')[0] + face.imageUrl;
                                // Hoặc nếu API_BASE_URL là http://localhost:5000 (không có /api)
                                // thì finalImageUrl = API_BASE_URL + face.imageUrl;

                                // Đơn giản nhất: Backend trả về URL tương đối từ root của server
                                // Ví dụ: /api/faces/image/NV001/ten_file.jpg
                                // Frontend sẽ tự động hiểu là request đến cùng origin.
                                // Nếu backend trả về url_for('faces_api.get_face_image', filename=first_encoding.image_filename)
                                // thì nó sẽ là /api/faces/image/user_id/filename.jpg.
                                // Frontend chỉ cần dùng trực tiếp:
                                finalImageUrl = face.imageUrl; // Giả sử backend trả về /api/faces/image/user_id/filename.jpg
                            }

                            card.innerHTML = `
                                <div class="face-image">
                                    <img src="${finalImageUrl}" alt="${face.name}" onerror="this.src='https://via.placeholder.com/160x160/EEEEEE/AAAAAA?text=Error'; console.error('Error loading image: ${finalImageUrl}')">
                                </div>
                                <div class="face-info">
                                    <div class="face-name">${face.name}</div>
                                    <div class="face-details">ID: ${face.employeeId}</div>
                                    <div class="face-actions">
                                        <button class="face-button delete" title="Xóa"><i class="fas fa-trash"></i> Xóa</button>
                                    </div>
                                </div>`;
                            if (addNewCard) {
                                gridContainer.insertBefore(card, addNewCard);
                            } else {
                                gridContainer.appendChild(card);
                            }
                        });
                    }
                    renderPagination(gridContainer.closest('.card-body'), data.pagination, (newPage) => {
                        loadFaceGrid(gridContainer, newPage, searchTerm);
                    });
                } else {
                     gridContainer.insertAdjacentHTML('afterbegin', '<p style="text-align:center; padding:20px; grid-column: 1 / -1;">Không thể tải dữ liệu khuôn mặt.</p>');
                }
            } catch (error) {
                console.error("Failed to load face grid:", error);
                const loadingPara = gridContainer.querySelector('p'); if(loadingPara) loadingPara.remove();
                gridContainer.insertAdjacentHTML('afterbegin', `<p style="text-align:center; padding:20px; color: var(--danger); grid-column: 1 / -1;">Lỗi tải dữ liệu: ${error.message}</p>`);
                renderPagination(gridContainer.closest('.card-body'), null, null);
            }
        }

        async function loadAttendanceHistory(tbody, page = 1, dateFrom = '', dateTo = '', employee = '') {
            if (!tbody) return;
            tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;"><i class="fas fa-spinner fa-spin"></i> Đang tải...</td></tr>';
            const paginationContainer = tbody.closest('.card-body')?.querySelector('.no-padding') || tbody.closest('.card-body');
            renderPagination(paginationContainer, null, null);

            try {
                const params = new URLSearchParams({ page });
                if(dateFrom) params.append('dateFrom', dateFrom);
                if(dateTo) params.append('dateTo', dateTo);
                if(employee) params.append('employee', employee);
                const endpoint = `/attendance/history?${params.toString()}`;
                const data = await apiFetch(endpoint);
                tbody.innerHTML = '';
                if (data && data.logs && data.logs.length > 0) {
                    data.logs.forEach(log => {
                        const row = tbody.insertRow();
                        row.insertCell().textContent = log.date;
                        row.insertCell().textContent = log.employeeId;
                        row.insertCell().textContent = log.employeeName;
                        row.insertCell().textContent = log.checkInTime;
                    });
                } else {
                    tbody.innerHTML = '<tr><td colspan="4" style="text-align:center; padding:20px;">Không có lịch sử check-in nào phù hợp.</td></tr>';
                }
                renderPagination(paginationContainer, data?.pagination, (newPage) => loadAttendanceHistory(tbody, newPage, dateFrom, dateTo, employee));
            } catch (error) {
                console.error("Failed to load attendance history:", error);
                tbody.innerHTML = `<tr><td colspan="4" style="text-align:center; padding:20px; color: var(--danger);">Lỗi tải dữ liệu: ${error.message}</td></tr>`;
                renderPagination(paginationContainer, null, null);
            }
        }

        async function loadUsersWithoutFaces(selectElement) {
            if (!selectElement) return;
            const currentValue = selectElement.value;
            selectElement.innerHTML = '<option value="">Đang tải...</option>';
            selectElement.disabled = true;
            try {
                const users = await apiFetch('/faces/users-without-faces');
                selectElement.innerHTML = '<option value="">-- Chọn nhân viên --</option>';
                if (users && users.length > 0) {
                    users.forEach(user => {
                        const option = document.createElement('option');
                        option.value = user.id;
                        option.textContent = `${user.name} (${user.id})`;
                        selectElement.appendChild(option);
                    });
                    selectElement.disabled = false;
                    if (users.some(u => u.id === currentValue)) selectElement.value = currentValue;
                } else {
                    selectElement.innerHTML = '<option value="">-- Không có nhân viên nào --</option>';
                }
            } catch (error) {
                console.error("Failed to load users without faces:", error);
                selectElement.innerHTML = `<option value="">Lỗi tải</option>`;
            }
        }

        function renderPagination(containerElement, paginationData, onPageClick) {
            let paginationDiv = containerElement?.querySelector('.pagination');
            if (!containerElement || !paginationData || paginationData.totalPages <= 1) {
                if(paginationDiv) paginationDiv.remove();
                else if (containerElement) {
                    const oldPagination = containerElement.querySelector('.pagination');
                    if(oldPagination) oldPagination.remove();
                }
                return;
            }
            if (!paginationDiv) {
                paginationDiv = document.createElement('div');
                paginationDiv.className = 'pagination';
                containerElement.appendChild(paginationDiv);
            }
            paginationDiv.innerHTML = '';
            const currentPage = paginationData.currentPage;
            const totalPages = paginationData.totalPages;
            const createPageLink = (page, text, isDisabled = false, isActive = false, isIcon = false) => {
                const link = document.createElement('a');
                link.href = '#'; link.classList.add('page-link');
                if (isIcon) link.innerHTML = text; else link.textContent = text;
                if (isDisabled) { link.classList.add('disabled'); link.style.pointerEvents = 'none'; link.style.opacity = '0.6'; }
                else if (isActive) { link.classList.add('active'); }
                else { link.onclick = (e) => { e.preventDefault(); onPageClick(page); }; }
                return link;
            };
            paginationDiv.appendChild(createPageLink(currentPage - 1, '<i class="fas fa-chevron-left"></i>', currentPage === 1, false, true));
            const maxPagesToShow = 5;
            let startPage, endPage;
            if (totalPages <= maxPagesToShow) { startPage = 1; endPage = totalPages; }
            else {
                const maxPagesBeforeCurrent = Math.floor((maxPagesToShow - 1) / 2);
                const maxPagesAfterCurrent = Math.ceil((maxPagesToShow - 1) / 2);
                if (currentPage <= maxPagesBeforeCurrent) { startPage = 1; endPage = maxPagesToShow; }
                else if (currentPage + maxPagesAfterCurrent >= totalPages) { startPage = totalPages - maxPagesToShow + 1; endPage = totalPages; }
                else { startPage = currentPage - maxPagesBeforeCurrent; endPage = currentPage + maxPagesAfterCurrent; }
            }
            if (startPage > 1) {
                paginationDiv.appendChild(createPageLink(1, '1'));
                if (startPage > 2) { const ellipsis = document.createElement('span'); ellipsis.classList.add('page-link'); ellipsis.textContent = '...'; ellipsis.style.pointerEvents = 'none'; paginationDiv.appendChild(ellipsis); }
            }
            for (let i = startPage; i <= endPage; i++) { paginationDiv.appendChild(createPageLink(i, i, false, i === currentPage)); }
            if (endPage < totalPages) {
                if (endPage < totalPages - 1) { const ellipsis = document.createElement('span'); ellipsis.classList.add('page-link'); ellipsis.textContent = '...'; ellipsis.style.pointerEvents = 'none'; paginationDiv.appendChild(ellipsis); }
                paginationDiv.appendChild(createPageLink(totalPages, totalPages));
            }
            paginationDiv.appendChild(createPageLink(currentPage + 1, '<i class="fas fa-chevron-right"></i>', currentPage === totalPages, false, true));
        }

        // --- Delete Functions ---
        async function deleteUser(userId, tableRow) {
            if (!userId) return;
            try {
                await apiFetch(`/users/${userId}`, { method: 'DELETE' });
                showToast(`Đã xóa nhân viên ${userId}!`, 'success');
                tableRow?.remove();
                const userTableTbody = pageContentArea?.querySelector('.data-table tbody'); // Lấy lại tbody
                const paginationDiv = userTableTbody?.closest('.card-body')?.querySelector('.pagination');
                const currentPage = parseInt(paginationDiv?.querySelector('.page-link.active')?.textContent || '1');
                const searchInput = pageContentArea?.querySelector('#user-data-content .search-input'); // Target search input specifically for user-data
                loadUserTable(userTableTbody, currentPage, searchInput?.value || '');


            } catch (error) {
                 showToast(`Lỗi xóa nhân viên ${userId}: ${error.message}`, 'error');
            }
        }
        async function deleteFaceData(userId, cardElement) {
            if (!userId) return;
            try {
                await apiFetch(`/faces/${userId}`, { method: 'DELETE' });
                showToast(`Đã xóa dữ liệu khuôn mặt của ${userId}!`, 'success');
                cardElement?.remove();
                if(window.location.hash === '#user-data') { loadPageContent('user-data', true); }
                else if (window.location.hash === '#face-data') {
                    const faceGridContainer = pageContentArea?.querySelector('.face-grid');
                    const paginationDiv = faceGridContainer?.closest('.card-body')?.querySelector('.pagination');
                    const currentPage = parseInt(paginationDiv?.querySelector('.page-link.active')?.textContent || '1');
                    const searchInput = pageContentArea?.querySelector('#face-data-content .search-input'); // Target search input specifically for face-data
                    loadFaceGrid(faceGridContainer, currentPage, searchInput?.value || '');
                }
            } catch (error) {
                showToast(`Lỗi xóa dữ liệu khuôn mặt của ${userId}: ${error.message}`, 'error');
            }
        }

        // --- Form Submission Handlers ---
        async function handleUserFormSubmit(event) {
            event.preventDefault();
            const form = event.target;
            const userIdInput = form.querySelector('#user-id');
            const userId = userIdInput?.value.trim();
            const userName = form.querySelector('#user-fullname')?.value.trim();
            const userStatus = form.querySelector('#user-workstatus')?.value;
            const isEditing = userIdInput?.disabled;
            if (!userId || !userName || !userStatus) { showToast("Vui lòng điền ID, Họ tên, Trạng thái.", 'warning'); return; }
            const url = isEditing ? `/users/${userId}` : '/users';
            const method = isEditing ? 'PUT' : 'POST';
            const bodyPayload = { name: userName, status: userStatus };
            if (!isEditing) bodyPayload.id = userId;
            const submitButton = form.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true; submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
            try {
                await apiFetch(url, { method: method, body: JSON.stringify(bodyPayload) });
                showToast(`Đã ${isEditing ? 'cập nhật' : 'thêm'} nhân viên ${userName}!`, 'success');
                toggleUserForm(false);
                loadPageContent('user-data', true);
            } catch (error) { showToast(`Lỗi lưu thông tin: ${error.message}`, 'error');
            } finally { submitButton.disabled = false; submitButton.innerHTML = originalButtonText; }
        }
        async function handleFaceFormSubmit(event) {
            event.preventDefault();
            const form = event.target;
            const employeeId = form.querySelector('#face-employee-select')?.value;
            const capturedPhotos = form.querySelector('#captured-photos-container')?.querySelectorAll('.captured-photo-item');
            const photoDataUrls = [];
            if (!employeeId) { showToast("Vui lòng chọn nhân viên.", 'warning'); return; }
            if (!capturedPhotos || capturedPhotos.length === 0) { showToast("Vui lòng chụp ít nhất 1 ảnh.", 'warning'); return; }
            capturedPhotos.forEach(item => { const img = item.querySelector('img'); if(img && img.src.startsWith('data:image')) photoDataUrls.push(img.src); });
            if (photoDataUrls.length === 0) { showToast("Không có ảnh hợp lệ.", 'warning'); return; }
            const submitButton = form.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true; submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang lưu...';
            try {
                const data = await apiFetch('/faces', { method: 'POST', body: JSON.stringify({ employeeId, photos: photoDataUrls }) });
                showToast(`Đã lưu ${data?.message || 'dữ liệu khuôn mặt'} cho ${employeeId}!`, 'success');
                toggleFaceForm(false);
                if(window.location.hash === '#user-data') loadPageContent('user-data', true);
                else loadPageContent('face-data', true);
            } catch (error) { showToast(`Lỗi lưu dữ liệu: ${error.message}`, 'error');
            } finally { submitButton.disabled = false; submitButton.innerHTML = originalButtonText; }
        }
        async function handleChangePassword(event) {
            event.preventDefault();
            const form = event.target;
            const currentPassword = form.querySelector('#current-password')?.value;
            const newPassword = form.querySelector('#new-password')?.value;
            const confirmPassword = form.querySelector('#confirm-password')?.value;
            if (!currentPassword || !newPassword || !confirmPassword) { showToast('Vui lòng điền đủ mật khẩu.', 'warning'); return; }
            if (newPassword.length < 6) { showToast('Mật khẩu mới cần ít nhất 6 ký tự.', 'warning'); return; }
            if (newPassword !== confirmPassword) { showToast('Xác nhận mật khẩu mới không khớp!', 'warning'); return; }
            const submitButton = form.querySelector('button[type="submit"]');
            const originalButtonText = submitButton.innerHTML;
            submitButton.disabled = true; submitButton.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Đang đổi...';
            try {
                 await apiFetch('/account/change-password', { method: 'POST', body: JSON.stringify({ currentPassword, newPassword }) });
                 showToast('Đổi mật khẩu thành công!', 'success');
                 form.reset();
            } catch (error) { showToast(`Lỗi đổi mật khẩu: ${error.message}`, 'error');
            } finally { submitButton.disabled = false; submitButton.innerHTML = originalButtonText; }
        }
        function handleAttendanceFilter(event) {
           event.preventDefault();
           const form = event.target;
           const dateFrom = form.querySelector('#filter-date-from')?.value || '';
           const dateTo = form.querySelector('#filter-date-to')?.value || '';
           const employee = form.querySelector('#filter-employee')?.value || '';
           const historyTbody = pageContentArea?.querySelector('#attendance-history-log');
           loadAttendanceHistory(historyTbody, 1, dateFrom, dateTo, employee);
        }

        // --- Camera Handling ---
        function handleCameraOnPageChange(currentPageId) {
            if (currentPageId !== 'attendance' && attendanceCameraStream) stopAttendanceCamera();
            const faceForm = pageContentArea?.querySelector('#face-form');
            if ((currentPageId !== 'face-data' || !faceForm || faceForm.style.display === 'none') && faceDataCameraStream) stopFaceDataCamera();
        }
        async function startAttendanceCamera() {
            const videoFeed = pageContentArea?.querySelector('#camera-feed');
            const statusIndicator = pageContentArea?.querySelector('#status-indicator');
            const statusText = pageContentArea?.querySelector('#status-text');
            const recognitionIcon = pageContentArea?.querySelector('#recognition-icon');
            if (!videoFeed || !statusIndicator || !statusText || !recognitionIcon || attendanceCameraStream) return;
            statusIndicator.className = 'status-indicator waiting'; statusText.textContent = 'Mở camera...'; recognitionIcon.className = 'fas fa-spinner fa-spin';
            try {
                attendanceCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                videoFeed.srcObject = attendanceCameraStream; await videoFeed.play();
                recognitionActive = true; statusIndicator.className = 'status-indicator active'; statusText.textContent = 'Đang nhận diện...'; recognitionIcon.className = 'fas fa-pause';
                console.log("Attendance camera started."); startRecognitionInterval();
            } catch (err) {
                console.error("Error accessing attendance camera: ", err);
                statusIndicator.className = 'status-indicator error'; statusText.textContent = 'Lỗi camera!'; recognitionIcon.className = 'fas fa-video-slash';
                if (err.name !== 'NotAllowedError' && err.name !== 'NotFoundError') showToast(`Không thể truy cập camera: ${err.name}`, 'error');
                attendanceCameraStream = null; stopRecognitionInterval();
            }
        }
        function stopAttendanceCamera() {
            stopRecognitionInterval();
            const videoFeed = pageContentArea?.querySelector('#camera-feed');
            const statusIndicator = pageContentArea?.querySelector('#status-indicator');
            const statusText = pageContentArea?.querySelector('#status-text');
            const recognitionIcon = pageContentArea?.querySelector('#recognition-icon');
            if (attendanceCameraStream) {
                attendanceCameraStream.getTracks().forEach(track => track.stop());
                attendanceCameraStream = null; if(videoFeed) videoFeed.srcObject = null;
                recognitionActive = false; if(statusIndicator) statusIndicator.className = 'status-indicator';
                if(statusText) statusText.textContent = 'Camera đã tắt'; if(recognitionIcon) recognitionIcon.className = 'fas fa-play';
                console.log("Attendance camera stopped.");
            }
        }
        function toggleRecognition() {
            const statusIndicator = pageContentArea?.querySelector('#status-indicator');
            const statusText = pageContentArea?.querySelector('#status-text');
            const recognitionIcon = pageContentArea?.querySelector('#recognition-icon');
            if (!attendanceCameraStream) { startAttendanceCamera(); return; }
            if (!statusIndicator || !statusText || !recognitionIcon) return;
            recognitionActive = !recognitionActive;
            if (recognitionActive) {
                statusIndicator.className = 'status-indicator active'; statusText.textContent = 'Đang nhận diện...'; recognitionIcon.className = 'fas fa-pause';
                startRecognitionInterval(); console.log("Recognition resumed.");
            } else {
                statusIndicator.className = 'status-indicator paused'; statusText.textContent = 'Tạm dừng'; recognitionIcon.className = 'fas fa-play';
                stopRecognitionInterval(); console.log("Recognition paused.");
            }
        }
        async function startFaceDataCamera() {
            const videoFeed = pageContentArea?.querySelector('#face-camera');
            if (!videoFeed || faceDataCameraStream) return;
            try {
                faceDataCameraStream = await navigator.mediaDevices.getUserMedia({ video: { facingMode: 'user' }, audio: false });
                videoFeed.srcObject = faceDataCameraStream; await videoFeed.play();
                console.log("Face form camera started.");
            } catch (err) {
                console.error("Error accessing face form camera: ", err);
                if (err.name !== 'NotAllowedError' && err.name !== 'NotFoundError') showToast(`Không thể truy cập camera: ${err.name}`, 'error');
                faceDataCameraStream = null;
            }
        }
        function stopFaceDataCamera() {
            const videoFeed = pageContentArea?.querySelector('#face-camera');
            if (faceDataCameraStream) {
                faceDataCameraStream.getTracks().forEach(track => track.stop());
                faceDataCameraStream = null; if(videoFeed) videoFeed.srcObject = null;
                console.log("Face form camera stopped.");
            }
        }
        function captureFacePhoto() {
            const videoFeed = pageContentArea?.querySelector('#face-camera');
            const photosContainer = pageContentArea?.querySelector('#captured-photos-container');
            if (!faceDataCameraStream || !videoFeed || !photosContainer || !videoFeed.videoWidth || videoFeed.videoWidth === 0) { showToast("Camera chưa sẵn sàng.", 'warning'); return; }
            if (photosContainer.querySelectorAll('.captured-photo-item').length >= 5) { showToast("Đã chụp đủ 5 ảnh.", 'info'); return; }
            const canvas = document.createElement('canvas'); canvas.width = videoFeed.videoWidth; canvas.height = videoFeed.videoHeight;
            canvas.getContext('2d').drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
            const imageDataUrl = canvas.toDataURL('image/jpeg', 0.9);
            const photoDiv = document.createElement('div'); photoDiv.className = 'captured-photo-item';
            photoDiv.innerHTML = `<img src="${imageDataUrl}" alt="Ảnh đã chụp"><button type="button" class="delete-photo-btn" title="Xóa ảnh này"><i class="fas fa-times"></i></button>`;
            photoDiv.querySelector('.delete-photo-btn').onclick = () => { photoDiv.remove(); updatePhotoCount(); };
            photosContainer.appendChild(photoDiv); updatePhotoCount(); console.log("Photo captured.");
        }
        function updatePhotoCount() {
            const photosContainer = pageContentArea?.querySelector('#captured-photos-container');
            const photoCountSpan = pageContentArea?.querySelector('#photo-count');
            if(photosContainer && photoCountSpan) photoCountSpan.textContent = photosContainer.querySelectorAll('.captured-photo-item').length;
        }

        // --- Recognition Interval ---
        function startRecognitionInterval() {
            stopRecognitionInterval();
            const videoFeed = pageContentArea?.querySelector('#camera-feed');
            if(!videoFeed || !attendanceCameraStream) {
                console.log("Cannot start recognition: videoFeed or camera stream not ready.");
                return;
            }
            console.log("Starting recognition interval...");
            recognitionIntervalId = setInterval(async () => {
                if (!recognitionActive || !attendanceCameraStream || videoFeed.paused || videoFeed.ended) return;
                const canvas = document.createElement('canvas'); const scale = 0.5;
                canvas.width = videoFeed.videoWidth * scale; canvas.height = videoFeed.videoHeight * scale;
                if (!canvas.width || !canvas.height) return;
                canvas.getContext('2d').drawImage(videoFeed, 0, 0, canvas.width, canvas.height);
                const frameDataUrl = canvas.toDataURL('image/jpeg', 0.7);
                try {
                    const result = await apiFetch('/attendance/recognize', { method: 'POST', body: JSON.stringify({ imageDataUrl: frameDataUrl }) });
                    if (result && result.recognized && result.log) {
                        console.log("Recognition successful:", result.log); updateRecentLogTable(result.log);
                    } else if (result && result.message === "Already checked in today" && result.log){
                        updateRecentLogTable(result.log, true);
                    }
                } catch (error) { console.error("Recognition API call error in interval:", error); }
            }, 2000);
        }
        function stopRecognitionInterval() {
            if (recognitionIntervalId) { clearInterval(recognitionIntervalId); recognitionIntervalId = null; console.log("Recognition interval stopped."); }
        }
        function updateRecentLogTable(logData, alreadyCheckedIn = false) {
            const logTbody = pageContentArea?.querySelector('#recognition-log');
            if (!logTbody) return;
            const logTimestamp = new Date(logData.timestamp).getTime();
            const existingRow = Array.from(logTbody.rows).find(row => row.cells[2]?.textContent === logData.employeeId && parseInt(row.dataset.timestamp) === logTimestamp);
            if(existingRow && !alreadyCheckedIn) return;
            if(existingRow && alreadyCheckedIn) {
                if(!existingRow.querySelector('.already-checked-in')) {
                    const statusSpan = document.createElement('span'); statusSpan.textContent = " (Đã vào)"; statusSpan.style.fontSize = '0.8em'; statusSpan.style.color = 'var(--gray)'; statusSpan.classList.add('already-checked-in');
                    existingRow.cells[2].appendChild(statusSpan);
                }
                return;
            }
            const newRow = logTbody.insertRow(0); newRow.dataset.timestamp = logTimestamp;
            const localTime = new Date(logData.timestamp).toLocaleTimeString('vi-VN', { hour: '2-digit', minute: '2-digit', second: '2-digit' });
            newRow.insertCell().textContent = localTime; newRow.insertCell().textContent = logData.employeeName;
            const idCell = newRow.insertCell(); idCell.textContent = logData.employeeId;
            if(alreadyCheckedIn) {
                const statusSpan = document.createElement('span'); statusSpan.textContent = " (Đã vào)"; statusSpan.style.fontSize = '0.8em'; statusSpan.style.color = 'var(--gray)'; statusSpan.classList.add('already-checked-in');
                idCell.appendChild(statusSpan);
            }
            while (logTbody.rows.length > 5) logTbody.deleteRow(-1);
        }

        // --- UI Toggles ---
        function toggleUserForm(show, userData = null) {
            const userForm = pageContentArea?.querySelector('#user-form');
            const formTitle = pageContentArea?.querySelector('#user-form-title');
            const userIdInput = pageContentArea?.querySelector('#user-id');
            const addEditForm = pageContentArea?.querySelector('#add-edit-user-form');
            if (!userForm || !formTitle || !userIdInput || !addEditForm) return;
            if (show) {
                addEditForm.reset();
                if (userData) {
                    formTitle.textContent = `Sửa thông tin: ${userData.name || userData.id}`;
                    userIdInput.value = userData.id || ''; userIdInput.disabled = true;
                    addEditForm.querySelector('#user-fullname').value = userData.name || '';
                    addEditForm.querySelector('#user-workstatus').value = userData.status || 'active';
                } else {
                    formTitle.textContent = 'Thêm nhân viên mới'; userIdInput.disabled = false;
                }
                userForm.style.display = 'block'; userForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
            } else { userForm.style.display = 'none'; }
        }
        function toggleFaceForm(show, employeeId = null) {
            const faceForm = pageContentArea?.querySelector('#face-form');
            const formTitle = pageContentArea?.querySelector('#face-form-title');
            const employeeSelect = pageContentArea?.querySelector('#face-employee-select');
            const addEditForm = pageContentArea?.querySelector('#add-edit-face-form');
            const photosContainer = pageContentArea?.querySelector('#captured-photos-container');
            if (!faceForm || !formTitle || !employeeSelect || !addEditForm || !photosContainer) return;
            if (show) {
                addEditForm.reset(); photosContainer.innerHTML = ''; updatePhotoCount();
                formTitle.textContent = 'Thêm dữ liệu khuôn mặt mới'; employeeSelect.disabled = false;
                loadUsersWithoutFaces(employeeSelect).then(() => { if (employeeId) employeeSelect.value = employeeId; });
                faceForm.style.display = 'block'; faceForm.scrollIntoView({ behavior: 'smooth', block: 'center' });
                startFaceDataCamera();
            } else { faceForm.style.display = 'none'; stopFaceDataCamera(); }
        }
        async function navigateAndOpenFaceForm(userId) {
            const targetHash = '#face-data';
            if (window.location.hash !== targetHash) {
                sessionStorage.setItem('openFaceFormForUser', userId);
                window.location.hash = targetHash;
            } else { toggleFaceForm(true, userId); }
        }
        function showToast(message, type = 'info', duration = 3000) {
            const toast = document.createElement('div');
            toast.className = `toast toast-${type}`; toast.textContent = message;
            toast.style.position = 'fixed'; toast.style.bottom = '20px'; toast.style.right = '20px';
            toast.style.padding = '12px 20px'; toast.style.borderRadius = 'var(--border-radius)';
            toast.style.color = 'white'; toast.style.zIndex = '1050'; toast.style.opacity = '0';
            toast.style.transition = 'opacity 0.5s ease';
            switch (type) {
                case 'success': toast.style.backgroundColor = 'rgba(40, 167, 69, 0.9)'; break;
                case 'warning': toast.style.backgroundColor = 'rgba(255, 193, 7, 0.9)'; toast.style.color = '#333'; break;
                case 'error': toast.style.backgroundColor = 'rgba(220, 53, 69, 0.9)'; break;
                default: toast.style.backgroundColor = 'rgba(0, 123, 255, 0.9)'; break;
            }
            document.body.appendChild(toast);
            setTimeout(() => { toast.style.opacity = '1'; }, 10);
            setTimeout(() => { toast.style.opacity = '0'; toast.addEventListener('transitionend', () => toast.remove()); }, duration);
        }

        // --- Event Listeners Setup ---
        // KHAI BÁO sidebarMenu Ở ĐÂY, SAU KHI `sidebar` ĐÃ ĐƯỢC KHỞI TẠO
        const sidebarMenu = sidebar?.querySelector('.menu');

        if (loginForm) loginForm.addEventListener('submit', handleLogin);
        if (logoutLink) logoutLink.addEventListener('click', handleLogout);
        if (logoutDropdownLink) logoutDropdownLink.addEventListener('click', handleLogout);
        if (toggleSidebarButton) {
            toggleSidebarButton.addEventListener('click', () => {
                if (window.innerWidth > 576) toggleDesktopSidebar(); else toggleMobileSidebar(true);
            });
        }
        // SỬ DỤNG sidebarMenu SAU KHI ĐÃ KIỂM TRA NÓ TỒN TẠI
        if (sidebarMenu) { // Kiểm tra sidebarMenu có tồn tại không
            sidebarMenu.addEventListener('click', (event) => {
                const link = event.target.closest('.menu-link');
                if (link && link.getAttribute('href')?.startsWith('#')) {
                    event.preventDefault(); const pageId = link.getAttribute('href').substring(1);
                    if (pageId && pageId !== '#') window.location.hash = pageId;
                }
            });
        } else {
            console.warn("Sidebar menu element not found. Navigation in sidebar might not work.");
        }

        if (userDropdownMenu) {
            userDropdownMenu.addEventListener('click', (event) => {
                const link = event.target.closest('.dropdown-item');
                if (link && link.getAttribute('href')?.startsWith('#')) {
                    event.preventDefault(); const pageId = link.getAttribute('href').substring(1);
                    if (pageId && pageId !== '#') window.location.hash = pageId;
                }
            });
        }
        if (sidebarOverlay) sidebarOverlay.addEventListener('click', () => toggleMobileSidebar(false));
        if (userDropdownToggle) {
            userDropdownToggle.addEventListener('click', (event) => {
                event.stopPropagation(); userDropdownMenu?.classList.toggle('show');
            });
        }
        window.addEventListener('click', (event) => {
            if (userDropdownMenu && !userDropdownToggle?.contains(event.target) && !userDropdownMenu.contains(event.target)) {
                userDropdownMenu.classList.remove('show');
            }
            if (window.innerWidth <= 576 && sidebar?.classList.contains('show')) {
                if (!sidebar.contains(event.target) && !toggleSidebarButton?.contains(event.target)) {
                    toggleMobileSidebar(false);
                }
            }
        });
        window.addEventListener('hashchange', () => {
            const pageId = window.location.hash.substring(1) || 'attendance';
            loadPageContent(pageId).then(() => {
                const openFormUserId = sessionStorage.getItem('openFaceFormForUser');
                if (openFormUserId && pageId === 'face-data') {
                    toggleFaceForm(true, openFormUserId);
                    sessionStorage.removeItem('openFaceFormForUser');
                }
            });
        });

        // --- Initial Page Load Logic ---
        if (currentYearSpan) currentYearSpan.textContent = new Date().getFullYear();
        const isLoggedIn = !!localStorage.getItem('authToken');
        if (isLoggedIn) {
            setupMainLayout();
            const initialPageId = window.location.hash.substring(1) || 'attendance';
            const openFormUserId = sessionStorage.getItem('openFaceFormForUser');
            if (openFormUserId && initialPageId === 'face-data') {
                setTimeout(() => {
                     toggleFaceForm(true, openFormUserId);
                     sessionStorage.removeItem('openFaceFormForUser');
                }, 200);
            }
        } else {
            if(mainLayout) mainLayout.style.display = 'none';
            if(loginPage) loginPage.style.display = 'flex';
        }

    } catch (e) {
        console.error("CRITICAL ERROR during DOMContentLoaded initialization:", e);
        document.body.innerHTML = `<div style='color:red;text-align:center;margin-top:50px;padding:20px;'><h1>Lỗi nghiêm trọng khi khởi tạo ứng dụng!</h1><p>Vui lòng kiểm tra Console (F12) để biết thêm chi tiết.</p><pre>${e.stack || e.message}</pre></div>`;
    }
}); // End DOMContentLoaded