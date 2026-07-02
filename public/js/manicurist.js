/**
 * AUBA - Manicurist Portal Logic (Enhanced)
 * Soporta pestañas, estados de citas, y acciones
 */

// BUG-12 FIX: Detectar origin dinámicamente
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const API_BASE = IS_LOCAL ? window.location.origin + '/api' : 'https://auba-api.onrender.com/api';
let currentManicurist = null;
let selectedDate = null;
const MANICURIST_TOKEN_KEY = 'auba_manicurist_token';

// Helper para headers con auth
function authHeaders(extra = {}) {
    const token = localStorage.getItem(MANICURIST_TOKEN_KEY);
    const headers = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

// Estado de las citas
const STATUS_LABELS = {
    'pending': 'Pendiente',
    'confirmed': 'Confirmada',
    'in_progress': 'En Progreso',
    'completed': 'Completada',
    'cancelled': 'Cancelada',
    'no_show': 'No Asistió'
};

// Password Toggle Function
function togglePassword(inputId, button) {
    const input = document.getElementById(inputId);
    if (input.type === 'password') {
        input.type = 'text';
        button.textContent = '🙈';
    } else {
        input.type = 'password';
        button.textContent = '👁';
    }
}

// Check if manicurist is logged in
document.addEventListener('DOMContentLoaded', () => {
    const session = localStorage.getItem('auba_manicurist_session');

    if (session) {
        currentManicurist = JSON.parse(session);
        showDashboard();
    } else {
        showLoginScreen();
    }

    // Setup tab navigation
    setupTabs();
});

// Show Login Screen
function showLoginScreen() {
    document.getElementById('login-view').style.display = 'block';
    document.getElementById('dashboard-view').style.display = 'none';
}

// Show Dashboard
function showDashboard() {
    document.getElementById('login-view').style.display = 'none';
    document.getElementById('dashboard-view').style.display = 'block';
    document.getElementById('welcome-msg').textContent = `Hola, ${currentManicurist.name}`;

    // Set today's date label
    const today = new Date();
    document.getElementById('today-date').textContent = today.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    // Default selection for calendar tab is today (local)
    selectedDate = getLocalDateISO(today);

    // Load data
    loadPendingBookings();
    loadTodayBookings();
    renderMiniCalendar();
    loadBookingsForDate(selectedDate); // Initial load for Agenda tab
    initBookingTab();
}

// Helper to get YYYY-MM-DD in local time
function getLocalDateISO(dateObj) {
    const year = dateObj.getFullYear();
    const month = String(dateObj.getMonth() + 1).padStart(2, '0');
    const day = String(dateObj.getDate()).padStart(2, '0');
    return `${year}-${month}-${day}`;
}

// Setup Tabs
function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update button states
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content visibility
            document.querySelectorAll('.tab-content').forEach(c => c.classList.remove('active'));
            document.getElementById(`tab-${tabId}`).classList.add('active');
        });
    });
}

// Login Form Handler
document.getElementById('manicurist-login-form').addEventListener('submit', async (e) => {
    e.preventDefault();

    const phone = document.getElementById('login-phone').value.trim();
    const password = document.getElementById('login-password').value;
    const errorEl = document.getElementById('login-error');

    try {
        const response = await fetch(`${API_BASE}/auth/manicurist/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone, password })
        });

        const data = await response.json();

        if (data.success) {
            currentManicurist = data.user;
            localStorage.setItem('auba_manicurist_session', JSON.stringify(data.user));
            if (data.token) localStorage.setItem(MANICURIST_TOKEN_KEY, data.token);
            showDashboard();
        } else {
            errorEl.textContent = data.error || 'Error al iniciar sesión';
            errorEl.style.display = 'block';
        }
    } catch (error) {
        errorEl.textContent = 'Error de conexión. Verifica que el servidor esté activo.';
        errorEl.style.display = 'block';
    }
});

// Logout
document.getElementById('btn-logout').addEventListener('click', () => {
    localStorage.removeItem('auba_manicurist_session');
    localStorage.removeItem(MANICURIST_TOKEN_KEY);
    currentManicurist = null;
    showLoginScreen();
});

// =============================================
// DATA LOADING
// =============================================

// Load Pending Bookings (status = pending)
async function loadPendingBookings() {
    const container = document.getElementById('pending-bookings');

    try {
        const response = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings?status=pending`, {
            headers: authHeaders()
        });
        const bookings = await response.json();

        // Update badge count
        const badge = document.getElementById('pending-count');
        if (bookings.length > 0) {
            badge.textContent = bookings.length;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }

        if (bookings.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>🎉 No tienes citas pendientes de confirmar.</p></div>';
            return;
        }

        container.innerHTML = bookings.map(b => renderBookingCard(b, 'pending')).join('');
        attachActionListeners();

    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p style="color: red;">Error cargando citas</p></div>';
        console.error(error);
    }
}

// Load Today's Bookings
async function loadTodayBookings() {
    const container = document.getElementById('today-bookings');
    const today = new Date().toISOString().split('T')[0];

    try {
        const response = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings?date=${today}`, {
            headers: authHeaders()
        });
        const bookings = await response.json();

        if (bookings.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>📭 No tienes citas para hoy.</p></div>';
            return;
        }

        container.innerHTML = bookings.map(b => renderBookingCard(b, 'today')).join('');
        attachActionListeners();

    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p style="color: red;">Error cargando citas</p></div>';
        console.error(error);
    }
}

// Render Mini Calendar (30 days)
function renderMiniCalendar() {
    const container = document.getElementById('mini-calendar');
    const today = new Date();
    const todayStr = getLocalDateISO(today);

    // Week day initials
    const dayNames = ['D', 'L', 'M', 'X', 'J', 'V', 'S'];
    let html = '';

    // Add headers for days starting from today's day of week
    for (let i = 0; i < 7; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        html += `<div style="text-align: center; font-size: 11px; color: #999; font-weight: 600; margin-bottom: 8px;">${dayNames[date.getDay()]}</div>`;
    }

    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const dateStr = getLocalDateISO(date);
        const dayNum = date.getDate();
        const isToday = dateStr === todayStr;

        html += `
            <div class="cal-day ${dateStr === selectedDate ? 'selected' : ''} ${isToday ? 'today' : ''}" 
                 data-date="${dateStr}" 
                 onclick="selectDate('${dateStr}')">
                <span class="day-name">${dayNames[date.getDay()]}</span>
                ${dayNum}
            </div>
        `;
    }

    container.innerHTML = html;
}

// Select Date (for calendar tab)
window.selectDate = function (dateStr) {
    selectedDate = dateStr;
    renderMiniCalendar();
    loadBookingsForDate(dateStr);
};

// Load Bookings for Specific Date (calendar tab)
async function loadBookingsForDate(date) {
    const container = document.getElementById('calendar-bookings');
    const label = document.getElementById('selected-date-label');

    // Format date
    const [year, month, day] = date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const formatted = dateObj.toLocaleDateString('es-ES', {
        weekday: 'long',
        year: 'numeric',
        month: 'long',
        day: 'numeric'
    });
    label.textContent = formatted;

    try {
        const response = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings?date=${date}`, {
            headers: authHeaders()
        });
        const bookings = await response.json();

        if (bookings.length === 0) {
            container.innerHTML = '<div class="empty-state"><p>No tienes citas para este día.</p></div>';
            return;
        }

        container.innerHTML = bookings.map(b => renderBookingCard(b, 'calendar')).join('');
        attachActionListeners();

    } catch (error) {
        container.innerHTML = '<div class="empty-state"><p style="color: red;">Error cargando citas</p></div>';
        console.error(error);
    }
}

// =============================================
// BOOKING CARD RENDERING
// =============================================

function renderBookingCard(booking, context) {
    const status = booking.status || 'pending';
    const statusLabel = STATUS_LABELS[status] || status;
    const time = booking.booking_time.substring(0, 5);

    // Format date
    const [year, month, day] = booking.booking_date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dateFormatted = dateObj.toLocaleDateString('es-ES', { day: 'numeric', month: 'short' });

    // Payment info
    const paymentStatus = booking.payment_status || 'unpaid';
    const paymentType = booking.payment_type || 'none';
    const paymentAmount = parseFloat(booking.payment_amount) || 0;
    const servicePrice = parseFloat(booking.service_price) || 0;
    const remaining = servicePrice - paymentAmount - (parseFloat(booking.final_payment_amount) || 0);

    // Payment badge
    let paymentBadgeHtml = '';
    const paymentLabels = {
        'unpaid': { text: 'Sin pago', color: '#999', bg: '#F5F5F5' },
        'pending_verification': { text: '⏳ Pago pendiente', color: '#E65100', bg: '#FFF3E0' },
        'verified': { text: '✅ Pago verificado', color: '#2E7D32', bg: '#E8F5E9' },
        'completed': { text: '💰 Pago completo', color: '#1565C0', bg: '#E3F2FD' }
    };
    const pLabel = paymentLabels[paymentStatus] || paymentLabels['unpaid'];

    if (paymentType !== 'none') {
        const typeText = paymentType === 'deposit' ? 'Abono' : 'Pago completo';
        const refHtml = booking.nequi_reference
            ? `<div style="margin-top: 6px; padding: 6px 10px; background: #FCE4EC; border-radius: 6px; font-size: 12px; color: #C62828; font-weight: 600;">
                   📋 Ref. Nequi: <span style="font-family: monospace; letter-spacing: 1px;">${booking.nequi_reference}</span>
               </div>`
            : '';
        paymentBadgeHtml = `
            <div style="margin-top: 8px; padding: 8px 12px; border-radius: 8px; background: ${pLabel.bg}; font-size: 13px;">
                <span style="color: ${pLabel.color}; font-weight: 600;">${pLabel.text}</span>
                <span style="color: #666; margin-left: 8px;">
                    ${typeText}: $${paymentAmount.toLocaleString('es-CO')} / $${servicePrice.toLocaleString('es-CO')}
                </span>
                ${refHtml}
            </div>
        `;
    }

    // Payment actions
    let paymentActionsHtml = '';

    // View proof button — show reference number as clickable link to proof image
    if (booking.payment_proof) {
        const refLabel = booking.nequi_reference
            ? `📋 Ref: ${booking.nequi_reference}`
            : '📎 Ver Comprobante';
        paymentActionsHtml += `
            <button class="action-btn" style="background: #7B1FA2; color: white; font-family: monospace; letter-spacing: 0.5px;" 
                    onclick="window.open('${booking.payment_proof}', '_blank')">
                ${refLabel}
            </button>
        `;
    }

    // Verify payment button (only for pending_verification)
    if (paymentStatus === 'pending_verification') {
        paymentActionsHtml += `
            <button class="action-btn" style="background: #FF9800; color: white;"
                    data-id="${booking.id}" data-action="verify-payment">
                ✓ Verificar Pago
            </button>
        `;
    }

    // Determine which actions to show based on status
    let actionsHtml = '';

    if (status === 'pending') {
        actionsHtml = `
            <button class="action-btn confirm" data-id="${booking.id}" data-action="confirm">
                ✓ Confirmar
            </button>
        `;
    } else if (status === 'confirmed') {
        actionsHtml = `
            <button class="action-btn start" data-id="${booking.id}" data-action="start">
                ▶ Iniciar Servicio
            </button>
            <button class="action-btn no-show" data-id="${booking.id}" data-action="no_show">
                ✗ No Asistió
            </button>
        `;
    } else if (status === 'in_progress') {
        // Show complete with payment info
        if (paymentType === 'deposit' && remaining > 0) {
            actionsHtml = `
                <button class="action-btn complete" data-id="${booking.id}" data-action="complete-service"
                        data-remaining="${remaining}" data-service-price="${servicePrice}">
                    💰 Completar (Saldo: $${remaining.toLocaleString('es-CO')})
                </button>
            `;
        } else {
            actionsHtml = `
                <button class="action-btn complete" data-id="${booking.id}" data-action="complete">
                    ✓ Completar
                </button>
            `;
        }
    }

    return `
        <div class="booking-card ${status}">
            <div class="booking-info">
                <div class="booking-time">${time}</div>
                <div class="booking-details">
                    <strong>${booking.client_name}</strong> - ${booking.service_title}<br>
                    📱 ${booking.client_phone} ${context !== 'today' ? `| 📅 ${dateFormatted}` : ''}
                    ${paymentBadgeHtml}
                </div>
                <span class="booking-status status-${status}">${statusLabel}</span>
            </div>
            <div class="booking-actions">
                ${paymentActionsHtml}
                ${actionsHtml}
            </div>
        </div>
    `;
}

// =============================================
// ACTIONS
// =============================================

function attachActionListeners() {
    document.querySelectorAll('.action-btn').forEach(btn => {
        // Skip buttons that already use onclick
        if (btn.onclick) return;

        btn.addEventListener('click', async (e) => {
            const bookingId = btn.dataset.id;
            const action = btn.dataset.action;

            if (!action || !bookingId) return;

            // Handle verify-payment
            if (action === 'verify-payment') {
                btn.disabled = true;
                btn.textContent = 'Verificando...';

                try {
                    const response = await fetch(
                        `${API_BASE}/manicurists/${currentManicurist.id}/bookings/${bookingId}/verify-payment`,
                        {
                            method: 'PUT',
                            headers: authHeaders({ 'Content-Type': 'application/json' })
                        }
                    );
                    const result = await response.json();
                    if (result.success) {
                        refreshAllViews();
                    } else {
                        alert('Error: ' + (result.error || 'No se pudo verificar'));
                        btn.disabled = false;
                    }
                } catch (error) {
                    console.error('Error verifying payment:', error);
                    alert('Error de conexión');
                    btn.disabled = false;
                }
                return;
            }

            // Handle complete-service (with remaining balance)
            if (action === 'complete-service') {
                const remaining = parseFloat(btn.dataset.remaining) || 0;
                const method = prompt(
                    `💰 Saldo pendiente: $${remaining.toLocaleString('es-CO')}\n\n¿Cómo pagó la clienta?\n\nEscribe: efectivo, nequi, o transferencia`,
                    'efectivo'
                );

                if (!method) return;

                btn.disabled = true;
                btn.textContent = 'Procesando...';

                try {
                    const response = await fetch(
                        `${API_BASE}/manicurists/${currentManicurist.id}/bookings/${bookingId}/complete-service`,
                        {
                            method: 'PUT',
                            headers: authHeaders({ 'Content-Type': 'application/json' }),
                            body: JSON.stringify({
                                final_payment_amount: remaining,
                                final_payment_method: method.trim()
                            })
                        }
                    );
                    const result = await response.json();
                    if (result.success) {
                        refreshAllViews();
                    } else {
                        alert('Error: ' + (result.error || 'No se pudo completar'));
                        btn.disabled = false;
                    }
                } catch (error) {
                    console.error('Error completing service:', error);
                    alert('Error de conexión');
                    btn.disabled = false;
                }
                return;
            }

            // Handle standard status changes
            btn.disabled = true;
            btn.textContent = 'Procesando...';

            let newStatus = '';
            switch (action) {
                case 'confirm':
                    newStatus = 'confirmed';
                    break;
                case 'start':
                    newStatus = 'in_progress';
                    break;
                case 'complete':
                    newStatus = 'completed';
                    break;
                case 'no_show':
                    newStatus = 'no_show';
                    break;
            }

            try {
                const response = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings/${bookingId}/status`, {
                    method: 'PUT',
                    headers: authHeaders({ 'Content-Type': 'application/json' }),
                    body: JSON.stringify({ status: newStatus })
                });

                const result = await response.json();

                if (result.success) {
                    refreshAllViews();
                } else {
                    alert('Error: ' + (result.error || 'No se pudo actualizar'));
                    btn.disabled = false;
                }
            } catch (error) {
                console.error('Error updating booking:', error);
                alert('Error de conexión');
                btn.disabled = false;
            }
        });
    });
}

// Helper to refresh all views
function refreshAllViews() {
    loadPendingBookings();
    loadTodayBookings();
    if (selectedDate) {
        loadBookingsForDate(selectedDate);
    }
}

// =============================================
// AGENDAR CITA (Booking Tab)
// =============================================

let selectedClientId = null;
let selectedBookTime = null;
let searchTimeout = null;

// Load services into the dropdown when tab is activated
async function loadServicesForBooking() {
    try {
        const res = await fetch(`${API_BASE}/services`);
        const data = await res.json();
        const select = document.getElementById('book-service');

        // Keep only first <option>
        select.innerHTML = '<option value="">Selecciona un servicio...</option>';

        const services = Array.isArray(data) ? data : (data.services || []);
        services.forEach(s => {
            const opt = document.createElement('option');
            opt.value = s.id;
            opt.textContent = `${s.name} — $${Number(s.price).toLocaleString('es-CO')}`;
            select.appendChild(opt);
        });
    } catch (e) {
        console.error('Error cargando servicios:', e);
    }
}

// Client search with autocomplete
function setupClientSearch() {
    const phoneInput = document.getElementById('search-client-phone');
    const nameInput = document.getElementById('search-client-name');

    phoneInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchClients(phoneInput.value.trim(), 'phone'), 300);
    });

    nameInput.addEventListener('input', () => {
        clearTimeout(searchTimeout);
        searchTimeout = setTimeout(() => searchClients(nameInput.value.trim(), 'name'), 300);
    });

    // Close dropdowns on click outside
    document.addEventListener('click', (e) => {
        if (!e.target.closest('.search-wrapper')) {
            document.querySelectorAll('.search-results').forEach(el => el.classList.remove('show'));
        }
    });
}

async function searchClients(query, source) {
    const resultsEl = document.getElementById(source === 'phone' ? 'search-results-phone' : 'search-results-name');

    if (!query || query.length < 2) {
        resultsEl.classList.remove('show');
        return;
    }

    try {
        const res = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/search-clients?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
        const data = await res.json();

        if (data.success && data.clients.length > 0) {
            resultsEl.innerHTML = data.clients.map(c => `
                <div class="search-result-item" onclick="selectClient(${c.id}, '${c.name.replace(/'/g, "\\'")}', '${c.phone}')">
                    <div class="client-name">${c.name}</div>
                    <div class="client-phone">📱 ${c.phone}</div>
                </div>
            `).join('');
            resultsEl.classList.add('show');
        } else {
            resultsEl.innerHTML = '<div style="padding: 12px 16px; color: #999; font-size: 13px;">No se encontraron clientas</div>';
            resultsEl.classList.add('show');
        }
    } catch (e) {
        console.error('Error buscando clientas:', e);
    }
}

function selectClient(id, name, phone) {
    selectedClientId = id;

    // Fill both inputs
    document.getElementById('search-client-phone').value = phone;
    document.getElementById('search-client-name').value = name;

    // Show badge
    document.getElementById('selected-client-name').textContent = name;
    document.getElementById('selected-client-phone').textContent = phone;
    document.getElementById('selected-client-badge').classList.add('show');

    // Hide dropdowns
    document.querySelectorAll('.search-results').forEach(el => el.classList.remove('show'));

    // Disable search inputs
    document.getElementById('search-client-phone').disabled = true;
    document.getElementById('search-client-name').disabled = true;

    validateBookForm();
}

function clearSelectedClient() {
    selectedClientId = null;
    document.getElementById('search-client-phone').value = '';
    document.getElementById('search-client-name').value = '';
    document.getElementById('search-client-phone').disabled = false;
    document.getElementById('search-client-name').disabled = false;
    document.getElementById('selected-client-badge').classList.remove('show');
    validateBookForm();
}

// Load available times for selected date
async function loadAvailableTimes() {
    const date = document.getElementById('book-date').value;
    const slotsContainer = document.getElementById('book-time-slots');
    selectedBookTime = null;

    if (!date) {
        slotsContainer.innerHTML = '<p style="color: #999; grid-column: 1/-1;">Selecciona una fecha primero</p>';
        validateBookForm();
        return;
    }

    slotsContainer.innerHTML = '<p style="color: #999; grid-column: 1/-1;">Cargando horarios...</p>';

    try {
        const res = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/available-times?date=${date}`, { headers: authHeaders() });
        const data = await res.json();

        if (data.success && data.times.length > 0) {
            slotsContainer.innerHTML = data.times.map(t => `
                <div class="time-slot-book" onclick="selectBookTime(this, '${t}')">${t}</div>
            `).join('');
        } else {
            slotsContainer.innerHTML = '<p style="color: #FF9500; grid-column: 1/-1;">No hay horarios disponibles para esta fecha</p>';
        }
    } catch (e) {
        slotsContainer.innerHTML = '<p style="color: #FF3B30; grid-column: 1/-1;">Error cargando horarios</p>';
    }

    validateBookForm();
}

function selectBookTime(el, time) {
    document.querySelectorAll('.time-slot-book').forEach(s => s.classList.remove('selected'));
    el.classList.add('selected');
    selectedBookTime = time;
    validateBookForm();
}

// Validate form completeness
function validateBookForm() {
    const service = document.getElementById('book-service').value;
    const date = document.getElementById('book-date').value;
    const btn = document.getElementById('btn-book-submit');

    btn.disabled = !(selectedClientId && service && date && selectedBookTime);
}

// Submit booking
async function submitBooking() {
    const btn = document.getElementById('btn-book-submit');
    const errorEl = document.getElementById('book-error');

    btn.disabled = true;
    btn.textContent = '⏳ Agendando...';
    errorEl.style.display = 'none';

    try {
        const res = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings`, {
            method: 'POST',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                client_id: selectedClientId,
                service_id: document.getElementById('book-service').value,
                booking_date: document.getElementById('book-date').value,
                booking_time: selectedBookTime + ':00'
            })
        });

        const data = await res.json();

        if (data.success) {
            // Show success
            document.getElementById('book-form-container').style.display = 'none';
            document.getElementById('book-success-msg').textContent = data.message;

            const date = new Date(document.getElementById('book-date').value + 'T00:00:00');
            const dateStr = date.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
            document.getElementById('book-success-detail').textContent = `${dateStr} a las ${selectedBookTime}`;
            document.getElementById('book-success').classList.add('show');

            // Refresh other tabs
            refreshAllViews();
        } else {
            errorEl.textContent = data.error || 'Error al agendar la cita';
            errorEl.style.display = 'block';
            btn.disabled = false;
        }
    } catch (e) {
        errorEl.textContent = 'Error de conexión';
        errorEl.style.display = 'block';
        btn.disabled = false;
    }

    btn.textContent = '📅 Agendar Cita';
}

// Reset booking form
function resetBookForm() {
    clearSelectedClient();
    document.getElementById('book-service').value = '';
    document.getElementById('book-date').value = '';
    document.getElementById('book-time-slots').innerHTML = '<p style="color: #999; grid-column: 1/-1;">Selecciona una fecha primero</p>';
    selectedBookTime = null;
    document.getElementById('book-error').style.display = 'none';
    document.getElementById('book-form-container').style.display = 'block';
    document.getElementById('book-success').classList.remove('show');
    validateBookForm();
}

// Initialize booking tab
function initBookingTab() {
    loadServicesForBooking();
    setupClientSearch();

    // Set minimum date to today
    const today = new Date().toISOString().split('T')[0];
    document.getElementById('book-date').min = today;

    // Date change → load times
    document.getElementById('book-date').addEventListener('change', loadAvailableTimes);

    // Service change → validate
    document.getElementById('book-service').addEventListener('change', validateBookForm);

    // Submit button
    document.getElementById('btn-book-submit').addEventListener('click', submitBooking);
}

// =============================================
// CAMBIO DE CONTRASEÑA
// =============================================

document.getElementById('btn-change-password').addEventListener('click', () => {
    document.getElementById('change-password-modal').style.display = 'flex';
});

document.getElementById('btn-close-password-modal').addEventListener('click', () => {
    document.getElementById('change-password-modal').style.display = 'none';
    document.getElementById('new-password').value = '';
});

document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const response = await fetch(`${API_BASE}/manicurists/${currentManicurist.id}/change-password`, {
            method: 'PUT',
            headers: authHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ newPassword })
        });
        
        const data = await response.json();
        if (data.success) {
            alert('Contraseña actualizada correctamente. Por favor inicia sesión nuevamente con tu nueva contraseña.');
            document.getElementById('btn-logout').click(); // Force logout
        } else {
            alert('Error: ' + (data.error || 'No se pudo actualizar'));
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        document.getElementById('change-password-modal').style.display = 'none';
        document.getElementById('new-password').value = '';
    }
});
