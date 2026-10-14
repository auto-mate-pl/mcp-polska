# mcp-polska 🇵🇱

**Polskie rejestry publiczne w Claude.** Darmowy serwer MCP, dzięki któremu Claude (Desktop, Code, Cursor i inne klienty MCP) sam sprawdzi firmę po NIP, konto na Białej liście, odpis z KRS i kurs NBP do faktury.

Bez kluczy API, bez rejestracji — korzysta wyłącznie z otwartych API Ministerstwa Finansów, Ministerstwa Sprawiedliwości i NBP.

## Co potrafi

| Narzędzie | Co robi | Źródło |
|---|---|---|
| `nip_waliduj` | Sprawdza sumę kontrolną NIP (wyłapuje literówki) | offline |
| `biala_lista_nip` | Status VAT, nazwa, adres, REGON, KRS i rachunki firmy | wl-api.mf.gov.pl |
| `biala_lista_konto` | Czy konto z faktury należy do tego NIP (TAK/NIE + `requestId` jako dowód) | wl-api.mf.gov.pl |
| `krs_odpis` | Forma prawna, adres, kapitał, zarząd, reprezentacja, upadłość/likwidacja | api-krs.ms.gov.pl |
| `nbp_kurs` | Kurs średni NBP; z `dla_faktury: true` — z dnia roboczego przed datą (zasada dla VAT) | api.nbp.pl |

## Przykładowe polecenia

> Sprawdź firmę z NIP 5260250274 i czy konto 60 1010 1010 0038 2522 3000 0000 jest na białej liście.

> Kto jest w zarządzie spółki z KRS 0000019193?

> Faktura w EUR z datą sprzedaży 12.10.2026 — jaki kurs NBP przyjąć do VAT?

## Instalacja

Wymaga [Node.js](https://nodejs.org) 18 lub nowszego.

### Claude Desktop

Otwórz **Ustawienia → Developer → Edit Config** i dodaj do `claude_desktop_config.json`:

```json
{
  "mcpServers": {
    "polska": {
      "command": "npx",
      "args": ["-y", "github:auto-mate-pl/mcp-polska"]
    }
  }
}
```

Zrestartuj Claude Desktop. W oknie rozmowy pojawią się narzędzia „polska”.

### Claude Code

```bash
claude mcp add polska -- npx -y github:auto-mate-pl/mcp-polska
```

### Lokalnie (z klonu repozytorium)

```bash
git clone https://github.com/auto-mate-pl/mcp-polska.git
cd mcp-polska && npm install
# w konfiguracji klienta: "command": "node", "args": ["/ścieżka/do/mcp-polska/index.js"]
```

## Ograniczenia

- API Białej listy ma dzienne limity zapytań (najostrzejsze dla wyszukiwania) — do masowej weryfikacji tysięcy kontrahentów używaj pliku płaskiego MF.
- CEIDG i GUS/REGON wymagają kluczy API, dlatego nie są (jeszcze) w tym serwerze.
- To narzędzie do sprawdzania danych w rejestrach, nie porada prawna ani podatkowa.

## Chcesz więcej?

Ten serwer to darmowa część **[Biblioteki Auto-mate](https://auto-mate.space/skille/)** — 44 skille do Claude po polsku, m.in. **Weryfikacja kontrahenta**, **Faktura pod KSeF** i **Oferty na Allegro**, 21 promptów i kurs „Claude w marketingu”.

👉 [auto-mate.space/skille](https://auto-mate.space/skille/)

## Licencja

MIT © Auto-mate. Zgłoszenia i pomysły: zakładka [Issues](https://github.com/auto-mate-pl/mcp-polska/issues).
