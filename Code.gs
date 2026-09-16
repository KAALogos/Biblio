/**
 * Biblioteka SLO 5 — v0.5
 * Logowanie kontem Google Workspace szkoły, ewidencja w Arkuszu Google,
 * raport dla czytelnika, retencja danych i przypomnienia.
 *
 * PIERWSZE URUCHOMIENIE: w edytorze Apps Script wybierz funkcję `setup` i kliknij „Uruchom”.
 * Ustawienia (Ustawienia projektu → Właściwości skryptu):
 *   ADMINS          – e-maile bibliotekarzy, rozdzielone przecinkami
 *   ALLOWED_DOMAIN  – domena szkoły, np. slo5.edu.pl (tylko te konta mają dostęp)
 *   RETENTION_DAYS  – po ilu dniach od zwrotu anonimizować e-mail (domyślnie 365)
 *   CONTACT         – kontakt w sprawie danych osobowych (np. e-mail IOD)
 *   SPREADSHEET_ID  – ustawiane automatycznie przez setup()
 */

const CONFIG = {
  LOAN_DAYS: 28,
  REMIND_DAYS_BEFORE: 3,
  DEFAULT_RETENTION_DAYS: 365,
  TZ: 'Europe/Warsaw',
  APP_NAME: 'Biblioteka SLO 5',
  CODE_FAMILIES: /(LEK|LTZN|SZTFIL|KLO|OWS|WSPL|HIS|POE|KLP)\d+/
};

const SHEETS = {
  LOANS: 'Wypożyczenia',
  LOG: 'Dziennik'
};
const LOAN_COLS = ['ID', 'Kod', 'Tytuł', 'E-mail czytelnika', 'Status', 'Wypożyczono', 'Termin zwrotu',
  'Zgłoszono zwrot', 'Zwrócono', 'Potwierdził', 'Przypomnienia'];
const LOG_COLS = ['Data', 'Akcja', 'Kod', 'Tytuł', 'E-mail czytelnika', 'Wykonał'];
const L = { ID:0, CODE:1, TITLE:2, EMAIL:3, STATUS:4, OUT:5, DUE:6, REQ:7, RET:8, BY:9, REM:10 };
const STATUS = { ACTIVE:'aktywne', PENDING:'zwrot_oczekuje', RETURNED:'zwrócone' };
const ANON = 'zanonimizowano';

// Katalog testowy (docelowo import z eBiblio)
const CATALOG = {"LEK000599":{"title":"Zemsta","author":"Aleksander Fredro"},"LEK000600":{"title":"Romeo i Julia","author":"William Shakespeare"},"LEK000601":{"title":"Konrad Wallenrod","author":"Adam Mickiewicz"},"LEK000603":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000604":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000655":{"title":"Skąpiec : [dramat]","author":"Molière"},"LEK000661":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000662":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000663":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000664":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000665":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000666":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000667":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000668":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000669":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000670":{"title":"Mitologia. Wierzenia i podania Greków i Rzymian","author":"Jan Parandowski"},"LEK000671":{"title":"Nowy wspaniały świat","author":"Aldous Huxley"},"LEK000672":{"title":"Madame","author":"Antoni Libera"},"LEK000673":{"title":"Madame","author":"Antoni Libera"}};

/* ───────────────────────── Konfiguracja i uruchomienie ───────────────────────── */

function setup() {
  const props = PropertiesService.getScriptProperties();
  const me = String(Session.getEffectiveUser().getEmail() || '').toLowerCase();
  if (!props.getProperty('ADMINS') && me) props.setProperty('ADMINS', me);
  if (!props.getProperty('ALLOWED_DOMAIN') && me.includes('@')) props.setProperty('ALLOWED_DOMAIN', me.split('@')[1]);
  if (!props.getProperty('RETENTION_DAYS')) props.setProperty('RETENTION_DAYS', String(CONFIG.DEFAULT_RETENTION_DAYS));

  const ss = spreadsheet_();

  const hasTrigger = ScriptApp.getProjectTriggers().some(t => t.getHandlerFunction() === 'dailyMaintenance');
  if (!hasTrigger) ScriptApp.newTrigger('dailyMaintenance').timeBased().everyDays(1).atHour(6).create();

  const msg = 'Gotowe.\nArkusz ewidencji: ' + ss.getUrl() +
    '\nAdministratorzy: ' + props.getProperty('ADMINS') +
    '\nDomena: ' + props.getProperty('ALLOWED_DOMAIN') +
    '\nRetencja: ' + props.getProperty('RETENTION_DAYS') + ' dni';
  Logger.log(msg);
  return msg;
}

function doGet(e) {
  const view = e && e.parameter && e.parameter.view;
  if (view === 'raport') {
    let html;
    try { html = reportHtml_(buildReport_(currentUser_())); }
    catch (err) { html = '<p style="font-family:sans-serif">' + esc_(err.message) + '</p>'; }
    return HtmlService.createHtmlOutput(html)
      .setTitle('Raport czytelnika — ' + CONFIG.APP_NAME)
      .addMetaTag('viewport', 'width=device-width, initial-scale=1');
  }
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle(CONFIG.APP_NAME)
    .addMetaTag('viewport', 'width=device-width, initial-scale=1, viewport-fit=cover');
}

/* ───────────────────────── API dla aplikacji (wywołania z Index.html) ───────────────────────── */

function getSession() {
  const email = currentUser_();
  return {
    email,
    isAdmin: isAdmin_(email),
    loanDays: CONFIG.LOAN_DAYS,
    appUrl: ScriptApp.getService().getUrl()
  };
}

function checkout(rawCode) {
  const email = currentUser_();
  const code = normalizeCode_(rawCode);
  const item = getItem_(code);
  return withLock_(() => {
    const sh = sheet_(SHEETS.LOANS);
    if (findOpenLoanRow_(sh, code)) throw new Error('Ten egzemplarz jest już wypożyczony lub czeka na potwierdzenie zwrotu.');
    const now = new Date();
    const due = new Date(now.getTime() + CONFIG.LOAN_DAYS * 86400000);
    sh.appendRow([Utilities.getUuid(), code, item.title, email, STATUS.ACTIVE, now, fmtDate_(due), '', '', '', '']);
    log_('WYPOŻYCZENIE', code, item.title, email, email);
    return { code, title: item.title, author: item.author, due: fmtDate_(due) };
  });
}

function requestReturn(rawCode) {
  const email = currentUser_();
  const code = normalizeCode_(rawCode);
  return withLock_(() => {
    const sh = sheet_(SHEETS.LOANS);
    const found = findOpenLoanRow_(sh, code);
    if (!found) throw new Error('Ten egzemplarz nie ma aktywnego wypożyczenia.');
    const r = found.values;
    if (String(r[L.EMAIL]).toLowerCase() !== email) throw new Error('Ten egzemplarz jest wypożyczony na inne konto.');
    if (r[L.STATUS] === STATUS.PENDING) throw new Error('Zwrot tego egzemplarza jest już zgłoszony.');
    sh.getRange(found.row, L.STATUS + 1).setValue(STATUS.PENDING);
    sh.getRange(found.row, L.REQ + 1).setValue(new Date());
    log_('ZGŁOSZENIE_ZWROTU', code, r[L.TITLE], email, email);
    return { code, title: r[L.TITLE] };
  });
}

function confirmReturn(rawCode) {
  const admin = requireAdmin_();
  const code = normalizeCode_(rawCode);
  return withLock_(() => {
    const sh = sheet_(SHEETS.LOANS);
    const found = findOpenLoanRow_(sh, code);
    if (!found) throw new Error('Ten egzemplarz nie ma otwartego wypożyczenia.');
    const r = found.values;
    // Bibliotekarz może przyjąć książkę także bez wcześniejszego zgłoszenia przez ucznia.
    sh.getRange(found.row, L.STATUS + 1).setValue(STATUS.RETURNED);
    sh.getRange(found.row, L.RET + 1).setValue(new Date());
    sh.getRange(found.row, L.BY + 1).setValue(admin);
    log_('POTWIERDZENIE_ZWROTU', code, r[L.TITLE], r[L.EMAIL], admin);
    return { code, title: r[L.TITLE], wasRequested: r[L.STATUS] === STATUS.PENDING };
  });
}

function getMyReport() {
  return buildReport_(currentUser_());
}

function emailMyReport() {
  const email = currentUser_();
  const report = buildReport_(email);
  const html = reportHtml_(report);
  const pdf = Utilities.newBlob(html, 'text/html', 'raport.html').getAs('application/pdf')
    .setName('Raport czytelnika ' + fmtDate_(new Date()) + '.pdf');
  MailApp.sendEmail({
    to: email,
    subject: CONFIG.APP_NAME + ' — Twój raport czytelnika',
    htmlBody: '<p>W załączniku raport z Twoimi danymi w bibliotece szkolnej (stan na ' + esc_(report.generatedAt) + ').</p>',
    attachments: [pdf],
    name: CONFIG.APP_NAME
  });
  return { sentTo: email };
}

function getAdminOverview() {
  requireAdmin_();
  const rows = sheet_(SHEETS.LOANS).getDataRange().getValues().slice(1);
  const today = fmtDate_(new Date());
  const open = rows.filter(r => r[L.STATUS] === STATUS.ACTIVE || r[L.STATUS] === STATUS.PENDING).map(loanView_);
  return {
    pending: open.filter(x => x.status === STATUS.PENDING),
    overdue: open.filter(x => x.status === STATUS.ACTIVE && x.due < today),
    activeCount: open.length,
    sheetUrl: spreadsheet_().getUrl()
  };
}

/* ───────────────────────── Zadanie dzienne: przypomnienia + retencja ───────────────────────── */

function dailyMaintenance() {
  return withLock_(() => ({ reminders: sendReminders_(), anonymized: applyRetention_() }));
}

function sendReminders_() {
  const sh = sheet_(SHEETS.LOANS);
  const values = sh.getDataRange().getValues();
  const today = fmtDate_(new Date());
  const soon = fmtDate_(new Date(Date.now() + CONFIG.REMIND_DAYS_BEFORE * 86400000));
  let sent = 0;
  for (let i = 1; i < values.length; i++) {
    const r = values[i];
    if (r[L.STATUS] !== STATUS.ACTIVE || !String(r[L.EMAIL]).includes('@')) continue;
    const due = fmtDate_(r[L.DUE]);
    const done = String(r[L.REM] || '');
    let kind = null;
    if (due < today && !done.includes('po_terminie')) kind = 'po_terminie';
    else if (due <= soon && due >= today && !done.includes('przed_terminem')) kind = 'przed_terminem';
    if (!kind) continue;
    const subject = kind === 'po_terminie'
      ? CONFIG.APP_NAME + ' — minął termin zwrotu'
      : CONFIG.APP_NAME + ' — zbliża się termin zwrotu';
    MailApp.sendEmail({
      to: r[L.EMAIL], subject, name: CONFIG.APP_NAME,
      htmlBody: '<p>Książka <b>' + esc_(r[L.TITLE]) + '</b> (' + esc_(r[L.CODE]) + ') — termin zwrotu: <b>' + esc_(due) + '</b>.</p>' +
        '<p>Zwrot zgłoś w aplikacji biblioteki i włóż książkę do skrzynki zwrotów.</p>'
    });
    sh.getRange(i + 1, L.REM + 1).setValue((done ? done + ',' : '') + kind);
    log_('PRZYPOMNIENIE', r[L.CODE], r[L.TITLE], r[L.EMAIL], 'system');
    sent++;
  }
  return sent;
}

function applyRetention_() {
  const days = Number(PropertiesService.getScriptProperties().getProperty('RETENTION_DAYS')) || CONFIG.DEFAULT_RETENTION_DAYS;
  const cutoff = new Date(Date.now() - days * 86400000);
  let count = 0;

  const loans = sheet_(SHEETS.LOANS);
  const lv = loans.getDataRange().getValues();
  const stillOpen = new Set();
  for (let i = 1; i < lv.length; i++) {
    const r = lv[i];
    if (r[L.STATUS] !== STATUS.RETURNED) { stillOpen.add(String(r[L.EMAIL]).toLowerCase() + '|' + r[L.CODE]); continue; }
    if (r[L.EMAIL] !== ANON && toDate_(r[L.RET]) < cutoff) {
      loans.getRange(i + 1, L.EMAIL + 1).setValue(ANON);
      count++;
    }
  }

  const log = sheet_(SHEETS.LOG);
  const gv = log.getDataRange().getValues();
  for (let i = 1; i < gv.length; i++) {
    const r = gv[i];
    const who = String(r[4]).toLowerCase();
    if (who === ANON || !who.includes('@') || stillOpen.has(who + '|' + r[2])) continue;
    if (toDate_(r[0]) < cutoff) {
      log.getRange(i + 1, 5).setValue(ANON);
      if (String(r[5]).toLowerCase() === who) log.getRange(i + 1, 6).setValue(ANON);
      count++;
    }
  }
  return count;
}

/* ───────────────────────── Raport czytelnika ───────────────────────── */

function buildReport_(email) {
  const loans = sheet_(SHEETS.LOANS).getDataRange().getValues().slice(1)
    .filter(r => String(r[L.EMAIL]).toLowerCase() === email)
    .map(loanView_);
  const history = sheet_(SHEETS.LOG).getDataRange().getValues().slice(1)
    .filter(r => String(r[4]).toLowerCase() === email)
    .map(r => ({ at: fmtDateTime_(r[0]), action: actionLabel_(r[1]), code: r[2], title: r[3] }))
    .reverse();
  const props = PropertiesService.getScriptProperties();
  const days = Number(props.getProperty('RETENTION_DAYS')) || CONFIG.DEFAULT_RETENTION_DAYS;
  const today = fmtDate_(new Date());
  return {
    email,
    generatedAt: fmtDateTime_(new Date()),
    active: loans.filter(x => x.status !== STATUS.RETURNED).map(x => Object.assign(x, { overdue: x.due < today })),
    returned: loans.filter(x => x.status === STATUS.RETURNED),
    history,
    dataInfo: {
      stored: 'adres e-mail konta szkolnego, kody i tytuły wypożyczonych egzemplarzy, daty wypożyczeń, zgłoszeń i zwrotów',
      purpose: 'obsługa wypożyczeń w bibliotece szkolnej i rozliczanie zwrotów',
      retention: 'e-mail jest usuwany (anonimizowany) z ewidencji po ' + days + ' dniach od zwrotu książki',
      access: 'wyłącznie Ty (w tym raporcie) oraz upoważnieni pracownicy biblioteki',
      contact: props.getProperty('CONTACT') || 'sekretariat szkoły / inspektor ochrony danych'
    }
  };
}

function reportHtml_(rep) {
  const row = cells => '<tr>' + cells.map(c => '<td>' + esc_(c) + '</td>').join('') + '</tr>';
  const table = (head, rows, empty) => rows.length
    ? '<table><tr>' + head.map(h => '<th>' + esc_(h) + '</th>').join('') + '</tr>' + rows.map(row).join('') + '</table>'
    : '<p class="m">' + esc_(empty) + '</p>';
  const d = rep.dataInfo;
  return '<!doctype html><html lang="pl"><head><meta charset="utf-8"><style>' +
    'body{font-family:Arial,sans-serif;color:#111;margin:24px;font-size:13px}h1{font-size:20px;margin:0}h2{font-size:15px;margin:22px 0 6px}' +
    'table{border-collapse:collapse;width:100%}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{background:#f1f1f1}' +
    '.m{color:#555}.late{color:#a32626;font-weight:bold}</style></head><body>' +
    '<h1>' + esc_(CONFIG.APP_NAME) + ' — raport czytelnika</h1>' +
    '<p class="m">Czytelnik: <b>' + esc_(rep.email) + '</b><br>Stan na: ' + esc_(rep.generatedAt) + '</p>' +
    '<h2>Aktualne wypożyczenia</h2>' +
    table(['Kod', 'Tytuł', 'Wypożyczono', 'Termin', 'Status'],
      rep.active.map(x => [x.code, x.title, x.checkoutAt, x.due, statusLabel_(x.status) + (x.overdue ? ' — PO TERMINIE' : '')]),
      'Brak aktualnych wypożyczeń.') +
    '<h2>Zwrócone</h2>' +
    table(['Kod', 'Tytuł', 'Wypożyczono', 'Zwrócono'], rep.returned.map(x => [x.code, x.title, x.checkoutAt, x.returnedAt]), 'Brak.') +
    '<h2>Historia działań</h2>' +
    table(['Data', 'Działanie', 'Kod', 'Tytuł'], rep.history.map(h => [h.at, h.action, h.code, h.title]), 'Brak zapisanych działań.') +
    '<h2>Jakie dane o Tobie przechowujemy</h2>' +
    '<p><b>Zakres:</b> ' + esc_(d.stored) + '.<br><b>Cel:</b> ' + esc_(d.purpose) + '.<br><b>Okres:</b> ' + esc_(d.retention) +
    '.<br><b>Dostęp:</b> ' + esc_(d.access) + '.<br><b>Kontakt w sprawie danych:</b> ' + esc_(d.contact) + '.</p>' +
    '</body></html>';
}

/* ───────────────────────── Pomocnicze ───────────────────────── */

function currentUser_() {
  const email = String(Session.getActiveUser().getEmail() || '').trim().toLowerCase();
  if (!email) throw new Error('Nie rozpoznano konta. Otwórz aplikację zalogowany kontem szkolnym Google.');
  const domain = String(PropertiesService.getScriptProperties().getProperty('ALLOWED_DOMAIN') || '').toLowerCase();
  if (domain && email.split('@')[1] !== domain) throw new Error('Aplikacja jest dostępna tylko dla kont @' + domain + '.');
  return email;
}
function isAdmin_(email) {
  const list = String(PropertiesService.getScriptProperties().getProperty('ADMINS') || '')
    .split(',').map(s => s.trim().toLowerCase()).filter(Boolean);
  return list.includes(email);
}
function requireAdmin_() {
  const email = currentUser_();
  if (!isAdmin_(email)) throw new Error('Ta operacja jest dostępna tylko dla bibliotekarzy.');
  return email;
}
let SS_CACHE_ = null;
function spreadsheet_() {
  if (SS_CACHE_) return SS_CACHE_;
  const props = PropertiesService.getScriptProperties();
  let id = props.getProperty('SPREADSHEET_ID');
  let ss = null;
  if (id) { try { ss = SpreadsheetApp.openById(id); } catch (e) { ss = null; } }
  if (!ss) {
    ss = SpreadsheetApp.create(CONFIG.APP_NAME + ' — ewidencja (dane osobowe)');
    props.setProperty('SPREADSHEET_ID', ss.getId());
  }
  ensureSheet_(ss, SHEETS.LOANS, LOAN_COLS);
  ensureSheet_(ss, SHEETS.LOG, LOG_COLS);
  const def = ss.getSheetByName('Arkusz1') || ss.getSheetByName('Sheet1');
  if (def && ss.getSheets().length > 2) ss.deleteSheet(def);
  SS_CACHE_ = ss;
  return ss;
}
function ensureSheet_(ss, name, cols) {
  let sh = ss.getSheetByName(name);
  if (!sh) sh = ss.insertSheet(name);
  if (sh.getLastRow() === 0) { sh.appendRow(cols); sh.setFrozenRows(1); }
  return sh;
}
function sheet_(name) {
  return spreadsheet_().getSheetByName(name);
}
function findOpenLoanRow_(sh, code) {
  const values = sh.getDataRange().getValues();
  for (let i = values.length - 1; i >= 1; i--) {
    const r = values[i];
    if (r[L.CODE] === code && (r[L.STATUS] === STATUS.ACTIVE || r[L.STATUS] === STATUS.PENDING)) return { row: i + 1, values: r };
  }
  return null;
}
function loanView_(r) {
  const item = CATALOG[r[L.CODE]] || {};
  return {
    code: r[L.CODE], title: r[L.TITLE], author: item.author || '',
    email: r[L.EMAIL], status: r[L.STATUS],
    checkoutAt: fmtDate_(r[L.OUT]), due: fmtDate_(r[L.DUE]),
    returnRequestedAt: r[L.REQ] ? fmtDate_(r[L.REQ]) : '', returnedAt: r[L.RET] ? fmtDate_(r[L.RET]) : ''
  };
}
function log_(action, code, title, readerEmail, actor) {
  sheet_(SHEETS.LOG).appendRow([new Date(), action, code, title, readerEmail, actor]);
}
function withLock_(fn) {
  const lock = LockService.getScriptLock();
  lock.waitLock(15000);
  try { return fn(); } finally { lock.releaseLock(); }
}
function getItem_(code) {
  if (CATALOG[code]) return CATALOG[code];
  return { title: 'Egzemplarz ' + code, author: '' };
}
function normalizeCode_(v) {
  const raw = String(v || '').trim().replace(/[\s\-]+/g, '').toUpperCase();
  if (!raw) throw new Error('Brak kodu.');
  const m = raw.match(CONFIG.CODE_FAMILIES);
  if (!m) throw new Error('Kod ma nieprawidłowy format: ' + raw);
  return m[0];
}
function toDate_(v) { return v instanceof Date ? v : new Date(v); }
function fmtDate_(v) { return v ? Utilities.formatDate(toDate_(v), CONFIG.TZ, 'yyyy-MM-dd') : ''; }
function fmtDateTime_(v) { return v ? Utilities.formatDate(toDate_(v), CONFIG.TZ, 'yyyy-MM-dd HH:mm') : ''; }
function statusLabel_(s) { return { aktywne: 'wypożyczona', zwrot_oczekuje: 'zwrot zgłoszony — czeka na potwierdzenie', 'zwrócone': 'zwrócona' }[s] || s; }
function actionLabel_(a) {
  return { 'WYPOŻYCZENIE': 'wypożyczenie', 'ZGŁOSZENIE_ZWROTU': 'zgłoszenie zwrotu',
    'POTWIERDZENIE_ZWROTU': 'zwrot potwierdzony przez bibliotekę', 'PRZYPOMNIENIE': 'wysłano przypomnienie' }[a] || a;
}
function esc_(s) {
  return String(s == null ? '' : s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#039;' }[c]));
}
