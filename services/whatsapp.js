/**
 * AUBA Beauty Studio - WhatsApp Notifications Service
 * Integración con WhatsApp Business API para recordatorios de citas
 */

// Usamos la API de WhatsApp Business Cloud (Meta)
// Alternativa simple: enlaces wa.me para abrir WhatsApp directamente

const WhatsAppService = {
    config: {
        token: process.env.WHATSAPP_TOKEN || '',
        phoneId: process.env.WHATSAPP_PHONE_ID || '',
        businessPhone: process.env.WHATSAPP_BUSINESS_PHONE || '573001234567', // Número de AUBA
        apiVersion: 'v18.0'
    },

    /**
     * Inicializar el servicio con las credenciales
     */
    init(token, phoneId) {
        this.config.token = token;
        this.config.phoneId = phoneId;
        console.log('📱 WhatsApp Service inicializado');
    },

    /**
     * Enviar mensaje de confirmación de reserva
     * @param {Object} booking - Datos de la reserva
     * @param {string} booking.clientPhone - Teléfono del cliente (formato: 573001234567)
     * @param {string} booking.clientName - Nombre del cliente
     * @param {string} booking.serviceName - Nombre del servicio
     * @param {string} booking.date - Fecha de la cita (YYYY-MM-DD)
     * @param {string} booking.time - Hora de la cita (HH:MM)
     * @param {string} booking.manicuristName - Nombre de la manicurista
     */
    async sendBookingConfirmation(booking) {
        const message = this.formatConfirmationMessage(booking);

        // Si no hay API configurada, generar enlace wa.me
        if (!this.config.token || !this.config.phoneId) {
            return this.generateWhatsAppLink(booking.clientPhone, message);
        }

        return this.sendMessage(booking.clientPhone, message);
    },

    /**
     * Enviar recordatorio de cita (1 día antes)
     * @param {Object} booking - Datos de la reserva
     */
    async sendReminder(booking) {
        const message = this.formatReminderMessage(booking);

        if (!this.config.token || !this.config.phoneId) {
            return this.generateWhatsAppLink(booking.clientPhone, message);
        }

        return this.sendMessage(booking.clientPhone, message);
    },

    /**
     * Enviar mensaje usando la API de WhatsApp Business
     * @param {string} phone - Número de teléfono (formato internacional sin +)
     * @param {string} message - Mensaje a enviar
     */
    async sendMessage(phone, message) {
        try {
            const url = `https://graph.facebook.com/${this.config.apiVersion}/${this.config.phoneId}/messages`;

            const response = await fetch(url, {
                method: 'POST',
                headers: {
                    'Authorization': `Bearer ${this.config.token}`,
                    'Content-Type': 'application/json'
                },
                body: JSON.stringify({
                    messaging_product: 'whatsapp',
                    recipient_type: 'individual',
                    to: phone,
                    type: 'text',
                    text: {
                        preview_url: false,
                        body: message
                    }
                })
            });

            const data = await response.json();

            if (data.error) {
                console.error('Error enviando WhatsApp:', data.error);
                return { success: false, error: data.error };
            }

            console.log('✅ Mensaje WhatsApp enviado:', data);
            return { success: true, messageId: data.messages?.[0]?.id };

        } catch (error) {
            console.error('Error en WhatsApp API:', error);
            return { success: false, error: error.message };
        }
    },

    /**
     * Generar enlace wa.me para abrir WhatsApp (alternativa sin API)
     * @param {string} phone - Número de teléfono
     * @param {string} message - Mensaje pre-escrito
     */
    generateWhatsAppLink(phone, message) {
        // Limpiar número (solo dígitos)
        const cleanPhone = phone.replace(/\D/g, '');
        // Agregar código de país si no lo tiene
        const fullPhone = cleanPhone.startsWith('57') ? cleanPhone : `57${cleanPhone}`;

        const encodedMessage = encodeURIComponent(message);
        const link = `https://wa.me/${fullPhone}?text=${encodedMessage}`;

        return {
            success: true,
            type: 'link',
            link: link,
            message: message
        };
    },

    /**
     * Formatear mensaje de confirmación
     */
    formatConfirmationMessage(booking) {
        const formattedDate = this.formatDate(booking.date);
        return `✨ *AUBA Beauty Studio* ✨

¡Hola ${booking.clientName}! 👋

Tu reserva ha sido confirmada:

📅 *Fecha:* ${formattedDate}
🕐 *Hora:* ${booking.time}
💅 *Servicio:* ${booking.serviceName}
👩‍💼 *Especialista:* ${booking.manicuristName}

📍 Dirección: Calle Principal 123, Ciudad

💳 Recuerda que tu depósito será descontado del valor total.

¡Te esperamos! 💖

_Si necesitas reagendar, contáctanos con 24h de anticipación._`;
    },

    /**
     * Formatear mensaje de recordatorio
     */
    formatReminderMessage(booking) {
        const formattedDate = this.formatDate(booking.date);
        return `⏰ *Recordatorio AUBA* ⏰

¡Hola ${booking.clientName}! 👋

Te recordamos que tienes una cita *mañana*:

📅 *Fecha:* ${formattedDate}
🕐 *Hora:* ${booking.time}
💅 *Servicio:* ${booking.serviceName}
👩‍💼 *Especialista:* ${booking.manicuristName}

📍 Dirección: Calle Principal 123, Ciudad

¡Te esperamos! 💅✨

_Si no puedes asistir, avísanos lo antes posible._`;
    },

    /**
     * Formatear fecha en español
     */
    formatDate(dateStr) {
        const date = new Date(dateStr + 'T12:00:00');
        const options = {
            weekday: 'long',
            year: 'numeric',
            month: 'long',
            day: 'numeric'
        };
        return date.toLocaleDateString('es-CO', options);
    },

    /**
     * Normalizar número de teléfono colombiano
     */
    normalizePhone(phone) {
        let cleaned = phone.replace(/\D/g, '');

        // Si empieza con 0, quitarlo
        if (cleaned.startsWith('0')) {
            cleaned = cleaned.substring(1);
        }

        // Si no tiene código de país, agregar 57 (Colombia)
        if (!cleaned.startsWith('57') && cleaned.length === 10) {
            cleaned = '57' + cleaned;
        }

        return cleaned;
    }
};

module.exports = WhatsAppService;
