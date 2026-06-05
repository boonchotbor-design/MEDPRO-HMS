# 🏥 MEDPRO Hospital Management System (HMS) + LINE OA

ระบบต้นแบบการจัดการโรงพยาบาลที่เชื่อมต่อกับ LINE Official Account สำหรับการออกใบเสนอราคาและการจองนัดหมายอัตโนมัติ

## 🚀 วิธีการเริ่มต้นใช้งาน (Getting Started)

### 1. การเตรียมสภาพแวดล้อม (Prerequisites)
- ติดตั้ง [Node.js](https://nodejs.org/)
- ติดตั้ง [Ngrok](https://ngrok.com/) สำหรับการทดสอบ Webhook บนเครื่องส่วนตัว

### 2. การตั้งค่า LINE Developers
1. ไปที่ [LINE Developers Console](https://developers.line.biz/)
2. สร้าง **Messaging API Channel**
   - คัดลอก `Channel Access Token` และ `Channel Secret`
3. สร้าง **LIFF App**
   - เลือก Size เป็น `Full`
   - Endpoint URL ให้เว้นไว้ก่อน (จะใช้ URL จาก Ngrok)
   - คัดลอก `LIFF ID`

### 3. การติดตั้งและรันระบบ
1. เปิดโฟลเดอร์โปรเจกต์
2. แก้ไขไฟล์ `.env` โดยใส่ค่าที่คัดลอกมา:
   ```env
   LINE_CHANNEL_ACCESS_TOKEN=your_token
   LINE_CHANNEL_SECRET=your_secret
   LIFF_ID=your_liff_id
   PORT=3000
   ```
3. รันคำสั่งติดตั้ง dependencies:
   ```bash
   npm install
   ```
4. รันเซิร์ฟเวอร์:
   ```bash
   node server.js
   ```

### 4. การเชื่อมต่อกับโลกภายนอก (Webhook & LIFF)
1. เปิด Terminal ใหม่แล้วรัน Ngrok:
   ```bash
   ngrok http 3000
   ```
2. คัดลอก URL ที่ได้จาก Ngrok (เช่น `https://abcd-123.ngrok-free.app`)
3. กลับไปที่ **LINE Developers Console**:
   - **Messaging API**: ใส่ Webhook URL เป็น `https://your-url.ngrok-free.app/webhook` (อย่าลืมกด Verify)
   - **LIFF**: แก้ไข Endpoint URL เป็น `https://your-url.ngrok-free.app/index.html`

## 🛠 ฟังก์ชันที่มีในระบบต้นแบบ
- **Admin Dashboard** (`/admin.html`): สำหรับเจ้าหน้าที่ ค้นหาผู้ป่วย (ลองใช้ HN: `HN-690023`), ออกใบเสนอราคา และส่งเข้า LINE
- **Patient LIFF** (`/index.html`): สำหรับผู้ป่วย จองนัดหมายแพทย์ เลือกวันเวลา และยืนยันนัดหมายผ่านแอป LINE
- **LINE Bot**: ตอบกลับข้อความอัตโนมัติและรับ Webhook จากการจองนัด

## 📂 โครงสร้างไฟล์
- `server.js`: เซิร์ฟเวอร์หลัก (Node.js + Express) และการจัดการ LINE API
- `public/admin.html`: หน้าจอสำหรับเจ้าหน้าที่โรงพยาบาล
- `public/index.html`: หน้าจอ LIFF สำหรับผู้ป่วย (จองนัดหมาย)
- `.env`: ไฟล์เก็บค่าคอนฟิกต่าง ๆ (ความลับ)

---
*พัฒนาโดย Gemini CLI - ระบบ HMS ต้นแบบระดับมืออาชีพ*
