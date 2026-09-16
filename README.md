# Biblioteka SLO 5 — v0.5

System wypożyczeń self-service dla biblioteki szkolnej.
**Wersja szkolna** działa w Google Apps Script na koncie Google Workspace szkoły.
**Wersja testowa** (`demo_local.html`, GitHub Pages) służy tylko do prób skanera — bez prawdziwych danych.

## Co nowego w v0.5 — ochrona danych
- **Logowanie kontem szkolnym.** Uczeń nie wpisuje e-maila — aplikacja sama rozpoznaje zalogowane konto Google. Nie da się podszyć pod innego ucznia.
- **Dostęp tylko dla domeny szkoły** (`ALLOWED_DOMAIN`).
- **Bibliotekarze według listy e-maili** (`ADMINS`) zamiast PIN-u w kodzie. Tylko oni potwierdzają zwroty i widzą ewidencję.
- **Ewidencja w Arkuszu Google** tworzonym na Dysku szkoły: zakładki *Wypożyczenia* (stan) i *Dziennik* (każde działanie). Minimum danych: data, akcja, kod, tytuł, e-mail.
- **Raport dla czytelnika** („Moje konto”): aktualne wypożyczenia, zwrócone książki, historia działań, informacja o przechowywanych danych. Raport PDF na e-mail ucznia albo wersja do druku.
- **Retencja:** codziennie o 6:00 e-maile w zamkniętych wypożyczeniach starszych niż `RETENTION_DAYS` (domyślnie 365 dni) zamieniane są na „zanonimizowano”.
- **Przypomnienia e-mail:** 3 dni przed terminem i po terminie (po jednym razie).
- Skaner bez zmian: kamera na żywo + mocny odczyt ze zdjęcia + ręczne wpisanie. Obsługiwane rodziny kodów: `LEK`, `LTZN`, `SZTFIL`, `KLO`, `OWs`, `WsPl`, `HIS`, `POE`, `KLP`.

## Wdrożenie (Google Apps Script)
Rób to z **konta szkolnego** (najlepiej konta biblioteki), nie prywatnego.

1. https://script.google.com → Nowy projekt → nazwa „Biblioteka SLO 5”.
2. Wklej `Code.gs`. Dodaj plik HTML o nazwie dokładnie `Index` i wklej `Index.html`.
3. Ustawienia projektu → zaznacz „Pokaż plik manifestu appsscript.json” → wklej `appsscript.json`.
4. W edytorze wybierz funkcję **`setup`** → Uruchom → zaakceptuj uprawnienia.
   Tworzy arkusz ewidencji, ustawia Ciebie jako administratora, domenę szkoły i codzienne zadanie.
   Link do arkusza pojawi się w „Dzienniku wykonania”.
5. Ustawienia projektu → **Właściwości skryptu** — sprawdź/uzupełnij:
   - `ADMINS` — e-maile bibliotekarzy po przecinku,
   - `ALLOWED_DOMAIN` — domena kont uczniów (np. `slo5.edu.pl`),
   - `RETENTION_DAYS` — okres przechowywania (ustala szkoła/IOD),
   - `CONTACT` — kontakt w sprawie danych (np. e-mail IOD).
6. Wdróż → Nowe wdrożenie → Aplikacja internetowa:
   - **Wykonaj jako: Ja**
   - **Kto ma dostęp: każdy w domenie szkoły**
7. Link rozdaj uczniom (np. kod QR przy regale).

### Arkusz ewidencji
- Zawiera dane osobowe — **udostępniaj tylko bibliotekarzom**. Nie kopiuj go na prywatne dyski.
- Nie edytuj ręcznie kolumn *Status* i *E-mail*, chyba że korygujesz błąd.

### Uwaga o kamerze
W niektórych przeglądarkach aplikacje Apps Script blokują kamerę na żywo. Wtedy użyj przycisków „zdjęcie” — otwierają aparat telefonu i działają zawsze.

## Wersja testowa — GitHub Pages
`demo_local.html` zapisuje stan tylko w przeglądarce. Nie wpisuj prawdziwych e-maili.
Repozytorium zawiera wyłącznie kod — **nigdy nie wrzucaj tu arkusza ani eksportów z danymi uczniów.**

## RODO — do uzgodnienia ze szkołą
Administratorem danych jest szkoła. Przed startem:
- pokaż ten opis inspektorowi ochrony danych (IOD),
- ustal okres przechowywania (`RETENTION_DAYS`),
- opublikuj klauzulę informacyjną — szkic w `KLAUZULA_INFORMACYJNA.md`.

## Pliki
- `Code.gs`, `Index.html`, `appsscript.json` — aplikacja Apps Script,
- `demo_local.html`, `zxing.min.js`, `index.html` — wersja testowa na GitHub Pages,
- `.claspignore` — do synchronizacji przez `clasp` (opcjonalnie).
