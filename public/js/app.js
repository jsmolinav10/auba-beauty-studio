/**
 * AUBA - Main Application Logic (Home Page)
 */

const SERVICES = [
    {
        id: 1,
        title: "Manicura Gel",
        price: "$45.000",
        description: "Limpieza profunda, esmaltado en gel de larga duración y diseño minimalista.",
    },
    {
        id: 2,
        title: "Pedicura Spa",
        price: "$60.000",
        description: "Relajación total, exfoliación, masaje e hidratación profunda.",
    },
    {
        id: 3,
        title: "Lifting de Pestañas",
        price: "$80.000",
        description: "Realza tu mirada con un efecto natural y duradero.",
    },
    {
        id: 4,
        title: "Diseño de Cejas",
        price: "$35.000",
        description: "Visagismo y depilación con hilo para unas cejas perfectas.",
    },
    {
        id: 5,
        title: "Maquillaje Social",
        price: "$120.000",
        description: "Look profesional para eventos especiales, resaltando tu belleza.",
    },
    {
        id: 6,
        title: "Tratamiento Facial",
        price: "$150.000",
        description: "Limpieza e hidratación para una piel radiante y saludable.",
    }
];

document.addEventListener('DOMContentLoaded', () => {
    initServices();
    initScrollEffects();
});

function initServices() {
    const list = document.getElementById('services-list');
    if (!list) return;

    // BUG-27 FIX: Intentar cargar del API primero, fallback a datos locales
    const IS_LOCAL = window.location.hostname === 'localhost' || window.location.hostname === '127.0.0.1' || window.location.hostname.startsWith('192.168.');
    const API_BASE = IS_LOCAL ? window.location.origin + '/api' : 'https://auba-api.onrender.com/api';
    fetch(`${API_BASE}/services`)
        .then(res => res.json())
        .then(data => {
            const services = data.map(s => ({
                id: s.id,
                title: s.title,
                price: `$${Number(s.price).toLocaleString('es-CO')}`,
                description: s.description
            }));
            renderServices(list, services);
        })
        .catch(() => {
            // Fallback: usar datos locales si el API no responde
            renderServices(list, SERVICES);
        });
}

function renderServices(container, services) {
    container.innerHTML = services.map(service => `
        <div class="service-card fade-in-up">
            <div class="service-header">
                <h3 class="service-title">${service.title}</h3>
                <span class="service-price">${service.price}</span>
            </div>
            <p class="service-desc">${service.description}</p>
            <a href="booking.html?showDeposit=true" class="btn-primary full-width">Reservar</a>
        </div>
    `).join('');
}

function initScrollEffects() {
    const header = document.getElementById('main-header');
    if (!header) return;

    window.addEventListener('scroll', () => {
        if (window.scrollY > 50) {
            header.style.boxShadow = "var(--shadow-sm)";
            header.style.background = "rgba(255, 255, 255, 0.95)";
        } else {
            header.style.boxShadow = "none";
            header.style.background = "rgba(255, 255, 255, 0.8)";
        }
    });

    // BUG-22 FIX: Hamburger menu toggle
    const menuToggle = document.querySelector('.mobile-menu-toggle');
    const mainNav = document.querySelector('.main-nav');
    const headerActions = document.querySelector('.header-actions');
    const glassHeader = document.querySelector('.glass-header');
    if (menuToggle && mainNav) {
        menuToggle.addEventListener('click', () => {
            mainNav.classList.toggle('mobile-open');
            menuToggle.classList.toggle('active');
            if (headerActions) headerActions.classList.toggle('mobile-open');
            if (glassHeader) glassHeader.classList.toggle('menu-expanded');
        });

        // Cerrar menú al hacer clic en un enlace
        mainNav.querySelectorAll('a').forEach(link => {
            link.addEventListener('click', () => {
                mainNav.classList.remove('mobile-open');
                menuToggle.classList.remove('active');
                if (headerActions) headerActions.classList.remove('mobile-open');
                if (glassHeader) glassHeader.classList.remove('menu-expanded');
            });
        });
    }
}