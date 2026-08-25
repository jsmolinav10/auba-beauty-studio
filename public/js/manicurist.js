/**
 * AUBA - Manicurist Portal Logic (Enhanced)
 * Soporta pestañas, estados de citas, y acciones
 */

// BUG-12 FIX: Detectar origin dinámicamente
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const API_BASE = IS_LOCAL ? window.location.origin + '/api' : '/api';
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

// Wrapper de fetch con autenticación y manejo de token expirado
async function authFetch(url, options = {}) {
    // Asegurar que siempre se envíen los headers de auth
    if (!options.headers) {
        options.headers = authHeaders();
    }
    const response = await fetch(url, options);
    // Si el token expiró, cerrar sesión automáticamente
    if (response.status === 401) {
        localStorage.removeItem('auba_manicurist_session');
        localStorage.removeItem(MANICURIST_TOKEN_KEY);
        currentManicurist = null;
        showLoginScreen();
        throw new Error('Sesión expirada. Por favor inicia sesión de nuevo.');
    }
    return response;
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

    // Initialize agenda state
    const todayStr = getLocalDateISO(today);
    agendaCurrentDate = todayStr;
    miniCalCurrentMonth = { year: today.getFullYear(), month: today.getMonth() };
    selectedDate = todayStr; // keep old variable in sync

    // Load all tabs data
    loadPendingBookings();
    loadTodayBookings();
    loadAgendaForDate(todayStr); // new time-grid agenda
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
        const response = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings?status=pending`, {
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
        const response = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings?date=${today}`, {
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

// =============================================
// AGENDA: Google Calendar Style Time Grid
// =============================================

const AGENDA_START_HOUR = 9;   // 9 AM
const AGENDA_END_HOUR   = 19;  // 7 PM (exclusive), shows rows 9–18
const HOUR_HEIGHT_PX    = 60;  // each hour row is 60px
let agendaCurrentDate   = null; // the date currently shown in the time grid
let miniCalCurrentMonth = null; // { year, month } of the mini calendar
let agendaAllBookings   = [];   // cached bookings for the displayed date

// Colour palette (rotates by booking index)
const APPT_COLORS = [
    { bg: '#FFCDD2', text: '#C62828' },
    { bg: '#FFE0B2', text: '#E65100' },
    { bg: '#FFF9C4', text: '#F57F17' },
    { bg: '#C8E6C9', text: '#2E7D32' },
    { bg: '#BBDEFB', text: '#1565C0' },
    { bg: '#E1BEE7', text: '#6A1B9A' },
    { bg: '#F8BBD0', text: '#AD1457' },
    { bg: '#B2DFDB', text: '#00695C' },
];

// Navigate agenda by +/-1 day
window.agendaNavigate = function(delta) {
    const d = new Date(agendaCurrentDate);
    d.setDate(d.getDate() + delta);
    agendaCurrentDate = getLocalDateISO(d);
    loadAgendaForDate(agendaCurrentDate);
};

// Navigate mini calendar by +/-1 month
window.miniCalNavigate = function(delta) {
    miniCalCurrentMonth.month += delta;
    if (miniCalCurrentMonth.month > 11) { miniCalCurrentMonth.month = 0; miniCalCurrentMonth.year++; }
    if (miniCalCurrentMonth.month < 0)  { miniCalCurrentMonth.month = 11; miniCalCurrentMonth.year--; }
    renderMiniMonthCal();
};

// Called when user clicks a day in the mini calendar
window.selectAgendaDate = function(dateStr) {
    agendaCurrentDate = dateStr;
    loadAgendaForDate(dateStr);
    renderMiniMonthCal();
};

// Master function: load bookings for date and re-render everything
async function loadAgendaForDate(date) {
    // Update header label
    const [y, m, d] = date.split('-').map(Number);
    const dateObj = new Date(y, m - 1, d);
    const label = dateObj.toLocaleDateString('es-ES', { weekday: 'long', day: 'numeric', month: 'long' });
    document.getElementById('agenda-date-label').textContent = label.charAt(0).toUpperCase() + label.slice(1);

    // Render empty skeleton immediately
    renderTimeGridSkeleton();

    try {
        const response = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings?date=${date}`, {
            headers: authHeaders()
        });
        agendaAllBookings = await response.json();
    } catch (e) {
        agendaAllBookings = [];
        console.error('Error cargando agenda:', e);
    }

    renderTimeGrid(agendaAllBookings);
    loadNextAppointments();
    renderMiniMonthCal();
}

// Draw the time grid rows (skeleton)
function renderTimeGridSkeleton() {
    const body = document.getElementById('time-grid-body');
    let html = '';
    for (let h = AGENDA_START_HOUR; h < AGENDA_END_HOUR; h++) {
        const label = h <= 12 ? `${h}:00 AM` : `${h - 12}:00 PM`;
        html += `<div class="time-grid-row">
            <span class="time-label">${label}</span>
            <div class="time-grid-half"></div>
        </div>`;
    }
    body.innerHTML = html;
}

// Place appointment blocks on the grid
function renderTimeGrid(bookings) {
    renderTimeGridSkeleton(); // redraw rows cleanly
    const body = document.getElementById('time-grid-body');

    if (!bookings || bookings.length === 0) {
        const empty = document.createElement('div');
        empty.className = 'agenda-empty-state';
        empty.innerHTML = '<p>📭 Sin citas para este día</p>';
        body.appendChild(empty);
        drawCurrentTimeLine(body);
        return;
    }

    bookings.forEach((b, idx) => {
        const timeStr = (b.booking_time || '09:00').substring(0, 5); // 'HH:MM'
        const [hh, mm] = timeStr.split(':').map(Number);
        const duration = parseInt(b.service_duration) || 60;
        const color = APPT_COLORS[idx % APPT_COLORS.length];

        // Position in pixels from top of grid
        const topPx  = (hh - AGENDA_START_HOUR) * HOUR_HEIGHT_PX + (mm / 60) * HOUR_HEIGHT_PX;
        const heightPx = Math.max((duration / 60) * HOUR_HEIGHT_PX, 36); // min 36px

        // End time string
        const endMin = hh * 60 + mm + duration;
        const endH   = Math.floor(endMin / 60);
        const endM   = endMin % 60;
        const endStr = `${String(endH).padStart(2,'0')}:${String(endM).padStart(2,'0')}`;

        const block = document.createElement('div');
        block.className = 'appt-block';
        block.style.top        = `${topPx}px`;
        block.style.height     = `${heightPx}px`;
        block.style.background = color.bg;
        block.style.color      = color.text;
        block.innerHTML = `
            <div class="appt-block-time">${timeStr} - ${endStr} · ${duration}m</div>
            <div class="appt-block-title">${escapeHtml(b.service_title || 'Servicio')} - ${escapeHtml(b.client_name || 'Clienta')}</div>
            ${heightPx > 50 ? `<div class="appt-block-client">📱 ${escapeHtml(b.client_phone || '')}</div>` : ''}
        `;
        body.appendChild(block);
    });

    drawCurrentTimeLine(body);
}

function escapeHtml(str) {
    return String(str).replace(/[&<>"]/g, c => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;'}[c]));
}

// Draw a red line at the current time
function drawCurrentTimeLine(body) {
    const now   = new Date();
    const today = getLocalDateISO(now);
    if (agendaCurrentDate !== today) return;

    const h = now.getHours();
    const m = now.getMinutes();
    if (h < AGENDA_START_HOUR || h >= AGENDA_END_HOUR) return;

    const topPx = (h - AGENDA_START_HOUR) * HOUR_HEIGHT_PX + (m / 60) * HOUR_HEIGHT_PX;
    const line  = document.createElement('div');
    line.className = 'current-time-line';
    line.style.top = `${topPx}px`;
    body.appendChild(line);
}

// Render the mini month calendar on the right panel
function renderMiniMonthCal() {
    const grid  = document.getElementById('mini-cal-grid');
    const label = document.getElementById('mini-cal-month-label');
    if (!grid) return;

    const { year, month } = miniCalCurrentMonth;
    const todayStr = getLocalDateISO(new Date());

    label.textContent = new Date(year, month, 1)
        .toLocaleDateString('es-ES', { month: 'long', year: 'numeric' });

    const dayNames = ['Do', 'Lu', 'Ma', 'Mi', 'Ju', 'Vi', 'Sa'];
    let html = dayNames.map(d => `<div class="mini-cal-day-name">${d}</div>`).join('');

    const firstDay = new Date(year, month, 1).getDay();
    const daysInMonth = new Date(year, month + 1, 0).getDate();
    const daysInPrev  = new Date(year, month, 0).getDate();

    // Pad with previous month
    for (let i = firstDay - 1; i >= 0; i--) {
        html += `<div class="mini-cal-day other-month">${daysInPrev - i}</div>`;
    }

    // Current month days
    for (let d = 1; d <= daysInMonth; d++) {
        const dateStr = `${year}-${String(month + 1).padStart(2,'0')}-${String(d).padStart(2,'0')}`;
        const classes = [
            'mini-cal-day',
            dateStr === todayStr ? 'today' : '',
            dateStr === agendaCurrentDate ? 'selected' : '',
        ].filter(Boolean).join(' ');
        html += `<div class="${classes}" onclick="selectAgendaDate('${dateStr}')">${d}</div>`;
    }

    // Pad remaining
    const total = firstDay + daysInMonth;
    const remainder = total % 7 === 0 ? 0 : 7 - (total % 7);
    for (let i = 1; i <= remainder; i++) {
        html += `<div class="mini-cal-day other-month">${i}</div>`;
    }

    grid.innerHTML = html;
}

// Load upcoming appointments for the right panel
async function loadNextAppointments() {
    const container = document.getElementById('next-appts-list');
    if (!container) return;

    const today = getLocalDateISO(new Date());
    try {
        const response = await authFetch(
            `${API_BASE}/manicurists/${currentManicurist.id}/bookings`,
            { headers: authHeaders() }
        );
        const all = await response.json();
        const upcoming = Array.isArray(all)
            ? all.filter(b => {
                const bd = typeof b.booking_date === 'string'
                    ? b.booking_date.substring(0, 10)
                    : new Date(b.booking_date).toISOString().substring(0, 10);
                return bd >= today && b.status !== 'cancelled';
            }).slice(0, 5)
            : [];

        if (upcoming.length === 0) {
            container.innerHTML = '<div class="agenda-empty-state"><p>Sin citas próximas</p></div>';
            return;
        }

        container.innerHTML = upcoming.map((b, i) => {
            const color = APPT_COLORS[i % APPT_COLORS.length];
            const bd = typeof b.booking_date === 'string'
                ? b.booking_date.substring(0, 10)
                : new Date(b.booking_date).toISOString().substring(0, 10);
            const [y, mo, d] = bd.split('-').map(Number);
            const dateLabel = new Date(y, mo-1, d).toLocaleDateString('es-ES', { day:'numeric', month:'short' });
            return `
            <div class="next-appt-item">
                <div class="next-appt-dot" style="background: ${color.bg}; border-left: 3px solid ${color.text};"></div>
                <div class="next-appt-info">
                    <div class="next-appt-title">${escapeHtml(b.service_title||'Servicio')} · ${escapeHtml(b.client_name||'Clienta')}</div>
                    <div class="next-appt-detail">${dateLabel} · ${(b.booking_time||'').substring(0,5)}</div>
                </div>
            </div>`;
        }).join('');
    } catch(e) {
        container.innerHTML = '<div class="agenda-empty-state"><p>Error cargando</p></div>';
    }
}

// Old aliases (kept for safety – unused now but avoid errors)
function renderMiniCalendar() { renderMiniMonthCal(); }
window.selectDate = function(dateStr) { selectAgendaDate(dateStr); };



// =============================================
// BOOKING CARD RENDERING
// =============================================

function renderBookingCard(booking, context) {
    const status = booking.status || 'pending';
    const statusLabel = STATUS_LABELS[status] || status;
    const time = booking.booking_time.substring(0, 5);

    // Format date - handle both YYYY-MM-DD and full ISO datetime
    const dateRaw = typeof booking.booking_date === 'string' ? booking.booking_date.substring(0, 10) : new Date(booking.booking_date).toISOString().substring(0, 10);
    const [year, month, day] = dateRaw.split('-').map(Number);
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
                    const response = await authFetch(
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
                    const response = await authFetch(
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
                const response = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings/${bookingId}/status`, {
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
        loadAgendaForDate(selectedDate);
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
        const res = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/search-clients?q=${encodeURIComponent(query)}`, { headers: authHeaders() });
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
        const res = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/available-times?date=${date}`, { headers: authHeaders() });
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
        const res = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/bookings`, {
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
        const response = await authFetch(`${API_BASE}/manicurists/${currentManicurist.id}/change-password`, {
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
