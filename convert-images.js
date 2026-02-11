/**
 * Convert HEIC images to JPEG format
 * Run with: node convert-images.js
 */

const convert = require('heic-convert');
const fs = require('fs');
const path = require('path');
const { promisify } = require('util');

const readFile = promisify(fs.readFile);
const writeFile = promisify(fs.writeFile);

const inputDir = './assets/servicios clientes';
const outputDir = './assets/servicios clientes';

async function convertImages() {
    console.log('🔄 Starting image conversion...\n');

    const files = fs.readdirSync(inputDir);
    const heicFiles = files.filter(f => f.toLowerCase().endsWith('.heic'));

    console.log(`Found ${heicFiles.length} HEIC files to convert\n`);

    let converted = 0;
    let failed = 0;

    for (const file of heicFiles) {
        const inputPath = path.join(inputDir, file);
        const baseName = file.replace(/\.heic$/i, '');
        const outputPath = path.join(outputDir, `${baseName}.jpg`);

        try {
            console.log(`Converting: ${file}...`);

            const inputBuffer = await readFile(inputPath);
            const outputBuffer = await convert({
                buffer: inputBuffer,
                format: 'JPEG',
                quality: 0.85
            });

            await writeFile(outputPath, outputBuffer);
            console.log(`✅ Converted: ${file} → ${baseName}.jpg`);
            converted++;
        } catch (error) {
            console.log(`❌ Failed: ${file} - ${error.message}`);
            failed++;
        }
    }

    console.log(`\n🎉 Conversion complete!`);
    console.log(`   ✅ Converted: ${converted}`);
    console.log(`   ❌ Failed: ${failed}`);
}

convertImages();
