const bcrypt = require('bcryptjs');

async function genHash() {
    const hash = await bcrypt.hash('auba2026', 10);
    console.log('HASH:', hash);
}

genHash();
