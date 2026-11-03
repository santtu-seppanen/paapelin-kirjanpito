// Google Apps Script: vastaanottaa uudet kirjaukset Workerilta ja lisää ne taulukon loppuun.
// Asennus: README, kohta "Kirjaus Google Sheetsiin".
const SECRET = "VAIHDA_TÄHÄN_PITKÄ_SATUNNAINEN_MERKKIJONO"; // sama kuin Workerin SHEET_SECRET
const SPREADSHEET_ID = "1kuWyR3lIv6ynPKtck1LgGHPOL9uzvuOhSjb5NHFZ3to"; // taulukon tunnus osoitteesta /d/<tunnus>/edit
const SHEET_NAME = "Kulut"; // välilehden nimi; tyhjä = ensimmäinen välilehti

function doPost(e) {
  const body = JSON.parse(e.postData.contents);
  if (body.secret !== SECRET) return ContentService.createTextOutput("forbidden");
  const ss = SpreadsheetApp.openById(SPREADSHEET_ID);
  const sheet = SHEET_NAME ? ss.getSheetByName(SHEET_NAME) : ss.getSheets()[0];
  const [date, desc, payer, payee, amount] = body.row;
  const [y, m, d] = date.split("-").map(Number);
  sheet.appendRow([new Date(y, m - 1, d), desc, payer, payee, amount]);
  return ContentService.createTextOutput("ok");
}
