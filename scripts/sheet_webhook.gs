// Google Apps Script: vastaanottaa uudet kirjaukset Workerilta ja lisää ne taulukon loppuun.
// Asennus: README, kohta "Kirjaus Google Sheetsiin".
const SECRET = "VAIHDA_TÄHÄN_PITKÄ_SATUNNAINEN_MERKKIJONO"; // sama kuin Workerin SHEET_SECRET
const SHEET_NAME = ""; // tyhjä = taulukon ensimmäinen välilehti

function doPost(e) {
  try {
    const body = JSON.parse(e.postData.contents);
    if (body.secret !== SECRET) return ContentService.createTextOutput("forbidden");
    const ss = SpreadsheetApp.getActiveSpreadsheet();
    const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
    const [date, desc, payer, payee, amount] = body.row;
    const [y, m, d] = date.split("-").map(Number);
    // Keskipäivä, jotta aikavyöhykkeiden ero ei siirrä päivää; muoto näyttää vain päivämäärän.
    sheet.appendRow([new Date(y, m - 1, d, 12), desc, payer, payee, amount]);
    try {
      sheet.getRange(sheet.getLastRow(), 1).setNumberFormat("d.M.yyyy");
    } catch (err) { /* muotoilu on kosmeettinen, rivi on jo lisätty */ }
    return ContentService.createTextOutput("ok");
  } catch (err) {
    // Worker kirjaa vastauksen lokiin, joten virheen syy näkyy Cloudflaressa.
    return ContentService.createTextOutput("error: " + err);
  }
}
