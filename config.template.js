/**
 * Configuration Template
 * Copy this file to config.js or insert these constants into your Apps Script editor.
 * DO NOT commit files containing actual API keys or private sheet IDs.
 */

module.exports = {
  SPREADSHEET_ID: "YOUR_GOOGLE_SPREADSHEET_ID",
  SHEET_NAME: "Transactions",
  NAV_TABLE_SHEET_NAME: "Investment_NAVTable",
  SUMMARY_SHEET_NAME: "Investment_Summary",
  GMAIL_LABEL: "Mutual Funds/Groww SIPs",

  TELEGRAM_BOT_TOKEN: "YOUR_TELEGRAM_BOT_TOKEN", // From @BotFather
  TELEGRAM_CHAT_ID: "YOUR_TELEGRAM_CHAT_ID",     // From @userinfobot

  SCHEME_MAP: {
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
  }
};
