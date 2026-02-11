/**
 * Script para generar iconos PWA desde el logo original
 * Ejecutar: node generate-pwa-icons.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SIZES = [72, 128, 192, 384, 512];
const SOURCE = path.join(__dirname, 'assets', 'Logo Auba.png');
const OUTPUT_DIR = path.join(__dirname, 'assets', 'icons');

async function generateIcons() {
    // Crear directorio si no existe
    if (!fs.existsSync(OUTPUT_DIR)) {
        fs.mkdirSync(OUTPUT_DIR, { recursive: true });
    }

    console.log('🎨 Generando iconos PWA desde Logo Auba.png...\n');

    for (const size of SIZES) {
        const outputFile = path.join(OUTPUT_DIR, `icon-${size}x${size}.png`);

        await sharp(SOURCE)
            .resize(size, size, {
                fit: 'contain',
                background: { r: 255, g: 255, b: 255, alpha: 1 }
            })
            .png({ quality: 95 })
            .toFile(outputFile);

        console.log(`  ✅ icon-${size}x${size}.png`);
    }

    console.log(`\n✨ ${SIZES.length} iconos generados en assets/icons/`);
}

generateIcons().catch(err => {
    console.error('Error generando iconos:', err);
    process.exit(1);
});
