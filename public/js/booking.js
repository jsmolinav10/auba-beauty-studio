/**
 * AUBA - Booking Page Logic (API Version)
 * Conecta con el backend Node.js + MySQL
 */

// BUG-12 FIX: Detectar origin dinámicamente
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const API_BASE = IS_LOCAL ? window.location.origin + '/api' : '/api';

// Datos por defecto (Fallback)
let MANICURISTS = [
    { id: 1, name: "María González", specialty: "Especialista en Nail Art", available: true },
    { id: 2, name: "Camila Rodríguez", specialty: "Experta en Gel & Acrílico", available: true },
    { id: 3, name: "Sofía Martínez", specialty: "Manicura Clásica & Spa", available: true }
];

let SERVICES = [
    { id: 1, title: "Manicura Gel", price: 45000, duration: 60 },
    { id: 2, title: "Pedicura Spa", price: 60000, duration: 75 },
    { id: 3, title: "Lifting de Pestañas", price: 80000, duration: 90 },
    { id: 4, title: "Diseño de Cejas", price: 35000, duration: 45 },
    { id: 5, title: "Maquillaje Social", price: 120000, duration: 120 },
    { id: 6, title: "Tratamiento Facial", price: 150000, duration: 90 }
];

const TIME_SLOTS = ["09:00", "10:00", "11:00", "12:00", "14:00", "15:00", "16:00", "17:00", "18:00"];

let bookingData = {
    manicurist: null,
    date: null,
    time: null,
    service: null,
    user: null
};

// Cargar datos desde la API (si falla, usa los locales)
async function loadData() {
    try {
        const [manicuristsRes, servicesRes] = await Promise.all([
            fetch(`${API_BASE}/manicurists`),
            fetch(`${API_BASE}/services`)
        ]);

        if (manicuristsRes.ok && servicesRes.ok) {
            MANICURISTS = await manicuristsRes.json();
            SERVICES = await servicesRes.json();
            console.log('Datos cargados del servidor');
        }
        return true;
    } catch (error) {
        console.warn('No se pudo conectar al servidor, usando datos locales:', error);
        // No alertamos para no bloquear la UI, simplemente usamos los datos por defecto
        return true;
    }
}

// Formatear precio
function formatPrice(price) {
    return '$' + Number(price).toLocaleString('es-CO');
}

// Generate dates
function generateAvailableDates() {
    const dates = [];
    const today = new Date();
    for (let i = 1; i <= 30; i++) {
        const date = new Date(today);
        date.setDate(today.getDate() + i);
        if (date.getDay() !== 0) { // No Sundays
            dates.push(date);
        }
    }
    return dates;
}

function formatDate(date) {
    const days = ['Dom', 'Lun', 'Mar', 'Mié', 'Jue', 'Vie', 'Sáb'];
    const months = ['Ene', 'Feb', 'Mar', 'Abr', 'May', 'Jun', 'Jul', 'Ago', 'Sep', 'Oct', 'Nov', 'Dic'];
    return {
        dayName: days[date.getDay()],
        day: date.getDate(),
        month: months[date.getMonth()],
        full: date.toISOString().split('T')[0]
    };
}

// Initialize
document.addEventListener('DOMContentLoaded', async () => {
    // Check authentication
    if (!AuthService.isLoggedIn()) {
        alert('Debes iniciar sesión para reservar una cita.');
        window.location.href = 'index.html';
        return;
    }

    // Get current user
    bookingData.user = AuthService.getCurrentUser();
    showUserGreeting();

    // Setup functions first
    setupConfirmButton();
    setupDepositModal();

    // Deposit Modal (Check immediately)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('showDeposit') === 'true') {
        // Short delay to ensure DOM is ready and transitions look good
        setTimeout(() => showDepositModal(), 100);
    }

    // Load data from API
    const dataLoaded = await loadData();
    // Proceed even if dataLoaded is false (we have fallbacks)

    renderManicurists();
    renderCalendar();
    renderServices();
});

function showUserGreeting() {
    const greetingEl = document.getElementById('user-greeting'); // Puede que no exista en booking.html, ignorar si falla
    // En booking.html no hay greeting, pero bueno.
}

// Render Manicurists (Step 1)
function renderManicurists() {
    const container = document.getElementById('manicurists-list');
    container.innerHTML = MANICURISTS.map(m => `
        <div class="manicurist-card" data-id="${m.id}">
            <div class="manicurist-avatar"></div>
            <h3>${m.name}</h3>
            <p>${m.specialty}</p>
            ${m.available ? '<span class="available-badge">● Disponible</span>' : ''}
        </div>
    `).join('');

    document.querySelectorAll('.manicurist-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            selectManicurist(id);
        });
    });
}

// Render Services (Step 2)
function renderServices() {
    const container = document.getElementById('services-selection');
    container.innerHTML = SERVICES.map(s => `
        <div class="service-selection-card" data-id="${s.id}">
            <div class="service-selection-header">
                <h3>${s.title}</h3>
                <span class="service-selection-price">${formatPrice(s.price)}</span>
            </div>
            <p class="service-selection-duration">${s.duration} min (Reserva: 2h)</p>
        </div>
    `).join('');

    document.querySelectorAll('.service-selection-card').forEach(card => {
        card.addEventListener('click', () => {
            const id = parseInt(card.dataset.id);
            selectService(id);
        });
    });
}

// Render Calendar (Step 3)
function renderCalendar() {
    const container = document.getElementById('calendar-dates');
    // Simple calendar logic for next 30 days
    const dates = generateAvailableDates();

    container.innerHTML = dates.map(date => {
        const formatted = formatDate(date);
        return `
            <div class="date-card" data-date="${formatted.full}">
                <div class="date-day-name">${formatted.dayName}</div>
                <div class="date-day">${formatted.day}</div>
                <div class="date-month">${formatted.month}</div>
            </div>
        `;
    }).join('');

    document.querySelectorAll('.date-card').forEach(card => {
        card.addEventListener('click', () => {
            const dateStr = card.dataset.date;
            selectDate(dateStr);
        });
    });
}

// Render Time Slots (Step 4)
async function renderTimeSlots(dateStr) {
    const container = document.getElementById('time-slots');
    container.innerHTML = '<p>Cargando disponibilidad...</p>';

    try {
        // Fetch occupied slots from backend
        const res = await fetch(`${API_BASE}/availability/${bookingData.manicurist.id}/${dateStr}`);
        const data = await res.json();

        let occupiedSlots = [];
        if (data.occupiedSlots) {
            occupiedSlots = data.occupiedSlots;
        }

        container.innerHTML = TIME_SLOTS.map(time => {
            // Check availability
            const isAvailable = checkTimeAvailability(time, occupiedSlots);
            const classes = isAvailable ? 'time-slot' : 'time-slot unavailable';

            return `
                <div class="${classes}" data-time="${time}" ${!isAvailable ? 'style="pointer-events:none"' : ''}>
                    ${time}
                </div>
            `;
        }).join('');

        document.querySelectorAll('.time-slot:not(.unavailable)').forEach(slot => {
            slot.addEventListener('click', () => {
                const time = slot.dataset.time;
                selectTime(time);
            });
        });

    } catch (error) {
        console.error("Error loading availability", error);
        container.innerHTML = '<p>Error cargando horarios. Intenta de nuevo.</p>';
    }
}

// Helper: Check overlap
function checkTimeAvailability(slotTime, occupiedSlots) {
    // Service duration = 2 hours (120 mins)
    // Slot Interval: [Start, Start + 120]

    const slotStart = parseTime(slotTime); // minutes from midnight
    const slotEnd = slotStart + 120;

    for (const occupied of occupiedSlots) {
        // occupied.start is 'HH:MM:SS'
        const occStart = parseTime(occupied.start.substring(0, 5));
        const occEnd = occStart + (occupied.duration || 120); // Default to 2h if not specified

        // Check overlap: taking max of starts < min of ends
        if (Math.max(slotStart, occStart) < Math.min(slotEnd, occEnd)) {
            return false; // Overlap detected
        }
    }
    return true;
}

function parseTime(timeStr) {
    const [hours, minutes] = timeStr.split(':').map(Number);
    return hours * 60 + minutes;
}


// Selection Handlers
function selectManicurist(id) {
    bookingData.manicurist = MANICURISTS.find(m => m.id === id);
    document.querySelectorAll('.manicurist-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.manicurist-card[data-id="${id}"]`).classList.add('selected');
    updateProgress(1);
    showStep('step-services'); // Next step
}

function selectService(id) {
    bookingData.service = SERVICES.find(s => s.id === id);
    document.querySelectorAll('.service-selection-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.service-selection-card[data-id="${id}"]`).classList.add('selected');
    updateProgress(2);
    showStep('step-calendar'); // Next step
}

function selectDate(dateStr) {
    bookingData.date = dateStr;
    document.querySelectorAll('.date-card').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.date-card[data-date="${dateStr}"]`).classList.add('selected');

    // Load time slots for this date
    renderTimeSlots(dateStr);

    updateProgress(3);
    showStep('step-time'); // Next step
}

function selectTime(time) {
    bookingData.time = time;
    document.querySelectorAll('.time-slot').forEach(c => c.classList.remove('selected'));
    document.querySelector(`.time-slot[data-time="${time}"]`).classList.add('selected');

    updateProgress(4);
    updateSummary();
}

// UI Helpers
function showStep(stepId) {
    // Ocultar todos los steps (opcional, o solo hacer scroll)
    // En este diseño parece que se van revelando hacia abajo.
    document.getElementById(stepId).classList.remove('hidden');
    // Scroll to new step
    document.getElementById(stepId).scrollIntoView({ behavior: 'smooth' });
}

function updateProgress(step) {
    for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById(`step-indicator-${i}`);
        if (!indicator) continue;

        if (i < step) {
            indicator.classList.add('completed');
            indicator.classList.remove('active');
        } else if (i === step) {
            indicator.classList.add('active');
            indicator.classList.remove('completed');
        } else {
            indicator.classList.remove('active', 'completed');
        }
    }
}

function updateSummary() {
    const summary = document.getElementById('booking-summary');
    const details = document.getElementById('summary-details');

    if (bookingData.manicurist && bookingData.date && bookingData.service && bookingData.time) {
        details.innerHTML = `
            <li><strong>Cliente:</strong> ${bookingData.user ? bookingData.user.name : 'N/A'}</li>
            <li><strong>Teléfono:</strong> ${bookingData.user ? bookingData.user.phone : 'N/A'}</li>
            <li><strong>Manicurista:</strong> ${bookingData.manicurist.name}</li>
            <li><strong>Servicio:</strong> ${bookingData.service.title}</li>
            <li><strong>Fecha:</strong> ${bookingData.date}</li>
            <li><strong>Hora:</strong> ${bookingData.time}</li>
            <li><strong>Duración:</strong> 2 horas (Est.)</li>
            <li><strong>Precio:</strong> ${formatPrice(bookingData.service.price)}</li>
        `;
        summary.classList.remove('hidden');
    }
}

// Confirm Button
function setupConfirmButton() {
    document.getElementById('btn-confirm').addEventListener('click', async () => {
        if (!bookingData.manicurist || !bookingData.date || !bookingData.service || !bookingData.user || !bookingData.time) {
            alert('Por favor completa todos los pasos.');
            return;
        }

        const btn = document.getElementById('btn-confirm');
        btn.disabled = true;
        btn.textContent = 'Procesando...';

        try {
            const token = localStorage.getItem('auba_auth_token');
            const bookingHeaders = { 'Content-Type': 'application/json' };
            if (token) bookingHeaders['Authorization'] = `Bearer ${token}`;

            const response = await fetch(`${API_BASE}/bookings`, {
                method: 'POST',
                headers: bookingHeaders,
                body: JSON.stringify({
                    user_id: bookingData.user.id,
                    manicurist_id: bookingData.manicurist.id,
                    service_id: bookingData.service.id,
                    booking_date: bookingData.date,
                    booking_time: bookingData.time
                })
            });

            const result = await response.json();

            if (result.success) {
                // Show deposit modal instead of direct alert? 
                // Or show success then redirect. Use alert for now as requested in previous flow.
                alert(`¡Reserva Confirmada! (#${result.booking_id})\n\nCliente: ${bookingData.user.name}\nManicurista: ${bookingData.manicurist.name}\nFecha: ${bookingData.date}\nHora: ${bookingData.time}\nServicio: ${bookingData.service.title}\nPrecio: ${formatPrice(bookingData.service.price)}\n\nTe contactaremos para el abono.`);
                window.location.href = 'index.html';
            } else {
                alert('Error: ' + result.error);
                btn.disabled = false;
                btn.textContent = 'Confirmar Reserva';
            }

        } catch (error) {
            alert('Error conectando con el servidor');
            btn.disabled = false;
            btn.textContent = 'Confirmar Reserva';
        }
    });
}

// Deposit Modal Helpers
function setupDepositModal() {
    const btnContinue = document.getElementById('btn-continue-booking');
    const btnCancel = document.getElementById('btn-cancel-booking');

    if (btnContinue) {
        btnContinue.addEventListener('click', () => {
            hideDepositModal();
        });
    }

    if (btnCancel) {
        btnCancel.addEventListener('click', () => {
            hideDepositModal();
            window.location.href = 'index.html';
        });
    }
}

function showDepositModal() {
    const el = document.getElementById('deposit-modal');
    if (el) el.classList.remove('hidden');
}

function hideDepositModal() {
    const el = document.getElementById('deposit-modal');
    if (el) el.classList.add('hidden');
}

