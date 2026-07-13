/**
 * AUBA Beauty Studio - ePayco Payments Module
 * Integración con pasarela de pagos ePayco (PSE, Nequi, Daviplata, Tarjetas)
 */

const EpaycoPayments = {
    // Configuración - se llenará desde el servidor o variables globales
    config: {
        publicKey: '', // Se configura desde el HTML
        testMode: true
    },

    /**
     * Inicializar ePayco con la llave pública
     * @param {string} publicKey - Llave pública de ePayco
     * @param {boolean} testMode - Modo pruebas (true) o producción (false)
     */
    init(publicKey, testMode = true) {
        this.config.publicKey = publicKey;
        this.config.testMode = testMode;
        console.log('💳 ePayco inicializado en modo:', testMode ? 'PRUEBAS' : 'PRODUCCIÓN');
    },

    /**
     * Abrir el checkout de ePayco para procesar un pago
     * @param {Object} paymentData - Datos del pago
     * @param {number} paymentData.amount - Monto a cobrar en COP
     * @param {string} paymentData.description - Descripción del servicio
     * @param {string} paymentData.invoiceNumber - Número de factura/reserva
     * @param {string} paymentData.customerName - Nombre del cliente
     * @param {string} paymentData.customerEmail - Email del cliente
     * @param {string} paymentData.customerPhone - Teléfono del cliente
     * @param {Function} onSuccess - Callback cuando el pago es exitoso
     * @param {Function} onError - Callback cuando hay error
     */
    openCheckout(paymentData, onSuccess, onError) {
        // Verificar que ePayco esté cargado
        if (typeof ePayco === 'undefined') {
            console.error('ePayco SDK no está cargado');
            if (onError) onError({ message: 'ePayco no está disponible' });
            return;
        }

        // Validar datos requeridos
        if (!paymentData.amount || !paymentData.description) {
            if (onError) onError({ message: 'Faltan datos requeridos para el pago' });
            return;
        }

        // Crear el handler de ePayco
        const handler = ePayco.checkout.configure({
            key: this.config.publicKey,
            test: this.config.testMode
        });

        // Configurar los datos del pago
        const data = {
            // Datos requeridos
            name: paymentData.description,
            description: paymentData.description,
            invoice: paymentData.invoiceNumber || `AUBA-${Date.now()}`,
            currency: 'cop',
            amount: paymentData.amount.toString(),
            tax_base: '0',
            tax: '0',
            tax_ico: '0',
            country: 'co',
            lang: 'es',

            // Datos del cliente
            external: 'false',
            name_billing: paymentData.customerName || 'Cliente AUBA',
            address_billing: 'Bogotá',
            type_doc_billing: 'cc',
            mobilephone_billing: paymentData.customerPhone || '',
            email_billing: paymentData.customerEmail || 'cliente@auba.com',

            // URLs de respuesta
            response: `${window.location.origin}/booking.html?payment=response`,
            confirmation: `${window.location.origin}/api/payments/confirm`,

            // Métodos de pago habilitados
            methodsDisable: [] // Todos habilitados: PSE, tarjetas, Nequi, Daviplata
        };

        // Abrir el checkout
        handler.open(data);

        // Guardar callbacks para usar después
        this._onSuccess = onSuccess;
        this._onError = onError;
    },

    /**
     * Procesar la respuesta de ePayco después del pago
     * @param {Object} response - Respuesta de ePayco
     */
    handleResponse(response) {
        console.log('📦 Respuesta de ePayco:', response);

        // Códigos de respuesta de ePayco
        // x_cod_response: 1 = Aceptado, 2 = Rechazado, 3 = Pendiente, 4 = Fallido
        if (response.x_cod_response === '1' || response.x_cod_response === 1) {
            console.log('✅ Pago exitoso');
            if (this._onSuccess) {
                this._onSuccess({
                    transactionId: response.x_id_invoice,
                    reference: response.x_ref_payco,
                    amount: response.x_amount,
                    status: 'approved'
                });
            }
        } else if (response.x_cod_response === '3' || response.x_cod_response === 3) {
            console.log('⏳ Pago pendiente');
            if (this._onSuccess) {
                this._onSuccess({
                    transactionId: response.x_id_invoice,
                    reference: response.x_ref_payco,
                    amount: response.x_amount,
                    status: 'pending'
                });
            }
        } else {
            console.log('❌ Pago rechazado o fallido');
            if (this._onError) {
                this._onError({
                    message: response.x_response_reason_text || 'Pago no completado',
                    code: response.x_cod_response
                });
            }
        }
    },

    /**
     * Verificar el estado de una transacción
     * @param {string} refPayco - Referencia de ePayco
     * @returns {Promise} Estado de la transacción
     */
    async verifyTransaction(refPayco) {
        try {
            const response = await fetch(`/api/payments/verify/${refPayco}`);
            const data = await response.json();
            return data;
        } catch (error) {
            console.error('Error verificando transacción:', error);
            throw error;
        }
    },

    /**
     * Calcular el monto del depósito (30% del total)
     * @param {number} totalAmount - Monto total del servicio
     * @returns {number} Monto del depósito
     */
    calculateDeposit(totalAmount) {
        const depositPercentage = 0.30; // 30%
        return Math.round(totalAmount * depositPercentage);
    },

    /**
     * Formatear precio en pesos colombianos
     * @param {number} amount - Monto
     * @returns {string} Monto formateado
     */
    formatPrice(amount) {
        return new Intl.NumberFormat('es-CO', {
            style: 'currency',
            currency: 'COP',
            minimumFractionDigits: 0
        }).format(amount);
    }
};

// Exportar para uso global
window.EpaycoPayments = EpaycoPayments;

// Manejar respuesta de ePayco si viene en la URL
document.addEventListener('DOMContentLoaded', () => {
    const urlParams = new URLSearchParams(window.location.search);

    if (urlParams.get('payment') === 'response') {
        // ePayco envía los datos como parámetros en la URL
        const response = {
            x_cod_response: urlParams.get('x_cod_response'),
            x_id_invoice: urlParams.get('x_id_invoice'),
            x_ref_payco: urlParams.get('x_ref_payco'),
            x_amount: urlParams.get('x_amount'),
            x_response_reason_text: urlParams.get('x_response_reason_text')
        };

        EpaycoPayments.handleResponse(response);
    }
});
