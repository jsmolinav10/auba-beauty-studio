/**
 * AUBA - Authentication Service (API Version)
 * Conecta con el backend Node.js + MySQL
 */

// BUG-12 FIX: Detectar origin dinámicamente para que funcione en producción
const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
const API_BASE = IS_LOCAL ? window.location.origin + '/api' : '/api';

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

const AuthService = {
    SESSION_KEY: 'auba_current_user',
    TOKEN_KEY: 'auba_auth_token',

    // BUG-13 FIX: Usar localStorage para persistencia entre pestañas y reinicios
    // Registrar nuevo usuario (ahora usa API)
    async register(userData) {
        try {
            const response = await fetch(`${API_BASE}/auth/register`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify(userData)
            });

            const result = await response.json();

            if (result.success) {
                this.setSession(result.user);
                if (result.token) localStorage.setItem(this.TOKEN_KEY, result.token);
            }

            return result;

        } catch (error) {
            console.error('Error de conexión:', error);
            return { success: false, error: 'No se pudo conectar con el servidor' };
        }
    },

    // Iniciar sesión (ahora usa API)
    async login(phone, password) {
        try {
            const response = await fetch(`${API_BASE}/auth/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });

            const result = await response.json();

            if (result.success) {
                this.setSession(result.user);
                if (result.token) localStorage.setItem(this.TOKEN_KEY, result.token);
            }

            return result;

        } catch (error) {
            console.error('Error de conexión:', error);
            return { success: false, error: 'No se pudo conectar con el servidor' };
        }
    },

    // Iniciar sesión manicurista
    async loginManicurist(phone, password) {
        try {
            const response = await fetch(`${API_BASE}/auth/manicurist/login`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ phone, password })
            });

            const result = await response.json();

            if (result.success) {
                this.setSession(result.user);
                if (result.token) localStorage.setItem(this.TOKEN_KEY, result.token);
            }

            return result;

        } catch (error) {
            console.error('Error de conexión:', error);
            return { success: false, error: 'No se pudo conectar con el servidor' };
        }
    },

    // BUG-13 FIX: localStorage persiste entre pestañas y reinicios del navegador
    setSession(user) {
        localStorage.setItem(this.SESSION_KEY, JSON.stringify(user));
    },

    // Cerrar sesión
    logout() {
        localStorage.removeItem(this.SESSION_KEY);
        localStorage.removeItem(this.TOKEN_KEY);
    },

    // Obtener token para peticiones autenticadas
    getToken() {
        return localStorage.getItem(this.TOKEN_KEY);
    },

    // Obtener headers de autorización para fetch
    getAuthHeaders() {
        const token = this.getToken();
        const headers = { 'Content-Type': 'application/json' };
        if (token) headers['Authorization'] = `Bearer ${token}`;
        return headers;
    },

    // Verificar si hay sesión activa
    isLoggedIn() {
        return localStorage.getItem(this.SESSION_KEY) !== null;
    },

    // Obtener usuario actual
    getCurrentUser() {
        const session = localStorage.getItem(this.SESSION_KEY);
        return session ? JSON.parse(session) : null;
    }
};

// ============================================
// Modal de Autenticación
// ============================================

const AuthModal = {
    modal: null,
    currentView: 'login',

    init() {
        this.modal = document.getElementById('auth-modal');
        if (!this.modal) return;

        this.bindEvents();
        this.updateHeaderUI();
    },

    bindEvents() {
        const btnLogin = document.getElementById('btn-login');
        if (btnLogin) {
            btnLogin.addEventListener('click', () => this.open('login'));
        }

        // BUG-16 FIX: Bind close event to ALL close buttons in the modal
        const closeBtns = this.modal.querySelectorAll('.modal-close');
        closeBtns.forEach(btn => {
            btn.addEventListener('click', () => this.close());
        });

        this.modal.addEventListener('click', (e) => {
            if (e.target === this.modal) this.close();
        });

        const toggleLinks = this.modal.querySelectorAll('.auth-toggle');
        toggleLinks.forEach(link => {
            link.addEventListener('click', (e) => {
                e.preventDefault();
                this.toggleView();
            });
        });

        const loginForm = document.getElementById('login-form');
        if (loginForm) {
            loginForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleLogin();
            });
        }

        const registerForm = document.getElementById('register-form');
        if (registerForm) {
            registerForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleRegister();
            });
        }

        const btnLogout = document.getElementById('btn-logout');
        if (btnLogout) {
            btnLogout.addEventListener('click', () => this.handleLogout());
        }

        // Forgot password link
        const btnForgotPassword = document.getElementById('btn-forgot-password');
        if (btnForgotPassword) {
            btnForgotPassword.addEventListener('click', (e) => {
                e.preventDefault();
                this.showView('forgot');
            });
        }

        // Back to login from forgot password
        const btnBackToLogin = document.getElementById('btn-back-to-login');
        if (btnBackToLogin) {
            btnBackToLogin.addEventListener('click', (e) => {
                e.preventDefault();
                this.showView('login');
            });
        }

        // Forgot password form
        const forgotForm = document.getElementById('forgot-password-form');
        if (forgotForm) {
            forgotForm.addEventListener('submit', (e) => {
                e.preventDefault();
                this.handleForgotPassword();
            });
        }

        // BUG-14 FIX: Interceptar todos los links a booking.html (incluyendo con query params)
        document.querySelectorAll('.btn-primary').forEach(btn => {
            const href = btn.getAttribute('href') || '';
            if (href.startsWith('booking.html')) {
                btn.addEventListener('click', (e) => {
                    if (!AuthService.isLoggedIn()) {
                        e.preventDefault();
                        this.open('register');
                    }
                });
            }
        });

        // Password toggle buttons — bind programmatically (CSP-safe)
        document.querySelectorAll('.password-toggle').forEach(btn => {
            btn.addEventListener('click', (e) => {
                e.preventDefault();
                e.stopPropagation();
                const wrapper = btn.closest('.password-wrapper');
                if (wrapper) {
                    const input = wrapper.querySelector('.form-input');
                    if (input) {
                        if (input.type === 'password') {
                            input.type = 'text';
                            btn.textContent = '🙈';
                        } else {
                            input.type = 'password';
                            btn.textContent = '👁';
                        }
                    }
                }
            });
        });
    },

    open(view = 'login') {
        this.currentView = view;
        this.updateView();
        this.modal.classList.add('active');
        document.body.style.overflow = 'hidden';
    },

    close() {
        this.modal.classList.remove('active');
        document.body.style.overflow = '';
        this.clearErrors();
    },

    toggleView() {
        this.currentView = this.currentView === 'login' ? 'register' : 'login';
        this.updateView();
        this.clearErrors();
    },

    showView(view) {
        this.currentView = view;
        this.updateView();
        this.clearErrors();
    },

    updateView() {
        const loginView = document.getElementById('login-view');
        const registerView = document.getElementById('register-view');
        const forgotView = document.getElementById('forgot-password-view');

        // Hide all views
        loginView?.classList.add('hidden');
        registerView?.classList.add('hidden');
        forgotView?.classList.add('hidden');

        // Show selected view
        if (this.currentView === 'login') {
            loginView?.classList.remove('hidden');
        } else if (this.currentView === 'register') {
            registerView?.classList.remove('hidden');
        } else if (this.currentView === 'forgot') {
            forgotView?.classList.remove('hidden');
        }
    },

    async handleLogin() {
        const phone = document.getElementById('login-phone').value;
        const password = document.getElementById('login-password').value;

        // Mostrar loading
        this.setLoading(true);

        const result = await AuthService.login(phone, password);

        this.setLoading(false);

        if (result.success) {
            this.close();
            this.updateHeaderUI();
            this.showSuccess('¡Bienvenido/a de vuelta, ' + result.user.name + '!');
        } else {
            this.showError('login-error', result.error);
        }
    },

    async handleRegister() {
        const userData = {
            name: document.getElementById('register-name').value,
            phone: document.getElementById('register-phone').value,
            email: document.getElementById('register-email').value,
            password: document.getElementById('register-password').value
        };

        // Mostrar loading
        this.setLoading(true);

        const result = await AuthService.register(userData);

        this.setLoading(false);

        if (result.success) {
            this.close();
            this.updateHeaderUI();
            this.showSuccess('¡Bienvenido/a, ' + result.user.name + '! Tu cuenta ha sido creada.');
        } else {
            this.showError('register-error', result.error);
        }
    },

    async handleForgotPassword() {
        const email = document.getElementById('forgot-email').value;
        const errorEl = document.getElementById('forgot-error');
        const successEl = document.getElementById('forgot-success');

        // Reset messages
        errorEl.classList.remove('visible');
        successEl.classList.add('hidden');

        this.setLoading(true);

        try {
            const response = await fetch(`${API_BASE}/auth/forgot-password`, {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ email })
            });

            const result = await response.json();

            this.setLoading(false);

            if (result.success) {
                successEl.textContent = result.message || 'Por favor contacta a soporte por WhatsApp para recuperar tu contraseña.';
                successEl.classList.remove('hidden');
                document.getElementById('forgot-password-form').reset();
            } else {
                errorEl.textContent = result.error || 'Error al procesar la solicitud';
                errorEl.classList.add('visible');
            }
        } catch (error) {
            this.setLoading(false);
            errorEl.textContent = 'Error de conexión con el servidor';
            errorEl.classList.add('visible');
        }
    },

    handleLogout() {
        AuthService.logout();
        this.updateHeaderUI();
        this.showSuccess('Sesión cerrada correctamente');
    },

    setLoading(loading) {
        const buttons = this.modal.querySelectorAll('button[type="submit"]');
        buttons.forEach(btn => {
            btn.disabled = loading;
            if (loading) {
                btn.textContent = 'Cargando...';
            } else {
                // BUG-15 FIX: Restaurar texto correcto según la vista actual
                if (btn.closest('#login-form')) {
                    btn.textContent = 'Ingresar';
                } else if (btn.closest('#register-form')) {
                    btn.textContent = 'Crear Cuenta';
                } else if (btn.closest('#forgot-password-form')) {
                    btn.textContent = 'Enviar Enlace';
                }
            }
        });
    },

    updateHeaderUI() {
        const btnLogin = document.getElementById('btn-login');
        const userMenu = document.getElementById('user-menu');
        const userName = document.getElementById('user-name');

        if (AuthService.isLoggedIn()) {
            const user = AuthService.getCurrentUser();
            if (btnLogin) btnLogin.classList.add('hidden');
            if (userMenu) {
                userMenu.classList.remove('hidden');
                if (userName) userName.textContent = user.name.split(' ')[0];
            }
        } else {
            if (btnLogin) btnLogin.classList.remove('hidden');
            if (userMenu) userMenu.classList.add('hidden');
        }
    },

    showError(elementId, message) {
        const errorEl = document.getElementById(elementId);
        if (errorEl) {
            errorEl.textContent = message;
            errorEl.classList.add('visible');
        }
    },

    clearErrors() {
        document.querySelectorAll('.auth-error').forEach(el => {
            el.textContent = '';
            el.classList.remove('visible');
        });
    },

    showSuccess(message) {
        const toast = document.createElement('div');
        toast.className = 'toast-success';
        toast.textContent = message;
        document.body.appendChild(toast);

        setTimeout(() => toast.classList.add('visible'), 100);
        setTimeout(() => {
            toast.classList.remove('visible');
            setTimeout(() => toast.remove(), 300);
        }, 3000);
    }
};

document.addEventListener('DOMContentLoaded', () => {
    AuthModal.init();

    // Check if we should show login modal (coming from booking page)
    const urlParams = new URLSearchParams(window.location.search);
    if (urlParams.get('showLogin') === 'true') {
        AuthModal.open('login');
        // Clean up URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
});

