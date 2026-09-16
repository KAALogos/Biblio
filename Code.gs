const CONFIG = {
  LOAN_DAYS: 28,
  ADMIN_PIN: '2468'
};

const CATALOG = {"LEK000599": {"title": "Zemsta", "author": "Aleksander Fredro"}, "LEK000600": {"title": "Romeo i Julia", "author": "William Shakespeare"}, "LEK000601": {"title": "Konrad Wallenrod", "author": "Adam Mickiewicz"}, "LEK000603": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000604": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000661": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000662": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000663": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000664": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000665": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000666": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000667": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000668": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000669": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000670": {"title": "Mitologia. Wierzenia i podania Greków i Rzymian", "author": "Jan Parandowski"}, "LEK000671": {"title": "Nowy wspaniały świat", "author": "Aldous Huxley"}, "LEK000672": {"title": "Madame", "author": "Antoni Libera"}, "LEK000673": {"title": "Madame", "author": "Antoni Libera"}};

function doGet() {
  return HtmlService.createHtmlOutputFromFile('Index')
    .setTitle('Biblioteka SLO 5 — MVP')
    .addMetaTag('viewport', 'width=device-width, initial-scale=1');
}

function getCatalogItem(code) {
  code = normalizeCode_(code);
  const item = CATALOG[code];
  if (!item) return null;
  const loan = getLoans_()[code] || null;
  return {
    code,
    title: item.title,
    author: item.author,
    status: loan ? loan.status : 'dostępna',
    borrower: loan ? loan.email : '',
    due: loan ? loan.due : ''
  };
}

function getMyLoans(email) {
  email = normalizeEmail_(email);
  const loans = getLoans_();
  return Object.keys(loans)
    .filter(code => loans[code].email === email && loans[code].status !== 'zwrócone')
    .map(code => {
      const item = CATALOG[code] || { title: code, author: '' };
      return { code, title:item.title, author:item.author, ...loans[code] };
    })
    .sort((a,b) => String(a.due).localeCompare(String(b.due)));
}

function checkout(code, email) {
  code = normalizeCode_(code);
  email = normalizeEmail_(email);
  if (!CATALOG[code]) throw new Error('Nie ma takiego kodu w katalogu testowym: ' + code);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const loans = getLoans_();
    if (loans[code] && loans[code].status !== 'zwrócone') {
      throw new Error('Ten egzemplarz jest już wypożyczony lub czeka na potwierdzenie zwrotu.');
    }

    const now = new Date();
    const due = new Date(now.getTime() + CONFIG.LOAN_DAYS * 86400000);
    loans[code] = {
      email,
      checkoutAt: now.toISOString(),
      due: Utilities.formatDate(due, 'Europe/Warsaw', 'yyyy-MM-dd'),
      status: 'aktywne'
    };
    saveLoans_(loans);
    log_('WYPOŻYCZENIE', code, email);
    return { ok:true, code, title:CATALOG[code].title, author:CATALOG[code].author, due:loans[code].due };
  } finally {
    lock.releaseLock();
  }
}

function requestReturn(code, email) {
  code = normalizeCode_(code);
  email = normalizeEmail_(email);

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const loans = getLoans_();
    const loan = loans[code];
    if (!loan || loan.status === 'zwrócone') throw new Error('Ten egzemplarz nie ma aktywnego wypożyczenia.');
    if (loan.email !== email) throw new Error('Ten egzemplarz jest wypożyczony na inne konto.');
    loan.status = 'zwrot_oczekuje';
    loan.returnRequestedAt = new Date().toISOString();
    loans[code] = loan;
    saveLoans_(loans);
    log_('ZGŁOSZENIE_ZWROTU', code, email);
    return { ok:true, code, title:(CATALOG[code]||{title:code}).title };
  } finally {
    lock.releaseLock();
  }
}

function confirmReturn(code, pin) {
  code = normalizeCode_(code);
  if (String(pin) !== CONFIG.ADMIN_PIN) throw new Error('Błędny PIN administratora.');

  const lock = LockService.getScriptLock();
  lock.waitLock(10000);
  try {
    const loans = getLoans_();
    const loan = loans[code];
    if (!loan || loan.status !== 'zwrot_oczekuje') throw new Error('Ten egzemplarz nie czeka na potwierdzenie zwrotu.');
    loan.status = 'zwrócone';
    loan.returnedAt = new Date().toISOString();
    loans[code] = loan;
    saveLoans_(loans);
    log_('POTWIERDZENIE_ZWROTU', code, loan.email);
    return { ok:true, code, title:(CATALOG[code]||{title:code}).title };
  } finally {
    lock.releaseLock();
  }
}

function resetDemo(pin) {
  if (String(pin) !== CONFIG.ADMIN_PIN) throw new Error('Błędny PIN administratora.');
  PropertiesService.getScriptProperties().deleteProperty('LOANS');
  PropertiesService.getScriptProperties().deleteProperty('LOG');
  return true;
}

function getLoans_() {
  return JSON.parse(PropertiesService.getScriptProperties().getProperty('LOANS') || '{}');
}
function saveLoans_(loans) {
  PropertiesService.getScriptProperties().setProperty('LOANS', JSON.stringify(loans));
}
function log_(action, code, email) {
  const props = PropertiesService.getScriptProperties();
  const log = JSON.parse(props.getProperty('LOG') || '[]');
  log.push({ts:new Date().toISOString(), action, code, email});
  props.setProperty('LOG', JSON.stringify(log.slice(-500)));
}
function normalizeCode_(v) {
  const code = String(v || '').trim().toUpperCase();
  if (!code) throw new Error('Brak kodu.');
  return code;
}
function normalizeEmail_(v) {
  const email = String(v || '').trim().toLowerCase();
  if (!email || !email.includes('@')) throw new Error('Podaj e-mail szkolny.');
  return email;
}
