/**
 * Script to generate valid bcrypt hashes for manicurist passwords
 * Run with: node database/generate_hashes.js
 */

const bcrypt = require('bcryptjs');

async function generateHashes() {
    const password = 'auba2026';
    const hash = await bcrypt.hash(password, 10);

    console.log('='.repeat(60));
    console.log('AUBA Beauty Studio - Password Hash Generator');
    console.log('='.repeat(60));
    console.log('');
    console.log('Default password:', password);
    console.log('');
    console.log('Bcrypt hash:');
    console.log(hash);
    console.log('');
    console.log('Use this SQL to update manicurists:');
    console.log('');
    console.log(`UPDATE manicurists SET password = '${hash}' WHERE password IS NULL OR password = '';`);
    console.log('');
    console.log('='.repeat(60));

    // Verify the hash works
    const isValid = await bcrypt.compare(password, hash);
    console.log('Verification test:', isValid ? '✅ PASSED' : '❌ FAILED');
}

generateHashes();
