/**
 * AUBA - My Bookings Page Logic
 * Portal para que usuarios vean y reagenden sus citas
 */

// BUG-12 FIX: Detectar origin dinámicamente
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const API_BASE = IS_LOCAL ? window.location.origin + '/api' : 'https://auba-api.onrender.com/api';
const SESSION_KEY = 'auba_current_user';

const TIME_SLOTS = ['09:00', '10:00', '11:00', '12:00', '14:00', '15:00', '16:00', '17:00', '18:00'];

// Auth headers helper
function userAuthHeaders(extra = {}) {
    const token = localStorage.getItem('auba_auth_token');
    const headers = { ...extra };
    if (token) headers['Authorization'] = `Bearer ${token}`;
    return headers;
}

const STATUS_LABELS = {
    'pending': 'Pendiente',
    'confirmed': 'Confirmada',
    'in_progress': 'En Progreso',
    'completed': 'Completada',
    'cancelled': 'Cancelada',
    'no_show': 'No Asistió'
};

let currentUser = null;
let allBookings = [];
let rescheduleData = {
    bookingId: null,
    manicuristId: null,
    newDate: null,
    newTime: null,
    occupiedSlots: []
};

// =============================================
// INITIALIZATION
// =============================================

document.addEventListener('DOMContentLoaded', () => {
    currentUser = getCurrentUser();

    if (!currentUser) {
        document.getElementById('auth-required').classList.remove('hidden');
        document.getElementById('main-content').classList.add('hidden');
        return;
    }

    // Show user info
    document.getElementById('user-info').innerHTML = `
        Hola, <strong>${currentUser.name}</strong>
    `;

    // Show main content
    document.getElementById('auth-required').classList.add('hidden');
    document.getElementById('main-content').classList.remove('hidden');

    // Setup tabs
    setupTabs();

    // Setup modal
    setupModal();

    // Load bookings
    loadBookings();
});

// =============================================
// AUTH
// =============================================

function getCurrentUser() {
    const session = localStorage.getItem(SESSION_KEY);
    return session ? JSON.parse(session) : null;
}

// =============================================
// TABS
// =============================================

function setupTabs() {
    document.querySelectorAll('.tab-btn').forEach(btn => {
        btn.addEventListener('click', () => {
            const tabId = btn.dataset.tab;

            // Update button states
            document.querySelectorAll('.tab-btn').forEach(b => b.classList.remove('active'));
            btn.classList.add('active');

            // Update content visibility
            document.querySelectorAll('.tab-content').forEach(c => c.classList.add('hidden'));
            document.getElementById(`tab-${tabId}`).classList.remove('hidden');
        });
    });
}

// =============================================
// DATA LOADING
// =============================================

async function loadBookings() {
    try {
        const response = await fetch(`${API_BASE}/bookings/${currentUser.id}`, {
            headers: userAuthHeaders()
        });
        allBookings = await response.json();

        renderBookings();
    } catch (error) {
        console.error('Error loading bookings:', error);
        document.getElementById('upcoming-bookings').innerHTML = `
            <div class="empty-state">
                <p style="color: red;">Error cargando citas. Verifica que el servidor esté activo.</p>
            </div>
        `;
    }
}

function renderBookings() {
    const today = new Date();
    today.setHours(0, 0, 0, 0);

    // Split into upcoming and past
    const upcoming = allBookings.filter(b => {
        const bookingDate = new Date(b.booking_date + 'T00:00:00');
        return bookingDate >= today && b.status !== 'completed' && b.status !== 'cancelled' && b.status !== 'no_show';
    });

    const past = allBookings.filter(b => {
        const bookingDate = new Date(b.booking_date + 'T00:00:00');
        return bookingDate < today || b.status === 'completed' || b.status === 'cancelled' || b.status === 'no_show';
    });

    // Render upcoming
    const upcomingContainer = document.getElementById('upcoming-bookings');
    if (upcoming.length === 0) {
        upcomingContainer.innerHTML = `
            <div class="empty-state">
                <p>📭 No tienes citas próximas.</p>
                <a href="booking.html" class="btn-primary">Reservar Cita</a>
            </div>
        `;
    } else {
        upcomingContainer.innerHTML = upcoming.map(b => renderBookingCard(b, true)).join('');
        attachRescheduleListeners();
    }

    // Render past
    const pastContainer = document.getElementById('past-bookings');
    if (past.length === 0) {
        pastContainer.innerHTML = `
            <div class="empty-state">
                <p>No tienes citas anteriores.</p>
            </div>
        `;
    } else {
        pastContainer.innerHTML = past.map(b => renderBookingCard(b, false)).join('');
    }
}

function renderBookingCard(booking, isUpcoming) {
    const status = booking.status || 'pending';
    const statusLabel = STATUS_LABELS[status] || status;

    // Format date
    const [year, month, day] = booking.booking_date.split('-').map(Number);
    const dateObj = new Date(year, month - 1, day);
    const dateFormatted = dateObj.toLocaleDateString('es-ES', {
        weekday: 'long',
        day: 'numeric',
        month: 'long'
    });

    // Check if can reschedule (more than 24 hours before)
    const bookingDateTime = new Date(booking.booking_date + 'T' + booking.booking_time);
    const now = new Date();
    const hoursUntilBooking = (bookingDateTime - now) / (1000 * 60 * 60);
    const canReschedule = hoursUntilBooking > 24 && isUpcoming && status !== 'in_progress' && status !== 'completed';

    let rescheduleHtml = '';
    if (isUpcoming && status !== 'completed' && status !== 'cancelled') {
        if (canReschedule) {
            rescheduleHtml = `
                <button class="btn-reschedule" data-id="${booking.id}" data-manicurist="${booking.manicurist_id || 1}">
                    📅 Reagendar
                </button>
            `;
        } else if (hoursUntilBooking <= 24 && hoursUntilBooking > 0) {
            rescheduleHtml = `
                <button class="btn-reschedule" disabled>📅 Reagendar</button>
                <p class="reschedule-warning">⚠️ Solo puedes reagendar con más de 24h de anticipación</p>
            `;
        }
    }

    return `
        <div class="booking-card ${isUpcoming ? 'upcoming' : 'past'}">
            <div class="booking-info">
                <div class="booking-date">${dateFormatted} - ${booking.booking_time.substring(0, 5)}</div>
                <div class="booking-details">
                    ${booking.service_title} con ${booking.manicurist_name}<br>
                    💰 $${Number(booking.service_price).toLocaleString('es-CO')}
                </div>
                <span class="booking-status status-${status}">${statusLabel}</span>
            </div>
            <div class="booking-actions">
                ${rescheduleHtml}
            </div>
        </div>
    `;
}

// =============================================
// RESCHEDULE MODAL
// =============================================

function setupModal() {
    document.getElementById('btn-cancel-reschedule').addEventListener('click', closeModal);
    document.getElementById('btn-confirm-reschedule').addEventListener('click', confirmReschedule);
}

function attachRescheduleListeners() {
    document.querySelectorAll('.btn-reschedule:not([disabled])').forEach(btn => {
        btn.addEventListener('click', () => {
            const bookingId = btn.dataset.id;
            const manicuristId = btn.dataset.manicurist;
            openRescheduleModal(bookingId, manicuristId);
        });
    });
}

function openRescheduleModal(bookingId, manicuristId) {
    rescheduleData = {
        bookingId,
        manicuristId,
        newDate: null,
        newTime: null,
        occupiedSlots: []
    };

    // Reset UI
    document.getElementById('btn-confirm-reschedule').disabled = true;

    // Render available dates (next 30 days, no Sundays)
    renderRescheduleDates();

    // Clear times until date is selected
    document.getElementById('reschedule-times').innerHTML = '<p style="color: #888; grid-column: span 3; text-align: center;">Selecciona una fecha primero</p>';

    // Show modal
    document.getElementById('reschedule-modal').classList.remove('hidden');
}

function closeModal() {
    document.getElementById('reschedule-modal').classList.add('hidden');
}

function renderRescheduleDates() {
    const container = document.getElementById('reschedule-dates');
    const today = new Date();
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];

    let html = '';
    for (let i = 1; i <= 21; i++) { // 3 weeks
        const date = new Date(today);
        date.setDate(today.getDate() + i);

        const dateStr = date.toISOString().split('T')[0];
        const dayName = days[date.getDay()];
        const isSunday = date.getDay() === 0;

        html += `
            <div class="date-option ${isSunday ? 'disabled' : ''}" 
                 data-date="${dateStr}" 
                 ${isSunday ? '' : `onclick="selectRescheduleDate('${dateStr}')"`}>
                <span>${dayName}</span>
                <span class="day">${date.getDate()}</span>
            </div>
        `;
    }

    container.innerHTML = html;
}

window.selectRescheduleDate = async function (dateStr) {
    rescheduleData.newDate = dateStr;
    rescheduleData.newTime = null;

    // Update date UI
    document.querySelectorAll('#reschedule-dates .date-option').forEach(el => {
        el.classList.remove('selected');
        if (el.dataset.date === dateStr) {
            el.classList.add('selected');
        }
    });

    // Load available times
    await loadAvailableTimes(dateStr);
};

async function loadAvailableTimes(dateStr) {
    const container = document.getElementById('reschedule-times');
    container.innerHTML = '<p style="color: #888; grid-column: span 3; text-align: center;">Cargando horarios...</p>';

    try {
        const response = await fetch(`${API_BASE}/availability/${rescheduleData.manicuristId}/${dateStr}`);
        const data = await response.json();
        rescheduleData.occupiedSlots = data.occupiedSlots || [];

        renderAvailableTimes();
    } catch (error) {
        container.innerHTML = '<p style="color: red; grid-column: span 3; text-align: center;">Error cargando horarios</p>';
    }
}

function renderAvailableTimes() {
    const container = document.getElementById('reschedule-times');

    let html = TIME_SLOTS.map(time => {
        const isOccupied = isTimeOccupied(time);
        return `
            <div class="time-option ${isOccupied ? 'disabled' : ''}" 
                 data-time="${time}"
                 ${isOccupied ? '' : `onclick="selectRescheduleTime('${time}')"`}>
                ${time}
            </div>
        `;
    }).join('');

    container.innerHTML = html;
}

function isTimeOccupied(time) {
    const timeMinutes = timeToMinutes(time);

    for (const occupied of rescheduleData.occupiedSlots) {
        const occupiedStart = timeToMinutes(occupied.start.substring(0, 5));
        const occupiedEnd = occupiedStart + (occupied.duration || 120);

        if (timeMinutes >= occupiedStart && timeMinutes < occupiedEnd) {
            return true;
        }
    }

    return false;
}

function timeToMinutes(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}

window.selectRescheduleTime = function (time) {
    rescheduleData.newTime = time;

    // Update time UI
    document.querySelectorAll('#reschedule-times .time-option').forEach(el => {
        el.classList.remove('selected');
        if (el.dataset.time === time) {
            el.classList.add('selected');
        }
    });

    // Enable confirm button
    document.getElementById('btn-confirm-reschedule').disabled = false;
};

async function confirmReschedule() {
    if (!rescheduleData.newDate || !rescheduleData.newTime) {
        alert('Por favor selecciona fecha y hora.');
        return;
    }

    const btn = document.getElementById('btn-confirm-reschedule');
    btn.disabled = true;
    btn.textContent = 'Procesando...';

    try {
        const response = await fetch(`${API_BASE}/bookings/${rescheduleData.bookingId}/reschedule`, {
            method: 'PUT',
            headers: userAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({
                user_id: currentUser.id,
                new_date: rescheduleData.newDate,
                new_time: rescheduleData.newTime + ':00'
            })
        });

        const result = await response.json();

        if (result.success) {
            alert('✅ Cita reagendada exitosamente!');
            closeModal();
            loadBookings(); // Refresh list
        } else {
            alert('Error: ' + (result.error || 'No se pudo reagendar'));
        }
    } catch (error) {
        console.error('Error rescheduling:', error);
        alert('Error de conexión');
    }

    btn.disabled = false;
    btn.textContent = 'Confirmar Reagendamiento';
}

// =============================================
// CAMBIO DE CONTRASEÑA
// =============================================

document.getElementById('btn-change-password').addEventListener('click', () => {
    document.getElementById('change-password-modal').classList.remove('hidden');
});

document.getElementById('btn-cancel-password').addEventListener('click', () => {
    document.getElementById('change-password-modal').classList.add('hidden');
    document.getElementById('new-password').value = '';
});

document.getElementById('change-password-form').addEventListener('submit', async (e) => {
    e.preventDefault();
    const newPassword = document.getElementById('new-password').value;
    const btn = e.target.querySelector('button[type="submit"]');
    btn.disabled = true;
    btn.textContent = 'Guardando...';

    try {
        const response = await fetch(`${API_BASE}/auth/change-password`, {
            method: 'PUT',
            headers: userAuthHeaders({ 'Content-Type': 'application/json' }),
            body: JSON.stringify({ newPassword })
        });
        
        const data = await response.json();
        if (data.success) {
            alert('Contraseña actualizada correctamente. Por favor inicia sesión nuevamente.');
            localStorage.removeItem(SESSION_KEY);
            localStorage.removeItem('auba_auth_token');
            window.location.href = 'index.html'; // Redirect to login
        } else {
            alert('Error: ' + (data.error || 'No se pudo actualizar'));
        }
    } catch (error) {
        console.error('Error changing password:', error);
        alert('Error de conexión');
    } finally {
        btn.disabled = false;
        btn.textContent = 'Guardar';
        document.getElementById('change-password-modal').classList.add('hidden');
        document.getElementById('new-password').value = '';
    }
});
