# Biblioteka SLO 5 — MVP v0.4

Naprawiono dwa błędy z v0.3:

1. Skanowanie: zamiast odczytu pełnego zdjęcia przez stare `@zxing/library`
   używany jest `html5-qrcode`. Są dwa tryby:
   - kamera na żywo,
   - zrobienie / wybranie zdjęcia (odczyt zdjęcia: natywny BarcodeDetector + ZXing z wieloma próbami skali, obrotu i kadru; `html5-qrcode` jako ostatnia próba).
2. System nie blokuje już poprawnych kodów eBiblio tylko dlatego, że nie ma jeszcze
   pełnej bazy metadanych. Akceptowane rodziny kodów:
   `LEK`, `LTZN`, `SZTFIL`, `KLO`, `OWs`, `WsPl`, `HIS`, `POE`, `KLP`.

`LEK000655` ma już metadane testowe: **Molière, Skąpiec**.

## Test GitHub Pages
Podmień tylko `demo_local.html`. Po publikacji:
- wpisz dowolny testowy e-mail,
- ręcznie wpisz `LEK000655` i kliknij „Wypożycz kod”,
- następnie sprawdź kamerę na żywo,
- potem tryb „zdjęcie”.

## Apps Script
`Index.html` i `Code.gs` są również zaktualizowane do tego samego modelu.

---

## Instrukcje z v0.3

To jest DZIAŁAJĄCY PROTOTYP systemu, nie baza danych.

## Co działa
- wypożyczenie egzemplarza po kodzie,
- skan kodu paskowego ze zdjęcia zrobionego telefonem,
- ręczne wpisanie kodu jako fallback,
- lista „Moje książki”,
- zgłoszenie zwrotu,
- zwrot oczekujący na fizyczne potwierdzenie,
- potwierdzenie zwrotu przez administratora,
- blokada podwójnego wypożyczenia,
- 28-dniowy termin zwrotu,
- wspólny stan wypożyczeń w wersji Apps Script.

## Katalog testowy
Wbudowanych jest 18 prawdziwych kodów z raportu, m.in.:
LEK000599, LEK000600, LEK000603, LEK000604, LEK000661–LEK000673.

Dane z eBiblio podmienimy później bez zmiany logiki aplikacji.

## Najszybszy test bez wdrożenia
Otwórz `demo_local.html` w przeglądarce.
Ta wersja zapisuje stan tylko w localStorage danego urządzenia.

## Wersja wieloużytkownikowa — Google Apps Script
1. Otwórz https://script.google.com i utwórz nowy projekt.
2. Wklej `Code.gs`.
3. Dodaj plik HTML o nazwie dokładnie `Index` i wklej `Index.html`.
4. Ustaw strefę czasową projektu na Europe/Warsaw.
5. Wdróż: `Wdróż → Nowe wdrożenie → Aplikacja internetowa`.
6. Uruchamiaj jako: `Ja`.
7. Dostęp: użytkownicy w domenie szkoły (na test może być szerszy).
8. Otwórz link na telefonie.

W prototypie uczeń wpisuje e-mail ręcznie. Google SSO dołożymy po potwierdzeniu działania całego flow.
PIN administratora MVP: 2468 (zmień w `Code.gs`).

## Test end-to-end
1. Wpisz np. `uczen@test.pl`.
2. Wypożycz `LEK000604`.
3. Wejdź w „Moje książki”.
4. Zgłoś zwrot `LEK000604`.
5. W sekcji administratora wpisz PIN `2468`.
6. Potwierdź fizyczny zwrot tego samego kodu.
7. Egzemplarz można ponownie wypożyczyć.

## Repozytorium i GitHub
- `Code.gs`, `Index.html`, `appsscript.json` — wersja Google Apps Script (można synchronizować przez `clasp`: `npm i -g @google/clasp`, `clasp login`, `clasp clone <scriptId>` lub `clasp create`, potem `clasp push`; `.clasp.json` jest w `.gitignore`).
- `demo_local.html` — samodzielne demo; na GitHub Pages dostępne jako `/demo_local.html` (lub dodaj `index.html` z przekierowaniem).
- **Uwaga:** PIN administratora jest w kodzie — przy publicznym repo zmień go przed wdrożeniem produkcyjnym albo trzymaj repo jako prywatne.
