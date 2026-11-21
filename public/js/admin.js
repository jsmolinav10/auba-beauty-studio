/**
 * AUBA Beauty Studio - Admin Dashboard
 * Panel de administración con gestión de reservas, servicios y usuarios
 */

const AdminApp = {
    // BUG-12 FIX: Detectar origin dinámicamente
    API_BASE: (window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.')) ? window.location.origin + '/api' : '/api',
    SESSION_KEY: 'auba_admin_session',
    TOKEN_KEY: 'auba_admin_token',
    currentSection: 'dashboard',
    calendarYear: new Date().getFullYear(),
    calendarMonth: new Date().getMonth() + 1,
    calendarSelectedDate: null,

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
            this.showLogin();
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

        // Security settings form
        const securityForm = document.getElementById('security-form');
        if (securityForm) {
            securityForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.saveSecuritySettings();
            });
        }
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
            calendar: 'Calendario',
            services: 'Servicios',
            manicurists: 'Manicuristas',
            users: 'Clientes',
            security: 'Seguridad'
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
            case 'calendar':
                this.loadCalendar();
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
            case 'security':
                this.loadSecuritySettings();
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
            this.loadRestRequests();
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

            container.innerHTML = bookings.slice(0, 5).map(b => {
                const dateFmt = this.formatDate(b.booking_date);
                const timeStr = b.booking_time?.substring(0, 5) || '';
                return `
                <div class="booking-item">
                    <div class="booking-info">
                        <strong>${b.client_name}</strong>
                        <span>${b.service_title}</span>
                    </div>
                    <div class="booking-time" style="display:flex; align-items:center; gap:10px;">
                        <div>
                            <span style="display:block;">${dateFmt}</span>
                            <span style="display:block;">${timeStr}</span>
                        </div>
                        <button class="btn-icon" style="color:#25D366; font-size:1.2rem;" onclick="AdminApp.sendWhatsAppReminder('${b.client_name}', '${b.client_phone}', '${dateFmt}', '${timeStr}', '${b.service_title}', '${b.manicurist_name}')" title="Enviar Recordatorio por WhatsApp">📱</button>
                    </div>
                </div>
            `}).join('');
        } catch (error) {
            console.error('Error loading upcoming bookings:', error);
        }
    },

    // ============================================
    // CALENDAR
    // ============================================

    async loadCalendar() {
        const today = new Date();
        this.calendarYear = today.getFullYear();
        this.calendarMonth = today.getMonth() + 1;
        this.calendarSelectedDate = null;
        document.getElementById('calendar-day-detail')?.classList.add('hidden');
        await this.renderCalendarView();
    },

    async renderCalendarView() {
        try {
            const response = await this.authFetch(
                `${this.API_BASE}/admin/bookings/month-summary?year=${this.calendarYear}&month=${this.calendarMonth}`
            );
            const summary = await response.json();

            const bookingsByDate = {};
            summary.forEach(item => {
                bookingsByDate[item.booking_date] = item.count;
            });

            this.renderCalendar(this.calendarYear, this.calendarMonth, bookingsByDate);
        } catch (error) {
            console.error('Error loading calendar:', error);
        }
    },

    calendarPrevMonth() {
        this.calendarMonth--;
        if (this.calendarMonth < 1) {
            this.calendarMonth = 12;
            this.calendarYear--;
        }
        this.calendarSelectedDate = null;
        document.getElementById('calendar-day-detail')?.classList.add('hidden');
        this.renderCalendarView();
    },

    calendarNextMonth() {
        this.calendarMonth++;
        if (this.calendarMonth > 12) {
            this.calendarMonth = 1;
            this.calendarYear++;
        }
        this.calendarSelectedDate = null;
        document.getElementById('calendar-day-detail')?.classList.add('hidden');
        this.renderCalendarView();
    },

    calendarGoToToday() {
        const today = new Date();
        this.calendarYear = today.getFullYear();
        this.calendarMonth = today.getMonth() + 1;
        this.calendarSelectedDate = null;
        document.getElementById('calendar-day-detail')?.classList.add('hidden');
        this.renderCalendarView();
    },

    renderCalendar(year, month, bookingsByDate) {
        const monthNames = [
            'Enero', 'Febrero', 'Marzo', 'Abril', 'Mayo', 'Junio',
            'Julio', 'Agosto', 'Septiembre', 'Octubre', 'Noviembre', 'Diciembre'
        ];
        const weekdayNames = ['Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sá', 'Do'];

        document.getElementById('calendar-month-year').textContent = `${monthNames[month - 1]} ${year}`;

        const grid = document.getElementById('calendar-grid');
        grid.innerHTML = '';

        // Weekday headers
        weekdayNames.forEach(wd => {
            const cell = document.createElement('div');
            cell.className = 'calendar-weekday';
            cell.textContent = wd;
            grid.appendChild(cell);
        });

        const firstDay = new Date(year, month - 1, 1);
        const startingDayOfWeek = firstDay.getDay(); // 0 = Sunday
        const daysInMonth = new Date(year, month, 0).getDate();
        const today = new Date();
        const isToday = (d, m, y) => d === today.getDate() && m === today.getMonth() + 1 && y === today.getFullYear();
        const isSelected = (d, m, y) => this.calendarSelectedDate &&
            d === this.calendarSelectedDate.getDate() &&
            m === this.calendarSelectedDate.getMonth() + 1 &&
            y === this.calendarSelectedDate.getFullYear();

        // Empty cells before first day (getDay: 0=Sun, we want Mon=0..Sun=6)
        const offset = (startingDayOfWeek + 6) % 7;
        for (let i = 0; i < offset; i++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day empty';
            grid.appendChild(cell);
        }

        // Day cells
        for (let day = 1; day <= daysInMonth; day++) {
            const cell = document.createElement('div');
            cell.className = 'calendar-day';
            const dateStr = `${year}-${String(month).padStart(2, '0')}-${String(day).padStart(2, '0')}`;
            const count = bookingsByDate[dateStr] || 0;

            if (count > 0) cell.classList.add('has-bookings');
            if (isToday(day, month, year)) cell.classList.add('today');
            if (isSelected(day, month, year)) cell.classList.add('today');

            cell.innerHTML = `
                <div class="calendar-day-number">${day}</div>
                ${count > 0 ? `<div class="calendar-booking-count">${count}</div>` : ''}
            `;

            cell.addEventListener('click', () => {
                this.calendarSelectedDate = new Date(year, month - 1, day);
                document.querySelectorAll('#calendar-grid .calendar-day').forEach(c => c.classList.remove('today'));
                if (isToday(day, month, year)) cell.classList.add('today');
                cell.classList.add('today');
                this.loadDayBookings(dateStr);
            });

            grid.appendChild(cell);
        }
    },

    async loadDayBookings(dateStr) {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/bookings?date=${dateStr}`);
            const bookings = await response.json();

            const title = document.getElementById('calendar-day-title');
            const dateObj = new Date(dateStr + 'T00:00:00');
            title.textContent = `Citas del ${dateObj.toLocaleDateString('es-CO', { day: 'numeric', month: 'long' })}`;

            const container = document.getElementById('calendar-day-bookings');
            const detailPanel = document.getElementById('calendar-day-detail');

            if (bookings.length === 0) {
                container.innerHTML = '<p class="empty-text">No hay citas programadas para este día.</p>';
            } else {
                container.innerHTML = bookings.map(b => {
                    const timeStr = b.booking_time?.substring(0, 5) || '';
                    return `
                    <div class="calendar-day-booking">
                        <div class="calendar-day-booking-time">${timeStr}</div>
                        <div class="calendar-day-booking-info">
                            <span class="calendar-day-booking-client">${b.client_name}</span>
                            <span class="calendar-day-booking-service">${b.service_title}</span>
                            <span class="calendar-day-booking-manicurist">${b.manicurist_name}</span>
                        </div>
                        <span class="status-badge status-${b.status}">${this.getStatusLabel(b.status)}</span>
                    </div>
                    `;
                }).join('');
            }

            detailPanel.classList.remove('hidden');
        } catch (error) {
            console.error('Error loading day bookings:', error);
        }
    },

    calendarHideDayDetail() {
        document.getElementById('calendar-day-detail').classList.add('hidden');
        this.calendarSelectedDate = null;
        document.querySelectorAll('#calendar-grid .calendar-day').forEach(c => c.classList.remove('today'));
        const today = new Date();
        const isCurrentMonth = today.getFullYear() === this.calendarYear && today.getMonth() + 1 === this.calendarMonth;
        if (isCurrentMonth) {
            document.querySelectorAll('#calendar-grid .calendar-day').forEach(c => {
                const num = parseInt(c.querySelector('.calendar-day-number')?.textContent || '0');
                if (num === today.getDate()) c.classList.add('today');
            });
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
                        <button class="btn-icon" style="color:#25D366; font-size:1.2rem;" onclick="AdminApp.sendWhatsAppReminder('${b.client_name}', '${b.client_phone}', '${this.formatDate(b.booking_date)}', '${b.booking_time?.substring(0, 5)}', '${b.service_title}', '${b.manicurist_name}')" title="Enviar WhatsApp">📱</button>
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
            console.error('Error updating status:', error);
        }
    },

    sendWhatsAppReminder(name, phone, date, time, service, manicurist) {
        if (!phone) {
            alert('El cliente no tiene un teléfono registrado válido.');
            return;
        }
        let cleanPhone = phone.toString().replace(/\D/g, '');
        if (cleanPhone.startsWith('0')) cleanPhone = cleanPhone.substring(1);
        if (!cleanPhone.startsWith('57') && cleanPhone.length === 10) cleanPhone = '57' + cleanPhone;

        const message = `⏰ *Recordatorio AUBA* ⏰\n\n¡Hola ${name}! 👋\n\nTe recordamos que tienes una cita con nosotras:\n\n📅 *Fecha:* ${date}\n🕐 *Hora:* ${time}\n💅 *Servicio:* ${service}\n👩‍💼 *Especialista:* ${manicurist}\n\n📍 Dirección: Calle Principal 123, Ciudad\n\n¡Te esperamos! 💅✨\n\n_Si no puedes asistir o quieres cambiar algo, por favor avísanos respondiendo a este mensaje._`;
        
        const url = `https://wa.me/${cleanPhone}?text=${encodeURIComponent(message)}`;
        window.open(url, '_blank');
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
                        <button class="btn-icon" onclick="AdminApp.resetManicuristPassword(${m.id})" title="Generar contraseña temporal">🔄</button>
                        <button class="btn-icon" onclick="AdminApp.deleteManicurist(${m.id})" title="Eliminar">🗑️</button>
                    </div>
                </div>
            `).join('');

            // Also load rest requests table
            this.loadRestRequests();
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
        if (!confirm('Se generará una contraseña temporal nueva para esta manicurista. ¿Continuar?')) return;

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/manicurists/${id}/reset-password`, { method: 'PUT' });
            const result = await response.json();

            if (result.success) {
                this.showTemporaryPassword(result.temporaryPassword);
            } else {
                alert('Error: ' + (result.error || 'No se pudo restablecer la contraseña'));
            }
        } catch (error) {
            console.error('Error resetting manicurist password:', error);
            alert('Error de conexión');
        }
    },

    showTemporaryPassword(password) {
        if (!password) {
            alert('Contraseña restablecida.');
            return;
        }
        alert(
            `Contraseña temporal:\n\n${password}\n\n` +
            'Cópiala y comunícasela ahora. No se puede recuperar más adelante: ' +
            'el siguiente reset genera una distinta.'
        );
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
                        <button class="btn-icon" onclick="AdminApp.resetUserPassword(${u.id})" title="Generar contraseña temporal">🔄</button>
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
        if (!confirm('Se generará una contraseña temporal nueva para esta clienta. ¿Continuar?')) return;

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/users/${id}/reset-password`, { method: 'PUT' });
            const result = await response.json();

            if (result.success) {
                this.showTemporaryPassword(result.temporaryPassword);
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
        // Simple CSV export from visible table
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

    async exportBookingsAll() {
        // Fetch ALL bookings from the API (no limit) and export to CSV with Excel-compatible BOM
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/bookings`);
            const bookings = await response.json();

            if (!bookings || bookings.length === 0) {
                alert('No hay reservas para exportar.');
                return;
            }

            const headers = ['ID', 'Cliente', 'Teléfono', 'Servicio', 'Manicurista', 'Fecha', 'Hora', 'Estado', 'Pago', 'Monto'];
            const rows = [headers.join(',')];

            bookings.forEach(b => {
                const escapeCsv = (val) => {
                    const s = String(val == null ? '' : val);
                    if (s.includes(',') || s.includes('"') || s.includes('\n')) {
                        return '"' + s.replace(/"/g, '""') + '"';
                    }
                    return s;
                };
                const dateFmt = b.booking_date ? new Date(b.booking_date + 'T00:00:00').toLocaleDateString('es-CO') : '-';
                const timeStr = b.booking_time ? b.booking_time.substring(0, 5) : '-';
                const payment = b.payment_status || 'unpaid';
                const amount = b.payment_amount > 0 ? this.formatPrice(b.payment_amount) : '-';
                rows.push([
                    escapeCsv(b.id),
                    escapeCsv(b.client_name),
                    escapeCsv(b.client_phone),
                    escapeCsv(b.service_title),
                    escapeCsv(b.manicurist_name),
                    escapeCsv(dateFmt),
                    escapeCsv(timeStr),
                    escapeCsv(this.getStatusLabel(b.status)),
                    escapeCsv(payment),
                    escapeCsv(amount)
                ].join(','));
            });

            // UTF-8 BOM for Excel compatibility
            const bom = '\uFEFF';
            const blob = new Blob([bom + rows.join('\n')], { type: 'text/csv;charset=utf-8;' });
            const url = URL.createObjectURL(blob);
            const a = document.createElement('a');
            a.href = url;
            a.download = `reservas_todas_${new Date().toISOString().split('T')[0]}.csv`;
            a.click();
        } catch (error) {
            console.error('Error exporting all bookings:', error);
            alert('Error al exportar reservas');
        }
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
    },

    async loadSecuritySettings() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/settings/security`);
            const data = await response.json();

            document.getElementById('security-question').value = data.manicurist_security_question || '';
            document.getElementById('security-answer').value = data.manicurist_security_answer || '';
            document.getElementById('security-error').classList.add('hidden');
            document.getElementById('security-success').classList.add('hidden');
        } catch (error) {
            console.error('Error loading security settings:', error);
        }
    },

    async saveSecuritySettings() {
        const question = document.getElementById('security-question').value.trim();
        const answer = document.getElementById('security-answer').value.trim();
        const errorEl = document.getElementById('security-error');
        const successEl = document.getElementById('security-success');

        if (!question || !answer) {
            errorEl.textContent = 'Debes completar la pregunta y la respuesta';
            errorEl.classList.remove('hidden');
            successEl.classList.add('hidden');
            return;
        }

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/settings/security`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    manicurist_security_question: question,
                    manicurist_security_answer: answer
                })
            });
            const result = await response.json();

            if (result.success) {
                successEl.textContent = 'Configuración actualizada correctamente';
                successEl.classList.remove('hidden');
                errorEl.classList.add('hidden');
            } else {
                errorEl.textContent = result.error || 'Error al guardar';
                errorEl.classList.remove('hidden');
                successEl.classList.add('hidden');
            }
        } catch (error) {
            errorEl.textContent = 'Error de conexión';
            errorEl.classList.remove('hidden');
            successEl.classList.add('hidden');
        }
    },

    // ============================================
    // SOLICITUDES DE DÍAS DE DESCANSO
    // ============================================

    async loadRestRequests() {
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/rest-requests`);
            const data = await response.json();
            const requests = data.requests || [];

            const pendingCount = requests.filter(r => r.status === 'pending').length;
            const sidebarBadge = document.getElementById('sidebar-rest-badge');
            const countBadge = document.getElementById('rest-requests-count-badge');

            if (sidebarBadge) {
                if (pendingCount > 0) {
                    sidebarBadge.textContent = pendingCount;
                    sidebarBadge.classList.remove('hidden');
                } else {
                    sidebarBadge.classList.add('hidden');
                }
            }

            if (countBadge) {
                countBadge.textContent = `${pendingCount} pendiente${pendingCount === 1 ? '' : 's'}`;
            }

            const tbody = document.getElementById('rest-requests-tbody');
            if (!tbody) return;

            if (requests.length === 0) {
                tbody.innerHTML = '<tr><td colspan="6" style="text-align: center; color: #888; padding: 24px;">No hay solicitudes de descanso registradas</td></tr>';
                return;
            }

            tbody.innerHTML = requests.map(r => {
                const [y, m, d] = (r.unavailable_date || '').split('-');
                const dateObj = new Date(Number(y), Number(m) - 1, Number(d));
                const formattedDate = !isNaN(dateObj) ? dateObj.toLocaleDateString('es-ES', { weekday: 'short', day: 'numeric', month: 'short', year: 'numeric' }) : r.unavailable_date;

                let statusBadge = '';
                if (r.status === 'pending') {
                    statusBadge = '<span class="status-badge" style="background: #FFF3CD; color: #856404; font-weight: 600;">⏳ Pendiente</span>';
                } else if (r.status === 'approved') {
                    statusBadge = '<span class="status-badge status-confirmed">✓ Aprobado</span>';
                } else if (r.status === 'rejected') {
                    statusBadge = `<span class="status-badge status-cancelled" title="${r.rejection_reason || ''}">✕ Rechazado</span>`;
                }

                let actions = '';
                if (r.status === 'pending') {
                    actions = `
                        <div style="display: flex; gap: 8px;">
                            <button class="action-btn-small" style="background: #34C759; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;" onclick="AdminApp.approveRestRequest(${r.id})">✓ Aprobar</button>
                            <button class="action-btn-small" style="background: #FF3B30; color: white; border: none; padding: 6px 12px; border-radius: 6px; cursor: pointer; font-size: 12px; font-weight: 600;" onclick="AdminApp.rejectRestRequest(${r.id})">✕ Rechazar</button>
                        </div>
                    `;
                } else if (r.status === 'approved') {
                    actions = `
                        <button class="action-btn-small" style="background: transparent; color: #FF3B30; border: 1px solid #FF3B30; padding: 5px 10px; border-radius: 6px; cursor: pointer; font-size: 12px;" onclick="AdminApp.rejectRestRequest(${r.id})" title="Revocar aprobación">Deshacer</button>
                    `;
                } else {
                    actions = `<span style="font-size: 12px; color: #888;">${r.rejection_reason || 'Rechazado'}</span>`;
                }

                return `
                    <tr>
                        <td><strong>${r.manicurist_name}</strong></td>
                        <td>${r.manicurist_phone || '-'}</td>
                        <td style="font-weight: 600; color: #2C2C3E;">${formattedDate}</td>
                        <td style="color: #666;">${r.reason || 'Descanso'}</td>
                        <td>${statusBadge}</td>
                        <td>${actions}</td>
                    </tr>
                `;
            }).join('');
        } catch (error) {
            console.error('Error cargando solicitudes de descanso:', error);
        }
    },

    async approveRestRequest(id) {
        if (!confirm('¿Confirmas que deseas APROBAR este día de descanso para la manicurista?\n\nLas clientas no podrán agendar citas en esa fecha.')) return;
        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/rest-requests/${id}/approve`, {
                method: 'PUT'
            });
            const result = await response.json();
            if (result.success) {
                alert('Día de descanso aprobado exitosamente');
                this.loadRestRequests();
            } else {
                alert('Error: ' + (result.error || 'No se pudo aprobar'));
            }
        } catch (error) {
            console.error('Error aprobando solicitud:', error);
            alert('Error de conexión');
        }
    },

    async rejectRestRequest(id) {
        const reason = prompt('Indica el motivo de rechazo (opcional para la manicurista):', 'Necesidad del servicio en esa fecha');
        if (reason === null) return; // cancelado

        try {
            const response = await this.authFetch(`${this.API_BASE}/admin/rest-requests/${id}/reject`, {
                method: 'PUT',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ reason: reason.trim() || 'No aprobado por administración' })
            });
            const result = await response.json();
            if (result.success) {
                alert('Solicitud de descanso rechazada.');
                this.loadRestRequests();
            } else {
                alert('Error: ' + (result.error || 'No se pudo rechazar'));
            }
        } catch (error) {
            console.error('Error rechazando solicitud:', error);
            alert('Error de conexión');
        }
    }
};

// Initialize on DOM load
document.addEventListener('DOMContentLoaded', () => AdminApp.init());

