// Google Apps Script: vastaanottaa uudet kirjaukset Workerilta ja lisää ne taulukon loppuun.
// Asennus: README, kohta "Kirjaus Google Sheetsiin".
const SECRET = "VAIHDA_TÄHÄN_PITKÄ_SATUNNAINEN_MERKKIJONO"; // sama kuin Workerin SHEET_SECRET
const SHEET_NAME = ""; // tyhjä = taulukon ensimmäinen välilehti

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return ContentService.createTextOutput("forbidden");
  const ss = SpreadsheetApp.getActiveSpreadsheet();
  const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  const [date, desc, payer, payee, amount] = body.row;
  // Päivämäärä taulukon aikavyöhykkeellä (ei siirry edelliselle päivälle), näytetään ilman kellonaikaa.
  const day = Utilities.parseDate(date, ss.getSpreadsheetTimeZone(), "yyyy-MM-dd");
  sheet.appendRow([day, desc, payer, payee, amount]);
  sheet.getRange(sheet.getLastRow(), 1).setNumberFormat("d.M.yyyy");
  return ContentService.createTextOutput("ok");
}
