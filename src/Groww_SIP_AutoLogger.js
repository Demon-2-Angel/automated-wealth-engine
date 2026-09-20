/**
 * Automated Wealth Engine - SIP Ingestion & Telemetry Pipeline
 * Author: Aniruddha Kumar
 * Description: Serverless Google Apps Script to parse Groww allotment emails,
 * update ledger sheets with formula bindings, and dispatch real-time alerts.
 */

// --- CONFIGURATION ---
const SPREADSHEET_ID = "YOUR_SPREADSHEET_ID_HERE";
const SHEET_NAME = "Transactions"; 
const NAV_TABLE_SHEET_NAME = "Investment_NAVTable";
const SUMMARY_SHEET_NAME = "Investment_Summary";
const GMAIL_LABEL = "Mutual Funds/Groww SIPs";

// --- TELEGRAM BOT CONFIG ---
const TELEGRAM_BOT_TOKEN = "YOUR_TELEGRAM_BOT_TOKEN_HERE";
const TELEGRAM_CHAT_ID = "YOUR_TELEGRAM_CHAT_ID_HERE";

// Scheme Metadata and Base SIP Rules
const SCHEME_MAP = {
  "Invesco India Mid Cap": {
    fullName: "Invesco India Mid Cap Fund Direct Growth",
    category: "Mid Cap",
    amfiCode: 120403,
    sipAmount: 13000
  },
  "Motilal Oswal Nifty 500": {
    fullName: "Motilal Oswal NIFTY 500",
    category: "Large Cap",
    amfiCode: 147625,
    sipAmount: 17000
  },
  "Bandhan Small Cap": {
    fullName: "Bandhan Small Cap Fund Direct Growth",
    category: "Small Cap",
    amfiCode: 147946,
    sipAmount: 10000
  },
  "ICICI Prudential Large Cap": {
    fullName: "ICICI Prudential Large Cap Fund Direct Growth",
    category: "Large Cap",
    amfiCode: 120586,
    sipAmount: 7500
  }
};

function processGrowwSipEmails() {
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = ss.getSheetByName(SHEET_NAME);
  
  const query = `label:"${GMAIL_LABEL}" is:unread`;
  const threads = GmailApp.search(query, 0, 10);
  
  if (threads.length === 0) {
    Logger.log("No new unread Groww allotment emails found.");
    return;
  }

  // Build in-memory hash cache from existing sheet records to prevent duplicate logging
  const lastRow = sheet.getLastRow();
  const existingSet = new Set();
  
  if (lastRow > 1) {
    const existingData = sheet.getRange(2, 1, lastRow - 1, 9).getValues();
    existingData.forEach(row => {
      const d = row[0];
      const mf = (row[2] || "").toString().trim().toLowerCase();
      const amt = Math.round(parseFloat(row[8]) || 0);
      
      let dateStr = "";
      if (d instanceof Date) {
        dateStr = Utilities.formatDate(d, "Asia/Kolkata", "yyyy-MM-dd");
      } else if (typeof d === "string") {
        dateStr = d.trim().substring(0, 10);
      }
      
      if (dateStr && mf) {
        existingSet.add(`${dateStr}|${mf}|${amt}`);
      }
    });
  }

  let loggedCount = 0;
  const processedBatches = [];

  threads.forEach(thread => {
    const messages = thread.getMessages();
    messages.forEach(message => {
      if (!message.isUnread()) return;

      const body = message.getPlainBody();
      const emailDate = Utilities.formatDate(message.getDate(), "Asia/Kolkata", "yyyy-MM-dd");

      // Extract details via regex
      const schemeMatch = body.match(/SCHEME NAME\s*\n\s*([^\n\r]+)/i);
      const amountMatch = body.match(/SIP AMOUNT\s*\n\s*₹?\s*([\d,]+(?:\.\d+)?)/i);
      const unitsMatch = body.match(/UNITS ALLOCATED\s*\n\s*([\d,]+(?:\.\d+)?)/i);
      const navMatch = body.match(/NAV\s*\n\s*([\d,]+(?:\.\d+)?)/i);

      if (schemeMatch && amountMatch && unitsMatch && navMatch) {
        const rawScheme = schemeMatch[1].trim();
        const amount = parseFloat(amountMatch[1].replace(/,/g, ''));
        const units = parseFloat(unitsMatch[1].replace(/,/g, ''));
        const nav = parseFloat(navMatch[1].replace(/,/g, ''));

        let matchedMeta = null;
        for (const key in SCHEME_MAP) {
          if (rawScheme.toLowerCase().includes(key.toLowerCase())) {
            matchedMeta = SCHEME_MAP[key];
            break;
          }
        }

        const fundName = matchedMeta ? matchedMeta.fullName : rawScheme;
        const category = matchedMeta ? matchedMeta.category : "Equity";
        const amfiCode = matchedMeta ? matchedMeta.amfiCode : "";

        // Duplicate validation
        const roundedAmount = Math.round(amount);
        const duplicateKey = `${emailDate}|${fundName.toLowerCase()}|${roundedAmount}`;

        if (existingSet.has(duplicateKey)) {
          Logger.log(`Skipping duplicate transaction: ${fundName} on ${emailDate} for ₹${amount}`);
          message.markRead();
          return;
        }

        // Anomaly / Type classifier
        let txnType = "Lumpsum";
        if (matchedMeta && matchedMeta.sipAmount && Math.abs(amount - matchedMeta.sipAmount) < 100) {
          txnType = "SIP";
        }

        // Resolve next row dynamically
        const dateValues = sheet.getRange("A:A").getValues();
        let targetRow = 1;
        while (targetRow <= dateValues.length && dateValues[targetRow - 1][0] !== "") {
          targetRow++;
        }

        // Row payload with dynamic formulas
        const rowData = [
          emailDate,
          txnType,
          fundName,
          category,
          "Groww",
          amfiCode,
          nav,
          units,
          amount,
          `=SUMIFS($H$2:H${targetRow}, $C$2:C${targetRow}, C${targetRow})`,
          `=VLOOKUP(F${targetRow}, '${NAV_TABLE_SHEET_NAME}'!$A:$E, 5, FALSE)`,
          `=H${targetRow}*K${targetRow}`,
          `=TODAY()-A${targetRow}`,
          `=L${targetRow}-I${targetRow}`
        ];

        sheet.getRange(targetRow, 1, 1, rowData.length).setValues([rowData]);
        existingSet.add(duplicateKey);

        processedBatches.push({
          fundName: fundName,
          category: category,
          type: txnType,
          amount: amount,
          units: units,
          nav: nav
        });

        message.markRead();
        loggedCount++;
        Logger.log(`Successfully logged [${txnType}]: ${fundName} | ₹${amount}`);
      }
    });
  });

  // Telemetry: Notifications & Milestones
  if (loggedCount > 0) {
    const totalRows = sheet.getLastRow();
    const allAmounts = sheet.getRange("I2:I" + totalRows).getValues().flat();
    const allDates = sheet.getRange("A2:A" + totalRows).getValues().flat().filter(d => d !== "");
    
    const totalInvested = allAmounts.reduce((acc, val) => {
      const num = parseFloat(val);
      return acc + (isNaN(num) ? 0 : num);
    }, 0);

    const totalInstallments = allDates.length;
    const firstDate = allDates[0] instanceof Date ? Utilities.formatDate(allDates[0], "Asia/Kolkata", "MMM yyyy") : allDates[0];
    const latestDate = allDates[allDates.length - 1] instanceof Date ? Utilities.formatDate(allDates[allDates.length - 1], "Asia/Kolkata", "dd MMM yyyy") : allDates[allDates.length - 1];

    const formattedTotal = Number(Math.round(totalInvested)).toLocaleString('en-IN');

    let summaryHighlights = "";
    let tgGainText = "";
    try {
      const summarySheet = ss.getSheetByName(SUMMARY_SHEET_NAME);
      if (summarySheet) {
        const summaryGains = summarySheet.getRange("E5").getValue();
        if (summaryGains !== "" && !isNaN(parseFloat(summaryGains))) {
          const gainVal = Math.round(parseFloat(summaryGains));
          const gainSign = gainVal >= 0 ? "+" : "-";
          const gainColor = gainVal >= 0 ? "#059669" : "#dc2626";
          summaryHighlights = `
            <tr>
              <td style="padding: 6px 0; color: #4b5563;">📈 <b>Total Unrealized Gains:</b></td>
              <td style="padding: 6px 0; font-weight: bold; color: ${gainColor}; text-align: right;">${gainSign}₹${Math.abs(gainVal).toLocaleString('en-IN')}</td>
            </tr>
          `;
          tgGainText = `📈 <b>Total Unrealized Gains:</b> ${gainSign}₹${Math.abs(gainVal).toLocaleString('en-IN')}\n`;
        }
      }
    } catch (e) {
      Logger.log("Summary tab read skipped: " + e.message);
    }

    let fundsTableRows = "";
    let tgFundBreakdown = "";

    processedBatches.forEach(item => {
      const formattedAmt = Number(Math.round(item.amount)).toLocaleString('en-IN');
      
      fundsTableRows += `
        <tr style="border-bottom: 1px solid #e5e7eb;">
          <td style="padding: 10px 6px; font-weight: 600; color: #1f2937;">
            ${item.fundName}
            <span style="display: block; font-size: 11px; font-weight: normal; color: #6b7280;">${item.type} • ${item.category}</span>
          </td>
          <td style="padding: 10px 6px; text-align: right; color: #111827; font-weight: 600;">₹${formattedAmt}</td>
          <td style="padding: 10px 6px; text-align: right; color: #4b5563;">${item.units.toFixed(3)}</td>
          <td style="padding: 10px 6px; text-align: right; color: #4b5563;">₹${item.nav.toFixed(2)}</td>
        </tr>
      `;

      const shortName = item.fundName.replace("Fund Direct Growth", "").replace("Direct Growth", "").trim();
      tgFundBreakdown += `• <b>${shortName}</b> (${item.type})\n  └ ₹${formattedAmt} | ${item.units.toFixed(3)} units @ ₹${item.nav.toFixed(2)}\n`;
    });

    // 1. Email Alert
    const subject = `🚀 Wealth Engine: ₹${formattedTotal} Invested (${loggedCount} New Orders Allotted)`;
    const htmlBody = `
      <div style="font-family: 'Segoe UI', Roboto, Helvetica, Arial, sans-serif; color: #1f2937; max-width: 600px; margin: auto; padding: 24px; border: 1px solid #e5e7eb; border-radius: 10px; background-color: #ffffff;">
        <h2 style="color: #059669; margin-top: 0; font-size: 20px;">🎯 Consistency in Action!</h2>
        <p style="font-size: 14px; line-height: 1.5; color: #374151;">
          Hi Aniruddha,<br>
          Your automated wealth engine just processed and recorded <b>${loggedCount} new investment(s)</b> into your portfolio tracker.
        </p>
        
        <div style="background-color: #f8fafc; border: 1px solid #e2e8f0; border-radius: 8px; padding: 14px 16px; margin: 18px 0;">
          <table style="width: 100%; border-collapse: collapse; font-size: 13px;">
            <tr>
              <td style="padding: 6px 0; color: #4b5563;">💰 <b>Total Capital Invested:</b></td>
              <td style="padding: 6px 0; font-size: 16px; font-weight: bold; color: #111827; text-align: right;">₹${formattedTotal}</td>
            </tr>
            ${summaryHighlights}
            <tr>
              <td style="padding: 6px 0; color: #4b5563;">🔥 <b>Total Discipline Count:</b></td>
              <td style="padding: 6px 0; font-weight: bold; color: #111827; text-align: right;">${totalInstallments} Successful Investments</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #4b5563;">🗓 <b>Investing Since:</b></td>
              <td style="padding: 6px 0; color: #111827; text-align: right;">${firstDate}</td>
            </tr>
            <tr>
              <td style="padding: 6px 0; color: #4b5563;">⚡ <b>Latest Execution:</b></td>
              <td style="padding: 6px 0; color: #111827; text-align: right;">${latestDate}</td>
            </tr>
          </table>
        </div>

        <h3 style="font-size: 13px; font-weight: bold; color: #111827; margin: 20px 0 8px 0; text-transform: uppercase; letter-spacing: 0.5px;">📦 Allotted Units Breakdown</h3>
        <table style="width: 100%; border-collapse: collapse; font-size: 12px; margin-bottom: 20px;">
          <thead>
            <tr style="background-color: #f1f5f9; color: #475569; text-align: left; border-bottom: 2px solid #cbd5e1;">
              <th style="padding: 8px 6px;">Scheme</th>
              <th style="padding: 8px 6px; text-align: right;">Amount</th>
              <th style="padding: 8px 6px; text-align: right;">Units</th>
              <th style="padding: 8px 6px; text-align: right;">NAV</th>
            </tr>
          </thead>
          <tbody>
            ${fundsTableRows}
          </tbody>
        </table>

        <div style="font-style: italic; font-size: 13px; color: #4b5563; border-left: 3px solid #059669; padding-left: 12px; margin: 20px 0;">
          "The individual investor should act consistently as an investor and not as a speculator. Compounding rewards the patient."
        </div>

        <p style="font-size: 13px; color: #6b7280; margin-bottom: 0;">Keep the momentum going! Your sheet formulas and NAV lookups are fully refreshed.</p>
      </div>
    `;

    MailApp.sendEmail({
      to: Session.getActiveUser().getEmail(),
      subject: subject,
      htmlBody: htmlBody
    });

    // 2. Telegram Alert
    let tgMessage = `🚀 <b>Wealth Engine: ${loggedCount} Orders Allotted!</b>\n\n`;
    tgMessage += `💰 <b>Total Capital Invested:</b> ₹${formattedTotal}\n`;
    if (tgGainText) tgMessage += tgGainText;
    tgMessage += `🔥 <b>Total Discipline Count:</b> ${totalInstallments} orders\n`;
    tgMessage += `🗓 <b>Investing Since:</b> ${firstDate}\n\n`;
    tgMessage += `📦 <b>Allotted Breakdown:</b>\n${tgFundBreakdown}\n`;
    tgMessage += `<i>"Compounding rewards the patient."</i>`;

    sendTelegramMessage(tgMessage);
  }
}

function sendTelegramMessage(text) {
  const url = `https://api.telegram.org/bot${TELEGRAM_BOT_TOKEN}/sendMessage`;
  const payload = {
    chat_id: TELEGRAM_CHAT_ID,
    text: text,
    parse_mode: "HTML"
  };

  try {
    UrlFetchApp.fetch(url, {
      method: "post",
      contentType: "application/json",
      payload: JSON.stringify(payload)
    });
    Logger.log("Telegram notification delivered successfully.");
  } catch (err) {
    Logger.log("Telegram notification failed: " + err.message);
  }
}
