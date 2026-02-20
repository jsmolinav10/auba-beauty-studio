/**
 * AUBA - Manicurist Portal Logic (Enhanced)
 * Soporta pestañas, estados de citas, y acciones
 */

// BUG-12 FIX: Detectar origin dinámicamente
const API_BASE = window.location.origin + '/api';
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

    // Load data
    loadPendingBookings();
    loadTodayBookings();
    renderMiniCalendar();
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
    const todayStr = today.toISOString().split('T')[0];

    let html = '';
    for (let i = 0; i < 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const dateStr = date.toISOString().split('T')[0];
        const day = date.getDate();
        const isToday = dateStr === todayStr;

        html += `
            <div class="day-cell ${dateStr === selectedDate ? 'selected' : ''} ${isToday ? 'today' : ''}" 
                 data-date="${dateStr}" 
                 onclick="selectDate('${dateStr}')">
                ${day}
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
        actionsHtml = `
            <button class="action-btn complete" data-id="${booking.id}" data-action="complete">
                ✓ Completar
            </button>
        `;
    }

    return `
        <div class="booking-card ${status}">
            <div class="booking-info">
                <div class="booking-time">${time}</div>
                <div class="booking-details">
                    <strong>${booking.client_name}</strong> - ${booking.service_title}<br>
                    📱 ${booking.client_phone} ${context !== 'today' ? `| 📅 ${dateFormatted}` : ''}
                </div>
                <span class="booking-status status-${status}">${statusLabel}</span>
            </div>
            <div class="booking-actions">
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
        btn.addEventListener('click', async (e) => {
            const bookingId = btn.dataset.id;
            const action = btn.dataset.action;

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
                    // Refresh all views
                    loadPendingBookings();
                    loadTodayBookings();
                    if (selectedDate) {
                        loadBookingsForDate(selectedDate);
                    }
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