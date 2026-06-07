require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');
const fs = require('fs');

const app = express();
const port = process.env.PORT || 3000;

// Simple Logger
app.use((req, res, next) => {
    console.log(`[${new Date().toISOString()}] ${req.method} ${req.url}`);
    next();
});

// GAS Configuration
const GOOGLE_SCRIPT_URL = process.env.GOOGLE_SCRIPT_URL;

// LINE Configuration from .env
const lineConfig = {
    channelAccessToken: process.env.LINE_CHANNEL_ACCESS_TOKEN,
    channelSecret: process.env.LINE_CHANNEL_SECRET
};

const client = new line.messagingApi.MessagingApiClient({
    channelAccessToken: lineConfig.channelAccessToken
});

// JSON Local Database Configuration
const DB_FILE = path.join(__dirname, 'database.json');

// Mock ICD Codes
const ICD10_CODES = [
    { code: "I10", name: "Essential (primary) hypertension (โรคความดันโลหิตสูง)" },
    { code: "E11.9", name: "Type 2 diabetes mellitus without complications (โรคเบาหวาน ชนิดที่ 2)" },
    { code: "J00", name: "Acute nasopharyngitis [common cold] (โรคไข้หวัดทั่วไป)" },
    { code: "J20.9", name: "Acute bronchitis, unspecified (โรคหลอดลมอักเสบเฉียบพลัน)" },
    { code: "K21.9", name: "Gastro-esophageal reflux disease without esophagitis (กรดไหลย้อน)" },
    { code: "M54.5", name: "Low back pain (อาการปวดหลังส่วนล่าง)" },
    { code: "N39.0", name: "Urinary tract infection, site not specified (โรคติดเชื้อทางเดินปัสสาวะ)" },
    { code: "H10.9", name: "Conjunctivitis, unspecified (โรคตาแดง)" },
    { code: "A09.9", name: "Gastroenteritis and colitis of infectious origin, unspecified (โรคท้องร่วงเฉียบพลัน)" },
    { code: "Z00.0", name: "General medical examination (ตรวจสุขภาพทั่วไป)" }
];

const ICD9_CODES = [
    { code: "89.52", name: "Electrocardiogram (ตรวจคลื่นไฟฟ้าหัวใจ - ECG)" },
    { code: "99.21", name: "Injection of antibiotic (ฉีดยาปฏิชีวนะ)" },
    { code: "93.94", name: "Respiratory medication administered by nebulizer (พ่นยาขยายหลอดลม)" },
    { code: "86.3", name: "Other local excision or destruction of lesion or tissue of skin (ผ่าตัดเล็ก/เย็บแผล)" },
    { code: "96.59", name: "Other irrigation of wound (ล้างแผล)" }
];

function initDb() {
    if (!fs.existsSync(DB_FILE)) {
        const initialData = {
            patients: {
                "HN-690023": {
                    hn: "HN-690023",
                    idCard: "1100100123456",
                    title: "คุณ",
                    name: "สมศักดิ์",
                    surname: "รักดี",
                    gender: "ชาย",
                    dob: "15/08/2528",
                    phone: "081-234-5678",
                    address: "123/45 หมู่ 3 ต.หมากแข้ง อ.เมือง จ.อุดรธานี 41000",
                    rights: "ประกันสังคม",
                    conditions: "ความดันโลหิตสูง",
                    allergy: "Penicillin",
                    bloodGroup: "O",
                    maritalStatus: "สมรส",
                    ethnicity: "ไทย",
                    nationality: "ไทย",
                    religion: "พุทธ",
                    occupation: "รับจ้าง",
                    physical: "รูปร่างสันทัด ผิวสองสี",
                    fatherName: "นายสมบูรณ์ รักดี",
                    motherName: "นางดีใจ รักดี",
                    spouseName: "นางปรานี รักดี",
                    emergencyContact: "นางปรานี รักดี",
                    relationship: "คู่สมรส",
                    emergencyPhone: "082-345-6789",
                    isConfidential: false,
                    confidentialRole: "staff",
                    isDeceased: false,
                    deathDate: "",
                    deathCause: "",
                    deathPlace: "",
                    deathDoctor: "",
                    active: true,
                    photo: "https://api.dicebear.com/7.x/adventurer/svg?seed=Somsak"
                }
            },
            visits: [
                {
                    visitId: "V-000001",
                    hn: "HN-690023",
                    patientName: "สมศักดิ์ รักดี",
                    date: new Date().toLocaleDateString('th-TH'),
                    time: "10:30",
                    doctor: "นพ. สมชาย (โรคทั่วไป)",
                    triage: "มาตรวจสุขภาพและรับยาลดความดันประจำเดือน (BP: 135/85 mmHg)",
                    rights: ["ประกันสังคม"],
                    diagnoses: [{ code: "I10", name: "Essential (primary) hypertension (โรคความดันโลหิตสูง)" }],
                    procedures: [{ code: "89.52", name: "Electrocardiogram (ตรวจคลื่นไฟฟ้าหัวใจ - ECG)" }],
                    status: "เสร็จสิ้น"
                }
            ],
            logs: [],
            mergeLogs: [],
            printLogs: []
        };
        fs.writeFileSync(DB_FILE, JSON.stringify(initialData, null, 2), 'utf-8');
    }
}
initDb();

function readDb() {
    try {
        const data = fs.readFileSync(DB_FILE, 'utf-8');
        return JSON.parse(data);
    } catch (err) {
        console.error('Error reading JSON DB', err);
        return { patients: {}, visits: [], logs: [], mergeLogs: [], printLogs: [] };
    }
}

function writeDb(data) {
    fs.writeFileSync(DB_FILE, JSON.stringify(data, null, 2), 'utf-8');
}

// Database Abstraction API compatibility
const db = {
    getPatient: async (hn) => {
        try {
            const data = readDb();
            const patient = data.patients[hn];
            if (patient && patient.active !== false) {
                // Return in format expected by billing code
                return { success: true, data: {
                    ...patient,
                    name: `${patient.title || ''}${patient.name} ${patient.surname}`
                }};
            }
            return { success: false };
        } catch (error) {
            console.error('DB getPatient Error:', error);
            return { success: false };
        }
    },
    saveQuotation: async (data) => {
        try {
            console.log('Saving quotation...', data);
            if (GOOGLE_SCRIPT_URL) {
                const response = await axios.post(GOOGLE_SCRIPT_URL, data, {
                    headers: { 'Content-Type': 'application/json' }
                });
                console.log('Google Apps Script Response:', response.data);
            } else {
                console.log('Google Apps Script URL not configured. (Logged as Mock)');
            }
            return { success: true };
        } catch (error) {
            console.error('DB saveQuotation Error:', error.message);
            return { success: false };
        }
    },
    savePatient: async (patientData) => {
        try {
            const data = readDb();
            let hn = patientData.hn;
            if (!hn) {
                const count = Object.keys(data.patients).length + 1;
                hn = `HN-${690000 + count}`;
                patientData.hn = hn;
            }
            patientData.active = true;
            data.patients[hn] = patientData;
            writeDb(data);
            return { success: true, data: patientData, message: "บันทึกข้อมูลสำเร็จ" };
        } catch (error) {
            console.error('DB savePatient Error:', error);
            return { success: false, message: "เกิดข้อผิดพลาดในการเขียนข้อมูล" };
        }
    }
};

// Middleware for LINE Webhook
app.post('/webhook', line.middleware(lineConfig), (req, res) => {
    Promise.all(req.body.events.map(handleEvent))
        .then((result) => res.json(result))
        .catch((err) => {
            console.error(err);
            res.status(500).end();
        });
});

app.use(bodyParser.json());
app.use(express.static('public'));

// API: Get Config for Frontend (LIFF ID, etc.)
app.get('/api/config', (req, res) => {
    res.json({
        liffId: process.env.LIFF_ID || ''
    });
});

// API: Get Patient details by HN
app.get('/api/patient/:hn', async (req, res) => {
    const hn = req.params.hn;
    const result = await db.getPatient(hn);
    if (result.success) {
        res.json(result);
    } else {
        res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ป่วยรายนี้" });
    }
});

// API: Search Patients
app.get('/api/patients/search', (req, res) => {
    const query = (req.query.q || '').toLowerCase().trim();
    const data = readDb();
    const results = [];
    
    Object.keys(data.patients).forEach(hn => {
        const p = data.patients[hn];
        if (p.active === false) return;
        
        const fullName = `${p.title || ''}${p.name} ${p.surname}`.toLowerCase();
        const idCard = (p.idCard || '').toLowerCase();
        const phone = (p.phone || '').toLowerCase();
        const address = (p.address || '').toLowerCase();
        const hnLower = hn.toLowerCase();

        if (query === '' || 
            hnLower.includes(query) || 
            fullName.includes(query) || 
            idCard.includes(query) || 
            phone.includes(query) || 
            address.includes(query)) {
            results.push({
                ...p,
                fullName: `${p.title || ''}${p.name} ${p.surname}`
            });
        }
    });

    res.json({ success: true, data: results });
});

// API: Check Duplicate Patient before/during registration
app.post('/api/register/check-duplicate', (req, res) => {
    const { idCard, name, surname } = req.body;
    const data = readDb();
    let duplicate = null;

    Object.keys(data.patients).forEach(hn => {
        const p = data.patients[hn];
        if (p.active === false) return;

        if (idCard && p.idCard === idCard) {
            duplicate = p;
        } else if (name && surname && p.name === name && p.surname === surname) {
            duplicate = p;
        }
    });

    if (duplicate) {
        res.json({ 
            success: true, 
            duplicate: true, 
            patient: {
                ...duplicate,
                fullName: `${duplicate.title || ''}${duplicate.name} ${duplicate.surname}`
            } 
        });
    } else {
        res.json({ success: true, duplicate: false });
    }
});

// API: Register a Patient
app.post('/api/register', async (req, res) => {
    const patientData = req.body;
    
    // Generate new HN
    const data = readDb();
    const count = Object.keys(data.patients).length + 1;
    const newHn = `HN-${690000 + count}`;
    patientData.hn = newHn;
    patientData.active = true;
    
    if (!patientData.photo) {
        patientData.photo = `https://api.dicebear.com/7.x/adventurer/svg?seed=${patientData.name}`;
    }

    data.patients[newHn] = patientData;
    writeDb(data);
    
    // Write an initial log for registration
    const logEntry = {
        hn: newHn,
        timestamp: new Date().toISOString(),
        action: "ลงทะเบียนใหม่",
        details: `สร้างแฟ้มเวชระเบียนใหม่โดยเจ้าหน้าที่`,
        officer: "พญ. วารุณี",
        docRef: "-"
    };
    data.logs.push(logEntry);
    writeDb(data);

    res.json({ success: true, data: patientData, message: "ลงทะเบียนผู้ป่วยใหม่สำเร็จ!" });
});

// API: Edit a Patient
app.post('/api/patients/edit', (req, res) => {
    const patientData = req.body;
    const { hn } = patientData;
    if (!hn) return res.status(400).json({ success: false, message: "ไม่พบ HN" });

    const data = readDb();
    const oldPatient = data.patients[hn];
    if (!oldPatient) return res.status(404).json({ success: false, message: "ไม่พบประวัติผู้ป่วย" });

    // Track Name / Surname Change
    const nameChanged = oldPatient.name !== patientData.name || oldPatient.surname !== patientData.surname;
    
    // Save previous values if name changed
    if (nameChanged) {
        const changeLog = {
            hn: hn,
            timestamp: new Date().toISOString(),
            action: "เปลี่ยนชื่อ-สกุล",
            details: `เปลี่ยนจาก: ${oldPatient.title || ''}${oldPatient.name} ${oldPatient.surname} เป็น: ${patientData.title || ''}${patientData.name} ${patientData.surname}`,
            officer: patientData.editOfficer || "พญ. วารุณี",
            docRef: patientData.editDocRef || "ใบเปลี่ยนชื่อ ช.3"
        };
        data.logs.push(changeLog);
    } else {
        // General edit log
        const changeLog = {
            hn: hn,
            timestamp: new Date().toISOString(),
            action: "แก้ไขข้อมูลทั่วไป",
            details: `แก้ไขรายละเอียดประวัติส่วนตัว`,
            officer: patientData.editOfficer || "พญ. วารุณี",
            docRef: "-"
        };
        data.logs.push(changeLog);
    }

    // Merge new updates
    data.patients[hn] = {
        ...oldPatient,
        ...patientData,
        active: true
    };
    
    writeDb(data);
    res.json({ success: true, message: "ปรับปรุงประวัติเรียบร้อยแล้ว", data: data.patients[hn] });
});

// API: Merge HNs
app.post('/api/patients/merge', (req, res) => {
    const { masterHn, secondaryHn, docRef, officer } = req.body;
    const data = readDb();

    const master = data.patients[masterHn];
    const secondary = data.patients[secondaryHn];

    if (!master || !secondary) {
        return res.status(404).json({ success: false, message: "ไม่พบข้อมูล HN หลัก หรือ HN ที่ต้องการยุบรวม" });
    }

    if (masterHn === secondaryHn) {
        return res.status(400).json({ success: false, message: "HN หลัก และ HN ยุบรวม ต้องเป็นคนละเลขกัน" });
    }

    // Transfer visits from secondary to master
    let visitsMergedCount = 0;
    data.visits.forEach(visit => {
        if (visit.hn === secondaryHn) {
            visit.hn = masterHn;
            visitsMergedCount++;
        }
    });

    // Disable secondary HN
    secondary.active = false;
    secondary.mergedInto = masterHn;

    // Log the merge
    const mergeLog = {
        timestamp: new Date().toISOString(),
        masterHn,
        secondaryHn,
        masterName: `${master.title || ''}${master.name} ${master.surname}`,
        secondaryName: `${secondary.title || ''}${secondary.name} ${secondary.surname}`,
        officer: officer || "พญ. วารุณี",
        docRef: docRef || "การยุบรวมแฟ้มประวัติซ้ำซ้อน",
        visitsMerged: visitsMergedCount
    };
    data.mergeLogs.push(mergeLog);

    // Also add to patient logs for master HN
    data.logs.push({
        hn: masterHn,
        timestamp: new Date().toISOString(),
        action: "ยุบรวมประวัติ",
        details: `ยุบรวม HN: ${secondaryHn} (${secondary.title || ''}${secondary.name} ${secondary.surname}) เข้ามา มีข้อมูลตรวจรักษาโอนย้ายมา ${visitsMergedCount} รายการ`,
        officer: officer || "พญ. วารุณี",
        docRef: docRef || "-"
    });

    writeDb(data);
    res.json({ success: true, message: `ยุบรวมสำเร็จ โอนย้ายรายการตรวจรักษาจำนวน ${visitsMergedCount} รายการ` });
});

// API: Register Mass Casualty Emergency Patients
app.post('/api/patients/mass-casualty', (req, res) => {
    const { eventName, count, officer } = req.body;
    if (!eventName || !count) {
        return res.status(400).json({ success: false, message: "กรุณาระบุข้อมูลเหตุการณ์และจำนวนผู้ป่วย" });
    }

    const data = readDb();
    const createdPatients = [];
    const timestamp = Date.now().toString().slice(-4);
    const dateStr = new Date().toLocaleDateString('th-TH');

    for (let i = 1; i <= parseInt(count); i++) {
        const patientCount = Object.keys(data.patients).length + 1;
        const hn = `HN-MC${1000 + patientCount}`;
        const gender = i % 2 === 0 ? "หญิง" : "ชาย";
        
        const patient = {
            hn: hn,
            idCard: `MC-${timestamp}-${1000 + i}`,
            title: "ผู้ประสบภัย",
            name: `อุบัติเหตุหมู่ #${i}`,
            surname: `(${eventName})`,
            gender: gender,
            dob: "00/00/2569",
            phone: "-",
            address: `สถานที่เกิดเหตุ: ${eventName}`,
            rights: "บัตรทอง (อุบัติเหตุฉุกเฉิน)",
            conditions: "การบาดเจ็บรุนแรง / อุบัติเหตุหมู่",
            allergy: "ไม่ทราบประวัติ",
            bloodGroup: "ไม่ทราบ",
            maritalStatus: "โสด",
            ethnicity: "ไม่ทราบ",
            nationality: "ไม่ทราบ",
            religion: "ไม่ทราบ",
            occupation: "-",
            physical: "ผู้ประสบอุบัติเหตุทางถนน/อุบัติเหตุภัยพิบัติ",
            fatherName: "ไม่ทราบ",
            motherName: "ไม่ทราบ",
            spouseName: "ไม่ทราบ",
            emergencyContact: "กู้ชีพ/ศูนย์สั่งการโรงพยาบาล",
            relationship: "หน่วยนำส่ง",
            emergencyPhone: "-",
            isConfidential: false,
            confidentialRole: "all",
            isDeceased: false,
            deathDate: "",
            deathCause: "",
            deathPlace: "",
            deathDoctor: "",
            active: true,
            photo: `https://api.dicebear.com/7.x/identicon/svg?seed=${hn}`
        };

        data.patients[hn] = patient;
        createdPatients.push(patient);

        // Save visit instantly for emergency triage room
        const visitId = `V-${100000 + data.visits.length + 1}`;
        data.visits.push({
            visitId: visitId,
            hn: hn,
            patientName: `${patient.title} ${patient.name} ${patient.surname}`,
            date: dateStr,
            time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
            doctor: "ห้องอุบัติเหตุ-ฉุกเฉิน (ER)",
            triage: `คัดกรองอุบัติเหตุหมู่: ${eventName}`,
            rights: ["บัตรทอง (อุบัติเหตุฉุกเฉิน)"],
            diagnoses: [],
            procedures: [],
            status: "ห้องตรวจฉุกเฉิน"
        });

        // Save log
        data.logs.push({
            hn: hn,
            timestamp: new Date().toISOString(),
            action: "ลงทะเบียนอุบัติเหตุหมู่",
            details: `สร้างประวัติฉุกเฉินในเหตุการณ์: ${eventName}`,
            officer: officer || "ศูนย์กู้ชีพ ER",
            docRef: "-"
        });
    }

    writeDb(data);
    res.json({ success: true, message: `ลงทะเบียนผู้ประสบภัยอุบัติเหตุหมู่จำนวน ${count} รายเรียบร้อยแล้ว`, data: createdPatients });
});

// API: Send Patient to Visit
app.post('/api/patients/visit', (req, res) => {
    const { hn, doctor, triage, rights, diagnoses, procedures, status } = req.body;
    if (!hn) return res.status(400).json({ success: false, message: "กรุณาระบุ HN" });

    const data = readDb();
    const patient = data.patients[hn];
    if (!patient) return res.status(404).json({ success: false, message: "ไม่พบผู้ป่วย" });

    const visitId = `V-${100000 + data.visits.length + 1}`;
    const newVisit = {
        visitId: visitId,
        hn: hn,
        patientName: `${patient.title || ''}${patient.name} ${patient.surname}`,
        date: new Date().toLocaleDateString('th-TH'),
        time: new Date().toLocaleTimeString('th-TH', { hour: '2-digit', minute: '2-digit' }),
        doctor: doctor || "ไม่ได้ระบุแพทย์",
        triage: triage || "มาตรวจสุขภาพ",
        rights: rights || [patient.rights || "ชำระเงินเอง"],
        diagnoses: diagnoses || [],
        procedures: procedures || [],
        status: status || "รอตรวจ"
    };

    data.visits.push(newVisit);
    writeDb(data);

    res.json({ success: true, message: "บันทึกส่งตรวจผู้ป่วยเรียบร้อย", visit: newVisit });
});

// API: Fetch Patient Visits
app.get('/api/patients/:hn/visits', (req, res) => {
    const hn = req.params.hn;
    const data = readDb();
    const patientVisits = data.visits.filter(v => v.hn === hn);
    res.json({ success: true, data: patientVisits });
});

// API: Fetch Patient Change Logs
app.get('/api/patients/:hn/logs', (req, res) => {
    const hn = req.params.hn;
    const data = readDb();
    const patientLogs = data.logs.filter(l => l.hn === hn);
    res.json({ success: true, data: patientLogs });
});

// API: Fetch Merge Logs
app.get('/api/merge-logs', (req, res) => {
    const data = readDb();
    res.json({ success: true, data: data.mergeLogs || [] });
});

// API: Record OP Card Replacement Print Log
app.post('/api/patients/print-card', (req, res) => {
    const { hn, reason, officer } = req.body;
    const data = readDb();

    const patient = data.patients[hn];
    if (!patient) return res.status(404).json({ success: false, message: "ไม่พบผู้ป่วย" });

    const logEntry = {
        timestamp: new Date().toISOString(),
        hn: hn,
        patientName: `${patient.title || ''}${patient.name} ${patient.surname}`,
        reason: reason || "เวชระเบียนชำรุด",
        officer: officer || "พญ. วารุณี"
    };

    data.printLogs.push(logEntry);
    
    // Also save to patient logs
    data.logs.push({
        hn: hn,
        timestamp: new Date().toISOString(),
        action: "พิมพ์ใบแทนเวชระเบียน",
        details: `สั่งพิมพ์ใบแทนแฟ้มประวัติ สาเหตุ: ${reason}`,
        officer: officer || "พญ. วารุณี",
        docRef: "-"
    });

    writeDb(data);
    res.json({ success: true, message: "บันทึกประวัติการสั่งพิมพ์ใบแทนเรียบร้อย" });
});

// API: Fetch Print Logs
app.get('/api/print-logs', (req, res) => {
    const data = readDb();
    res.json({ success: true, data: data.printLogs || [] });
});

// API: ICD Autocomplete Lookups
app.get('/api/icd10', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    const matches = ICD10_CODES.filter(item => 
        item.code.toLowerCase().includes(q) || 
        item.name.toLowerCase().includes(q)
    );
    res.json({ success: true, data: matches });
});

app.get('/api/icd9', (req, res) => {
    const q = (req.query.q || '').toLowerCase();
    const matches = ICD9_CODES.filter(item => 
        item.code.toLowerCase().includes(q) || 
        item.name.toLowerCase().includes(q)
    );
    res.json({ success: true, data: matches });
});

// 3. API: Create quotation and send LINE notification
app.post('/api/quotation', async (req, res) => {
    const { hn, items, totalAmount } = req.body;
    
    try {
        const patientResult = await db.getPatient(hn);
        if (!patientResult.success) {
            return res.status(404).json({ success: false, message: "ไม่พบผู้ป่วย" });
        }
        const patient = patientResult.data;

        // Save to Google Sheets
        await db.saveQuotation({ 
            hn, 
            patientName: patient.name, 
            totalAmount, 
            items: JSON.stringify(items),
            lineUserId: patient.lineUserId 
        });

        // Flex Message for Quotation
        const flexMessage = {
            type: 'flex',
            altText: 'ใบเสนอราคาค่ารักษาพยาบาล',
            contents: {
                type: 'bubble',
                header: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        { type: 'text', text: '🏥 MEDPRO CLINIC', weight: 'bold', color: '#ffffff', size: 'lg' }
                    ],
                    backgroundColor: '#06C755'
                },
                body: {
                    type: 'box',
                    layout: 'vertical',
                    contents: [
                        { type: 'text', text: 'ใบเสนอราคาออนไลน์', weight: 'bold', size: 'xl' },
                        { type: 'text', text: `เรียน: ${patient.name}`, margin: 'md', size: 'sm', color: '#666666' },
                        { type: 'separator', margin: 'lg' },
                        {
                            type: 'box',
                            layout: 'vertical',
                            margin: 'lg',
                            spacing: 'sm',
                            contents: items.map(item => ({
                                type: 'box',
                                layout: 'horizontal',
                                contents: [
                                    { type: 'text', text: item.name, size: 'sm', color: '#555555', flex: 4 },
                                    { type: 'text', text: `${item.price} บาท`, size: 'sm', color: '#111111', align: 'end', flex: 2 }
                                ]
                            }))
                        },
                        { type: 'separator', margin: 'lg' },
                        {
                            type: 'box',
                            layout: 'horizontal',
                            margin: 'lg',
                            contents: [
                                { type: 'text', text: 'ยอดรวมทั้งสิ้น', weight: 'bold', size: 'md' },
                                { type: 'text', text: `${totalAmount} บาท`, weight: 'bold', size: 'md', color: '#1DB446', align: 'end' }
                            ]
                        }
                    ]
                },
                footer: {
                    type: 'box',
                    layout: 'vertical',
                    spacing: 'sm',
                    contents: [
                        {
                            type: 'button',
                            style: 'primary',
                            height: 'sm',
                            color: '#06C755',
                            action: {
                                type: 'uri',
                                label: 'ชำระเงินออนไลน์',
                                uri: 'https://line.me' // Placeholder
                            }
                        }
                    ]
                }
            }
        };

        // Send Push Message to LINE
        if (patient.lineUserId) {
            await client.pushMessage({
                to: patient.lineUserId,
                messages: [flexMessage]
            });
        }
        
        res.json({ success: true, message: "ออกใบเสนอราคาเรียบร้อย", debug_data: flexMessage });
    } catch (error) {
        console.error('Error in quotation process:', error);
        if (error.response) {
            console.error('Error response data:', error.response.data);
            console.error('Error response status:', error.response.status);
        }
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในระบบ", error: error.message });
    }
});

// LINE Event Handler
function handleEvent(event) {
    if (event.type !== 'message' || event.message.type !== 'text') {
        return Promise.resolve(null);
    }

    const userText = event.message.text;

    if (userText.includes('จองนัดหมาย')) {
        return client.replyMessage({
            replyToken: event.replyToken,
            messages: [{ type: 'text', text: 'กรุณากดที่เมนู "จองนัดหมาย" เพื่อเลือกวันและเวลาที่สะดวกครับ' }]
        });
    }

    return client.replyMessage({
        replyToken: event.replyToken,
        messages: [{ type: 'text', text: `MedPro สวัสดีครับ คุณส่งข้อความ: "${userText}"\nเจ้าหน้าที่จะรีบติดต่อกลับครับ` }]
    });
}

app.listen(port, () => {
    console.log(`Server is running on http://localhost:${port}`);
});
