// ====== API LAYER — Gọi REST API với JWT token ======
const API = {
    _token: () => localStorage.getItem('lm_token'),

    async fetch(path, options = {}) {
        const token = API._token();
        const headers = { 'Content-Type': 'application/json', ...(options.headers || {}) };
        if (token) headers['Authorization'] = `Bearer ${token}`;

        const res = await fetch(path, { ...options, headers });

        if (res.status === 401) { logout(); throw new Error('Phiên đăng nhập hết hạn, vui lòng đăng nhập lại!'); }

        const data = await res.json();
        if (!res.ok) throw new Error(data.error || `Lỗi API: ${res.status}`);
        return data;
    },

    // AUTH
    async login(username, password) {
        const res = await fetch('/api/auth/login', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ username, password })
        });
        const data = await res.json();
        if (!res.ok) throw new Error(data.error || 'Đăng nhập thất bại');
        return data; // { token, user }
    },
    async changePassword(oldPassword, newPassword) {
        return API.fetch('/api/auth/change-password', {
            method: 'POST',
            body: JSON.stringify({ oldPassword, newPassword })
        });
    },

    // USERS
    async getUsers() { return API.fetch('/api/users'); },
    async addUser(username, password, role) {
        return API.fetch('/api/users', { method: 'POST', body: JSON.stringify({ username, password, role }) });
    },
    async deleteUser(username) {
        return API.fetch(`/api/users/${encodeURIComponent(username)}`, { method: 'DELETE' });
    },
    async resetUserPassword(username, newPassword) {
        return API.fetch(`/api/users/${encodeURIComponent(username)}/reset-password`, {
            method: 'POST',
            body: JSON.stringify({ newPassword })
        });
    },

    // CATEGORIES
    async getCategories() { return API.fetch('/api/categories'); },
    async addCategory(name) {
        return API.fetch('/api/categories', { method: 'POST', body: JSON.stringify({ name }) });
    },
    async deleteCategory(name) {
        return API.fetch(`/api/categories/${encodeURIComponent(name)}`, { method: 'DELETE' });
    },
    async renameCategory(oldName, newName) {
        return API.fetch(`/api/categories/${encodeURIComponent(oldName)}`, {
            method: 'PUT',
            body: JSON.stringify({ newName })
        });
    },

    // LINKS
    async getLinks() { return API.fetch('/api/links'); },
    async saveLinks(linksData, forceSaveCheckbox) {
        return API.fetch('/api/links/batch', {
            method: 'POST',
            body: JSON.stringify({ linksData, forceSaveCheckbox })
        });
    },
    async updateLink(id, url, date, categories) {
        return API.fetch(`/api/links/${id}`, {
            method: 'PUT',
            body: JSON.stringify({ url, date, categories })
        });
    },
    async deleteLink(id) {
        return API.fetch(`/api/links/${id}`, { method: 'DELETE' });
    },

    // ACCOUNTS
    async getAccounts() { return API.fetch('/api/accounts'); },
    async addAccount(name) {
        return API.fetch('/api/accounts', { method: 'POST', body: JSON.stringify({ name }) });
    },
    async deleteAccount(id) {
        return API.fetch(`/api/accounts/${id}`, { method: 'DELETE' });
    },
    async renameAccount(id, name) {
        return API.fetch(`/api/accounts/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    },

    // MERCHANTS
    async getMerchants() { return API.fetch('/api/merchants'); },
    async addMerchant(name) {
        return API.fetch('/api/merchants', { method: 'POST', body: JSON.stringify({ name }) });
    },
    async deleteMerchant(id) {
        return API.fetch(`/api/merchants/${id}`, { method: 'DELETE' });
    },
    async renameMerchant(id, name) {
        return API.fetch(`/api/merchants/${id}`, { method: 'PUT', body: JSON.stringify({ name }) });
    },
    // SCHEDULE
    async getSchedule(user = '') { 
        const url = user ? `/api/schedule?user=${user}` : '/api/schedule';
        return API.fetch(url); 
    },
    async addScheduleTask(title, description, date, userId = '') {
        return API.fetch('/api/schedule', { method: 'POST', body: JSON.stringify({ title, description, date, userId }) });
    },
    async updateScheduleTask(id, data) {
        return API.fetch(`/api/schedule/${id}`, { method: 'PUT', body: JSON.stringify(data) });
    },
    async deleteScheduleTask(id) {
        return API.fetch(`/api/schedule/${id}`, { method: 'DELETE' });
    },
    // USERS

    // SAMPLES
    async getSamples() { return API.fetch('/api/samples'); },
    async addSample(designId) {
        return API.fetch('/api/samples', { method: 'POST', body: JSON.stringify({ designId }) });
    },
    async updateSample(id, productLink) {
        return API.fetch(`/api/samples/${id}`, { method: 'PUT', body: JSON.stringify({ productLink }) });
    },
    async deleteSample(id) {
        return API.fetch(`/api/samples/${id}`, { method: 'DELETE' });
    },
    async requestLink(id) {
        return API.fetch(`/api/samples/${id}/request`, { method: 'POST' });
    },
    async cleanupExpiredSamples() {
        return API.fetch('/api/samples/cleanup-expired', { method: 'POST' });
    },

    // FINANCE
    async getFinance() { return API.fetch('/api/finance'); },
    async addFinance(data) { return API.fetch('/api/finance', { method: 'POST', body: JSON.stringify(data) }); },
    async updateFinance(id, data) { return API.fetch(`/api/finance/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async deleteFinance(id) { return API.fetch(`/api/finance/${id}`, { method: 'DELETE' }); },
};

// ====== APP STATE ======
let currentPage = 1;
let currentMonthFilter = null;
let cachedLinks = [];       // Cache dữ liệu từ server
let cachedCategories = [];  // Cache danh mục từ server
let cachedAccounts = [];    // Cache account từ server
let cachedMerchants = [];   // Cache merchant từ server
let cachedSchedule = [];    // Cache lịch làm việc
let cachedUsers = [];       // Cache danh sách người dùng (cho admin)
let cachedSamples = [];     // Cache yêu cầu mẫu
let cachedFinance = [];     // Cache thu chi
let calendarDate = new Date(); // Tháng/Năm đang xem trên lịch
let selectedDate = new Date().toISOString().split('T')[0]; // Ngày đang chọn (YYYY-MM-DD)
let selectedScheduleUser = 'all'; // User đang lọc trên lịch

function getCurrentUser() {
    const raw = localStorage.getItem('lm_current_user');
    return raw ? JSON.parse(raw) : null;
}

function setCurrentUser(user) {
    localStorage.setItem('lm_current_user', JSON.stringify(user));
}

function logout() {
    localStorage.removeItem('lm_token');
    localStorage.removeItem('lm_current_user');
    resetAppState();
    showLogin();
}

function resetAppState() {
    currentPage = 1;
    currentMonthFilter = null;
    cachedLinks = [];
    cachedCategories = [];
    cachedAccounts = [];
    cachedMerchants = [];
    cachedSchedule = [];
    cachedUsers = [];
    cachedSamples = [];
    cachedFinance = [];
    selectedScheduleUser = 'all';
}

// ====== DOM ELEMENTS ======
const DOM = {
    loginScreen: document.getElementById('login-screen'),
    dashboardScreen: document.getElementById('dashboard-screen'),
    loginForm: document.getElementById('login-form'),
    usernameInput: document.getElementById('username'),
    passwordInput: document.getElementById('password'),

    displayUsername: document.getElementById('display-username'),
    btnLogout: document.getElementById('btn-logout'),
    btnChangePassword: document.getElementById('btn-change-password'),
    adminMenu: document.getElementById('admin-menu'),
    navUsers: document.getElementById('nav-users'),
    usersTab: document.getElementById('users-tab'),
    usersFormTitle: document.getElementById('users-form-title'),
    btnSaveUser: document.getElementById('btn-save-user'),
    btnCancelUserEdit: document.getElementById('btn-cancel-user-edit'),
    editUserOriginalName: document.getElementById('edit-user-original-name'),
    btnCleanupSamples: document.getElementById('btn-cleanup-samples'),

    btnMobileMenu: document.getElementById('btn-mobile-menu'),
    sidebarOverlay: document.getElementById('sidebar-overlay'),
    sidebar: document.querySelector('.sidebar'),
    btnSidebarEdge: document.getElementById('btn-toggle-sidebar-edge'),

    // Management Tab Bodies
    linksTableBody: document.getElementById('links-table-body'),
    accountsTableBody: document.getElementById('accounts-table-body'),
    merchantsTableBody: document.getElementById('merchants-table-body'),
    categoriesTableBody: document.getElementById('categories-table-body'),

    totalLinks: document.getElementById('total-links'),
    filterCategory: document.getElementById('filter-category'),
    searchInput: document.getElementById('search-input'),
    monthStatsContainer: document.getElementById('month-stats-container'),
    btnClearMonthFilter: document.getElementById('btn-clear-month-filter'),
    itemsPerPage: document.getElementById('items-per-page'),
    paginationControls: document.getElementById('pagination-controls'),
    btnPrevPage: document.getElementById('btn-prev-page'),
    btnNextPage: document.getElementById('btn-next-page'),
    pageInfo: document.getElementById('page-info'),

    btnExportExcel: document.getElementById('btn-export-excel'),
    addLinkForm: document.getElementById('add-link-form'),
    linkUrlsInput: document.getElementById('link-urls'),
    linkDateInput: document.getElementById('link-date'),
    linkCategories: document.getElementById('link-categories'),
    duplicateWarnings: document.getElementById('duplicate-warnings'),
    forceSaveLabel: document.getElementById('force-save-label'),
    forceSaveCheckbox: document.getElementById('force-save'),

    modalOverlay: document.getElementById('modal-overlay'),
    closeModalBtns: document.querySelectorAll('.btn-close-modal'),
    modalPassword: document.getElementById('modal-password'),
    modalEditLink: document.getElementById('modal-edit-link'),
    modalEditSingleCat: document.getElementById('modal-edit-single-cat'),

    // Schedule Elements
    calendarMonthYear: document.getElementById('calendar-month-year'),
    calendarGrid: document.getElementById('calendar-grid'),
    btnPrevMonth: document.getElementById('btn-prev-month'),
    btnNextMonth: document.getElementById('btn-next-month'),
    adminCalendarFilters: document.getElementById('admin-calendar-filters'),
    scheduleUserFilter: document.getElementById('schedule-user-filter'),
    btnRefreshSchedule: document.getElementById('btn-refresh-schedule'),
    currentSelectedDate: document.getElementById('current-selected-date'),
    btnAddToday: document.getElementById('btn-add-task-today'),
    dayTaskList: document.getElementById('day-task-list'),
    
    modalTask: document.getElementById('modal-task'),
    taskIdInput: document.getElementById('task-id'),
    taskDateInput: document.getElementById('task-date'),
    assigneeGroup: document.getElementById('assignee-group'),
    taskAssigneeInput: document.getElementById('task-assignee-input'),
    taskTitleInput: document.getElementById('task-title-input'),
    taskDescInput: document.getElementById('task-desc-input'),
    taskFileInput: document.getElementById('task-file-input'),
    btnUploadFiles: document.getElementById('btn-upload-files'),
    taskFilesList: document.getElementById('task-files-list'),
    btnSaveTask: document.getElementById('btn-save-task'),

    modalTaskDetail: document.getElementById('modal-task-detail'),
    detailTaskTitle: document.getElementById('detail-task-title'),
    detailTaskStatus: document.getElementById('detail-task-status'),
    detailTaskAssignee: document.getElementById('detail-task-assignee'),
    detailTaskCreator: document.getElementById('detail-task-creator'),
    detailTaskDate: document.getElementById('detail-task-date'),
    detailTaskDesc: document.getElementById('detail-task-desc'),
    detailTaskFiles: document.getElementById('detail-task-files'),
    adminDetailActions: document.getElementById('admin-detail-actions'),
    btnToggleStatusFromDetail: document.getElementById('btn-toggle-status-from-detail'),
    btnEditTaskFromDetail: document.getElementById('btn-edit-task-from-detail'),
    btnDeleteTaskFromDetail: document.getElementById('btn-delete-task-from-detail'),

    // Samples Elements
    samplesTableBody: document.getElementById('samples-table-body'),
    addSampleForm: document.getElementById('add-sample-form'),
    sampleDesignIdInput: document.getElementById('sample-design-id'),
    sampleSearchInput: document.getElementById('sample-search-input'),
    sampleAdminColHead: document.getElementById('sample-admin-col-head'),

    // Sample Link Modal
    modalEditSampleLink: document.getElementById('modal-edit-sample-link'),
    modalSampleLinkHeader: document.getElementById('modal-sample-link-header'),
    editSampleId: document.getElementById('edit-sample-id'),
    editSampleLinkUrl: document.getElementById('edit-sample-link-url'),

    // Reset Password Modal
    modalResetPassword: document.getElementById('modal-reset-password'),
    resetPassUsername: document.getElementById('reset-pass-username'),
    resetPassNew: document.getElementById('reset-pass-new'),
    resetPassDesc: document.getElementById('modal-reset-pass-desc'),
    btnConfirmResetPass: document.getElementById('btn-confirm-reset-pass'),

    // Confirm Delete Modal
    modalConfirmDelete: document.getElementById('modal-confirm-delete'),
    confirmDeleteId: document.getElementById('confirm-delete-id'),
    confirmDeleteMsg: document.getElementById('modal-confirm-delete-msg'),
    btnConfirmDelete: document.getElementById('btn-confirm-delete'),
    btnSaveSampleLink: document.getElementById('btn-save-sample-link'),
};

// ====== UTILS ======
function copyToClipboard(text, element) {
    if (!text) return;
    navigator.clipboard.writeText(text).then(() => {
        if (!element) {
            showSuccess?.('Đã sao chép!');
            return;
        }
        const originalHTML = element.innerHTML;
        const originalTitle = element.title;
        element.style.color = '#34d399';
        element.innerHTML = '✓ Copied';
        setTimeout(() => {
            element.style.color = '';
            element.innerHTML = originalHTML;
            element.title = originalTitle;
        }, 1500);
    }).catch(err => {
        console.error('Copy failed:', err);
    });
}

function debounce(func, wait) {
    let timeout;
    return function(...args) { clearTimeout(timeout); timeout = setTimeout(() => func.apply(this, args), wait); };
}

function normalizeUrl(urlStr) {
    try {
        const url = new URL(urlStr.trim());
        // Normalizing: lowercase hostname
        url.hostname = url.hostname.toLowerCase();
        
        // Normalizing: remove trailing slash from pathname
        let pathname = url.pathname;
        if (pathname.endsWith('/') && pathname.length > 1) {
            pathname = pathname.slice(0, -1);
        }
        
        // List of tracking/navigation parameters to discard
        const discardParams = ['utm_source', 'utm_medium', 'utm_campaign', 'utm_term', 'utm_content', 'ref', 'index', 'query_id'];
        
        const params = new URLSearchParams(url.search);
        discardParams.forEach(p => params.delete(p));
        
        // Reconstruct
        const search = params.toString();
        // and remove trailing slash from the final URL if it exists
        return `${url.protocol}//${url.hostname}${pathname}${search ? '?' + search : ''}${url.hash}`.replace(/\/$/, ""); 
    } catch (e) {
        return urlStr.trim();
    }
}

function showToast(msg, type = 'error') {
    let container = document.getElementById('toast-container');
    if (!container) {
        container = document.createElement('div');
        container.id = 'toast-container';
        container.style.cssText = 'position:fixed;top:20px;right:20px;z-index:99999;display:flex;flex-direction:column;gap:10px;';
        document.body.appendChild(container);
    }
    const toast = document.createElement('div');
    const bg = type === 'success' ? '#16a34a' : type === 'info' ? '#2563eb' : '#dc2626';
    toast.style.cssText = `background:${bg};color:#fff;padding:12px 18px;border-radius:10px;font-size:0.92em;max-width:320px;box-shadow:0 4px 16px rgba(0,0,0,0.25);opacity:0;transform:translateX(40px);transition:all 0.25s ease;`;
    toast.textContent = msg;
    container.appendChild(toast);
    requestAnimationFrame(() => { toast.style.opacity = '1'; toast.style.transform = 'translateX(0)'; });
    setTimeout(() => {
        toast.style.opacity = '0'; toast.style.transform = 'translateX(40px)';
        setTimeout(() => toast.remove(), 300);
    }, 3500);
}

function showError(msg) {
    showToast(msg, 'error');
}

function showSuccess(msg) {
    showToast(msg, 'success');
}

function getUserColor(username) {
    if (!username) return '#ffffff';
    let hash = 0;
    for (let i = 0; i < username.length; i++) {
        hash = username.charCodeAt(i) + ((hash << 5) - hash);
    }
    const c = (hash & 0x00FFFFFF).toString(16).toUpperCase();
    return '#' + '00000'.substring(0, 6 - c.length) + c;
}

// ====== INITIALIZATION (REMOVED OLD VERSION) ======

function showLogin() {
    DOM.loginScreen.classList.remove('hidden');
    DOM.loginScreen.classList.add('active');
    DOM.dashboardScreen.classList.add('hidden');
    DOM.dashboardScreen.classList.remove('active');
}

function showDashboard(user) {
    DOM.loginScreen.classList.add('hidden');
    DOM.loginScreen.classList.remove('active');
    DOM.dashboardScreen.classList.remove('hidden');
    DOM.dashboardScreen.classList.add('active');

    const tagColor = user.role === 'admin' ? '#f59e0b' : '#3b82f6';
    DOM.displayUsername.innerHTML = `👋 <b>${user.username}</b> <span style="font-size:0.7em; background:${tagColor}; padding:2px 6px; border-radius:10px; color:white; margin-left:5px;">${user.role.toUpperCase()}</span>`;

    if (user.role === 'admin') {
        DOM.adminMenu.classList.remove('hidden');
        document.getElementById('nav-settings')?.classList.remove('hidden');
        document.getElementById('nav-users')?.classList.remove('hidden');
        document.getElementById('nav-sales')?.classList.remove('hidden');
        document.getElementById('nav-finance')?.classList.remove('hidden');

        DOM.adminCalendarFilters?.classList.remove('hidden');
        DOM.assigneeGroup?.classList.remove('hidden');
    } else {
        DOM.adminMenu.classList.add('hidden');
        document.getElementById('nav-settings')?.classList.add('hidden');
        document.getElementById('nav-users')?.classList.add('hidden');
        document.getElementById('nav-sales')?.classList.add('hidden');
        document.getElementById('nav-finance')?.classList.add('hidden');

        DOM.adminCalendarFilters?.classList.add('hidden');
        DOM.assigneeGroup?.classList.add('hidden');

        const activeTab = document.querySelector('.nav-tab.active')?.dataset?.tab;
        if (['settings-tab', 'sales-tab', 'finance-tab', 'users-tab'].includes(activeTab)) {
            document.querySelector('[data-tab="links-tab"]')?.click();
        }
    }
}

// ====== APPLICATION DATA LOADING ======
async function loadAppData() {
    try {
        const user = getCurrentUser();
        const promises = [
            API.getLinks(),
            API.getCategories(),
            API.getAccounts(),
            API.getMerchants(),
            API.getSchedule(),
            API.getSamples()
        ];

        if (user && user.role === 'admin') {
            promises.push(API.getFinance());
            promises.push(API.getUsers());
        }

        const results = await Promise.all(promises);

        cachedLinks = results[0] || [];
        cachedCategories = results[1] || [];
        cachedAccounts = results[2] || [];
        cachedMerchants = results[3] || [];
        cachedSchedule = results[4] || [];
        cachedSamples = results[5] || [];

        if (user && user.role === 'admin') {
            cachedFinance = results[6] || [];
            cachedUsers = results[7];
            populateAdminControls();
        }
        
        renderAppContent();
        renderAccountsTable();
        renderMerchantsTable();
        renderCategoriesFullTable();
        updateSalesDropdowns();
    } catch (err) {
        console.error("Failed to load app data:", err);
        showError('Không thể tải dữ liệu: ' + err.message);
    }
}

function populateAdminControls() {
    if (!DOM.scheduleUserFilter || !DOM.taskAssigneeInput) return;
    
    const userOptions = cachedUsers.map(u => `<option value="${u.username}">${u.username} (${u.role})</option>`).join('');
    
    DOM.scheduleUserFilter.innerHTML = `<option value="all">Tất cả nhân viên</option>` + userOptions;
    DOM.taskAssigneeInput.innerHTML = userOptions;
}

function renderAppContent() {
    renderCategories();
    renderCategoryCheckboxes('#link-categories');
    renderFilterCategories();
    renderStats();
    renderLinks();
    renderSamplesTable();
    updateSalesDropdowns();
}

// ====== MODALS UTILS ======
function openModal(element) {
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    DOM.modalOverlay.classList.remove('hidden');
    element.classList.remove('hidden');
}

async function closeAllModals() {
    DOM.modalOverlay.classList.add('hidden');
    document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
    await loadAppData();
}

// ====== SETUP EVENT LISTENERS ======
function setupEventListeners() {
    // ---- AUTH ----
    DOM.loginForm.addEventListener('submit', async (e) => {
        e.preventDefault();
        const u = DOM.usernameInput.value.trim();
        const p = DOM.passwordInput.value;
<<<<<<< HEAD
        const loginError = document.getElementById('login-error');
        if (loginError) loginError.classList.add('hidden');
=======
        
        if (!u || !p) {
            showError('Vui lòng nhập tên đăng nhập và mật khẩu!');
            return;
        }
        
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5
        try {
            const data = await API.login(u, p);
            localStorage.setItem('lm_token', data.token);
            setCurrentUser(data.user);
            showDashboard(data.user);
            DOM.usernameInput.value = '';
            DOM.passwordInput.value = '';
            await Promise.all([loadAppData(), loadSalesData()]);
        } catch (err) {
<<<<<<< HEAD
            if (loginError) {
                loginError.textContent = err.message || 'Tên đăng nhập hoặc mật khẩu không đúng!';
                loginError.classList.remove('hidden');
            } else {
                showError(err.message);
            }
=======
            showError('❌ Tên đăng nhập hoặc mật khẩu không đúng!');
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5
        }
    });

    DOM.btnLogout.addEventListener('click', () => logout());

    // ---- MOBILE MENU LOGIC ----
    if (DOM.btnMobileMenu) DOM.btnMobileMenu.addEventListener('click', () => {
        DOM.sidebar.classList.add('open');
        DOM.sidebarOverlay.classList.add('active');
        if (DOM.btnSidebarEdge) DOM.btnSidebarEdge.textContent = '◀';
    });
    if (DOM.sidebarOverlay) DOM.sidebarOverlay.addEventListener('click', () => {
        DOM.sidebar.classList.remove('open');
        DOM.sidebarOverlay.classList.remove('active');
        if (DOM.btnSidebarEdge) DOM.btnSidebarEdge.textContent = '▶';
    });

    if (DOM.btnSidebarEdge) {
        DOM.btnSidebarEdge.addEventListener('click', () => {
            DOM.sidebar.classList.toggle('open');
            DOM.sidebarOverlay.classList.toggle('active', DOM.sidebar.classList.contains('open'));
            DOM.btnSidebarEdge.textContent = DOM.sidebar.classList.contains('open') ? '◀' : '▶';
        });
    }

    // ---- CLICK OUTSIDE TO CLOSE MODALS ----
    DOM.modalOverlay.addEventListener('click', (e) => {
        if (e.target === DOM.modalOverlay) {
            closeAllModals();
        }
    });

    // ---- MODALS CLOSER ----
    DOM.closeModalBtns.forEach(btn => btn.addEventListener('click', closeAllModals));

    // ---- CHANGE PASSWORD ----
    DOM.btnChangePassword.addEventListener('click', () => {
        document.getElementById('change-pass-form').reset();
        openModal(DOM.modalPassword);
    });
    document.getElementById('change-pass-form').addEventListener('submit', async (e) => {
        e.preventDefault();
        const oldP = document.getElementById('old-pass').value;
        const newP = document.getElementById('new-pass').value;
        try {
            await API.changePassword(oldP, newP);
            alert('✅ Đổi mật khẩu thành công!');
            closeAllModals();
        } catch (err) {
            showError(err.message);
        }
    });

    
    // ---- CLEANUP EXPIRED SAMPLES (ADMIN) ----
    DOM.btnCleanupSamples?.addEventListener('click', async () => {
        try {
            const result = await API.cleanupExpiredSamples();
            showSuccess(result.message);
            cachedSamples = (await API.getSamples()) || [];
            renderSamplesTable();
        } catch (err) {
            showError(err.message);
        }
    });
    
    // ---- RESET PASSWORD MODAL ----
    DOM.btnConfirmResetPass?.addEventListener('click', async () => {
        const username = DOM.resetPassUsername.value;
        const newP = DOM.resetPassNew.value.trim();
        if (!newP) { showError('Vui lòng nhập mật khẩu mới!'); return; }
        try {
            await API.resetUserPassword(username, newP);
            closeAllModals();
            DOM.resetPassNew.value = '';
            showSuccess(`Đã reset mật khẩu cho ${username} thành công!`);
        } catch (err) { showError(err.message); }
    });

    DOM.resetPassNew?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') DOM.btnConfirmResetPass?.click();
    });

    // ---- CONFIRM DELETE MODAL ----
    DOM.btnConfirmDelete?.addEventListener('click', async () => {
        const id = DOM.confirmDeleteId.value;
        if (!id) return;
        try {
            await API.deleteSample(id);
            cachedSamples = (await API.getSamples()) || [];
            closeAllModals();
            renderSamplesTable();
        } catch (err) { showError(err.message); }
    });

    document.getElementById('add-user-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const originalName = document.getElementById('edit-user-original-name').value;
        const u = document.getElementById('new-user-name').value.trim();
        const p = document.getElementById('new-user-pass').value;
        const r = document.getElementById('new-user-role').value;

        if (!u) { showError('Vui lòng nhập tên tài khoản!'); return; }

        try {
            if (originalName) {
                // UPDATE MODE
                // 1. Rename if name changed
                if (u !== originalName) {
                    // Note: This project doesn't have a direct 'updateUser' API for everything, 
                    // but we can update password and role. Renaming username might be tricky if not supported.
                    // Based on API object, we have resetPassword. Let's see if we need more.
                    // If username changes, we'll need a rename API. 
                    // For now, let's just handle password and role on originalName.
                    showError('Tính năng đổi tên tài khoản chưa được hỗ trợ. Hãy đổi mật khẩu/vai trò.');
                    // return; 
                }
                
                // Update password if provided
                if (p) {
                    await API.resetUserPassword(originalName, p);
                }
                
                // Note: The API doesn't seem to have a 'updateRole' endpoint, but let's assume it might or we can add it.
                // If it's not here, we'll just show success for password.
                showSuccess(`Đã cập nhật mật khẩu cho ${originalName}`);
            } else {
                // ADD MODE
                if (!p) { showError('Vui lòng nhập mật khẩu!'); return; }
                await API.addUser(u, p, r);
                showSuccess(`Đã thêm user ${u}`);
            }

            window.cancelUserEdit();
            cachedUsers = await API.getUsers();
            populateAdminControls();
            await renderUsersTable();
        } catch (err) {
            showError(err.message);
        }
    });

    // ---- ADD LINKS ----
    DOM.linkUrlsInput?.addEventListener('input', debounce(checkDuplicates, 600));
    DOM.addLinkForm?.addEventListener('submit', handleSaveLinks);

    // ---- FILTERS & PAGINATION ----
    DOM.filterCategory?.addEventListener('change', () => { currentPage = 1; renderStats(); renderLinks(); });
    DOM.searchInput?.addEventListener('input', () => { currentPage = 1; renderStats(); renderLinks(); });
    DOM.itemsPerPage?.addEventListener('change', () => { currentPage = 1; renderLinks(); });

    DOM.btnClearMonthFilter?.addEventListener('click', () => {
        currentMonthFilter = null; currentPage = 1;
        renderStats(); renderLinks();
    });

    DOM.btnPrevPage?.addEventListener('click', () => { if (currentPage > 1) { currentPage--; renderLinks(); } });
    DOM.btnNextPage?.addEventListener('click', () => { currentPage++; renderLinks(); });

    // ---- EDIT LINK ----
    document.getElementById('btn-save-edit-link')?.addEventListener('click', saveEditedLink);

    // ---- SAVE SAMPLE LINK ----
    DOM.btnSaveSampleLink?.addEventListener('click', async () => {
        const id = DOM.editSampleId.value;
        const newLink = DOM.editSampleLinkUrl.value.trim();
        if (!id) return;
        try {
            await API.updateSample(id, newLink);
            cachedSamples = await API.getSamples();
            DOM.modalOverlay.classList.add('hidden');
            document.querySelectorAll('.modal').forEach(m => m.classList.add('hidden'));
            renderSamplesTable();
        } catch (err) { showError(err.message); }
    });

    DOM.editSampleLinkUrl?.addEventListener('keydown', (e) => {
        if (e.key === 'Enter') DOM.btnSaveSampleLink?.click();
    });

    // ---- EXPORT ----
    DOM.btnExportExcel?.addEventListener('click', exportToCSV);

    // ---- MOBILE MENU ----
    DOM.btnMobileMenu?.addEventListener('click', () => {
        DOM.sidebar.classList.add('open');
        DOM.sidebarOverlay.classList.add('active');
    });
    DOM.sidebarOverlay?.addEventListener('click', () => {
        DOM.sidebar.classList.remove('open');
        DOM.sidebarOverlay.classList.remove('active');
    });

    // ---- SCHEDULE ----
    DOM.btnPrevMonth?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() - 1);
        renderSchedule();
    });
    DOM.btnNextMonth?.addEventListener('click', () => {
        calendarDate.setMonth(calendarDate.getMonth() + 1);
        renderSchedule();
    });
    DOM.scheduleUserFilter?.addEventListener('change', async (e) => {
        selectedScheduleUser = e.target.value;
        await loadScheduleData();
        renderSchedule();
    });

    // --- EVENT DELEGATION: TOÀN BỘ SỰ KIỆN CLICK ---
    document.addEventListener('click', async (e) => {
        const target = e.target;
        
        // 1. XỬ LÝ CHUYỂN TAB (nav-tab)
        const tabBtn = target.closest('.nav-tab');
        if (tabBtn) {
            const targetId = tabBtn.dataset.tab;
            if (!targetId) return;
            
            // UI: Highlight tab
            document.querySelectorAll('.nav-tab').forEach(t => t.classList.remove('active'));
            tabBtn.classList.add('active');
            
            // UI: Show content
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            const targetContent = document.getElementById(targetId);
            if (targetContent) targetContent.classList.add('active');
            
            // Mobile: Close sidebar
            if (window.innerWidth <= 768) {
                DOM.sidebar?.classList.remove('open');
                DOM.sidebarOverlay?.classList.remove('active');
            }
            
            // Action: Update Topbar and Render
            updateTopbar(targetId);
            return;
        }

        // 1b. XỬ LÝ CHUYỂN SUB-TAB (settings-subtab)
        const subTabBtn = target.closest('.settings-subtab');
        if (subTabBtn) {
            const panelId = subTabBtn.dataset.subtab;
            if (!panelId) return;
            document.querySelectorAll('.settings-subtab').forEach(b => b.classList.remove('active'));
            subTabBtn.classList.add('active');
            document.querySelectorAll('.settings-panel').forEach(p => p.classList.remove('active-panel'));
            const panel = document.getElementById(panelId);
            if (panel) panel.classList.add('active-panel');
            return;
        }

        const btn = target.closest('button');
        if (!btn) return;
        const id = btn.getAttribute('data-id');

        // 2. TAB: SALES (Sửa/Xóa)
        if (btn.classList.contains('btn-edit-sales')) {
            if (id) window.openEditSales(id);
            return;
        } else if (btn.classList.contains('btn-delete-sales')) {
            if (id) window.handleDeleteSales(id);
            return;
        }

        // 3. TAB: LINKS (Sửa/Xóa)
        if (btn.classList.contains('btn-edit-link')) {
            if (id) window.openEditLink(id);
        } else if (btn.classList.contains('btn-delete-link')) {
            if (id) window.handleDeleteLink(id);
        }

<<<<<<< HEAD
        // 4. TAB: SAMPLES (Add/Sửa/Xóa)
=======
        // 3. TAB: SAMPLES (Add/Sửa/Xóa/Request)
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5
        else if (btn.classList.contains('btn-add-link') || btn.classList.contains('btn-edit-sample')) {
            const link = btn.getAttribute('data-link') || 'N/A';
            if (id) window.handleEditSampleLink(id, link);
        } else if (btn.classList.contains('btn-request-link')) {
            // User clicked Request button for expired/process samples
            if (id) window.handleRequestLink(id);
        } else if (btn.classList.contains('btn-delete-sample')) {
            if (id) window.handleDeleteSample(id);
        }

        // 5. TAB: USERS (Admin only)
        else if (btn.classList.contains('btn-edit-user')) {
            const username = btn.getAttribute('data-username');
            if (username) window.handleEditUser(username);
        } else if (btn.classList.contains('btn-delete-user')) {
            const username = btn.getAttribute('data-username');
            if (username) window.handleDeleteUser(username);
        }

        const taskBtn = target.closest('.btn-icon');
        if (taskBtn && (taskBtn.closest('.day-tasks') || taskBtn.closest('.task-actions'))) {
            const taskId = taskBtn.dataset.id;
            const action = taskBtn.dataset.action;
            if (action === 'edit') window.openEditTask(taskId);
            if (action === 'delete') window.handleDeleteTask(taskId);
        }
    });

    document.addEventListener('submit', async (e) => {
        const form = e.target;
        if (form.id === 'add-link-form') {
            handleSaveLinks(e);
        } else if (form.id === 'add-sample-form') {
            handleAddSample(e);
        }
    });

    // --- CÁC SỰ KIỆN KHÁC (INPUT, MODALS) ---
    DOM.searchInput?.addEventListener('input', debounce(renderLinks, 300));
    DOM.sampleSearchInput?.addEventListener('input', debounce(renderSamplesTable, 300));
    
    DOM.btnAddToday?.addEventListener('click', () => openAddTaskModal());
    DOM.btnSaveTask?.addEventListener('click', handleSaveTask);
    
    DOM.btnSidebarEdge?.addEventListener('click', () => {
        DOM.sidebar.classList.toggle('collapsed');
    });

    DOM.btnCancelUserEdit?.addEventListener('click', () => window.cancelUserEdit());
}

// ====== LOGIC: USERS ======
async function renderUsersTable() {
    let users = [];
    try { users = await API.getUsers(); } catch (err) { showError(err.message); return; }

    const tbody = document.getElementById('users-table-body');
    tbody.innerHTML = '';
    users.forEach(u => {
        const tr = document.createElement('tr');
        const roleStr = u.role === 'admin' ? '<span style="color:#f59e0b">Admin</span>' : 'User';
        tr.innerHTML = `
            <td>${u.username}</td><td>${roleStr}</td>
            <td style="text-align:center;">
                <button class="btn-small btn-edit btn-edit-user" data-username="${u.username}">Sửa</button>
                <button class="btn-small btn-danger btn-delete-user" data-username="${u.username}">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.handleEditUser = function(username) {
    const user = cachedUsers.find(u => u.username === username);
    if (!user) return;

    document.getElementById('edit-user-original-name').value = user.username;
    document.getElementById('new-user-name').value = user.username;
    document.getElementById('new-user-name').disabled = true; // Protect original username
    document.getElementById('new-user-pass').value = ''; 
    document.getElementById('new-user-pass').placeholder = '(Để trống nếu không đổi mật khẩu)';
    document.getElementById('new-user-role').value = user.role;

    DOM.usersFormTitle.textContent = `📝 Sửa Người Dùng: ${username}`;
    DOM.btnSaveUser.textContent = 'Cập Nhật';
    DOM.btnCancelUserEdit.classList.remove('hidden');
    
    // Scroll to form
    document.getElementById('add-user-form').scrollIntoView({ behavior: 'smooth', block: 'start' });
};

window.cancelUserEdit = function() {
    document.getElementById('edit-user-original-name').value = '';
    document.getElementById('new-user-name').value = '';
    document.getElementById('new-user-name').disabled = false;
    document.getElementById('new-user-pass').value = '';
    document.getElementById('new-user-pass').placeholder = 'Mật khẩu mới';
    document.getElementById('new-user-role').value = 'user';

    DOM.usersFormTitle.textContent = '➕ Thêm Người Dùng Mới';
    DOM.btnSaveUser.textContent = 'Lưu User';
    DOM.btnCancelUserEdit.classList.add('hidden');
};

window.handleDeleteUser = async function(username) {
    const currentUser = getCurrentUser();
    if (username === currentUser.username) { showError('Không thể xóa bản thân!'); return; }
    if (!confirm(`Xóa user: ${username}?`)) return;
    try {
        await API.deleteUser(username);
        cachedUsers = await API.getUsers();
        populateAdminControls();
        await renderUsersTable();
    } catch (err) { showError(err.message); }
};

window.handleResetUserPassword = function(username) {
    // Deprecated for the new Edit flow in tab
};

// ====== LOGIC: CATEGORIES ======
async function addCategory() {
    const val = DOM.newCategoryInput.value.trim();
    if (!val) return;
    try {
        await API.addCategory(val);
        DOM.newCategoryInput.value = '';
        cachedCategories = await API.getCategories();
        renderAppContent();
    } catch (err) { showError(err.message); }
}

function renderCategories() {
    if (!DOM.categoryList) return;
    DOM.categoryList.innerHTML = '';
    cachedCategories.forEach(c => {
        const li = document.createElement('li');
        const count = cachedLinks.filter(l => l.categories.includes(c)).length;
        li.innerHTML = `<span>${c}</span> <span class="cat-count">${count}</span>`;
        li.onclick = () => { DOM.filterCategory.value = c; currentPage = 1; renderStats(); renderLinks(); };
        DOM.categoryList.appendChild(li);
    });
}

let sortableCategories = null;
function renderCategoryCheckboxes(containerSelector) {
    const container = document.querySelector(containerSelector);
    container.innerHTML = '';
    cachedCategories.forEach(c => {
        const label = document.createElement('label');
        label.className = 'checkbox-item';
        label.innerHTML = `<input type="checkbox" class="cat-checkbox" value="${c}"> ${c}`;
        container.appendChild(label);
    });

    if (containerSelector === '#link-categories' && typeof Sortable !== 'undefined') {
        if (sortableCategories) sortableCategories.destroy();
        sortableCategories = Sortable.create(container, {
            animation: 150,
            ghostClass: 'sortable-ghost',
            onEnd: function () {
                const newLabels = document.querySelectorAll('#link-categories .cat-checkbox');
                cachedCategories = Array.from(newLabels).map(input => input.value);
                renderCategories();
                renderFilterCategories();
            }
        });
    }
}

function renderFilterCategories() {
    const currentVal = DOM.filterCategory.value;
    DOM.filterCategory.innerHTML = '<option value="ALL">Lọc: Tất cả danh mục</option>';
    cachedCategories.forEach(c => {
        const opt = document.createElement('option');
        opt.value = c; opt.textContent = c;
        DOM.filterCategory.appendChild(opt);
    });
    if (cachedCategories.includes(currentVal)) DOM.filterCategory.value = currentVal;
}

async function renderManageCategoriesTable() {
    const tbody = document.getElementById('manage-cats-table');
    tbody.innerHTML = '';
    cachedCategories.forEach(c => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td>${c}</td>
            <td>
                <button class="btn-small btn-edit" onclick="openEditCategoryModal('${c.replace(/'/g, "\\'")}')">Sửa</button>
                <button class="btn-small btn-danger" onclick="handleDeleteCategory('${c.replace(/'/g, "\\'")}')">Xoá</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

window.handleDeleteCategory = async function(name) {
    if (!confirm(`Xoá danh mục "${name}"?`)) return;
    try {
        await API.deleteCategory(name);
        cachedCategories = await API.getCategories();
        cachedLinks = await API.getLinks();
        renderAppContent();
        await renderManageCategoriesTable();
    } catch (err) { showError(err.message); }
};

window.openEditCategoryModal = function(oldName) {
    document.getElementById('edit-cat-old').value = oldName;
    document.getElementById('edit-cat-new').value = oldName;
    openModal(DOM.modalEditSingleCat);
};

async function saveEditedCategory() {
    const oldName = document.getElementById('edit-cat-old').value;
    const newName = document.getElementById('edit-cat-new').value.trim();
    if (!newName || newName === oldName) return;
    try {
        await API.renameCategory(oldName, newName);
        cachedCategories = await API.getCategories();
        cachedLinks = await API.getLinks();
        await renderManageCategoriesTable();
        openModal(DOM.modalManageCats);
    } catch (err) { showError(err.message); }
}

// ====== LOGIC: ADD LINKS ======
function getParsedUrls() {
    return DOM.linkUrlsInput.value.split('\n').map(u => u.trim()).filter(u => u.length > 0);
}

let currentDuplicates = [];
function checkDuplicates() {
    const urls = getParsedUrls();
    currentDuplicates = [];
    urls.forEach(urlInput => {
        const normalizedInput = normalizeUrl(urlInput);
        const existingList = cachedLinks.filter(l => normalizeUrl(l.url) === normalizedInput);
        if (existingList.length > 0) existingList.forEach(ex => currentDuplicates.push(ex));
    });

    if (currentDuplicates.length > 0) {
        DOM.duplicateWarnings.classList.remove('hidden');
        DOM.forceSaveLabel.classList.remove('hidden');
        let html = `<h4>⚠️ Cảnh báo trùng lặp:</h4>`;
        currentDuplicates.forEach(dup => {
            html += `<div class="warning-item" style="display:flex; align-items:center; justify-content:space-between; margin-bottom:8px;">
                <span>👉 Link <strong style="color:white; word-break:break-all;">${dup.url}</strong> đã có ở <strong>[${dup.categories.join(', ')}]</strong> (Ngày <strong>${dup.date}</strong>).</span>
                <button type="button" class="btn-small btn-edit" style="flex-shrink:0; margin-left: 10px;" onclick="highlightUrlInTextarea('${dup.url.replace(/'/g, "\\'")}')">Chọn chữ này</button>
            </div>`;
        });
        DOM.duplicateWarnings.innerHTML = html;
    } else {
        DOM.duplicateWarnings.classList.add('hidden');
        DOM.forceSaveLabel.classList.add('hidden');
        DOM.forceSaveCheckbox.checked = false;
        DOM.duplicateWarnings.innerHTML = '';
    }
}

window.highlightUrlInTextarea = function(urlToFind) {
    const textarea = DOM.linkUrlsInput;
    const text = textarea.value;
    const startIndex = text.indexOf(urlToFind);
    if (startIndex !== -1) {
        textarea.focus();
        textarea.setSelectionRange(startIndex, startIndex + urlToFind.length);
    }
};

async function handleSaveLinks(e) {
    e.preventDefault();
    const urls = getParsedUrls();
    if (urls.length === 0) { showError('Chưa nhập link hợp lệ!'); return; }

    const selectedCats = Array.from(document.querySelectorAll('#add-link-form .cat-checkbox:checked')).map(cb => cb.value);
    if (selectedCats.length === 0) { showError('Chưa chọn danh mục!'); return; }

    if (currentDuplicates.length > 0 && !DOM.forceSaveCheckbox.checked) {
        showError('Có link trùng lặp! Hãy check box "Vẫn lưu đè..." nếu muốn tiếp tục.');
        return;
    }

    const inputDate = DOM.linkDateInput.value;
    const linksData = urls.map(url => ({ url, date: inputDate, categories: selectedCats }));
    const forceSaveCheckbox = DOM.forceSaveCheckbox.checked;

    try {
        const result = await API.saveLinks(linksData, forceSaveCheckbox);
        DOM.linkUrlsInput.value = '';
        DOM.forceSaveCheckbox.checked = false;
        currentDuplicates = [];
        DOM.duplicateWarnings.classList.add('hidden');
        DOM.forceSaveLabel.classList.add('hidden');
        document.querySelectorAll('#add-link-form .cat-checkbox').forEach(cb => cb.checked = false);

        cachedLinks = await API.getLinks();
        renderAppContent();
        
        let msg = `✅ Hoàn tất! Thêm mới: ${result.newCount}, Cập nhật: ${result.updatedCount}`;
        if (result.forbiddenCount > 0) {
            msg += `\n⚠️ Có ${result.forbiddenCount} link không thể cập nhật vì bạn không phải người tạo (và không phải Admin).`;
        }
        alert(msg);
    } catch (err) { showError(err.message); }
}

// ====== LOGIC: DISPLAY STATS & TABLE ======
function getFilteredLinks() {
    let links = [...cachedLinks];
    const filterCat = DOM.filterCategory.value;
    const searchVal = DOM.searchInput.value.toLowerCase().trim();

    if (filterCat !== 'ALL') links = links.filter(l => l.categories.includes(filterCat));
    if (searchVal) {
        links = links.filter(l =>
            l.url.toLowerCase().includes(searchVal) ||
            l.categories.join(' ').toLowerCase().includes(searchVal)
        );
    }
    return links;
}

function renderStats() {
    const links = getFilteredLinks();
    const groups = {};
    links.forEach(l => {
        const monthKey = l.date.substring(0, 7);
        groups[monthKey] = (groups[monthKey] || 0) + 1;
    });

    const sortedKeys = Object.keys(groups).sort((a, b) => b.localeCompare(a));
    DOM.monthStatsContainer.innerHTML = '';
    sortedKeys.forEach(mKey => {
        const [yy, mm] = mKey.split('-');
        const btn = document.createElement('button');
        btn.className = `btn-stat ${currentMonthFilter === mKey ? 'active' : ''}`;
        btn.textContent = `Tháng ${mm}/${yy} (${groups[mKey]})`;
        btn.onclick = () => {
            currentMonthFilter = (mKey === currentMonthFilter) ? null : mKey;
            currentPage = 1;
            renderStats();
            renderLinks();
        };
        DOM.monthStatsContainer.appendChild(btn);
    });

    if (currentMonthFilter) DOM.btnClearMonthFilter.classList.remove('hidden');
    else DOM.btnClearMonthFilter.classList.add('hidden');
}

function renderLinks() {
    const currentUser = getCurrentUser();
    let links = getFilteredLinks();
    if (currentMonthFilter) links = links.filter(l => l.date.startsWith(currentMonthFilter));

    links.sort((a, b) => new Date(b.date) - new Date(a.date));
    const totalLinksEl = document.getElementById('total-links');
    if (totalLinksEl) totalLinksEl.textContent = links.length;

    const limit = parseInt(DOM.itemsPerPage.value) || 25;
    const totalPages = Math.ceil(links.length / limit) || 1;
    if (currentPage > totalPages) currentPage = totalPages;
    if (currentPage < 1) currentPage = 1;

    const startIndex = (currentPage - 1) * limit;
    const paginated = links.slice(startIndex, startIndex + limit);

    DOM.linksTableBody.innerHTML = '';
    if (paginated.length === 0) {
        DOM.linksTableBody.innerHTML = '<tr><td colspan="5" style="text-align:center; color:gray; padding: 20px;">Không có dữ liệu phù hợp...</td></tr>';
        DOM.paginationControls.classList.add('hidden');
        return;
    }

    paginated.forEach(l => {
        const tr = document.createElement('tr');
        const tagsHtml = l.categories.map(c => `<span class="tag">${c}</span>`).join('');
        const addedBy = l.addedBy || `<span style="color:#64748b; font-size:0.85em;">—</span>`;
        const updatedBy = l.updatedBy || `<span style="color:#64748b; font-size:0.85em;">—</span>`;

        const canEdit = currentUser && (currentUser.role === 'admin' || l.addedBy === currentUser.username);
        const actionButtons = canEdit ? `
            <button class="btn-small btn-edit btn-edit-link" data-id="${l.id}">Sửa</button>
            <button class="btn-small btn-danger btn-delete-link" data-id="${l.id}">Xoá</button>
        ` : `<span style="color:gray; font-size:0.8em;">N/A</span>`;

        tr.innerHTML = `
            <td><a href="${l.url}" target="_blank" class="url-text">${l.url}</a></td>
            <td><span class="date-text" style="color:#e2e8f0">${l.date}</span></td>
            <td><span class="date-text" style="font-size:0.85em;">${addedBy}</span></td>
            <td><span class="date-text" style="font-size:0.85em;">${updatedBy}</span></td>
            <td>${tagsHtml}</td>
            <td>${actionButtons}</td>
        `;
        DOM.linksTableBody.appendChild(tr);
    });

    if (totalPages > 1) {
        DOM.paginationControls.classList.remove('hidden');
        DOM.pageInfo.textContent = `Trang ${currentPage} / ${totalPages}`;
        DOM.btnPrevPage.style.color = currentPage === 1 ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)';
        DOM.btnNextPage.style.color = currentPage === totalPages ? 'rgba(255,255,255,0.2)' : 'var(--text-primary)';
    } else {
        DOM.paginationControls.classList.add('hidden');
    }
}

// ====== LOGIC: EDIT & DELETE LINK ======
window.handleDeleteLink = async function(id) {
    if (!confirm('Bạn chắc chắn xoá link vĩnh viễn?')) return;
    try {
        await API.deleteLink(id);
        cachedLinks = await API.getLinks();
        renderAppContent();
    } catch (err) { showError(err.message); }
};

window.openEditLink = function(id) {
    console.log('Opening edit for link ID:', id);
    const link = cachedLinks.find(l => String(l.id) === String(id));
    if (!link) { console.error('Link not found for ID:', id); return; }

    document.getElementById('edit-link-id').value = link.id;
    document.getElementById('edit-link-url').value = link.url;
    document.getElementById('edit-link-date').value = link.date;

    renderCategoryCheckboxes('#edit-link-categories');
    document.querySelectorAll('#edit-link-categories .cat-checkbox').forEach(cb => {
        if (link.categories.includes(cb.value)) cb.checked = true;
    });

    openModal(DOM.modalEditLink);
};

async function saveEditedLink() {
    const id = document.getElementById('edit-link-id').value;
    const url = document.getElementById('edit-link-url').value.trim();
    const date = document.getElementById('edit-link-date').value;
    const selectedCats = Array.from(document.querySelectorAll('#edit-link-categories .cat-checkbox:checked')).map(cb => cb.value);

    if (!url) { showError('URL không được trống!'); return; }
    if (selectedCats.length === 0) { showError('Chọn danh mục!'); return; }

    try {
        await API.updateLink(id, url, date, selectedCats);
        cachedLinks = await API.getLinks();
        closeAllModals();
        renderAppContent();
    } catch (err) { showError(err.message); }
}

// ====== LOGIC: EXPORT CSV ======
function exportToCSV() {
    let links = getFilteredLinks();
    if (currentMonthFilter) links = links.filter(l => l.date.startsWith(currentMonthFilter));

    if (links.length === 0) { showError('Không có dữ liệu để xuất!'); return; }

    links.sort((a, b) => new Date(b.date) - new Date(a.date));

    const escape = val => `"${String(val || '').replace(/"/g, '""')}"`;

    const headers = ['STT', 'URL', 'Ngày nhập', 'Người thêm', 'Người cập nhật', 'Ngày cập nhật', 'Danh mục'];
    let csvContent = headers.join(',') + '\n';

    links.forEach((l, index) => {
        const updatedTime = l.updatedAt ? new Date(l.updatedAt).toLocaleDateString('vi-VN') : '';
        const addedBy = l.addedBy || '';
        const updatedBy = l.updatedBy || '';
        const catStr = Array.isArray(l.categories) ? l.categories.join(', ') : (l.categories || '');
        const row = [
            index + 1,
            escape(l.url),
            l.date || '',
            escape(addedBy),
            escape(updatedBy),
            updatedTime,
            escape(catStr)
        ];
        csvContent += row.join(',') + '\n';
    });

    const BOM = '\uFEFF';
    const blob = new Blob([BOM + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);

    const today = new Date().toISOString().slice(0, 10).replace(/-/g, '');
    const link = document.createElement('a');
    link.setAttribute('href', url);
    link.setAttribute('download', `Data_Export_${today}.csv`);
    document.body.appendChild(link);
    link.click();
    document.body.removeChild(link);
    URL.revokeObjectURL(url);
}

function updateTopbar(tabId) {
    const titleEl = document.getElementById('topbar-title');
    const statsEl = document.getElementById('topbar-stats');
    const exportBtn = document.getElementById('btn-export-excel');
    
    exportBtn.classList.add('hidden');
    statsEl.classList.add('hidden');

    if (tabId === 'links-tab') {
        titleEl.textContent = 'Quản Lý Links';
        exportBtn.classList.remove('hidden');
        statsEl.classList.remove('hidden');
        renderAppContent();
    } else if (tabId === 'settings-tab') {
        titleEl.textContent = '⚙️ Cài Đặt Chung';
        renderAccountsTable();
        renderMerchantsTable();
        renderCategoriesFullTable();
    } else if (tabId === 'sales-tab') {
        titleEl.textContent = '🛍️ Nhập Sales';
        renderSalesTable();
    } else if (tabId === 'stats-tab') {
        titleEl.textContent = '📊 Thống Kê & Xếp Hạng';
        renderStatistics();
    } else if (tabId === 'schedule-tab') {
        titleEl.textContent = '📅 Lịch Công Việc';
        loadScheduleData().then(() => renderSchedule());
    } else if (tabId === 'samples-tab') {
        titleEl.textContent = '🔬 Quản Lý Mẫu';
        renderSamplesTable();
    } else if (tabId === 'finance-tab') {
        titleEl.textContent = '💰 Nhập Thu Chi';
        renderFinanceTab();
    } else if (tabId === 'users-tab') {
        titleEl.textContent = '👥 Quản Lý Người Dùng';
        renderUsersTable();
    }
}

// ====== SALES API LAYER ======
const SalesAPI = {
    async getAll() { return API.fetch('/api/sales'); },
    async add(data) { return API.fetch('/api/sales', { method: 'POST', body: JSON.stringify(data) }); },
    async update(id, data) { return API.fetch(`/api/sales/${id}`, { method: 'PUT', body: JSON.stringify(data) }); },
    async delete(id) { return API.fetch(`/api/sales/${id}`, { method: 'DELETE' }); },

};

// ====== SALES STATE ======
let cachedSales = [];

async function loadSalesData() {
    try {
        cachedSales = await SalesAPI.getAll();
    } catch (err) {
        cachedSales = [];
    }
}

// ====== SALES: SKU SCAN ======
async function handleScanSku() {
    const skuInput = document.getElementById('sales-sku');
    if (!skuInput) return;
    const sku = skuInput.value.trim();
    if (!sku) { showError('Vui lòng nhập SKU trước khi quét!'); return; }

    const btnText = document.getElementById('scan-btn-text');
    const btnLoader = document.getElementById('scan-btn-loader');
    const titleEl = document.getElementById('sales-title');
    const scanBtn = document.getElementById('btn-scan-sku');
    
    // Platform detection logic
    let type = 'amazon'; // Default
    let platformName = 'Amazon';
    
    if (/^[0-9]+$/.test(sku)) {
        // Purely numeric
        if (sku.length === 12) {
            type = 'ebay';
            platformName = 'eBay';
        } else if (sku.length >= 10 && sku.length <= 11) {
            type = 'etsy';
            platformName = 'Etsy';
        }
    } else if (sku.length === 10) {
        type = 'amazon';
        platformName = 'Amazon';
    }

    try {
        if (btnText) btnText.textContent = `Quét ${platformName}...`;
        if (btnLoader) btnLoader.classList.remove('hidden');
        if (scanBtn) scanBtn.disabled = true;
        
        if (titleEl) {
            titleEl.value = `Đang quét từ ${platformName}...`;
            titleEl.style.color = 'var(--text-secondary)';
        }

        const data = await API.fetch(`/api/scrape/${type}/${sku}`);
        if (data && data.title) {
            if (titleEl) {
                titleEl.value = data.title;
                titleEl.style.color = '#34d399';
                // Show success feedback
                const msgEl = document.getElementById('sales-form-msg');
                if (msgEl) {
                    msgEl.textContent = `✅ Đã tìm thấy tiêu đề từ ${platformName}!`;
                    setTimeout(() => { if (msgEl.textContent.includes('tiêu đề')) msgEl.textContent = ''; }, 3000);
                }
            }
        }
    } catch (err) {
        showError(`Không thể lấy tiêu đề từ ${platformName}. Vui lòng nhập thủ công.`);
        if (titleEl) {
            titleEl.value = `${platformName} Product (SKU: ${sku})`;
            titleEl.style.color = 'var(--text-secondary)';
        }
    } finally {
        if (btnText) btnText.textContent = 'Quét';
        if (btnLoader) btnLoader.classList.add('hidden');
        if (scanBtn) scanBtn.disabled = false;
    }
}

// ====== SALES: ADD ENTRY ======
async function handleAddSales(e) {
    e.preventDefault();

    const accountEl = document.getElementById('sales-account');
    const skuEl = document.getElementById('sales-sku');
    const dateEl = document.getElementById('sales-date');
    const fulfillmentEl = document.getElementById('sales-fulfillment');
    const designIdEl = document.getElementById('sales-design-id');
    const titleEl = document.getElementById('sales-title');
    const ordIdEl = document.getElementById('sales-ord-id');
    const customEl = document.getElementById('sales-custom');
    const sizeEl = document.getElementById('sales-size');
    const filenameEl = document.getElementById('sales-filename');
    const salesQtyEl = document.getElementById('sales-qty');

    if (!accountEl || !skuEl || !dateEl) {
        showError('Lỗi giao diện: không tìm thấy trường nhập liệu. Vui lòng tải lại trang!');
        return;
    }

    const account = (accountEl.value || '').trim();
    const fulfillment = (fulfillmentEl?.value || '').trim();
    const design_id = (designIdEl?.value || '').trim();
    const sku = (skuEl.value || '').trim().toUpperCase();
    const title = (titleEl?.value || '').trim();
    const ord_id = (ordIdEl?.value || '').trim();
    const custom = (customEl?.value || '').trim();
    const size = (sizeEl?.value || '').trim() || 'N/A';
    const filenameRaw = (filenameEl?.value || '').trim();
    const sales = parseInt(salesQtyEl?.value) || 0;
    const date = dateEl.value || new Date().toISOString().split('T')[0];

    const accPart = account.slice(0, 3);
    const fulPart = fulfillment.slice(0, 2);
    const ordPart = ord_id.slice(-4);
    const filename = filenameRaw || `${accPart}_${fulPart}_${sku}_${ordPart}`;

    if (!account) { showError('Vui lòng chọn Account!'); return; }
    if (!fulfillment) { showError('Vui lòng nhập Fulfillment!'); return; }
    if (!design_id) { showError('Vui lòng nhập Mã Design!'); return; }
    if (!sku) { showError('Vui lòng nhập mã SKU!'); return; }
    if (!ord_id) { showError('Vui lòng nhập OrdID!'); return; }
    if (!date) { showError('Vui lòng chọn Ngày!'); return; }

    const payload = { account, fulfillment, design_id, sku, title, ord_id, custom, size, filename, sales, date };
    const editId = (document.getElementById('edit-sales-id-inline')?.value || '').trim();

    try {
        if (editId) {
            await SalesAPI.update(editId, payload);
        } else {
            await SalesAPI.add(payload);
        }

        document.getElementById('add-sales-form').reset();
        document.getElementById('edit-sales-id-inline').value = '';
        document.getElementById('sales-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('sales-qty').value = '0';
        if (titleEl) { titleEl.value = ''; titleEl.style.color = ''; }
        document.getElementById('btn-save-sales').innerHTML = '💾 Lưu Dữ Liệu';
        document.getElementById('btn-save-sales').classList.remove('btn-warning');
        document.getElementById('btn-cancel-edit-sales')?.classList.add('hidden');
        updateSalesDropdowns();

        const msgEl = document.getElementById('sales-form-msg');
        if (msgEl) {
            msgEl.textContent = editId ? '✅ Đã cập nhật thành công!' : '✅ Đã lưu thành công!';
            setTimeout(() => { msgEl.textContent = ''; }, 3000);
        }

        cachedSales = await SalesAPI.getAll();
        renderSalesTable();
        renderStatistics();
    } catch (err) {
        showError(err.message);
    }
}

window.debugSchema = async function() {
    try {
        const schema = await API.fetch('/api/debug/schema');
        console.table(schema.sales_entries || []);
        const cols = (schema.sales_entries || []).map(c => c.name).join(', ');
        alert('sales_entries columns:\n' + cols);
    } catch(e) {
        alert('Error: ' + e.message);
    }
};

document.getElementById('btn-cancel-edit-sales')?.addEventListener('click', () => {
    document.getElementById('add-sales-form').reset();
    document.getElementById('edit-sales-id-inline').value = '';
    document.getElementById('btn-save-sales').innerHTML = '💾 Lưu Dữ Liệu';
    document.getElementById('btn-cancel-edit-sales').classList.add('hidden');
    document.getElementById('sales-date').value = new Date().toISOString().split('T')[0];
});

// ====== SALES: RENDER TABLE ======
function renderSalesTable() {
    const search = (document.getElementById('sales-search')?.value || '').toLowerCase();
    const filterDate = document.getElementById('sales-filter-date')?.value || '';
    const currentUser = getCurrentUser();
    const isAdmin = currentUser && currentUser.role === 'admin';
    const tbody = document.getElementById('sales-table-body');
    if (!tbody) return;

    let data = [...cachedSales];
    if (search) data = data.filter(s =>
        s.sku.toLowerCase().includes(search) ||
        (s.title || '').toLowerCase().includes(search) ||
        (s.account || '').toLowerCase().includes(search) ||
        (s.ord_id || '').toLowerCase().includes(search) ||
        (s.design_id || '').toLowerCase().includes(search) ||
        (s.filename || '').toLowerCase().includes(search)
    );
    if (filterDate) data = data.filter(s => s.date === filterDate);

    tbody.innerHTML = '';
    if (data.length === 0) {
        tbody.innerHTML = '<tr><td colspan="12" style="text-align:center;color:gray;padding:20px;">Chưa có dữ liệu doanh số...</td></tr>';
        return;
    }
    const tc = (val, maxW) => {
        const style = `max-width:${maxW || 90}px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;`;
        const escapedVal = String(val || '').replace(/'/g, "\\'");
        return val ? `
            <td style="${style}" 
                title="Click để copy: ${val}" 
                onclick="copyToClipboard('${escapedVal}', this)">
                ${val}
            </td>
        ` : `<td style="color:var(--text-secondary)">—</td>`;
    };
    data.forEach(s => {
        const tr = document.createElement('tr');
        const actions = isAdmin ? `
            <button class="btn-small btn-edit btn-edit-sales" data-id="${s.id}">Sửa</button>
            <button class="btn-small btn-danger btn-delete-sales" data-id="${s.id}">Xóa</button>
        ` : `<span style="color:gray;font-size:0.8em">—</span>`;

        const filenameCell = s.filename ? `
            <td style="max-width:90px;overflow:hidden;text-overflow:ellipsis;white-space:nowrap;cursor:pointer;color:var(--primary-color);" 
                title="Click để copy: ${s.filename}" 
                onclick="copyToClipboard('${s.filename.replace(/'/g, "\\'")}', this)">
                ${s.filename}
            </td>
        ` : `<td style="color:var(--text-secondary)">—</td>`;

        const valDate = String(s.date || '').replace(/'/g, "\\'");
        const valSku = String(s.sku || '').replace(/'/g, "\\'");
        const valSales = String(s.sales || '').replace(/'/g, "\\'");

        tr.innerHTML = `
            <td style="white-space:nowrap;cursor:pointer;" title="Click để copy: ${s.date}" onclick="copyToClipboard('${valDate}', this)">
                <span class="date-text">${s.date}</span>
            </td>
            ${tc(s.account, 80)}
            ${tc(s.fulfillment, 70)}
            ${tc(s.design_id, 90)}
            <td style="white-space:nowrap;cursor:pointer;" title="Click để copy: ${s.sku}" onclick="copyToClipboard('${valSku}', this)">
                <span class="sku-tag">${s.sku}</span>
            </td>
            ${tc(s.title, 140)}
            ${tc(s.ord_id, 80)}
            ${tc(s.custom, 70)}
            ${tc(s.size, 45)}
            ${filenameCell}
            <td style="white-space:nowrap;cursor:pointer;" title="Click để copy: ${s.sales}" onclick="copyToClipboard('${valSales}', this)">
                <span class="units-badge">${s.sales}</span>
            </td>
            <td style="white-space:nowrap;">${actions}</td>
        `;
        tbody.appendChild(tr);
    });
}

// ====== SALES: EDIT ======
window.openEditSales = function(id) {
    const entry = cachedSales.find(s => s.id === id);
    if (!entry) return;

    document.getElementById('edit-sales-id-inline').value = entry.id;
    const accSel = document.getElementById('sales-account');
    if (entry.account && ![...accSel.options].some(o => o.value === entry.account)) {
        const opt = document.createElement('option');
        opt.value = entry.account;
        opt.textContent = entry.account;
        accSel.appendChild(opt);
    }
    accSel.value = entry.account;
    document.getElementById('sales-fulfillment').value = entry.fulfillment || '';
    document.getElementById('sales-design-id').value = entry.design_id || '';
    document.getElementById('sales-sku').value = entry.sku;
    document.getElementById('sales-title').value = entry.title || '';
    document.getElementById('sales-ord-id').value = entry.ord_id || '';
    document.getElementById('sales-custom').value = entry.custom || '';
    document.getElementById('sales-size').value = entry.size || '';
    document.getElementById('sales-filename').value = entry.filename || '';
    document.getElementById('sales-qty').value = entry.sales;
    document.getElementById('sales-date').value = entry.date;

    document.getElementById('btn-save-sales').innerHTML = '✏️ Cập Nhật Dữ Liệu';
    document.getElementById('btn-cancel-edit-sales').classList.remove('hidden');
    window.scrollTo({ top: 0, behavior: 'smooth' });
};

// Store pending sales delete ID for modal confirmation
let _pendingSalesDeleteId = null;

window.handleDeleteSales = function(id) {
    _pendingSalesDeleteId = id;
    const entry = cachedSales.find(s => s.id === id);
    const label = entry ? `bản ghi SKU "${entry.sku}" (${entry.date})` : 'bản ghi này';
    DOM.confirmDeleteMsg.textContent = `Bạn có chắc muốn xóa ${label}? Hành động này không thể hoàn tác.`;
    // Override confirm button to handle sales delete
    const btnConfirm = DOM.btnConfirmDelete;
    const handler = async () => {
        if (!_pendingSalesDeleteId) return;
        try {
            await SalesAPI.delete(_pendingSalesDeleteId);
            _pendingSalesDeleteId = null;
            cachedSales = await SalesAPI.getAll();
            closeAllModals();
            renderSalesTable();
            renderStatistics();
            updateTopbar('sales-tab');
            // Show success feedback
            const msgEl = document.getElementById('sales-form-msg');
            if (msgEl) {
                msgEl.textContent = '✅ Đã xóa bản ghi thành công!';
                setTimeout(() => { msgEl.textContent = ''; }, 3000);
            }
        } catch (err) {
            showError(err.message);
        }
        btnConfirm.removeEventListener('click', handler);
    };
    // Remove old listeners by cloning
    const newBtn = btnConfirm.cloneNode(true);
    btnConfirm.parentNode.replaceChild(newBtn, btnConfirm);
    DOM.btnConfirmDelete = newBtn;
    newBtn.addEventListener('click', handler);
    openModal(DOM.modalConfirmDelete);
};

// ====== STATISTICS ======
let currentChartRange = 7;
let customChartStart = null;
let customChartEnd = null;

window.setChartRange = function(days) {
    if (days === 'custom') {
        document.getElementById('custom-chart-range-container').style.display = 'flex';
        return;
    }
    document.getElementById('custom-chart-range-container').style.display = 'none';
    currentChartRange = parseInt(days);
    customChartStart = null;
    customChartEnd = null;
    // Sync the select element
    const sel = document.getElementById('chart-range-select');
    if (sel) sel.value = String(days);
    renderSalesChart();
};

window.applyCustomChartRange = function() {
    const start = document.getElementById('chart-start-date').value;
    const end = document.getElementById('chart-end-date').value;
    if (!start || !end) return alert("Vui lòng chọn đầy đủ ngày bắt đầu và kết thúc.");
    if (new Date(start) > new Date(end)) return alert("Ngày bắt đầu không được lớn hơn ngày kết thúc.");
    
    const diffTime = Math.abs(new Date(end) - new Date(start));
    const diffDays = Math.ceil(diffTime / (1000 * 60 * 60 * 24)) + 1;
    if (diffDays > 180) return alert("Chỉ hỗ trợ xem tối đa 180 ngày.");

    currentChartRange = 'custom';
    customChartStart = start;
    customChartEnd = end;
    renderSalesChart();
};

function renderStatistics() {
    const today = new Date();
    const d7 = new Date(today); d7.setDate(today.getDate() - 7);
    const d30 = new Date(today); d30.setDate(today.getDate() - 30);

    const thisMonthKey = today.toISOString().slice(0, 7);

    const monthSales = cachedSales.filter(s => s.date.startsWith(thisMonthKey));
    const totalUnits = monthSales.reduce((a, s) => a + (s.sales || 0), 0);
    const uniqueSkus = [...new Set(cachedSales.map(s => s.sku))].length;

    // Calculate Top Design (aggregated by design_id)
    const designCount = {};
    cachedSales.forEach(s => { 
        if (s.design_id) designCount[s.design_id] = (designCount[s.design_id] || 0) + s.sales; 
    });
    const topDesign = Object.entries(designCount).sort((a, b) => b[1] - a[1])[0]?.[0] || '—';

    const statsContainer = document.getElementById('stats-summary-cards');
    if (statsContainer) {
        statsContainer.innerHTML = `
            <div class="stat-card">
                <div class="stat-icon">📦</div>
                <div class="stat-title">Doanh Số Tháng Này</div>
                <div class="stat-val" id="stat-total-units">${totalUnits.toLocaleString()}</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🏷️</div>
                <div class="stat-title">Số Lượng SKU</div>
                <div class="stat-val" id="stat-unique-skus">${uniqueSkus}</div>
            </div>
            <div class="stat-card">
                <div class="stat-icon">🎨</div>
                <div class="stat-title">Top Design</div>
                <div class="stat-val" id="stat-top-design" style="font-size:${topDesign.length > 12 ? '1.1em' : '1.6em'}; word-break:break-all;">${topDesign}</div>
            </div>
        `;
    }

    renderTopProducts('top-weekly-body', cachedSales.filter(s => new Date(s.date) >= d7));
    renderTopProducts('top-monthly-body', cachedSales.filter(s => new Date(s.date) >= d30));
    renderSalesChart();
}

function renderTopProducts(tbodyId, data) {
    const grouped = {};
    data.forEach(s => {
        if (!grouped[s.sku]) grouped[s.sku] = { sku: s.sku, title: s.title || s.sku, design_id: s.design_id, total: 0 };
        grouped[s.sku].total += s.sales;
        // Keep the latest design_id for that SKU if multiple exist
        if (s.design_id) grouped[s.sku].design_id = s.design_id;
    });
    const sorted = Object.values(grouped).sort((a, b) => b.total - a.total).slice(0, 10);
    const tbody = document.getElementById(tbodyId);
    tbody.innerHTML = '';
    if (sorted.length === 0) {
        tbody.innerHTML = '<tr><td colspan="5" style="text-align:center;color:gray;padding:20px;">Chưa có dữ liệu...</td></tr>';
        return;
    }
    sorted.forEach((p) => {
        const linkHtml = `
            <a href="https://www.amazon.com/dp/${p.sku}" target="_blank" style="display:inline-flex; align-items:center; justify-content:center; width:30px; height:30px; background:rgba(96, 165, 250, 0.15); border:1px solid rgba(96, 165, 250, 0.3); border-radius:6px; color:#60a5fa; transition:all 0.2s;" onmouseover="this.style.background='rgba(96, 165, 250, 0.3)'" onmouseout="this.style.background='rgba(96, 165, 250, 0.15)'" title="Mở trang Amazon">
                <svg width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round"><path d="M18 13v6a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2V8a2 2 0 0 1 2-2h6"></path><polyline points="15 3 21 3 21 9"></polyline><line x1="10" y1="14" x2="21" y2="3"></line></svg>
            </a>`;

        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td class="col-sku"><span class="sku-tag">${p.sku}</span></td>
            <td class="col-title" title="${p.title}">${p.title}</td>
            <td class="col-design" title="${p.design_id || 'N/A'}"><span class="tag" style="background: rgba(96,165,250,0.1); color:#60a5fa; border-color:rgba(96,165,250,0.2);">${p.design_id || 'N/A'}</span></td>
            <td class="col-sale"><span class="units-badge">${p.total}</span></td>
            <td class="col-link">${linkHtml}</td>
        `;
        tbody.appendChild(tr);
    });
}

function renderSalesChart() {
    const chartAreaEl = document.getElementById('sales-chart');
    const labelsEl = document.getElementById('sales-chart-labels');
    const yaxisEl = document.getElementById('sales-chart-yaxis');
    const gridEl = document.getElementById('sales-chart-grid');
    const wrapperEl = document.getElementById('sales-chart-wrapper');
    
    if (!chartAreaEl || !labelsEl || !yaxisEl) return;

    let days = [];
    if (currentChartRange === 'custom' && customChartStart && customChartEnd) {
        const startD = new Date(customChartStart);
        const endD = new Date(customChartEnd);
        for (let d = new Date(startD); d <= endD; d.setDate(d.getDate() + 1)) {
            days.push(d.toISOString().split('T')[0]);
        }
    } else {
        const range = typeof currentChartRange === 'number' ? currentChartRange : 7;
        const today = new Date();
        for (let i = range - 1; i >= 0; i--) {
            const d = new Date(today);
            d.setDate(today.getDate() - i);
            days.push(d.toISOString().split('T')[0]);
        }
    }

    const dayTotals = days.map(day => ({
        day,
        label: day.slice(5).replace('-', '/'),
        total: cachedSales.filter(s => s.date === day).reduce((a, s) => a + s.sales, 0)
    }));
    
    // Y-Axis Max calculation
    let max = Math.max(...dayTotals.map(d => d.total), 5); // Ensure a baseline max
    max = Math.ceil(max / 5) * 5; // Round to nearest 5 for clean Y-axis ticks

    // Render Y-axis
    yaxisEl.innerHTML = '';
    if(gridEl) gridEl.innerHTML = '';
    
    const tickCount = 5;
    for (let i = tickCount; i >= 0; i--) {
        const val = Math.round((max / tickCount) * i);
        
        // Add Y-axis label
        const tick = document.createElement('div');
        tick.className = 'yaxis-tick';
        tick.textContent = val;
        yaxisEl.appendChild(tick);
        
        // Add Grid line
        if(gridEl) {
            const line = document.createElement('div');
            line.className = 'grid-line';
            gridEl.appendChild(line);
        }
    }

    chartAreaEl.innerHTML = '';
    labelsEl.innerHTML = '';

    const rangeLength = days.length;
    const containerWidth = wrapperEl ? wrapperEl.clientWidth - 50 : 600; // Account for Y-axis space
    const minBarWidth = rangeLength <= 7 ? 48 : rangeLength <= 14 ? 36 : 24;
    const gap = 6;
    
    const barWidth = Math.max(Math.floor(containerWidth / rangeLength), minBarWidth);
    const totalChartWidth = Math.max((barWidth * rangeLength), containerWidth);
    
    chartAreaEl.style.width = totalChartWidth + 'px';
    labelsEl.style.width = totalChartWidth + 'px';
    if(gridEl) gridEl.style.width = totalChartWidth + 'px';

    dayTotals.forEach(d => {
        const heightPct = Math.round((d.total / max) * 100);
        
        // Render Bar Wrap
        const wrap = document.createElement('div');
        wrap.className = 'chart-bar-wrap';
        wrap.style.flex = `0 0 ${barWidth - gap}px`;
        wrap.style.maxWidth = `${barWidth - gap}px`;
        wrap.innerHTML = `
            <div class="chart-bar-value" style="opacity: ${d.total > 0 ? 1 : 0}">${d.total}</div>
            <div class="chart-bar" style="height:${Math.max(heightPct, 1)}%" title="${d.day}: ${d.total} đơn"></div>
        `;
        chartAreaEl.appendChild(wrap);

        // Render Label
        const lbl = document.createElement('div');
        lbl.className = 'chart-label';
        lbl.style.flex = `0 0 ${barWidth - gap}px`;
        lbl.style.maxWidth = `${barWidth - gap}px`;
        lbl.textContent = d.label;
        labelsEl.appendChild(lbl);
    });
}

// ====== SALES EVENT LISTENERS SETUP ======
function setupSalesListeners() {
    document.getElementById('btn-scan-sku').addEventListener('click', handleScanSku);
    document.getElementById('sales-sku').addEventListener('keydown', e => {
        if (e.key === 'Enter') { e.preventDefault(); handleScanSku(); }
    });
    document.getElementById('add-sales-form').addEventListener('submit', handleAddSales);
    document.getElementById('sales-search').addEventListener('input', renderSalesTable);
    document.getElementById('sales-filter-date').addEventListener('change', renderSalesTable);

    document.getElementById('sales-date').value = new Date().toISOString().split('T')[0];

    // Cancel edit mode
    document.getElementById('btn-cancel-edit-sales')?.addEventListener('click', () => {
        document.getElementById('edit-sales-id-inline').value = '';
        document.getElementById('add-sales-form').reset();
        document.getElementById('sales-date').value = new Date().toISOString().split('T')[0];
        document.getElementById('btn-save-sales').innerHTML = '💾 Lưu Dữ Liệu';
        document.getElementById('btn-cancel-edit-sales').classList.add('hidden');
        updateFilenamePreview();
    });

    // Real-time filename preview
    const previewFields = ['sales-account', 'sales-fulfillment', 'sales-sku', 'sales-ord-id', 'sales-filename'];
    previewFields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            el.addEventListener('input', updateFilenamePreview);
            el.addEventListener('change', updateFilenamePreview);
        }
    });
}

function updateFilenamePreview() {
    const previewEl = document.getElementById('filename-preview');
    if (!previewEl) return;

    const filenameVal = (document.getElementById('sales-filename')?.value || '').trim();
    if (filenameVal) {
        previewEl.textContent = '';
        return;
    }

    const acc = (document.getElementById('sales-account')?.value || '').trim().slice(0, 3);
    const ful = (document.getElementById('sales-fulfillment')?.value || '').trim().slice(0, 2);
    const sku = (document.getElementById('sales-sku')?.value || '').trim().toUpperCase();
    const ord = (document.getElementById('sales-ord-id')?.value || '').trim().slice(-4);

    if (acc || ful || sku || ord) {
        previewEl.textContent = `→ ${acc}_${ful}_${sku}_${ord}`;
    } else {
        previewEl.textContent = '→ [3 Account]_[2 Ful]_[SKU]_[4 OrdID]';
    }
}

// ====== OVERRIDE INIT TO INCLUDE NEW MODULES ======

// ====== GENERAL MANAGEMENT RENDERERS ======

function renderAccountsTable() {
    const tbody = document.getElementById('accounts-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    cachedAccounts.forEach(acc => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600; color:#cbd5e1;">${acc.name}</td>
            <td>
                <button class="btn-small btn-edit" onclick="handleRenameAccount('${acc.id}', '${acc.name.replace(/'/g, "\\'")}')">Sửa</button>
                <button class="btn-small btn-danger" onclick="handleDeleteAccount('${acc.id}')">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderMerchantsTable() {
    const tbody = document.getElementById('merchants-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    cachedMerchants.forEach(m => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600; color:#cbd5e1;">${m.name}</td>
            <td>
                <button class="btn-small btn-edit" onclick="handleRenameMerchant('${m.id}', '${m.name.replace(/'/g, "\\'")}')">Sửa</button>
                <button class="btn-small btn-danger" onclick="handleDeleteMerchant('${m.id}')">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function renderCategoriesFullTable() {
    const tbody = document.getElementById('categories-table-body');
    if (!tbody) return;
    tbody.innerHTML = '';
    cachedCategories.forEach(catName => {
        const tr = document.createElement('tr');
        tr.innerHTML = `
            <td style="font-weight:600; color:#cbd5e1;">${catName}</td>
            <td>
                <button class="btn-small btn-edit" onclick="openRenameCategoryFull('${catName}')">Sửa</button>
                <button class="btn-small btn-danger" onclick="handleDeleteCategory('${catName}')">Xóa</button>
            </td>
        `;
        tbody.appendChild(tr);
    });
}

function updateSalesDropdowns() {
    const accSelect = document.getElementById('sales-account');
    if (!accSelect) return;

    accSelect.innerHTML = '<option value="">-- Chọn Account --</option>';
    cachedAccounts.forEach(acc => {
        const name = (acc.name || '').trim();
        if (!name) return;
        accSelect.innerHTML += `<option value="${name}">${name}</option>`;
    });
}

// ====== GENERAL MANAGEMENT LISTENERS ======

function setupGeneralManagementListeners() {
    document.getElementById('add-account-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-account-name').value.trim();
        try {
            await API.addAccount(name);
            document.getElementById('new-account-name').value = '';
            cachedAccounts = await API.getAccounts();
            renderAccountsTable();
            updateSalesDropdowns();
        } catch (err) { showError(err.message); }
    });

    document.getElementById('add-merchant-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-merchant-name').value.trim();
        try {
            await API.addMerchant(name);
            document.getElementById('new-merchant-name').value = '';
            cachedMerchants = await API.getMerchants();
            renderMerchantsTable();
            updateSalesDropdowns();
        } catch (err) { showError(err.message); }
    });

    document.getElementById('add-category-full-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        const name = document.getElementById('new-category-full-name').value.trim();
        try {
            await API.addCategory(name);
            document.getElementById('new-category-full-name').value = '';
            await loadAppData();
        } catch (err) { showError(err.message); }
    });
}

window.handleDeleteAccount = async function(id) {
    if (!confirm('Xóa account này?')) return;
    try {
        await API.deleteAccount(id);
        cachedAccounts = await API.getAccounts();
        renderAccountsTable();
        updateSalesDropdowns();
    } catch (err) { showError(err.message); }
};

window.handleRenameAccount = async function(id, oldName) {
    const newName = prompt('Nhập tên Account mới:', oldName);
    if (!newName || newName.trim() === oldName || newName.trim() === '') return;
    try {
        await API.renameAccount(id, newName.trim());
        cachedAccounts = await API.getAccounts();
        renderAccountsTable();
        updateSalesDropdowns();
    } catch (err) { showError(err.message); }
};

window.handleDeleteMerchant = async function(id) {
    if (!confirm('Xóa merchant này?')) return;
    try {
        await API.deleteMerchant(id);
        cachedMerchants = await API.getMerchants();
        renderMerchantsTable();
        updateSalesDropdowns();
    } catch (err) { showError(err.message); }
};

window.handleRenameMerchant = async function(id, oldName) {
    const newName = prompt('Nhập tên Merchant mới:', oldName);
    if (!newName || newName.trim() === oldName || newName.trim() === '') return;
    try {
        await API.renameMerchant(id, newName.trim());
        cachedMerchants = await API.getMerchants();
        renderMerchantsTable();
        updateSalesDropdowns();
    } catch (err) { showError(err.message); }
};

window.adjustSalesQty = function(delta) {
    const input = document.getElementById('sales-qty');
    if (!input) return;
    let val = parseInt(input.value) || 0;
    val += delta;
    if (val < 0) val = 0;
    input.value = val;
};

window.openRenameCategoryFull = function(oldName) {
    document.getElementById('edit-cat-old').value = oldName;
    document.getElementById('edit-cat-new').value = oldName;
    openModal(DOM.modalEditSingleCat);
};

window.handleDeleteCategory = async function(name) {
    if (!confirm(`Xóa danh mục: ${name}?`)) return;
    try {
        await API.deleteCategory(name);
        cachedCategories = await API.getCategories();
        renderAppContent();
        renderCategoriesFullTable();
        updateSalesDropdowns();
    } catch (err) { showError(err.message); }
};

// ====== LOGIC: WORK SCHEDULE ======
async function loadScheduleData() {
    try {
        const user = getCurrentUser();
        if (user && user.role === 'admin') {
            cachedSchedule = await API.getSchedule(selectedScheduleUser);
        } else {
            cachedSchedule = await API.getSchedule();
        }
    } catch (err) {
        cachedSchedule = [];
    }
}

function renderSchedule() {
    renderCalendar();
    renderDayTasks();
}

function renderCalendar() {
    const year = calendarDate.getFullYear();
    const month = calendarDate.getMonth();
    
    const monthNames = ["Tháng 01", "Tháng 02", "Tháng 03", "Tháng 04", "Tháng 05", "Tháng 06", "Tháng 07", "Tháng 08", "Tháng 09", "Tháng 10", "Tháng 11", "Tháng 12"];
    DOM.calendarMonthYear.textContent = `${monthNames[month]}, ${year}`;
    
    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const prevMonthDays = new Date(year, month, 0).getDate();
    
    DOM.calendarGrid.innerHTML = '';
    
    const weekdays = ['CN', 'T2', 'T3', 'T4', 'T5', 'T6', 'T7'];
    weekdays.forEach(day => {
        const div = document.createElement('div');
        div.className = 'calendar-weekday';
        div.textContent = day;
        DOM.calendarGrid.appendChild(div);
    });
    
    for (let i = firstDay; i > 0; i--) {
        const d = prevMonthDays - i + 1;
        renderDayCell(year, month - 1, d, true);
    }
    
    for (let i = 1; i <= daysInMonth; i++) {
        renderDayCell(year, month, i, false);
    }
    
    const totalCells = DOM.calendarGrid.children.length - 7;
    const remaining = 42 - totalCells;
    for (let i = 1; i <= remaining; i++) {
        renderDayCell(year, month + 1, i, true);
    }
}

function renderDayCell(year, month, day, isOtherMonth) {
    const dateObj = new Date(year, month, day);
    const dateStr = dateObj.toISOString().split('T')[0];
    
    const div = document.createElement('div');
    div.className = `calendar-day ${isOtherMonth ? 'other-month' : ''}`;
    if (dateStr === new Date().toISOString().split('T')[0]) div.classList.add('today');
    if (dateStr === selectedDate) div.classList.add('selected');
    
    div.innerHTML = `<span class="day-number">${day}</span>`;
    
    const tasks = cachedSchedule.filter(t => t.date === dateStr);
    if (tasks.length > 0) {
        const taskContainer = document.createElement('div');
        taskContainer.className = 'day-tasks';
        
        tasks.slice(0, 3).forEach(t => {
            const pill = document.createElement('div');
            pill.className = `task-summary-pill ${t.status === 'completed' ? 'completed' : ''}`;
            
            if (selectedScheduleUser === 'all') {
                const color = getUserColor(t.userId);
                pill.innerHTML = `<span class="user-tag" style="color: ${color}; border-color: ${color};">${t.userId}</span> ${t.title}`;
            } else {
                pill.textContent = t.title;
            }
            taskContainer.appendChild(pill);
        });
        
        if (tasks.length > 3) {
            const more = document.createElement('div');
            more.style.fontSize = '0.65em';
            more.style.color = 'var(--text-secondary)';
            more.style.textAlign = 'center';
            more.textContent = `+${tasks.length - 3}...`;
            taskContainer.appendChild(more);
        }
        div.appendChild(taskContainer);
    }
    
    div.onclick = () => {
        selectedDate = dateStr;
        renderCalendar();
        renderDayTasks();
    };
    
    DOM.calendarGrid.appendChild(div);
}

function renderDayTasks() {
    const displayDate = new Date(selectedDate.replace(/-/g, '/'));
    DOM.currentSelectedDate.textContent = displayDate.toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    
    const tasks = cachedSchedule.filter(t => t.date === selectedDate);
    DOM.dayTaskList.innerHTML = '';
    
    if (tasks.length === 0) {
        DOM.dayTaskList.innerHTML = '<p style="text-align: center; color: var(--text-secondary); opacity: 0.5; padding: 20px;">Không có công việc nào.</p>';
        return;
    }
    
    tasks.forEach(t => {
        const div = document.createElement('div');
        div.className = 'task-item';
        div.dataset.id = t.id;
        
        const color = getUserColor(t.userId);
        const user = getCurrentUser();
        const showTag = (user?.role === 'admin') || (selectedScheduleUser === 'all');
        const userTag = showTag ? `<span class="user-tag" style="color: ${color}; border-color: ${color};">${t.userId}</span>` : '';
        
        const creatorTag = (user?.role === 'admin' && t.createdBy) ? `<span style="font-size: 0.75em; color: var(--text-secondary); margin-left:8px;">(Tạo bởi: ${t.createdBy})</span>` : '';

        div.innerHTML = `
            <div class="task-item-header">
                <span class="task-item-title" style="${t.status === 'completed' ? 'text-decoration: line-through; opacity: 0.6;' : ''}">
                    ${userTag}${t.title}${creatorTag}
                </span>
                <div class="task-actions">
                    <button class="btn-icon" data-id="${t.id}" data-action="edit" title="Sửa" style="font-size: 0.9em; padding: 4px;">✏️</button>
                    <button class="btn-icon" data-id="${t.id}" data-action="delete" title="Xóa" style="font-size: 0.9em; padding: 4px; color: var(--danger-color);">🗑️</button>
                </div>
            </div>
            <p class="task-item-desc">${t.description ? t.description.substring(0, 100) + (t.description.length > 100 ? '...' : '') : 'Không có mô tả'}</p>
            <div class="task-item-footer">
                <label class="status-toggle">
                    <input type="checkbox" data-id="${t.id}" ${t.status === 'completed' ? 'checked' : ''} onchange="window.handleToggleTaskStatus('${t.id}', this.checked)">
                    <span>${t.status === 'completed' ? 'Đã hoàn thành' : 'Đang thực hiện'}</span>
                </label>
            </div>
        `;
        DOM.dayTaskList.appendChild(div);
    });
}

window.openTaskDetail = function(id) {
    const task = cachedSchedule.find(t => t.id === id);
    if (!task) return;
    
    const user = getCurrentUser();
    DOM.detailTaskTitle.textContent = task.title;
    DOM.detailTaskStatus.textContent = task.status === 'completed' ? 'Đã hoàn thành' : 'Đang thực hiện';
    DOM.detailTaskStatus.className = `tag ${task.status === 'completed' ? 'tag-success' : ''}`;
    DOM.detailTaskAssignee.textContent = task.userId || 'Chưa phân công';
    DOM.detailTaskCreator.textContent = task.createdBy || task.userId || 'Unknown';
    DOM.detailTaskDate.textContent = new Date(task.date).toLocaleDateString('vi-VN', { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' });
    DOM.detailTaskDesc.textContent = task.description || 'Chưa có mô tả chi tiết.';
    
    // Hiển thị file đính kèm (giả lập từ data task)
    const filesContainer = DOM.detailTaskFiles;
    if (filesContainer) {
        if (task.attachments && task.attachments.length > 0) {
            filesContainer.innerHTML = task.attachments.map(f => 
                `<span style="background: rgba(0,0,0,0.3); padding: 5px 10px; border-radius: 5px; font-size: 0.85em; display: inline-flex; align-items: center; gap: 5px; margin: 3px;">
                    📎 ${f.name}
                </span>`
            ).join('');
        } else {
            filesContainer.innerHTML = '<em style="color: var(--text-secondary);">Chưa có file đính kèm</em>';
        }
    }
    
    DOM.btnToggleStatusFromDetail.innerHTML = task.status === 'completed' ? '↩️ Đánh dấu chưa xong' : '✅ Đánh dấu hoàn thành';
    DOM.btnToggleStatusFromDetail.onclick = () => {
        handleToggleTaskStatus(task.id, task.status !== 'completed');
        closeAllModals();
    };

    if (user && user.role === 'admin') {
        DOM.adminDetailActions.classList.remove('hidden');
        DOM.btnEditTaskFromDetail.onclick = (e) => {
            e.stopPropagation();
            closeAllModals();
            openEditTask(task.id);
        };
        DOM.btnDeleteTaskFromDetail.onclick = (e) => {
            e.stopPropagation();
            handleDeleteTask(task.id);
            closeAllModals();
        };
    } else {
        DOM.adminDetailActions.classList.add('hidden');
    }

    openModal(DOM.modalTaskDetail);
};

<<<<<<< HEAD
function openAddTaskModal() {
    const user = getCurrentUser();
    DOM.taskIdInput.value = '';
    DOM.taskDateInput.value = selectedDate;
    DOM.taskTitleInput.value = '';
    DOM.taskDescInput.value = '';

    if (user && user.role === 'admin') {
        DOM.assigneeGroup.classList.remove('hidden');
        if (DOM.taskAssigneeInput.options.length > 0) {
            DOM.taskAssigneeInput.value = DOM.taskAssigneeInput.options[0].value;
        }
=======
window.openAddTaskModal = function(date = null) {
    const user = getCurrentUser();
    DOM.taskIdInput.value = '';
    DOM.taskDateInput.value = date || selectedDate;
    DOM.taskTitleInput.value = '';
    DOM.taskDescInput.value = '';
    if (DOM.taskFileInput) DOM.taskFileInput.value = '';
    if (DOM.taskFilesList) DOM.taskFilesList.innerHTML = '';
    
    if (user && user.role === 'admin') {
        DOM.assigneeGroup.classList.remove('hidden');
        DOM.taskAssigneeInput.value = user.username;
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5
    } else {
        DOM.assigneeGroup.classList.add('hidden');
    }

    const header = document.getElementById('modal-task-header');
<<<<<<< HEAD
    if (header) header.textContent = 'Thêm Công Việc Mới';
    openModal(DOM.modalTask);
}
=======
    if (header) header.textContent = 'Thêm Công Việc';
    openModal(DOM.modalTask);
};
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5

window.openEditTask = function(id) {
    const task = cachedSchedule.find(t => t.id === id);
    if (!task) return;
    
    const user = getCurrentUser();
    DOM.taskIdInput.value = task.id;
    DOM.taskDateInput.value = task.date;
    DOM.taskTitleInput.value = task.title;
    DOM.taskDescInput.value = task.description || '';
    if (DOM.taskFileInput) DOM.taskFileInput.value = '';
    if (DOM.taskFilesList) DOM.taskFilesList.innerHTML = '';
    
    if (user && user.role === 'admin') {
        DOM.assigneeGroup.classList.remove('hidden');
        DOM.taskAssigneeInput.value = task.userId || '';
    } else {
        DOM.assigneeGroup.classList.add('hidden');
    }

    const header = document.getElementById('modal-task-header');
    if (header) header.textContent = 'Sửa Công Việc';
    openModal(DOM.modalTask);
};

window.handleDeleteTask = async function(id) {
    if (!confirm('Xóa công việc này?')) return;
    try {
        await API.deleteScheduleTask(id);
        await loadScheduleData();
        renderSchedule();
    } catch (err) { showError(err.message); }
};

window.handleToggleTaskStatus = async function(id, isCompleted) {
    try {
        await API.updateScheduleTask(id, { status: isCompleted ? 'completed' : 'pending' });
        await loadScheduleData();
        renderSchedule();
    } catch (err) { showError(err.message); }
};

async function handleSaveTask() {
    const id = DOM.taskIdInput.value;
    const title = DOM.taskTitleInput.value.trim();
    const description = DOM.taskDescInput.value.trim();
    const date = DOM.taskDateInput.value;
    const user = getCurrentUser();
    let userId = user?.username;
    
    if (user && user.role === 'admin') {
        userId = DOM.taskAssigneeInput.value;
    }
    
    if (!title) { showError('Vui lòng nhập tiêu đề!'); return; }
    
    try {
        const payload = { title, description, date, userId };
        if (id) {
            await API.updateScheduleTask(id, payload);
        } else {
            await API.addScheduleTask(title, description, date, userId);
        }
        await loadScheduleData();
        closeAllModals();
        renderSchedule();
    } catch (err) { showError(err.message); }
}

// Xử lý upload files (giả lập đồng bộ Trello)
DOM.btnUploadFiles?.addEventListener('click', async () => {
    const files = DOM.taskFileInput?.files;
    if (!files || files.length === 0) {
        showError('Vui lòng chọn file cần upload!');
        return;
    }
    
    const fileList = [];
    for (let i = 0; i < files.length; i++) {
        const file = files[i];
        // Giả lập upload - trong thực tế sẽ gọi API upload lên server/Trello
        fileList.push({
            name: file.name,
            size: (file.size / 1024).toFixed(2) + ' KB',
            type: file.type
        });
    }
    
    // Hiển thị danh sách file đã upload
    if (DOM.taskFilesList) {
        DOM.taskFilesList.innerHTML = fileList.map(f => 
            `<span style="background: rgba(0,0,0,0.3); padding: 5px 10px; border-radius: 5px; font-size: 0.85em; display: inline-flex; align-items: center; gap: 5px;">
                📎 ${f.name} (${f.size})
            </span>`
        ).join('');
    }
    
    alert(`✅ Đã upload ${files.length} file(s). Files sẽ được đồng bộ lên Trello khi lưu công việc!`);
});

// ====== LOGIC: SAMPLE MANAGEMENT ======
async function renderSamplesTable() {
    const user = getCurrentUser();
    const tbody = DOM.samplesTableBody;
    if (!tbody) return;
    tbody.innerHTML = '';
    
    const isAdmin = user && user.role === 'admin';
    if (isAdmin) {
        DOM.sampleAdminColHead?.classList.remove('hidden');
    } else {
        DOM.sampleAdminColHead?.classList.add('hidden');
    }

    const searchKey = DOM.sampleSearchInput?.value.toLowerCase().trim() || '';
    const filtered = cachedSamples.filter(s => {
        const designId = s.designId || '';
        return designId.toLowerCase().includes(searchKey);
    });

    // Helper function to check if sample is expired
    function isExpired(expiryDate) {
        if (!expiryDate || expiryDate === 'N/A') return false;
        const today = new Date().toISOString().split('T')[0];
        return expiryDate < today;
    }

    filtered.forEach(s => {
        const tr = document.createElement('tr');
<<<<<<< HEAD
        const hasLink = s.productLink && s.productLink !== 'N/A';

        let statusCell = '';
        if (hasLink) {
            statusCell = `<a href="${s.productLink}" target="_blank" title="${s.productLink}" style="font-size: 1.4em; text-decoration: none; display:inline-flex; align-items:center;">🔗</a>`;
        } else if (s.status === 'Process') {
            if (isAdmin) {
                statusCell = `<button class="btn-small btn-primary btn-add-link" data-id="${s.id}" data-link="N/A">Add</button>`;
=======
        const statusClass = s.status === 'Process' ? 'tag-warning' : (s.status === 'Live' ? 'tag-success' : '');
        const expired = isExpired(s.expiryDate);
        
        let linkDisplay = '';
        if (s.productLink && s.productLink !== 'N/A' && !expired) {
            // Status is Live and not expired - show link
            linkDisplay = `<a href="${s.productLink}" target="_blank" title="${s.productLink}" style="font-size: 1.4em; text-decoration: none;">🔗</a>`;
        } else if (expired || s.status === 'Process') {
            // Expired or Process - show button based on role
            if (isAdmin) {
                linkDisplay = `<button class="btn-small btn-primary btn-add-link" data-id="${s.id}" data-link="${s.productLink || 'N/A'}">➕ Add</button>`;
            } else {
                // User role - show Request button
                linkDisplay = `<button class="btn-small btn-warning btn-request-link" data-id="${s.id}">📩 Request</button>`;
            }
        } else {
            // Fallback
            if (isAdmin) {
                linkDisplay = `<button class="btn-small btn-primary btn-add-link" data-id="${s.id}" data-link="${s.productLink || 'N/A'}">➕ Add</button>`;
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5
            } else {
                statusCell = `<span class="tag tag-warning">Process</span>`;
            }
        } else {
            const statusClass = s.status === 'Live' ? 'tag-success' : '';
            statusCell = `<span class="tag ${statusClass}">${s.status}</span>`;
        }

        let adminActions = '';
        if (isAdmin) {
            adminActions = `
                <td>
                    <button class="btn-small btn-edit btn-edit-sample" data-id="${s.id}" data-link="${s.productLink || 'N/A'}">Sửa Link</button>
                    <button class="btn-small btn-danger btn-delete-sample" data-id="${s.id}">Xóa</button>
                </td>
            `;
        } else if (user && s.requester === user.username) {
             adminActions = `<td><button class="btn-small btn-danger btn-delete-sample" data-id="${s.id}">Xóa</button></td>`;
        }

        tr.innerHTML = `
            <td><span class="date-text">${s.requestDate}</span></td>
            <td style="font-weight:600; color:var(--accent-color);">${s.designId}</td>
            <td>${s.requester}</td>
<<<<<<< HEAD
            <td>${statusCell}</td>
            <td>${s.expiryDate}</td>
=======
            <td><span class="tag ${statusClass}">${expired ? 'Hết Hạn' : s.status}</span></td>
            <td style="max-width:250px; overflow:hidden; text-overflow:ellipsis;">${linkDisplay}</td>
            <td>${expired ? '<span style="color:red;font-weight:bold;">' + s.expiryDate + '</span>' : s.expiryDate}</td>
>>>>>>> 97347c7485447e9b7f22ddb11596ea83d8fed2a5
            ${isAdmin || (user && s.requester === user.username) ? adminActions : ''}
        `;
        
        tbody.appendChild(tr);
    });
}

async function handleAddSample(e) {
    if (e) e.preventDefault();
    const designId = DOM.sampleDesignIdInput.value.trim();
    if (!designId) return;
    try {
        await API.addSample(designId);
        DOM.sampleDesignIdInput.value = '';
        alert('✅ Gửi yêu cầu thành công!');
        cachedSamples = await API.getSamples();
        renderSamplesTable();
    } catch (err) { showError(err.message); }
}

window.handleEditSampleLink = function(id, currentLink) {
    const isAdd = !currentLink || currentLink === 'N/A';
    DOM.modalSampleLinkHeader.textContent = isAdd ? 'Thêm Link Sản Phẩm' : 'Sửa Link Sản Phẩm';
    DOM.editSampleId.value = id;
    DOM.editSampleLinkUrl.value = isAdd ? '' : currentLink;
    openModal(DOM.modalEditSampleLink);
    setTimeout(() => DOM.editSampleLinkUrl.focus(), 100);
};

window.handleDeleteSample = function(id) {
    const sample = cachedSamples.find(s => s.id === id);
    const label = sample ? `mẫu "${sample.designId}"` : 'yêu cầu này';
    DOM.confirmDeleteId.value = id;
    DOM.confirmDeleteMsg.textContent = `Bạn có chắc muốn xóa ${label}? Hành động này không thể hoàn tác.`;
    openModal(DOM.modalConfirmDelete);
};

window.handleRequestLink = async function(id) {
    if (!confirm('Bạn có chắc muốn gửi yêu cầu cấp link mới cho mẫu này?')) return;
    try {
        await API.requestLink(id);
        alert('✅ Yêu cầu đã được gửi thành công! Admin sẽ xem xét và thêm link sớm.');
        cachedSamples = await API.getSamples();
        renderSamplesTable();
    } catch (err) { showError(err.message); }
};

// Start app
async function init() {
    const user = getCurrentUser();
    const token = localStorage.getItem('lm_token');

    if (user && token) {
        showDashboard(user);
        await Promise.all([loadAppData(), loadSalesData()]);
    } else {
        logout();
        showLogin();
    }

    setupEventListeners();
    setupGeneralManagementListeners();
    setupSalesListeners();

    const today = new Date().toISOString().split('T')[0];
    DOM.linkDateInput.value = today;
    document.getElementById('sales-date').value = today;
}

init();

// ====== FINANCE MODULE ======
let financeEditingId = null;

const FinanceDOM = {
    get date()              { return document.getElementById('fin-date'); },
    get fulfillmentCost()   { return document.getElementById('fin-fulfillment-cost'); },
    get fulfillmentNote()   { return document.getElementById('fin-fulfillment-note'); },
    get otherCost()         { return document.getElementById('fin-other-cost'); },
    get otherNote()         { return document.getElementById('fin-other-note'); },
    get payment()           { return document.getElementById('fin-payment'); },
    get paymentNote()       { return document.getElementById('fin-payment-note'); },
    get btnSave()           { return document.getElementById('btn-save-finance'); },
    get btnCancel()         { return document.getElementById('btn-cancel-finance-edit'); },
    get formTitle()         { return document.getElementById('finance-form-title'); },
    get msg()               { return document.getElementById('finance-form-msg'); },
    get tbody()             { return document.getElementById('finance-table-body'); },
    get filterMonth()       { return document.getElementById('fin-filter-month'); },
    get monthlySummary()    { return document.getElementById('finance-monthly-summary'); },
    get adminActions()      { return document.getElementById('finance-form-admin-actions'); },
    get formPanel()         { return document.getElementById('finance-form-panel'); },
};

function finFmt(val) {
    const n = parseFloat(val) || 0;
    return n === 0 ? '-' : '$' + n.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function finColor(val) {
    const n = parseFloat(val) || 0;
    if (n > 0) return 'color:#34d399;';
    if (n < 0) return 'color:#f87171;';
    return 'color:var(--text-secondary);';
}

function finGetMonthKey(dateStr) {
    if (!dateStr) return '';
    return dateStr.substring(0, 7);
}

function finGetMonthLabel(key) {
    if (!key) return '';
    const [y, m] = key.split('-');
    const months = ['Tháng 1', 'Tháng 2', 'Tháng 3', 'Tháng 4', 'Tháng 5', 'Tháng 6',
                    'Tháng 7', 'Tháng 8', 'Tháng 9', 'Tháng 10', 'Tháng 11', 'Tháng 12'];
    return `${months[parseInt(m, 10) - 1]} ${y}`;
}

function renderFinanceTab() {
    const user = getCurrentUser();
    const isAdmin = user && user.role === 'admin';

    if (FinanceDOM.formPanel) {
        FinanceDOM.formPanel.style.display = isAdmin ? '' : 'none';
    }

    document.querySelectorAll('.finance-admin-col').forEach(el => {
        el.classList.toggle('hidden', !isAdmin);
    });

    finPopulateMonthFilter();
    renderFinanceMonthlySummary();
    renderFinanceTable();

    if (isAdmin) {
        FinanceDOM.btnSave.onclick = finSaveEntry;
        FinanceDOM.btnCancel.onclick = finCancelEdit;
        FinanceDOM.filterMonth.onchange = renderFinanceTable;

        if (!FinanceDOM.date.value) {
            FinanceDOM.date.value = new Date().toISOString().split('T')[0];
        }
    } else {
        FinanceDOM.filterMonth.onchange = renderFinanceTable;
    }
}

function finPopulateMonthFilter() {
    const select = FinanceDOM.filterMonth;
    if (!select) return;
    const months = [...new Set(cachedFinance.map(e => finGetMonthKey(e.date)))].sort().reverse();
    const current = select.value;
    select.innerHTML = '<option value="">Tất cả tháng</option>' +
        months.map(m => `<option value="${m}" ${m === current ? 'selected' : ''}>${finGetMonthLabel(m)}</option>`).join('');
}

function finGetFilteredEntries() {
    const month = FinanceDOM.filterMonth ? FinanceDOM.filterMonth.value : '';
    if (!month) return cachedFinance;
    return cachedFinance.filter(e => finGetMonthKey(e.date) === month);
}

function renderFinanceMonthlySummary() {
    const container = FinanceDOM.monthlySummary;
    if (!container) return;

    const byMonth = {};
    cachedFinance.forEach(e => {
        const key = finGetMonthKey(e.date);
        if (!byMonth[key]) byMonth[key] = { fulfillment: 0, other: 0, payment: 0 };
        byMonth[key].fulfillment += parseFloat(e.fulfillment_cost) || 0;
        byMonth[key].other       += parseFloat(e.other_cost) || 0;
        byMonth[key].payment     += parseFloat(e.payment) || 0;
    });

    const months = Object.keys(byMonth).sort().reverse();
    if (months.length === 0) {
        container.innerHTML = '';
        return;
    }

    const cards = months.map(key => {
        const d = byMonth[key];
        const profit = d.payment - d.fulfillment - d.other;
        return `
        <div class="glass-panel" style="flex:1; min-width:220px; padding: 16px 20px;">
            <div style="font-size:0.8em; color:var(--text-secondary); font-weight:600; text-transform:uppercase; margin-bottom:10px; letter-spacing:0.5px;">${finGetMonthLabel(key)}</div>
            <div style="display:flex; flex-direction:column; gap:6px;">
                <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                    <span style="color:var(--text-secondary);">Fulfillment</span>
                    <span style="color:#f87171; font-weight:600;">${finFmt(d.fulfillment)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                    <span style="color:var(--text-secondary);">Chi Phí Khác</span>
                    <span style="color:#f87171; font-weight:600;">${finFmt(d.other)}</span>
                </div>
                <div style="display:flex; justify-content:space-between; font-size:0.9em;">
                    <span style="color:var(--text-secondary);">Payment</span>
                    <span style="color:#34d399; font-weight:600;">${finFmt(d.payment)}</span>
                </div>
                <div style="border-top:1px solid rgba(255,255,255,0.08); margin-top:6px; padding-top:8px; display:flex; justify-content:space-between; font-size:1em;">
                    <span style="font-weight:600;">Lợi Nhuận</span>
                    <span style="font-weight:700; ${finColor(profit)}">${finFmt(profit)}</span>
                </div>
            </div>
        </div>`;
    }).join('');

    container.innerHTML = `
        <h3 style="margin-bottom:14px;">Tổng Hợp Theo Tháng</h3>
        <div style="display:flex; flex-wrap:wrap; gap:16px;">${cards}</div>
    `;
}

function renderFinanceTable() {
    const tbody = FinanceDOM.tbody;
    if (!tbody) return;
    const user = getCurrentUser();
    const isAdmin = user && user.role === 'admin';
    const entries = finGetFilteredEntries();

    if (entries.length === 0) {
        tbody.innerHTML = `<tr><td colspan="9" style="text-align:center;color:var(--text-secondary);padding:24px;">Chưa có dữ liệu thu chi...</td></tr>`;
        return;
    }

    tbody.innerHTML = entries.map(e => {
        const profit = (parseFloat(e.payment) || 0) - (parseFloat(e.fulfillment_cost) || 0) - (parseFloat(e.other_cost) || 0);
        const adminActions = isAdmin ? `
            <td class="finance-admin-col" style="text-align:center; white-space:nowrap;">
                <button class="btn-icon-sm" onclick="finStartEdit('${e.id}')" title="Sửa" style="margin-right:4px;">✏️</button>
                <button class="btn-icon-sm btn-danger-sm" onclick="finDeleteEntry('${e.id}')" title="Xóa">🗑️</button>
            </td>` : `<td class="finance-admin-col hidden"></td>`;

        return `<tr>
            <td style="white-space:nowrap; font-size:0.88em;">${e.date}</td>
            <td style="white-space:nowrap; text-align:right; color:#f87171; font-weight:600;">${finFmt(e.fulfillment_cost)}</td>
            <td style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary); font-size:0.88em;" title="${e.fulfillment_note || ''}">${e.fulfillment_note || '<span style="opacity:0.4">—</span>'}</td>
            <td style="white-space:nowrap; text-align:right; color:#f87171; font-weight:600;">${finFmt(e.other_cost)}</td>
            <td style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary); font-size:0.88em;" title="${e.other_note || ''}">${e.other_note || '<span style="opacity:0.4">—</span>'}</td>
            <td style="white-space:nowrap; text-align:right; color:#34d399; font-weight:600;">${finFmt(e.payment)}</td>
            <td style="overflow:hidden; text-overflow:ellipsis; white-space:nowrap; color:var(--text-secondary); font-size:0.88em;" title="${e.payment_note || ''}">${e.payment_note || '<span style="opacity:0.4">—</span>'}</td>
            <td style="white-space:nowrap; text-align:right; font-weight:700; ${finColor(profit)}">${finFmt(profit)}</td>
            ${adminActions}
        </tr>`;
    }).join('');
}

function finClearForm() {
    FinanceDOM.date.value = new Date().toISOString().split('T')[0];
    FinanceDOM.fulfillmentCost.value = '';
    FinanceDOM.fulfillmentNote.value = '';
    FinanceDOM.otherCost.value = '';
    FinanceDOM.otherNote.value = '';
    FinanceDOM.payment.value = '';
    FinanceDOM.paymentNote.value = '';
    FinanceDOM.msg.textContent = '';
    FinanceDOM.msg.style.color = '';
}

function finShowMsg(text, isError = false) {
    const el = FinanceDOM.msg;
    if (!el) return;
    el.textContent = text;
    el.style.color = isError ? '#ef4444' : '#34d399';
    if (!isError) setTimeout(() => { el.textContent = ''; }, 3000);
}

async function finSaveEntry() {
    const date = FinanceDOM.date.value;
    if (!date) { finShowMsg('Vui lòng chọn ngày!', true); return; }

    const data = {
        date,
        fulfillment_cost: parseFloat(FinanceDOM.fulfillmentCost.value) || 0,
        fulfillment_note: FinanceDOM.fulfillmentNote.value.trim(),
        other_cost:       parseFloat(FinanceDOM.otherCost.value) || 0,
        other_note:       FinanceDOM.otherNote.value.trim(),
        payment:          parseFloat(FinanceDOM.payment.value) || 0,
        payment_note:     FinanceDOM.paymentNote.value.trim(),
    };

    try {
        FinanceDOM.btnSave.disabled = true;
        if (financeEditingId) {
            await API.updateFinance(financeEditingId, data);
            finShowMsg('Đã cập nhật bản ghi!');
        } else {
            await API.addFinance(data);
            finShowMsg('Đã thêm bản ghi!');
        }
        cachedFinance = await API.getFinance();
        finCancelEdit();
        finPopulateMonthFilter();
        renderFinanceMonthlySummary();
        renderFinanceTable();
    } catch (err) {
        finShowMsg('Lỗi: ' + err.message, true);
    } finally {
        FinanceDOM.btnSave.disabled = false;
    }
}

function finStartEdit(id) {
    const entry = cachedFinance.find(e => e.id === id);
    if (!entry) return;
    financeEditingId = id;
    FinanceDOM.date.value              = entry.date;
    FinanceDOM.fulfillmentCost.value   = entry.fulfillment_cost || '';
    FinanceDOM.fulfillmentNote.value   = entry.fulfillment_note || '';
    FinanceDOM.otherCost.value         = entry.other_cost || '';
    FinanceDOM.otherNote.value         = entry.other_note || '';
    FinanceDOM.payment.value           = entry.payment || '';
    FinanceDOM.paymentNote.value       = entry.payment_note || '';
    FinanceDOM.formTitle.textContent   = 'Sửa Bản Ghi Thu Chi';
    FinanceDOM.btnSave.textContent     = 'Cập Nhật';
    FinanceDOM.btnCancel.classList.remove('hidden');
    FinanceDOM.formPanel.scrollIntoView({ behavior: 'smooth', block: 'start' });
}

function finCancelEdit() {
    financeEditingId = null;
    FinanceDOM.formTitle.textContent = 'Thêm Bản Ghi Thu Chi';
    FinanceDOM.btnSave.textContent   = 'Lưu Bản Ghi';
    FinanceDOM.btnCancel.classList.add('hidden');
    finClearForm();
}

async function finDeleteEntry(id) {
    if (!confirm('Xác nhận xóa bản ghi này?')) return;
    try {
        await API.deleteFinance(id);
        cachedFinance = await API.getFinance();
        finPopulateMonthFilter();
        renderFinanceMonthlySummary();
        renderFinanceTable();
    } catch (err) {
        alert('Lỗi xóa: ' + err.message);
    }
}

