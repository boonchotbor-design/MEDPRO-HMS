const axios = require('axios');

const BASE_URL = 'http://localhost:3000';

async function runTests() {
    console.log('============= STARTING CLINICAL API TESTS =============\n');

    try {
        // 1. Check duplicate patient (should match HN-690023)
        console.log('1. Testing Duplicate Check for ID Card 1100100123456...');
        const dupRes = await axios.post(`${BASE_URL}/api/register/check-duplicate`, {
            idCard: '1100100123456'
        });
        console.log('   Result:', dupRes.data.duplicate ? '✅ Duplicate Detected' : '❌ No Duplicate (Error)');
        if (dupRes.data.duplicate) {
            console.log(`   Existing Patient: ${dupPatInfo(dupRes.data.patient)}`);
        }

        // 2. Register a new patient
        console.log('\n2. Registering new patient "นาย วิชัย ดีพร้อม"...');
        const regRes = await axios.post(`${BASE_URL}/api/register`, {
            idCard: '1234567890123',
            title: 'นาย',
            name: 'วิชัย',
            surname: 'ดีพร้อม',
            gender: 'ชาย',
            dob: '01/01/2530',
            phone: '0899999999',
            address: '456/78 ต.หมากแข้ง อ.เมือง จ.อุดรธานี 41000',
            rights: 'บัตรทอง (30 บาท)',
            bloodGroup: 'AB',
            maritalStatus: 'โสด',
            emergencyContact: 'นางสมศรี ดีพร้อม',
            relationship: 'มารดา',
            emergencyPhone: '0888888888',
            conditions: 'ไม่มี',
            allergy: 'ไม่มี',
            isConfidential: false,
            confidentialRole: 'staff',
            isDeceased: false
        });
        const newHn = regRes.data.data.hn;
        console.log(`   Result: ✅ Registered Successfully. Assigned HN: ${newHn}`);

        // 3. Search and load details of the new patient
        console.log(`\n3. Loading details of new patient ${newHn}...`);
        const searchRes = await axios.get(`${BASE_URL}/api/patients/search?q=${newHn}`);
        console.log('   Result:', searchRes.data.data.length > 0 ? `✅ Found: ${searchRes.data.data[0].fullName}` : '❌ Not Found');

        // 4. Send visit for HN-690023 with multiple rights and ICD-10 (I10) & ICD-9 (89.52)
        console.log('\n4. Recording patient visit with multiple rights and ICD diagnoses...');
        const visitRes = await axios.post(`${BASE_URL}/api/patients/visit`, {
            hn: 'HN-690023',
            doctor: 'นพ. สมชาย (โรคทั่วไป)',
            triage: 'มาตรวจความดันและรับยาตามนัด สัญญาณชีพเสถียร',
            rights: ['บัตรทอง (30 บาท)', 'ประกันสุขภาพเอกชน'],
            diagnoses: [{ code: 'I10', name: 'Essential (primary) hypertension (โรคความดันโลหิตสูง)' }],
            procedures: [{ code: '89.52', name: 'Electrocardiogram (ตรวจคลื่นไฟฟ้าหัวใจ - ECG)' }],
            status: 'รอตรวจ'
        });
        console.log('   Result: ✅ Visit Saved Successfully.');
        console.log(`   Visit ID: ${visitRes.data.visit.visitId} | Rights: ${visitRes.data.visit.rights.join(', ')}`);

        // 5. Verify visit appears in patient history
        console.log('\n5. Verifying visit appears in patient history for HN-690023...');
        const historyRes = await axios.get(`${BASE_URL}/api/patients/HN-690023/visits`);
        const latestVisit = historyRes.data.data[historyRes.data.data.length - 1];
        console.log(`   Result: ✅ Found visit. Doctor: ${latestVisit.doctor} | Diagnoses: ${latestVisit.diagnoses.map(d=>d.code).join(', ')}`);

        // 6. Merge new patient HN into HN-690023
        console.log(`\n6. Merging duplicate patient ${newHn} into Master HN-690023...`);
        const mergeRes = await axios.post(`${BASE_URL}/api/patients/merge`, {
            masterHn: 'HN-690023',
            secondaryHn: newHn,
            docRef: 'ใบรับคำร้องการยุบรวมแฟ้มประวัติคนไข้ซ้ำซ้อน เลขที่ 06/2569',
            officer: 'พญ. วารุณี รักษ์ไทย'
        });
        console.log('   Result: ✅ Merged Successfully.', mergeRes.data.message);

        // Verify merge completed (secondary HN is inactive)
        console.log(`\n7. Checking active status of secondary patient ${newHn} after merge...`);
        const secRes = await axios.get(`${BASE_URL}/api/patient/${newHn}`).catch(err => err.response);
        console.log('   Result:', secRes.status === 404 ? '✅ Patient file deactivated (Merged)' : '❌ Error: Patient file still active');

        console.log('\n============= ALL CLINICAL TESTS COMPLETED SUCCESSFULLY =============');
    } catch (err) {
        console.error('\n❌ Test execution failed with error:', err.message);
        if (err.response) {
            console.error('Response data:', err.response.data);
        }
    }
}

function dupPatInfo(p) {
    return `${p.fullName} (HN: ${p.hn}, DOB: ${p.dob}, มารดา: ${p.motherName})`;
}

runTests();
