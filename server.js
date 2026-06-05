require('dotenv').config();
const express = require('express');
const line = require('@line/bot-sdk');
const bodyParser = require('body-parser');
const axios = require('axios');
const path = require('path');

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

// Database Abstraction (Google Sheets via GAS)
const db = {
    getPatient: async (hn) => {
        const mock = { 
            "HN-690023": { 
                name: "คุณสมศักดิ์ รักดี", 
                phone: "081-234-XXXX", 
                conditions: "ความดันโลหิตสูง", 
                allergy: "Penicillin",
                rights: "ประกันสังคม",
                lineUserId: "USER_LINE_ID_1" 
            } 
        };

        try {
            if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('your_google_script')) {
                const response = await axios.get(`${GOOGLE_SCRIPT_URL}?action=getPatient&hn=${hn}`, { timeout: 5000 });
                if (response.data && response.data.success) {
                    return response.data;
                }
            }
            
            // Fallback to mock for testing
            console.log(`Using mock data for HN: ${hn}`);
            return mock[hn] ? { success: true, data: mock[hn] } : { success: false };
        } catch (error) {
            console.error('GAS Error (getPatient):', error.message);
            // Fallback to mock on any error
            return mock[hn] ? { success: true, data: mock[hn] } : { success: false };
        }
    },
    saveQuotation: async (data) => {
        try {
            if (GOOGLE_SCRIPT_URL && !GOOGLE_SCRIPT_URL.includes('your_google_script')) {
                const response = await axios.post(GOOGLE_SCRIPT_URL, { action: 'saveQuotation', ...data }, { timeout: 5000 });
                return response.data;
            }
            console.log('Mock: Saving quotation to console instead of GAS');
            console.log('Data:', data);
            return { success: true };
        } catch (error) {
            console.error('GAS Error (saveQuotation):', error.message);
            return { success: true, mock: true }; // Return success even on error to allow prototype flow
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

// 1. API: Get patient data by HN
app.get('/api/patient/:hn', async (req, res) => {
    const hn = req.params.hn;
    try {
        const result = await db.getPatient(hn);
        if (result.success) {
            res.json(result);
        } else {
            res.status(404).json({ success: false, message: "ไม่พบข้อมูลผู้ป่วยรายนี้" });
        }
    } catch (err) {
        res.status(500).json({ success: false, message: "Database Error" });
    }
});

// 2. API: Create quotation and send LINE notification
app.post('/api/quotation', async (req, res) => {
    const { hn, items, totalAmount } = req.body;
    
    try {
        const patientResult = await db.getPatient(hn);
        if (!patientResult.success) {
            return res.status(404).json({ success: false, message: "ไม่พบผู้ป่วย" });
        }
        const patient = patientResult.data;

        // Save to Google Sheets
        await db.saveQuotation({ hn, patientName: patient.name, totalAmount, items: JSON.stringify(items) });

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
        if (patient.lineUserId && !patient.lineUserId.startsWith('USER_LINE_ID')) {
            await client.pushMessage({
                to: patient.lineUserId,
                messages: [flexMessage]
            });
        }
        
        res.json({ success: true, message: "ออกใบเสนอราคาเรียบร้อย", debug_data: flexMessage });
    } catch (error) {
        console.error('Error in quotation process:', error);
        res.status(500).json({ success: false, message: "เกิดข้อผิดพลาดในระบบ" });
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
