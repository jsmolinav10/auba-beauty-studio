/**
 * AUBA Security Gate
 * Maneja la pregunta de seguridad antes de acceder a los portales
 * de admin y manicuristas.
 *
 * - Admin: pregunta fija "¿Como ves?" → respuesta "Solo con corazón"
 * - Manicuristas: pregunta variable (obtenida del API) → respuesta variable
 *
 * El estado se persiste en sessionStorage del tab actual.
 */

const SecurityGate = {
    STORAGE_KEY_ADMIN: 'auba_sec_passed_admin',
    STORAGE_KEY_MANICURIST: 'auba_sec_passed_manicurist',

    API_BASE: window.location.origin + '/api',

    ADMIN_QUESTION: '¿Como ves?',

    portal: null,

    init(portal) {
        this.portal = portal;
        this.renderModal();
        this.checkPassed();
    },

    renderModal() {
        if (document.getElementById('security-gate-modal')) return;

        let html = `
        <div id="security-gate-modal" class="security-gate-modal-overlay">
            <div class="security-gate-modal">
                <div class="sg-header">
                    <span class="sg-icon">🔒</span>
                    <h2 class="sg-title" id="sg-title"></h2>
                </div>
                <p class="sg-question" id="sg-question"></p>
                <input type="text" id="sg-answer" class="sg-answer" placeholder="Tu respuesta..." autocomplete="off" />
                <div class="sg-error" id="sg-error"></div>
                <button type="button" class="sg-submit" id="sg-submit">Verificar</button>
            </div>
        </div>
        `;
        document.body.insertAdjacentHTML('beforeend', html);

        document.getElementById('sg-submit').addEventListener('click', () => this.verify());
        document.getElementById('sg-answer').addEventListener('keypress', (e) => {
            if (e.key === 'Enter') this.verify();
        });
    },

    async checkPassed() {
        const key = this.portal === 'admin'
            ? this.STORAGE_KEY_ADMIN
            : this.STORAGE_KEY_MANICURIST;

        const passed = sessionStorage.getItem(key) === 'true';
        if (passed) {
            this.hideModal();
            return true;
        }

        // Show security gate modal
        if (this.portal === 'admin') {
            document.getElementById('sg-title').textContent = 'Acceso Administrador';
            document.getElementById('sg-question').textContent = this.ADMIN_QUESTION;
        } else {
            document.getElementById('sg-title').textContent = 'Acceso Manicuristas';
            try {
                const res = await fetch(`${this.API_BASE}/settings/manicurist-question`);
                const data = await res.json();
                document.getElementById('sg-question').textContent = data.question;
            } catch {
                document.getElementById('sg-question').textContent = this.ADMIN_QUESTION;
            }
        }

        // Hide portal views behind the modal
        const loginView = document.getElementById('login-view');
        const dashboardView = document.getElementById('dashboard-view');
        const loginSection = document.getElementById('login-section');
        const dashboardSection = document.getElementById('dashboard-section');
        if (loginView) loginView.style.display = 'none';
        if (dashboardView) dashboardView.style.display = 'none';
        if (loginSection) loginSection.classList.add('hidden');
        if (dashboardSection) dashboardSection.classList.add('hidden');
        const sidebar = document.querySelector('.sidebar');
        if (sidebar) sidebar.classList.add('hidden');

        document.getElementById('sg-error').textContent = '';
        document.getElementById('sg-answer').value = '';
        document.getElementById('sg-answer').focus();

        this.showModal();
        return false;
    },

    showModal() {
        const modal = document.getElementById('security-gate-modal');
        if (modal) modal.classList.add('sg-active');
        document.body.style.overflow = 'hidden';
    },

    hideModal() {
        const modal = document.getElementById('security-gate-modal');
        if (modal) modal.classList.remove('sg-active');
        document.body.style.overflow = '';
    },

    async verify() {
        const answer = document.getElementById('sg-answer').value.trim();
        const errorEl = document.getElementById('sg-error');
        const submitBtn = document.getElementById('sg-submit');

        if (!answer) {
            errorEl.textContent = 'Por favor, ingresa una respuesta';
            return;
        }

        submitBtn.disabled = true;
        submitBtn.textContent = 'Verificando...';

        try {
            const res = await fetch(`${this.API_BASE}/settings/verify`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ portal: this.portal, answer })
            });
            const data = await res.json();

            if (data.valid) {
                const key = this.portal === 'admin'
                    ? this.STORAGE_KEY_ADMIN
                    : this.STORAGE_KEY_MANICURIST;
                sessionStorage.setItem(key, 'true');
                this.hideModal();
                this.onVerified();
            } else {
                errorEl.textContent = 'Respuesta incorrecta. Inténtalo de nuevo.';
                document.getElementById('sg-answer').value = '';
                document.getElementById('sg-answer').focus();
            }
        } catch (error) {
            errorEl.textContent = 'Error de conexión. Intenta de nuevo.';
        } finally {
            submitBtn.disabled = false;
            submitBtn.textContent = 'Verificar';
        }
    },

    onVerified() {
        if (this.portal === 'admin') {
            const loginSection = document.getElementById('login-section');
            const dashboardSection = document.getElementById('dashboard-section');
            const sidebar = document.querySelector('.sidebar');
            if (loginSection) loginSection.classList.remove('hidden');
            if (dashboardSection) dashboardSection.classList.add('hidden');
            if (sidebar) sidebar.classList.add('hidden');
            AdminApp.checkAuth();
        } else {
            const loginView = document.getElementById('login-view');
            const dashboardView = document.getElementById('dashboard-view');
            if (loginView) loginView.style.display = 'block';
            if (dashboardView) dashboardView.style.display = 'none';
        }
    }
};

document.addEventListener('DOMContentLoaded', () => {
    if (window.SECURITY_GATE_PORTAL) {
        SecurityGate.init(window.SECURITY_GATE_PORTAL);
    }
});
