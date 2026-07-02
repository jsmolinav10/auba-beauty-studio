/**
 * AUBA Beauty Studio - Admin Dashboard
 * Panel de administración con gestión de reservas, servicios y usuarios
 */

const AdminApp = {
    // BUG-12 FIX: Detectar origin dinámicamente
    API_BASE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')) ? window.location.origin + '/api' : 'https://auba-beauty-studio.onrender.com/api',
    SESSION_KEY: 'auba_admin_session',
    TOKEN_KEY: 'auba_admin_token',
    currentSection: 'dashboard',

    // ============================================
    // INITIALIZATION
    // ============================================

    init() {
        this.checkAuth();
        this.setupEventListeners();
        this.setupNavigation();
    },

    checkAuth() {
        const session = this.getSession();
        if (session && session.role === 'admin') {
            this.showDashboard();
            this.loadDashboardData();
        } else {
            this.showLogin();
        }
    },

    getSession() {
        try {
            return JSON.parse(localStorage.getItem(this.SESSION_KEY));
        } catch {
            return null;
        }
    },

    setSession(data) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(data));
    },

    clearSession() {
        localStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem(this.TOKEN_KEY);
    },

    // Auth fetch wrapper: agrega Authorization header automáticamente
    async authFetch(url, options = {}) {
        const token = localStorage.getItem(this.TOKEN_KEY);
        if (!options.headers) options.headers = {};
        if (token) options.headers['Authorization'] = `Bearer ${token}`;
        if (!options.headers['Content-Type'] && options.body) {
            options.headers['Content-Type'] = 'application/json';
        }
        const response = await fetch(url, options);
        if (response.status === 401) {
            this.clearSession();
            this.showLoginScreen();
            throw new Error('Sesión expirada');
        }
        return response;
    },

    // ============================================
    // EVENT LISTENERS
    // ============================================

    setupEventListeners() {
        // Login form
        document.getElementById('admin-login-form').addEventListener('submit', (e) => {
            e.preventDefault();
            this.handleLogin();
        });

        // Logout
        document.getElementById('btn-logout').addEventListener('click', () => {
            this.handleLogout();
        });

        // Mobile menu toggle
        document.getElementById('menu-toggle').addEventListener('click', () => {
            document.getElementById('sidebar').classList.toggle('open');
        });

        // Filters
        document.getElementById('filter-date')?.addEventListener('change', () => this.loadBookings());
        document.getElementById('filter-status')?.addEventListener('change', () => this.loadBookings());
        document.getElementById('search-users')?.addEventListener('input', (e) => this.searchUsers(e.target.value));
    },

    setupNavigation() {
        document.querySelectorAll('.nav-item').forEach(item => {
            item.addEventListener('click', (e) => {
                e.preventDefault();
                const section = item.dataset.section;
                this.navigateTo(section);
            });
        });
    },

    navigateTo(section) {
        // Update active nav
        document.querySelectorAll('.nav-item').forEach(n => n.classList.remove('active'));
        document.querySelector(`[data-section="${section}"]`).classList.add('active');

        // Hide all sections
        document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));

        // Show target section
        document.getElementById(`${section}-section`).classList.remove('hidden');

        // Update title
        const titles = {
            dashboard: 'Dashboard',
            bookings: 'Reservas',
            services: 'Servicios',
            manicurists: 'Manicuristas',
            users: 'Clientes'
        };
        document.getElementById('section-title').textContent = titles[section] || 'Dashboard';

        // Load section data
        this.currentSection = section;
        this.loadSectionData(section);

        // Close mobile menu
        document.getElementById('sidebar').classList.remove('open');
    },

    loadSectionData(section) {
        switch (section) {
            case 'dashboard':
                this.loadDashboardData();
                break;
            case 'bookings':
                this.loadBookings();
                break;
            case 'services':
                this.loadServices();
                break;
            case 'manicurists':
                this.loadManicurists();
                break;
            case 'users':
                this.loadUsers();
                break;
        }
    },

    // ============================================
    // AUTHENTICATION
    // ============================================

    showLogin() {
        document.getElementById('login-section').classList.remove('hidden');
        document.querySelectorAll('.content-section').forEach(s => s.classList.add('hidden'));
        document.querySelector('.sidebar').classList.add('hidden');
    },

    showDashboard() {
        document.getElementById('login-section').classList.add('hidden');
        document.getElementById('dashboard-section').classList.remove('hidden');
        document.querySelector('.sidebar').classList.remove('hidden');

        const session = this.getSession();
        if (session) {
            document.getElementById('admin-name').textContent = session.name || 'Admin';
        }
    },

    async handleLogin() {
        const phone = document.getElementById('admin-phone').value;
        const password = document.getElementById('admin-password').value;
        const errorEl = document.getElementById('login-error');

        try {
            const response = await fetch(`${this.API_BASE}/auth/admin/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });

            const data = await response.json();

            if (data.success) {
                if (data.token) localStorage.setItem(this.TOKEN_KEY, data.token);
                this.setSession({ ...data.user, role: 'admin' });
                this.showDashboard();
                this.loadDashboardData();
            } else {
                errorEl.textContent = data.error || 'Credenciales inválidas';
                errorEl.classList.remove('hidden');
            }
        } catch (error) {
            errorEl.textContent = 'Error de conexión';
            errorEl.classList.remove('hidden');
        }
    },

    handleLogout() {
        this.clearSession();
        this.showLogin();
    },

    // ============================================
    // DASHBOARD DATA
    // ============================================

    async loadDashboardData() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/stats`);
            const stats = await response.json();

            document.getElementById('stat-bookings-today').textContent = stats.bookingsToday || 0;
            document.getElementById('stat-bookings-week').textContent = stats.bookingsWeek || 0;
            document.getElementById('stat-total-users').textContent = stats.totalUsers || 0;
            document.getElementById('stat-revenue-month').textContent = this.formatPrice(stats.revenueMonth || 0);

            // Load upcoming bookings
            this.loadUpcomingBookings();
        } catch (error) {
            console.error('Error loading stats:', error);
        }
    },

    async loadUpcomingBookings() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/bookings/upcoming`);
            const bookings = await response.json();

            const container = document.getElementById('upcoming-bookings');

            if (bookings.length === 0) {
                container.innerHTML = '<p class="empty-text">No hay citas próximas</p>';
                return;
            }

            container.innerHTML = bookings.slice(0, 5).map(b => `
                <div class="booking-item">
                    <div class="booking-info">
                        <strong>${b.client_name}</strong>
                        <span>${b.service_title}</span>
                    </div>
                    <div class="booking-time">
                        <span>${this.formatDate(b.booking_date)}</span>
                        <span>${b.booking_time?.substring(0, 5)}</span>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading upcoming bookings:', error);
        }
    },

    // ============================================
    // BOOKINGS MANAGEMENT
    // ============================================

    async loadBookings() {
        try {
            const date = document.getElementById('filter-date').value;
            const status = document.getElementById('filter-status').value;

            let url = `${this.API_BASE}/admin/bookings?`;
            if (date) url += `date=${date}&`;
            if (status) url += `status=${status}`;

            const response = await this.authFetch(url);
            const bookings = await response.json();

            const tbody = document.getElementById('bookings-tbody');
            tbody.innerHTML = bookings.map(b => `
                <tr>
                    <td>${b.id}</td>
                    <td>${b.client_name}<br><small>${b.client_phone}</small></td>
                    <td>${b.service_title}</td>
                    <td>${b.manicurist_name}</td>
                    <td>${this.formatDate(b.booking_date)}</td>
                    <td>${b.booking_time?.substring(0, 5)}</td>
                    <td><span class="status-badge status-${b.status}">${this.getStatusLabel(b.status)}</span></td>
                    <td>
                        <button class="btn-icon" onclick="AdminApp.updateBookingStatus(${b.id}, 'confirmed')">✓</button>
                        <button class="btn-icon" onclick="AdminApp.updateBookingStatus(${b.id}, 'cancelled')">✕</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error loading bookings:', error);
        }
    },

    async updateBookingStatus(id, status) {
        try {
            await this.authFetch(`${this.API_BASE}/admin/bookings/${id}/status`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ status })
            });
            this.loadBookings();
        } catch (error) {
            console.error('Error updating booking:', error);
        }
    },

    // ============================================
    // SERVICES MANAGEMENT
    // ============================================

    async loadServices() {
        try {
            const response = await fetch(`${this.API_BASE}/services`);
            const services = await response.json();

            const tbody = document.getElementById('services-tbody');
            tbody.innerHTML = services.map(s => `
                <tr>
                    <td>${s.id}</td>
                    <td>${s.title}</td>
                    <td>${s.description || '-'}</td>
                    <td>${this.formatPrice(s.price)}</td>
                    <td>${s.duration || 60} min</td>
                    <td>
                        <button class="btn-icon" onclick="AdminApp.editService(${s.id})">✏️</button>
                        <button class="btn-icon" onclick="AdminApp.deleteService(${s.id})">🗑️</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error loading services:', error);
        }
    },

    showServiceModal(service = null) {
        const modal = document.getElementById('edit-modal');
        const title = document.getElementById('modal-title');
        const fields = document.getElementById('modal-fields');

        title.textContent = service ? 'Editar Servicio' : 'Nuevo Servicio';
        fields.innerHTML = `
            <input type="hidden" id="edit-id" value="${service?.id || ''}" />
            <div class="form-group">
                <label>Título</label>
                <input type="text" id="edit-title" value="${service?.title || ''}" required />
            </div>
            <div class="form-group">
                <label>Descripción</label>
                <textarea id="edit-description">${service?.description || ''}</textarea>
            </div>
            <div class="form-row">
                <div class="form-group">
                    <label>Precio (COP)</label>
                    <input type="number" id="edit-price" value="${service?.price || ''}" required />
                </div>
                <div class="form-group">
                    <label>Duración (min)</label>
                    <input type="number" id="edit-duration" value="${service?.duration || 60}" />
                </div>
            </div>
        `;

        document.getElementById('edit-form').onsubmit = (e) => {
            e.preventDefault();
            this.saveService();
        };

        modal.classList.remove('hidden');
    },

    async saveService() {
        const id = document.getElementById('edit-id').value;
        const data = {
            title: document.getElementById('edit-title').value,
            description: document.getElementById('edit-description').value,
            price: parseFloat(document.getElementById('edit-price').value),
            duration: parseInt(document.getElementById('edit-duration').value)
        };

        try {
            const url = id ? `${this.API_BASE}/admin/services/${id}` : `${this.API_BASE}/admin/services`;
            const method = id ? 'PUT' : 'POST';

            await this.authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            this.closeModal();
            this.loadServices();
        } catch (error) {
            console.error('Error saving service:', error);
        }
    },

    async editService(id) {
        try {
            const response = await fetch(`${this.API_BASE}/services`);
            const services = await response.json();
            const service = services.find(s => s.id === id);
            if (service) this.showServiceModal(service);
        } catch (error) {
            console.error('Error:', error);
        }
    },

    async deleteService(id) {
        if (!confirm('¿Estás seguro de eliminar este servicio?')) return;

        try {
            await this.authFetch(`${this.API_BASE}/admin/services/${id}`, { method: 'DELETE' });
            this.loadServices();
        } catch (error) {
            console.error('Error deleting service:', error);
        }
    },

    // ============================================
    // MANICURISTS MANAGEMENT
    // ============================================

    async loadManicurists() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/manicurists`);
            const manicurists = await response.json();

            const grid = document.getElementById('manicurists-grid');
            grid.innerHTML = manicurists.map(m => `
                <div class="manicurist-card">
                    <div class="manicurist-avatar">${m.name.charAt(0)}</div>
                    <h4>${m.name}</h4>
                    <p>${m.specialty || 'Especialista'}</p>
                    <p class="phone">${m.phone}</p>
                    <span class="status-badge status-${m.available ? 'confirmed' : 'cancelled'}">
                        ${m.available ? 'Disponible' : 'No disponible'}
                    </span>
                    <div class="card-actions">
                        <button class="btn-icon" onclick="AdminApp.editManicurist(${m.id})" title="Editar">✏️</button>
                        <button class="btn-icon" onclick="AdminApp.toggleManicuristAvailability(${m.id}, ${!m.available})" title="Disponibilidad">
                            ${m.available ? '🚫' : '✓'}
                        </button>
                        <button class="btn-icon" onclick="AdminApp.resetManicuristPassword(${m.id})" title="Resetear Contraseña a auba2026">🔄</button>
                        <button class="btn-icon" onclick="AdminApp.deleteManicurist(${m.id})" title="Eliminar">🗑️</button>
                    </div>
                </div>
            `).join('');
        } catch (error) {
            console.error('Error loading manicurists:', error);
        }
    },

    async toggleManicuristAvailability(id, available) {
        try {
            await this.authFetch(`${this.API_BASE}/admin/manicurists/${id}/availability`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ available })
            });
            this.loadManicurists();
        } catch (error) {
            console.error('Error:', error);
        }
    },

    showManicuristModal(manicurist = null) {
        const modal = document.getElementById('edit-modal');
        const title = document.getElementById('modal-title');
        const fields = document.getElementById('modal-fields');

        title.textContent = manicurist ? 'Editar Manicurista' : 'Nueva Manicurista';
        fields.innerHTML = `
            <input type="hidden" id="edit-id" value="${manicurist?.id || ''}" />
            <div class="form-group">
                <label>Nombre completo</label>
                <input type="text" id="edit-name" value="${manicurist?.name || ''}" required />
            </div>
            <div class="form-group">
                <label>Teléfono</label>
                <input type="tel" id="edit-phone" value="${manicurist?.phone || ''}" placeholder="3001234567" required />
            </div>
            <div class="form-group">
                <label>Especialidad</label>
                <input type="text" id="edit-specialty" value="${manicurist?.specialty || ''}" placeholder="Ej: Especialista en Nail Art" />
            </div>
            ${!manicurist ? `
            <div class="form-group">
                <label>Contraseña inicial</label>
                <input type="password" id="edit-password" placeholder="Contraseña para acceso al portal" required />
            </div>
            ` : ''}
        `;

        document.getElementById('edit-form').onsubmit = (e) => {
            e.preventDefault();
            this.saveManicurist();
        };

        modal.classList.remove('hidden');
    },

    async saveManicurist() {
        const id = document.getElementById('edit-id').value;
        const data = {
            name: document.getElementById('edit-name').value,
            phone: document.getElementById('edit-phone').value,
            specialty: document.getElementById('edit-specialty').value
        };

        // Solo incluir contraseña si es nueva manicurista
        const passwordField = document.getElementById('edit-password');
        if (passwordField && passwordField.value) {
            data.password = passwordField.value;
        }

        try {
            const url = id ? `${this.API_BASE}/admin/manicurists/${id}` : `${this.API_BASE}/admin/manicurists`;
            const method = id ? 'PUT' : 'POST';

            const response = await this.authFetch(url, {
                method,
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(data)
            });

            const result = await response.json();

            if (result.success) {
                this.closeModal();
                this.loadManicurists();
                alert(id ? 'Manicurista actualizada correctamente' : 'Manicurista creada correctamente');
            } else {
                alert('Error: ' + (result.error || 'No se pudo guardar'));
            }
        } catch (error) {
            console.error('Error saving manicurist:', error);
            alert('Error de conexión');
        }
    },

    async editManicurist(id) {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/manicurists`);
            const manicurists = await response.json();
            const manicurist = manicurists.find(m => m.id === id);
            if (manicurist) this.showManicuristModal(manicurist);
        } catch (error) {
            console.error('Error:', error);
        }
    },

    async deleteManicurist(id) {
        if (!confirm('¿Estás seguro de eliminar esta manicurista? Esta acción no se puede deshacer.')) return;

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/manicurists/${id}`, { method: 'DELETE' });
            const result = await response.json();

            if (result.success) {
                this.loadManicurists();
            } else {
                alert('Error: ' + (result.error || 'No se pudo eliminar'));
            }
        } catch (error) {
            console.error('Error deleting manicurist:', error);
        }
    },

    async resetManicuristPassword(id) {
        if (!confirm('¿Estás seguro de resetear la contraseña de esta manicurista a "auba2026"?')) return;

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/manicurists/${id}/reset-password`, { method: 'PUT' });
            const result = await response.json();

            if (result.success) {
                alert('Contraseña restablecida a: auba2026');
            } else {
                alert('Error: ' + (result.error || 'No se pudo restablecer la contraseña'));
            }
        } catch (error) {
            console.error('Error resetting manicurist password:', error);
            alert('Error de conexión');
        }
    },

    // ============================================
    // USERS MANAGEMENT
    // ============================================

    async loadUsers() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/users`);
            const users = await response.json();

            const tbody = document.getElementById('users-tbody');
            tbody.innerHTML = users.map(u => `
                <tr>
                    <td>${u.id}</td>
                    <td>${u.name}</td>
                    <td>${u.phone}</td>
                    <td>${u.email || '-'}</td>
                    <td>${this.formatDate(u.created_at)}</td>
                    <td>${u.booking_count || 0}</td>
                    <td>
                        <button class="btn-icon" onclick="AdminApp.resetUserPassword(${u.id})" title="Resetear Contraseña a auba2026">🔄</button>
                    </td>
                </tr>
            `).join('');
        } catch (error) {
            console.error('Error loading users:', error);
        }
    },

    searchUsers(query) {
        const rows = document.querySelectorAll('#users-tbody tr');
        rows.forEach(row => {
            const text = row.textContent.toLowerCase();
            row.style.display = text.includes(query.toLowerCase()) ? '' : 'none';
        });
    },

    async resetUserPassword(id) {
        if (!confirm('¿Estás seguro de resetear la contraseña de este cliente a "auba2026"?')) return;

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/users/${id}/reset-password`, { method: 'PUT' });
            const result = await response.json();

            if (result.success) {
                alert('Contraseña restablecida a: auba2026');
            } else {
                alert('Error: ' + (result.error || 'No se pudo restablecer la contraseña'));
            }
        } catch (error) {
            console.error('Error resetting user password:', error);
            alert('Error de conexión');
        }
    },

    // ============================================
    // ACTIONS
    // ============================================

    async sendReminders() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/notifications/send-reminders`, {
                method: 'POST'
            });
            const result = await response.json();
            alert(`Se enviaron ${result.sent || 0} recordatorios`);
        } catch (error) {
            console.error('Error sending reminders:', error);
            alert('Error enviando recordatorios');
        }
    },

    exportBookings() {
        // Simple CSV export
        const table = document.getElementById('bookings-table');
        if (!table) return;

        let csv = [];
        const rows = table.querySelectorAll('tr');
        rows.forEach(row => {
            const cols = row.querySelectorAll('td, th');
            const rowData = Array.from(cols).map(col => `"${col.innerText.replace(/\n/g, ' ')}"`);
            csv.push(rowData.join(','));
        });

        const blob = new Blob([csv.join('\n')], { type: 'text/csv' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `reservas_${new Date().toISOString().split('T')[0]}.csv`;
        a.click();
    },

    closeModal() {
        document.getElementById('edit-modal').classList.add('hidden');
    },

    // ============================================
    // UTILITIES
    // ============================================

    formatPrice(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount);
    },

    formatDate(dateStr) {
        if (!dateStr) return '-';
        const date = new Date(dateStr);
        return date.toLocaleDateString('es-CO', { day: '2-digit', month: 'short' });
    },

    getStatusLabel(status) {
        const labels = {
            pending: 'Pendiente',
            confirmed: 'Confirmada',
            completed: 'Completada',
            cancelled: 'Cancelada'
        };
        return labels[status] || status;
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => AdminApp.init());
