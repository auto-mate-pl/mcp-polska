#!/usr/bin/env node
// mcp-polska — serwer MCP z polskimi rejestrami publicznymi dla Claude.
// Biała lista podatników VAT (MF), KRS (MS), kursy walut NBP, walidacja NIP.
// Wszystkie API są publiczne i nie wymagają klucza.
import { McpServer } from "@modelcontextprotocol/sdk/server/mcp.js";
import { StdioServerTransport } from "@modelcontextprotocol/sdk/server/stdio.js";
import { z } from "zod";

const UA = "mcp-polska (+https://github.com/auto-mate-pl/mcp-polska)";

const dzis = () => new Date().toLocaleDateString("sv-SE", { timeZone: "Europe/Warsaw" });
const tylkoCyfry = (s) => String(s).replace(/\D/g, "");

function nipPoprawny(nip) {
  const n = tylkoCyfry(nip);
  if (n.length !== 10) return false;
  const w = [6, 5, 7, 2, 3, 4, 5, 6, 7];
  const suma = w.reduce((acc, wi, i) => acc + wi * Number(n[i]), 0);
  return suma % 11 === Number(n[9]);
}

async function pobierz(url) {
  const res = await fetch(url, { headers: { Accept: "application/json", "User-Agent": UA } });
  const tekst = await res.text();
  let dane = null;
  try { dane = JSON.parse(tekst); } catch {}
  if (!res.ok) {
    const e = new Error(`HTTP ${res.status}: ${dane?.message || tekst.slice(0, 120) || res.statusText}`);
    e.status = res.status;
    throw e;
  }
  if (dane === null) {
    throw new Error(
      "serwer zwrócił stronę zamiast danych — zwykle to chwilowa blokada anty-bot lub limit zapytań. Spróbuj za kilka minut albo sprawdź ręcznie w wyszukiwarce urzędu."
    );
  }
  return dane;
}

const ok = (obj) => ({ content: [{ type: "text", text: JSON.stringify(obj, null, 2) }] });
const blad = (msg) => ({ isError: true, content: [{ type: "text", text: msg }] });

const server = new McpServer({ name: "mcp-polska", version: "0.1.1" });

server.registerTool(
  "nip_waliduj",
  {
    title: "Walidacja NIP",
    description: "Sprawdza sumę kontrolną polskiego numeru NIP (offline, bez zapytania do rejestru).",
    inputSchema: { nip: z.string().describe("NIP, może zawierać PL, spacje i myślniki") },
  },
  async ({ nip }) => ok({ nip: tylkoCyfry(nip), poprawny: nipPoprawny(nip) })
);

server.registerTool(
  "biala_lista_nip",
  {
    title: "Biała lista VAT — wyszukaj po NIP",
    description:
      "Zwraca dane podatnika z wykazu podatników VAT Ministerstwa Finansów (Biała lista): nazwa, status VAT, REGON, KRS, adres, rachunki bankowe, daty rejestracji i wykreślenia.",
    inputSchema: {
      nip: z.string().describe("NIP kontrahenta"),
      data: z.string().optional().describe("Data stanu RRRR-MM-DD (domyślnie dziś)"),
    },
  },
  async ({ nip, data }) => {
    const n = tylkoCyfry(nip);
    if (!nipPoprawny(n)) return blad(`NIP ${n} ma błędną sumę kontrolną — sprawdź, czy nie ma literówki.`);
    try {
      const d = await pobierz(`https://wl-api.mf.gov.pl/api/search/nip/${n}?date=${data || dzis()}`);
      if (!d.result?.subject) return blad(`Brak podmiotu o NIP ${n} na Białej liście (stan na ${data || dzis()}).`);
      return ok({ ...d.result, zrodlo: "wl-api.mf.gov.pl" });
    } catch (e) {
      return blad(`Biała lista: ${e.message}`);
    }
  }
);

server.registerTool(
  "biala_lista_konto",
  {
    title: "Biała lista VAT — czy konto należy do NIP",
    description:
      "Sprawdza, czy rachunek bankowy jest przypisany do danego NIP na Białej liście (ważne przy płatnościach powyżej 15 000 zł). Zwraca TAK/NIE i requestId jako dowód sprawdzenia.",
    inputSchema: {
      nip: z.string().describe("NIP kontrahenta"),
      konto: z.string().describe("Numer rachunku (26 cyfr, może mieć PL i spacje)"),
      data: z.string().optional().describe("Data stanu RRRR-MM-DD (domyślnie dziś)"),
    },
  },
  async ({ nip, konto, data }) => {
    const n = tylkoCyfry(nip);
    const k = tylkoCyfry(konto);
    if (k.length !== 26) return blad(`Rachunek powinien mieć 26 cyfr, a ma ${k.length}.`);
    try {
      const d = await pobierz(
        `https://wl-api.mf.gov.pl/api/check/nip/${n}/bank-account/${k}?date=${data || dzis()}`
      );
      if (!d.result) return blad("Biała lista: nieoczekiwana odpowiedź serwera MF.");
      return ok({ nip: n, konto_koncowka: k.slice(-4), przypisane: d.result.accountAssigned, requestId: d.result.requestId, data: data || dzis() });
    } catch (e) {
      return blad(`Biała lista: ${e.message}`);
    }
  }
);

server.registerTool(
  "krs_odpis",
  {
    title: "KRS — odpis aktualny",
    description:
      "Pobiera aktualny odpis z Krajowego Rejestru Sądowego: forma prawna, adres, kapitał, zarząd, sposób reprezentacji, upadłość/likwidacja.",
    inputSchema: {
      krs: z.string().describe("Numer KRS (do 10 cyfr)"),
      rejestr: z.enum(["P", "S"]).optional().describe("P — przedsiębiorcy (domyślnie), S — stowarzyszenia i fundacje"),
      pelny: z.boolean().optional().describe("true = cały odpis JSON zamiast skrótu"),
    },
  },
  async ({ krs, rejestr, pelny }) => {
    const nr = tylkoCyfry(krs).padStart(10, "0");
    try {
      const d = await pobierz(`https://api-krs.ms.gov.pl/api/krs/OdpisAktualny/${nr}?rejestr=${rejestr || "P"}&format=json`);
      if (pelny) return ok(d);
      const o = d.odpis || {};
      const dz1 = o.dane?.dzial1 || {};
      const dz2 = o.dane?.dzial2 || {};
      const dz6 = o.dane?.dzial6 || {};
      return ok({
        krs: nr,
        nazwa: dz1.danePodmiotu?.nazwa,
        forma_prawna: dz1.danePodmiotu?.formaPrawna,
        identyfikatory: dz1.danePodmiotu?.identyfikatory,
        adres: dz1.siedzibaIAdres?.adres,
        data_rejestracji: o.naglowekA?.dataRejestracjiWKRS,
        stan_z_dnia: o.naglowekA?.stanZDnia,
        kapital: dz1.kapital,
        reprezentacja: dz2.reprezentacja,
        dzial6_upadlosc_likwidacja: Object.keys(dz6).length ? dz6 : "brak wpisów",
        zrodlo: "api-krs.ms.gov.pl",
      });
    } catch (e) {
      return blad(e.status === 404 ? `Nie znaleziono KRS ${nr} w rejestrze ${rejestr || "P"}.` : `KRS: ${e.message}`);
    }
  }
);

server.registerTool(
  "nbp_kurs",
  {
    title: "Kurs średni NBP",
    description:
      "Kurs średni waluty z tabeli A NBP. Z parametrem 'dla_faktury' zwraca kurs z ostatniego dnia roboczego PRZED podaną datą (zasada dla VAT i kosztów).",
    inputSchema: {
      waluta: z.string().describe("Kod waluty, np. EUR, USD, GBP"),
      data: z.string().optional().describe("RRRR-MM-DD; domyślnie najnowszy kurs"),
      dla_faktury: z.boolean().optional().describe("true = kurs z dnia roboczego poprzedzającego datę"),
    },
  },
  async ({ waluta, data, dla_faktury }) => {
    const kod = waluta.trim().toLowerCase();
    try {
      if (!data) {
        const d = await pobierz(`https://api.nbp.pl/api/exchangerates/rates/a/${kod}/?format=json`);
        return ok({ waluta: d.code, kurs: d.rates[0].mid, data: d.rates[0].effectiveDate, tabela: d.rates[0].no });
      }
      const cel = new Date(data + "T12:00:00Z");
      if (dla_faktury) cel.setUTCDate(cel.getUTCDate() - 1);
      for (let i = 0; i < 10; i++) {
        const dzien = cel.toISOString().slice(0, 10);
        try {
          const d = await pobierz(`https://api.nbp.pl/api/exchangerates/rates/a/${kod}/${dzien}/?format=json`);
          return ok({ waluta: d.code, kurs: d.rates[0].mid, data_kursu: d.rates[0].effectiveDate, tabela: d.rates[0].no, data_zapytania: data, dla_faktury: !!dla_faktury });
        } catch (e) {
          if (e.status !== 404) throw e;
          cel.setUTCDate(cel.getUTCDate() - 1);
        }
      }
      return blad("Brak notowania w ciągu 10 dni przed datą.");
    } catch (e) {
      return blad(`NBP: ${e.message}`);
    }
  }
);

await server.connect(new StdioServerTransport());
