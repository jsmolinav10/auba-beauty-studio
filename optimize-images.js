/**
 * Comprime las imagenes de la galeria.
 *
 * Las fotos originales pesan entre 1.5 y 2.6 MB cada una (29 MB en total), lo que
 * hace que la portada tarde en cargar en conexion movil. Este script genera
 * versiones WebP y JPEG ligieras, y deja los originales intactos por si hay que
 * regenerar mas adelante.
 *
 * Ejecutar: node optimize-images.js
 */
const sharp = require('sharp');
const fs = require('fs');
const path = require('path');

const SRC_DIR = path.join(__dirname, 'public', 'assets', 'servicios clientes');
const OUT_DIR = path.join(__dirname, 'public', 'assets', 'galeria');

// Ancho maximo del carrusel. Las imagenes originales son mucho mas grandes de
// lo que se muestra, asi que se reducen sin perdida visible.
const MAX_WIDTH = 1200;
const WEBP_QUALITY = 78;
const JPEG_QUALITY = 72;

async function optimizeFile(fileName) {
    const input = path.join(SRC_DIR, fileName);
    const base = path.basename(fileName, path.extname(fileName));
    const pipeline = sharp(input).rotate().resize({
        width: MAX_WIDTH,
        withoutEnlargement: true
    });

    const webpPath = path.join(OUT_DIR, `${base}.webp`);
    const jpegPath = path.join(OUT_DIR, `${base}.jpg`);

    await pipeline.clone().webp({ quality: WEBP_QUALITY }).toFile(webpPath);
    await pipeline.clone().jpeg({ quality: JPEG_QUALITY, mozjpeg: true }).toFile(jpegPath);

    const original = fs.statSync(input).size;
    const webp = fs.statSync(webpPath).size;
    const jpeg = fs.statSync(jpegPath).size;

    return {
        fileName,
        original: (original / 1024).toFixed(0),
        webp: (webp / 1024).toFixed(0),
        jpeg: (jpeg / 1024).toFixed(0)
    };
}

async function main() {
    if (!fs.existsSync(SRC_DIR)) {
        throw new Error(`No existe el directorio de origen: ${SRC_DIR}`);
    }
    if (!fs.existsSync(OUT_DIR)) {
        fs.mkdirSync(OUT_DIR, { recursive: true });
    }

    const files = fs.readdirSync(SRC_DIR).filter((f) => /\.(jpg|jpeg|png)$/i.test(f));
    if (files.length === 0) {
        console.log('No hay imagenes que optimizar.');
        return;
    }

    console.log(`Optimizando ${files.length} imagenes (ancho max ${MAX_WIDTH}px)\n`);

    let totalOriginal = 0;
    let totalWebp = 0;

    for (const fileName of files) {
        const r = await optimizeFile(fileName);
        totalOriginal += Number(r.original);
        totalWebp += Number(r.webp);
        console.log(
            `  ${r.fileName}\n` +
            `      original ${r.original} KB  ->  webp ${r.webp} KB  /  jpg ${r.jpeg} KB`
        );
    }

    console.log(
        `\nTotal: ${(totalOriginal / 1024).toFixed(1)} MB -> ` +
        `${(totalWebp / 1024).toFixed(1)} MB usando Webp ` +
        `(ahorro del ${(100 - (totalWebp / totalOriginal) * 100).toFixed(0)}%)`
    );
    console.log(`Salida en: ${OUT_DIR}`);
}

main().catch((err) => {
    console.error('Error optimizando imagenes:', err.message);
    process.exit(1);
});
