# TUF-RGB Code Style & Architectural Guidelines

Ten dokument definiuje formalny standard kodowania, konwencje stylistyczne oraz architekturę dla repozytorium **TUF-RGB** (rozszerzenie GNOME Shell, demon w Pythonie oraz skrypty pomocnicze). Standard powstał w oparciu o audyt kodu tuf-rgb, oficjalne wytyczne GNOME HIG / GJS oraz analizę wzorcowych repozytoriów społeczności (w szczególności `Battery-Health-Charging`).

---

## 1. Architektura Systemowa i Podział Odpowiedzialności

Projekt składa się z trzech współpracujących warstw:

```
┌─────────────────────────────────────────────────────────┐
│               GNOME Shell / UI Layer                    │
│  - extension.js (Quick Settings widget, DBus listener)  │
│  - prefs.js (Libadwaita Preferences dialog)             │
│  - stylesheet.css (Styling spójny z GNOME/Adwaita)      │
└───────────────────────────┬─────────────────────────────┘
                            │ Subprocess IPC / CLI calls
┌───────────────────────────▼─────────────────────────────┐
│             Hardware Backend Helper & Daemon            │
│  - bin/tuf-rgb (Python 3, ioctl HIDIOCSFEATURE)         │
│  - ~/.config/tuf-rgb/state.json (Atomowy plik stanu)    │
└───────────────────────────┬─────────────────────────────┘
                            │ /dev/hidrawX (ITE5570 LampArray)
┌───────────────────────────▼─────────────────────────────┐
│                 System / Kernel Layer                   │
│  - bin/installer.sh (Zarządzanie udev przez pkexec)     │
│  - /etc/udev/rules.d/99-tuf-rgb.rules                   │
└─────────────────────────────────────────────────────────┘
```

1. **Warstwa UI (GJS / Libadwaita / CSS):** Lekka warstwa prezentacji. Nie wykonuje bezpośrednich operacji uprzywilejowanych ani blokujących operacji wejścia/wyjścia na głównym wątku GNOME Shell.
2. **Warstwa Backendowa (Python CLI & Daemon):** Zarządza protokołem HID LampArray (`0x5F`, `0x46`, `0x45`), generuje klatki animacji (Breathe, Heartbeat, Cycle) i zarządza plikiem stanu.
3. **Warstwa Uprawnień (Bash & udev):** Zapewnia bezhasłowy dostęp użytkownika do węzła `/dev/hidraw*` poprzez udev (`uaccess`, `0666`), instalowany jednorazowo z poziomu preferencji lub CLI.

---

## 2. Standardy JavaScript / GJS (GNOME Shell)

### 2.1 Standard ECMAScript i Importy
- Używaj nowoczesnych modułów ES (`import` / `export`).
- Importuj biblioteki GObject przez schemat `gi://`:
  ```javascript
  import Clutter from 'gi://Clutter';
  import Gio from 'gi://Gio';
  import GLib from 'gi://GLib';
  import GObject from 'gi://GObject';
  import St from 'gi://St';
  ```
- Importuj moduły GNOME Shell przez schemat `resource:///`:
  ```javascript
  import {Extension, gettext as _} from 'resource:///org/gnome/shell/extensions/extension.js';
  import * as Main from 'resource:///org/gnome/shell/ui/main.js';
  import * as PopupMenu from 'resource:///org/gnome/shell/ui/popupMenu.js';
  ```

### 2.2 Rejestracja Klas i GObject
- Każda klasa dziedzicząca po typie GObject (np. `PopupMenu.PopupBaseMenuItem`, `St.Widget`) musi posiadać blok rejestracji:
  ```javascript
  class ColorPaletteItem extends PopupMenu.PopupBaseMenuItem {
      static {
          GObject.registerClass(this);
      }
      // ...
  }
  ```

### 2.3 Konwencja Nazewnictwa
- **Klasy:** `PascalCase` (np. `KeyboardColorSection`, `SpeedSliderItem`).
- **Metody i Zmienne:** `camelCase` (np. `syncState()`, `activeEffect`).
- **Składowe Prywatne:** Prefix podkreślenia `_` (np. `this._currentColor`, `this._runCmd()`).
- **Stałe Konfiguracyjne:** `UPPER_SNAKE_CASE` (np. `PALETTE`, `INITIAL_WAKE_DELAY_MS`).

### 2.4 Zarządzanie Pamięcią i Cyklem Życia (Lifecycle & Teardown)
> **ZASADA ZEROWEGO WYCIEKU PAMIĘCI (Zero Leak Policy):**
> Wszystkie zasoby powiązane z GNOME Shell muszą zostać bezwzględnie wyczyszczone przy wyłączeniu wtyczki (`disable()`) lub zniszczeniu widgetu (`destroy()`).

1. **Timery GLib:** Identyfikator każdego `GLib.timeout_add` musi być przechowywany w polu instancji i czyszczony przez `GLib.source_remove(id)`.
2. **Sygnały GObject:** Każde połączenie `.connect(...)` z zewnętrznymi obiektami (np. `Main.sessionMode`, menu nadrzędne) musi posiadać odpowiadający `.disconnect(signalId)`.
3. **Subskrypcje DBus:** Każdy `Gio.DBus.system.signal_subscribe` musi zostać wyrejestrowany za pomocą `Gio.DBus.system.signal_unsubscribe(id)`.
4. **Elementy UI:** Wszystkie utworzone widgety podrzędne muszą zostać zniszczone (`widget.destroy()`).

### 2.5 Asynchroniczność i I/O
- **Nigdy nie blokuj wątku głównego:** Operacje odczytu/zapisu plików oraz uruchamianie procesów podrzędnych powinny być asynchroniczne (`Gio.Subprocess.prototype.wait_async`, `Gio.File.prototype.load_contents_async`).
- Odczyt stanu z dysku w pętli menu powinien być zoptymalizowany (throttling / debounce / obsługa GSettings).

### 2.6 Wstrzykiwanie do Quick Settings (Injection Pattern)
- Unikaj sprawdzania etykiet w konkretnym języku użytkownika (np. `child.title === 'Klawiatura'`).
- Wyszukuj elementy docelowe po typie konstruktora lub właściwościach funkcjonalnych:
  ```javascript
  if (child.constructor.name === 'KeyboardBrightnessToggle' || child._sliderItem !== undefined)
      return child;
  ```

---

## 3. Standardy Python (Backend & Daemon)

### 3.1 Zgodność z PEP 8 i Formatowanie
- Wcięcia: 4 spacje.
- Maksymalna długość linii: 100 znaków.
- Kod sformatowany zgodnie ze standardem `black` / `flake8`.
- Type hinting dla kluczowych sygnatur funkcji (np. `def hidiocsfeature(length: int) -> int:`).

### 3.2 Kody Wyjścia CLI (Standardized Exit Codes)
CLI i demon `bin/tuf-rgb` muszą zwracać przewidywalne kody wyjścia:
- **`0` (Success):** Operacja powiodła się.
- **`1` (General / Usage Error):** Nieprawidłowe argumenty, błąd składni, nieoczekiwany wyjątek.
- **`2` (Permission Denied):** Brak uprawnień do zapisu na `/dev/hidraw*` (sygnał dla UI do wyświetlenia prośby o instalację reguły udev).
- **`3` (Device Not Found):** Kontroler ITE5570 LampArray nie został odnaleziony w systemie.

### 3.3 Bezpieczeństwo Zapisów Stanu (Atomic Writes)
Zapis pliku `~/.config/tuf-rgb/state.json` musi odbywać się atomowo:
```python
tmp_file = CONFIG_DIR / f"state.json.tmp.{os.getpid()}"
tmp_file.write_text(json.dumps(state, indent=2), encoding="utf-8")
tmp_file.replace(STATE_FILE)
```
Dzięki temu demon odczytujący plik w pętli nigdy nie napotka pliku częściowo zapisanego.

### 3.4 Architektura Demona Efektów
1. **Podwójny Fork (Daemonization):** Standardowy podwójny `os.fork()` z `os.setsid()` oraz przekierowaniem deskryptorów `stdin`, `stdout`, `stderr` do `/dev/null`.
2. **PID File:** Zarządzany atomowo w `~/.config/tuf-rgb/effect.pid`. Przy zamykaniu (`SIGTERM` / `SIGINT`) plik jest usuwany.
3. **Automatyczne Przywracanie Połączenia:** W przypadku uśpienia laptopa lub rozłączenia kontrolera (`BrokenPipeError`), demon zamyka deskryptor, ponawia wyszukiwanie `/dev/hidraw*` i wznawia animację.
4. **Efektywność Obliczeniowa:** Częstotliwość klatek 40 FPS (`time.sleep(0.025)`). Sprawdzanie `mtime` pliku stanu raz na 200 ms. Zużycie CPU poniżej 0.2%.

---

## 4. Standardy CSS i Estetyka GNOME

### 4.1 Przestrzeń Nazw (Namespace)
- Wszystkie selektory CSS w `stylesheet.css` muszą być poprzedzone prefiksem `.tuf-rgb-*`, aby zapobiec kolizjom z motywem powłoki GNOME i innymi rozszerzeniami.

### 4.2 Zgodność z Akcentami Systemowymi i GNOME HIG
- Unikaj twardego kodowania kolorów w CSS (`#bde6fb !important`), o ile nie jest to fallback.
- Korzystaj ze zmiennych środowiskowych i klas systemowych powłoki:
  - Stany aktywne przycisków powinny dziedziczyć z motywu systemowego (`.button.default`, `.quick-toggle:checked`).
- Płynne przejścia: deklaruj `transition-duration: 150ms` do `200ms` dla hover i zmian stanów.

### 4.3 Dostępność Wizualna (Contrast & Readability)
- Wskaźnik zaznaczenia (checkmark `✓`) na próbkach kolorów musi adaptować swój kontrast:
  - Jasne tło (White, Yellow): ciemny znak `#161c1f`.
  - Ciemne tło (Red, Blue, Purple itd.): biały znak `#ffffff`.
- Rozmiar próbek koloru: minimum `30x30px` z promieniem zaokrąglenia `8px` dla wygody klikania.

---

## 5. Standardy Skryptów Powłoki (Bash / udev)

### 5.1 Rygor Bezpieczeństwa
- Skrypt instalatora `bin/installer.sh` musi zaczynać się od:
  ```bash
  #!/usr/bin/env bash
  set -euo pipefail
  ```
- Wszystkie zmienne ścieżek muszą być ujmowane w cudzysłowy.
- Operacje modyfikacji systemu (`/etc/udev/rules.d/`) muszą być idempotentne.

### 5.2 Zarządzanie Regułą udev
- Identyfikacja urządzeń: precyzyjne dopasowanie do kerneli ITE5570:
  `SUBSYSTEM=="hidraw", KERNELS=="i2c-ITE5570*", TAG+="uaccess", MODE="0666"`
- Po instalacji i usunięciu reguły należy wymusić przeładowanie:
  `udevadm control --reload && udevadm trigger --subsystem-match=hidraw`

---

## 6. Wzorzec Preferencji (Libadwaita / prefs.js)

- Interfejs preferencji musi być zbudowany przy użyciu komponentów **Libadwaita** (`Adw.PreferencesPage`, `Adw.PreferencesGroup`, `Adw.ActionRow`).
- Stan instalacji reguły uprawnień udev musi być weryfikowany dynamicznie przy otwarciu okna za pomocą asynchronicznego podprocesu (`Gio.Subprocess`).
- Operacje instalacji i deinstalacji uprawnień wymagające roota (`pkexec`) muszą informować użytkownika o wyniku za pomocą powiadomień `Adw.Toast`.
- Przyciski akcji powinny stosować semantyczne klasy stylów Adwaita:
  - `.suggested-action` dla instalacji/włączenia,
  - `.destructive-action` dla usunięcia/wyłączenia.
