/**
 * System Test Script (Corrected)
 * Verifies:
 * 1. Manicurist Login
 * 2. User User Login/Register (Simulation)
 * 3. Booking Creation (Success)
 * 4. Booking Creation (Conflict Failure)
 * 5. Manicurist Dashboard Data Fetch
 */

const BASE_URL = 'http://localhost:3000/api';

async function runTests() {
    console.log('🚀 Starting System Tests...');
    let passed = 0;
    let failed = 0;

    // Helper to log result
    const assert = (desc, condition) => {
        if (condition) {
            console.log(`✅ PASS: ${desc}`);
            passed++;
        } else {
            console.error(`❌ FAIL: ${desc}`);
            failed++;
        }
    };

    try {
        // --- PRE-TEST CLEANUP ---
        // Use a random future date to ensure "clean" agenda
        const randomDay = Math.floor(Math.random() * 20) + 1;
        const dateObj = new Date();
        dateObj.setDate(dateObj.getDate() + randomDay);
        const uniqueTestDate = dateObj.toISOString().split('T')[0];

        console.log(`Using Test Date: ${uniqueTestDate}`);

        // --- TEST 1: Manicurist Login ---
        console.log('\n--- 1. Testing Manicurist Login ---');
        const maniLoginRes = await fetch(`${BASE_URL}/auth/manicurist/login`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ phone: '3001234567', password: 'auba2026' })
        });
        const maniData = await maniLoginRes.json();
        assert('Manicurist login successful', maniData.success === true);
        assert('User role is manicurist', maniData.user && maniData.user.role === 'manicurist');
        const manicuristId = maniData.user ? maniData.user.id : 1;

        // --- TEST 2: User Registration (Mock) ---
        console.log('\n--- 2. Testing User Registration ---');
        // Randomize user to avoid duplicates
        const randomPhone = '320' + Math.floor(1000000 + Math.random() * 9000000);
        const userRegRes = await fetch(`${BASE_URL}/auth/register`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                name: 'Test User',
                phone: randomPhone,
                password: 'password123',
                email: 'test@example.com'
            })
        });
        const userData = await userRegRes.json();
        assert('User registration successful', userData.success === true);
        const userId = userData.user ? userData.user.id : null;

        if (!userId) {
            console.error('CRITICAL: Cannot proceed without user ID');
            return;
        }

        // --- TEST 3: Create Booking (Success) ---
        console.log(`\n--- 3. Testing Booking Creation (Time Slot 10:00) on ${uniqueTestDate} ---`);
        const bookingTime = '10:00:00';

        const bookingRes = await fetch(`${BASE_URL}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                manicurist_id: manicuristId,
                service_id: 1, // Manicura Gel
                booking_date: uniqueTestDate,
                booking_time: bookingTime
            })
        });
        const bookingData = await bookingRes.json();
        if (!bookingData.success) console.error('Error:', bookingData.error);
        assert('Booking created successfully', bookingData.success === true);


        // --- TEST 4: Create Conflicting Booking (Should Fail) ---
        console.log('\n--- 4. Testing Conflict Detection (Overlap 11:00) ---');
        // Attempt to book at 11:00 (overlaps with 10:00-12:00)
        const conflictRes = await fetch(`${BASE_URL}/bookings`, {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                user_id: userId,
                manicurist_id: manicuristId,
                service_id: 2,
                booking_date: uniqueTestDate,
                booking_time: '11:00:00'
            })
        });
        const conflictData = await conflictRes.json();
        assert('Conflicting booking rejected', conflictData.success === false);
        console.log('Conflict Error Message:', conflictData.error);


        // --- TEST 5: Verify Availability Endpoint ---
        console.log('\n--- 5. Testing Availability Endpoint ---');
        const availRes = await fetch(`${BASE_URL}/availability/${manicuristId}/${uniqueTestDate}`);
        const availData = await availRes.json();

        const hasSlot = availData.occupiedSlots && availData.occupiedSlots.some(s => s.start.startsWith('10:00'));
        assert('Availability endpoint reports 10:00 slot occupied', hasSlot);


        // --- TEST 6: Verify Manicurist Dashboard Data ---
        console.log('\n--- 6. Testing Manicurist Agenda ---');
        const agendaRes = await fetch(`${BASE_URL}/manicurists/${manicuristId}/bookings?date=${uniqueTestDate}`);
        const agendaData = await agendaRes.json();

        const hasBooking = agendaData.some(b => b.client_phone === randomPhone);
        assert('Manicurist sees the new booking in agenda', hasBooking);


    } catch (error) {
        console.error('❌ TEST SCRIPT ERROR:', error);
    }

    console.log(`\n\nTotal Tests: ${passed + failed}`);
    console.log(`Passed: ${passed}`);
    console.log(`Failed: ${failed}`);
}

runTests();
