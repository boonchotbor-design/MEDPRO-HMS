// Google Apps Script for MEDPRO HMS
// นำโค้ดนี้ไปวางในส่วนของ Google Apps Script ของ Spreadsheet ของคุณ

// -------------------------------------------------------------
// ⚙️ ส่วนการตั้งค่า (Configuration)
// -------------------------------------------------------------
// 1. LINE Notify Token: ใช้สำหรับส่งการแจ้งเตือนเข้ากลุ่ม LINE ของผู้เกี่ยวข้อง (ฟรี และทำง่ายที่สุด)
// สมัครและขอ Token ได้ที่: https://notify-bot.line.me/
var LINE_NOTIFY_TOKEN = "YOUR_LINE_NOTIFY_TOKEN_HERE";

// 2. LINE Channel Access Token: ใช้กรณีที่ต้องการส่ง Push Message ตรงไปยังแอป LINE ของคนไข้ (เลือกใส่หรือไม่ใส่ก็ได้)
// นำมาจาก LINE Developers Console -> Messaging API
var LINE_CHANNEL_ACCESS_TOKEN = "YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE";


// -------------------------------------------------------------
// 📥 ฟังก์ชันหลักรับข้อมูลจาก Node.js Server (HTTP POST)
// -------------------------------------------------------------
function doPost(e) {
  var lock = LockService.getScriptLock();
  try {
    // ป้องกันการเขียนข้อมูลพร้อมกัน (Race Conditions) โดยให้รอสูงสุด 10 วินาที
    lock.waitLock(10000);
    
    // ดึงและแปลงข้อมูล JSON ที่ Node.js ส่งมา
    var jsonString = e.postData.contents;
    var data = JSON.parse(jsonString);
    
    var hn = data.hn || "-";
    var patientName = data.patientName || "ไม่ทราบชื่อ";
    var totalAmount = data.totalAmount || 0;
    var itemsRaw = data.items || "[]";
    var lineUserId = data.lineUserId || "";
    
    // แปลงรายการรักษา (items) ให้อยู่ในรูปแบบอ่านง่ายสำหรับบันทึกตาราง
    var itemsList = [];
    var parsedItems = [];
    try {
      parsedItems = JSON.parse(itemsRaw);
      if (Array.isArray(parsedItems)) {
        itemsList = parsedItems.map(function(item) {
          var details = item.name + " (" + item.price + " บาท x " + item.qty;
          if (parseInt(item.discount) > 0) {
            details += " ลด " + item.discount + "%";
          }
          details += ")";
          return details;
        });
      }
    } catch(err) {
      itemsList = [itemsRaw];
    }
    var itemsText = itemsList.join("\n");
    
    // 2. เปิดและเขียนข้อมูลลง Google Spreadsheet
    var ss = SpreadsheetApp.getActiveSpreadsheet();
    var sheet = ss.getActiveSheet();
    
    // ตรวจสอบและสร้างหัวตาราง (Header) หากเป็นชีตว่างใหม่
    if (sheet.getLastRow() === 0) {
      sheet.appendRow(["วันที่-เวลา", "HN", "ชื่อ-นามสกุล คนไข้", "ยอดรวมสุทธิ (บาท)", "รายการบริการรักษา", "LINE User ID"]);
      // ตกแต่งหัวตารางให้สวยงามน่าใช้งาน
      sheet.getRange(1, 1, 1, 6)
           .setBackground("#0f766e") // Teal 700
           .setFontColor("#ffffff")
           .setFontWeight("bold")
           .setHorizontalAlignment("center")
           .setVerticalAlignment("middle");
      sheet.setRowHeight(1, 35);
    }
    
    // เพิ่มแถวข้อมูลใหม่
    var timestamp = new Date();
    sheet.appendRow([timestamp, hn, patientName, totalAmount, itemsText, lineUserId]);
    
    // สไตล์ข้อมูลแถวล่าสุดเพื่อความเรียบร้อย
    var lastRow = sheet.getLastRow();
    sheet.getRange(lastRow, 1).setNumberFormat("yyyy-mm-dd HH:mm:ss");
    sheet.getRange(lastRow, 4).setNumberFormat("#,##0");
    sheet.getRange(lastRow, 1, 1, 6).setVerticalAlignment("top");
    
    // ปรับความกว้างคอลัมน์อัตโนมัติเพื่อให้ข้อมูลไม่ล้น
    sheet.autoResizeColumns(1, 6);
    
    // -------------------------------------------------------------
    // 📱 การส่งแจ้งเตือนทาง LINE
    // -------------------------------------------------------------
    var notificationResults = { notify: false, push: false };
    
    // 1. ส่งแจ้งเตือนทาง LINE Notify (ส่งเข้ากลุ่มแชทเจ้าหน้าที่การเงิน/แพทย์)
    if (LINE_NOTIFY_TOKEN && LINE_NOTIFY_TOKEN !== "YOUR_LINE_NOTIFY_TOKEN_HERE") {
      var notifySent = sendLineNotify(LINE_NOTIFY_TOKEN, hn, patientName, totalAmount, parsedItems);
      notificationResults.notify = notifySent;
    }
    
    // 2. ส่ง Push Message ไปยังห้องแชทของคนไข้โดยตรง (ถ้ามี LINE User ID)
    if (LINE_CHANNEL_ACCESS_TOKEN && LINE_CHANNEL_ACCESS_TOKEN !== "YOUR_LINE_CHANNEL_ACCESS_TOKEN_HERE" && lineUserId) {
      var pushSent = sendLinePushMessage(LINE_CHANNEL_ACCESS_TOKEN, lineUserId, hn, patientName, totalAmount, parsedItems);
      notificationResults.push = pushSent;
    }
    
    // ปลดล็อคระบบเขียนไฟล์
    lock.releaseLock();
    
    return ContentService.createTextOutput(JSON.stringify({
      success: true,
      message: "บันทึกข้อมูลและส่งแจ้งเตือนสำเร็จ!",
      row: lastRow,
      notifications: notificationResults
    })).setMimeType(ContentService.MimeType.JSON);
    
  } catch (error) {
    if (lock.hasLock()) {
      lock.releaseLock();
    }
    return ContentService.createTextOutput(JSON.stringify({
      success: false,
      error: error.toString()
    })).setMimeType(ContentService.MimeType.JSON);
  }
}

/**
 * 🔔 ส่งการแจ้งเตือนไปยังกลุ่มไลน์ หรือแชทส่วนตัวด้วย LINE Notify
 */
function sendLineNotify(token, hn, patientName, totalAmount, items) {
  var url = "https://notify-api.line.me/api/notify";
  
  var itemsStringList = items.map(function(item) {
    var desc = "- " + item.name + " (" + item.price + " บาท)";
    if (parseInt(item.discount) > 0) {
      desc += " [ลด " + item.discount + "%]";
    }
    return desc;
  });
  
  var message = "\n💰 [MEDPRO HMS] ยอดค่ารักษาพยาบาล\n" +
                "━━━━━━━━━━━━━━━━━━━━\n" +
                "👤 คนไข้: " + patientName + "\n" +
                "🔑 HN: " + hn + "\n" +
                "📋 รายการรักษา:\n" + itemsStringList.join("\n") + "\n" +
                "💰 ยอดรวมทั้งสิ้น: " + totalAmount.toLocaleString() + " บาท\n" +
                "━━━━━━━━━━━━━━━━━━━━\n" +
                "📅 บันทึกข้อมูลเข้าระบบ Google Sheet สำเร็จแล้ว";
                
  var options = {
    "method" : "post",
    "headers": {
      "Authorization": "Bearer " + token
    },
    "payload" : {
      "message": message
    },
    "muteHttpExceptions": true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var resCode = response.getResponseCode();
    return resCode === 200;
  } catch(e) {
    Logger.log("LINE Notify Error: " + e.toString());
    return false;
  }
}

/**
 * 💬 ส่ง Flex Message หาคนไข้คนนั้นโดยตรงผ่าน LINE Bot (Messaging API)
 */
function sendLinePushMessage(token, userId, hn, patientName, totalAmount, items) {
  var url = "https://api.line.me/v2/bot/message/push";
  
  // สร้างรายการบริการรักษาใน Flex Message
  var flexItemsContents = items.map(function(item) {
    var priceText = item.price + " บาท";
    if (item.qty > 1) {
      priceText = item.price + " x " + item.qty + " บ.";
    }
    return {
      "type": "box",
      "layout": "horizontal",
      "margin": "sm",
      "contents": [
        { "type": "text", "text": item.name, "size": "sm", "color": "#555555", "flex": 4, "wrap": true },
        { "type": "text", "text": priceText, "size": "sm", "color": "#111111", "align": "end", "flex": 2 }
      ]
    };
  });

  var flexMessageContents = {
    "type": "bubble",
    "header": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        { "type": "text", "text": "🏥 MEDPRO CLINIC", "weight": "bold", "color": "#ffffff", "size": "md" }
      ],
      "backgroundColor": "#0f766e"
    },
    "body": {
      "type": "box",
      "layout": "vertical",
      "contents": [
        { "type": "text", "text": "ใบสรุปค่ารักษาพยาบาล", "weight": "bold", "size": "lg", "color": "#0f766e" },
        { "type": "text", "text": "เรียนคุณ: " + patientName + " (" + hn + ")", "margin": "xs", "size": "xs", "color": "#888888" },
        { "type": "separator", "margin": "md" },
        {
          "type": "box",
          "layout": "vertical",
          "margin": "md",
          "spacing": "xs",
          "contents": flexItemsContents
        },
        { "type": "separator", "margin": "md" },
        {
          "type": "box",
          "layout": "horizontal",
          "margin": "md",
          "contents": [
            { "type": "text", "text": "ยอดรวมสุทธิ", "weight": "bold", "size": "sm" },
            { "type": "text", "text": totalAmount.toLocaleString() + " บาท", "weight": "bold", "size": "sm", "color": "#0f766e", "align": "end" }
          ]
        }
      ]
    },
    "footer": {
      "type": "box",
      "layout": "vertical",
      "spacing": "sm",
      "contents": [
        {
          "type": "button",
          "style": "primary",
          "height": "sm",
          "color": "#0f766e",
          "action": {
            "type": "uri",
            "label": "ชำระเงินออนไลน์",
            "uri": "https://line.me" // สามารถแทนที่ด้วยลิงก์ระบบชำระเงินจริงของคุณได้
          }
        }
      ]
    }
  };

  var postData = {
    "to": userId,
    "messages": [{
      "type": "flex",
      "altText": "🏥 ใบสรุปยอดค่ารักษาพยาบาลจาก MEDPRO CLINIC",
      "contents": flexMessageContents
    }]
  };
  
  var options = {
    "method" : "post",
    "contentType": "application/json",
    "headers": {
      "Authorization": "Bearer " + token
    },
    "payload" : JSON.stringify(postData),
    "muteHttpExceptions": true
  };
  
  try {
    var response = UrlFetchApp.fetch(url, options);
    var resCode = response.getResponseCode();
    return resCode === 200;
  } catch(e) {
    Logger.log("LINE Push Message Error: " + e.toString());
    return false;
  }
}
