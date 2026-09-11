/**
 * Inhaber-/Werbewiderspruchs-Erkennung (lib/impressum-inhaber.js) und die
 * Durchreichung bis in die Antwort von enrichContact; dazu searchPlaces-
 * Blaettern (V7) und der Modellwechsel der Sonnet-Functions.
 *
 * Die Handler-Tests laufen gegen die ECHTEN Handler aus index.js (nur fetch
 * und Firebase sind ersetzt) — sie messen, was in der Antwort ankommt, nicht
 * nur, was die Bibliothek zurueckgibt.
 */

jest.mock('firebase-admin', () => ({
    initializeApp: jest.fn(),
    firestore: jest.fn(() => ({ collection: jest.fn(), runTransaction: jest.fn() })),
    auth: jest.fn(() => ({ getUser: jest.fn(), setCustomUserClaims: jest.fn() }))
}));
jest.mock('firebase-functions/v2/https', () => ({
    onRequest: jest.fn(() => jest.fn()),
    onCall: jest.fn(() => jest.fn())
}));
jest.mock('firebase-functions/v2/scheduler', () => ({ onSchedule: jest.fn(() => jest.fn()) }));
jest.mock('firebase-functions/v2/firestore', () => ({ onDocumentCreated: jest.fn(() => jest.fn()) }));
jest.mock('firebase-functions/v2', () => ({ setGlobalOptions: jest.fn() }));
jest.mock('firebase-functions/params', () => ({ defineSecret: jest.fn(() => ({ value: () => 'test' })) }));
jest.mock('nodemailer', () => ({ createTransport: jest.fn() }));
jest.mock('pdfkit', () => jest.fn());
jest.mock('docx', () => ({}));
jest.mock('@pdfme/generator', () => ({ generate: jest.fn() }));
jest.mock('@pdfme/common', () => ({ BLANK_PDF: '' }));
jest.mock('@pdfme/schemas', () => ({ text: {}, image: {}, line: {}, rectangle: {} }));

process.env.NODE_ENV = 'test';

const fs = require('fs');
const path = require('path');
const { erkenneInhaber, erkenneWerbewiderspruch, entitiesAufloesen, textMitBloecken } = require('../lib/impressum-inhaber');
const { _test } = require('../index');

// ─────────────────────────────────────────────────────────────────────────────
describe('erkenneInhaber — Pflichtfaelle aus dem Auftrag', () => {
    test('„Angaben gemäß § 5 DDG: Malerbetrieb Schneider GmbH" → kein Name', () => {
        const r = erkenneInhaber('Angaben gemäß § 5 DDG: Malerbetrieb Schneider GmbH');
        expect(r).toEqual({ name: null, rolle: null, anrede: null, titel: null });
    });

    test('„Verantwortlich Herr Klaus Bauer" → Klaus Bauer / Herr', () => {
        const r = erkenneInhaber('Verantwortlich Herr Klaus Bauer');
        expect(r.name).toBe('Klaus Bauer');
        expect(r.anrede).toBe('Herr');
        expect(r.rolle).toBe('Verantwortlich');
    });

    test('„Inhaber Max Müller-Lüdenscheidt" → voller Doppelname', () => {
        const r = erkenneInhaber('Inhaber Max Müller-Lüdenscheidt');
        expect(r.name).toBe('Max Müller-Lüdenscheidt');
        expect(r.rolle).toBe('Inhaber');
        // Die maskuline Form wird auch generisch benutzt → keine geratene Anrede.
        expect(r.anrede).toBeNull();
    });

    test('„Inhaberin: Dr. med. Ayşe Yıldız" → Frau, Titel getrennt, türkische Buchstaben', () => {
        const r = erkenneInhaber('Inhaberin: Dr. med. Ayşe Yıldız');
        expect(r.name).toBe('Ayşe Yıldız');
        expect(r.anrede).toBe('Frau');
        expect(r.titel).toBe('Dr. med.');
        expect(r.rolle).toBe('Inhaberin');
    });

    test('„Vertreten durch: Jean-Luc Martin" → Jean-Luc Martin', () => {
        const r = erkenneInhaber('Vertreten durch: Jean-Luc Martin');
        expect(r.name).toBe('Jean-Luc Martin');
        expect(r.rolle).toBe('Vertreten durch');
    });
});

describe('erkenneInhaber — Namensformen', () => {
    test('dreiteiliger Name', () => {
        expect(erkenneInhaber('Geschäftsführerin: Anna Maria Schulz Handelsregister: HRB 1234').name).toBe('Anna Maria Schulz');
    });

    test('Großbuchstaben mit Punkt im Türkischen (İ Ş Ğ Ç)', () => {
        const r = erkenneInhaber('Inhaber: İsmail Çağlar Öztürk Musterweg 3');
        expect(r.name).toBe('İsmail Çağlar Öztürk');
    });

    test('Prof. Dr. vor dem Namen, Frau vor dem Titel', () => {
        const r = erkenneInhaber('Verantwortlich nach § 18 Abs. 2 MStV: Frau Prof. Dr. Helga Brandt, Hauptstraße 5');
        expect(r).toEqual({ name: 'Helga Brandt', rolle: 'Verantwortlich', anrede: 'Frau', titel: 'Prof. Dr.' });
    });

    test('Fundstelle ohne Doppelpunkt (Wortlaut aus webdesign/src/impressum.html)', () => {
        // Echter Fall, keine Fixture-Konvention: die erste Fassung fand hier nichts.
        const r = erkenneInhaber('Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV Muammer Kizilaslan Spitalstr. 7');
        expect(r).toMatchObject({ name: 'Muammer Kizilaslan', rolle: 'Verantwortlich' });
    });

    // Wortlaute aus echten Seiten in webdesign/src/portfolio (Fusszeile/Team-Block),
    // nicht aus der Fixture-Konvention „Rolle: Vorname Nachname".
    test('Fusszeile „Inhaber Stefan Müller Made by …" → nur der Name', () => {
        expect(erkenneInhaber('© 2026 Meisterbetrieb Müller GmbH · Inhaber Stefan Müller Made by Karriaro · Webdesign-Manufaktur').name).toBe('Stefan Müller');
    });

    test('Berufsbezeichnung zwischen Rolle und Name wird übersprungen', () => {
        expect(erkenneInhaber('Inhaber & Dachdeckermeister Thomas Berger Dachdeckermeister in dritter Generation')).toMatchObject({ name: 'Thomas Berger', rolle: 'Inhaber' });
        expect(erkenneInhaber('Inhaberin & Friseurmeisterin Laura Müller Seit 18 Jahren in der Stadt')).toMatchObject({ name: 'Laura Müller', anrede: 'Frau' });
    });

    test('Gegenprobe: Betriebswort wird NICHT übersprungen', () => {
        expect(erkenneInhaber('Betreiber: Friseursalon Aydın Yılmaz').name).toBeNull();
        expect(erkenneInhaber('Inhaberin & Zahnarztpraxis Dr. Weber').name).toBeNull();
    });

    test('Gegenprobe: Satzende zwischen Rolle und Großwörtern → kein Name', () => {
        expect(erkenneInhaber('Wir sind verantwortlich. Verantwortlich nach § 5. Weitere Hinweise folgen hier').name).toBeNull();
    });

    test('Namenspartikel „von" bleibt Teil des Namens', () => {
        expect(erkenneInhaber('Geschäftsführer: Carl von Ossietzky Registergericht Berlin').name).toBe('Carl von Ossietzky');
    });

    test('HTML-Entities werden aufgelöst (M&uuml;ller, &nbsp;, &sect;)', () => {
        const r = erkenneInhaber('Verantwortlich gem. &sect; 18 MStV: Hans&nbsp;M&uuml;ller');
        expect(r.name).toBe('Hans Müller');
    });

    test('Straße nach dem Namen gehört nicht dazu', () => {
        expect(erkenneInhaber('Inhaber: Peter Wagner Lindenstraße 12 70173 Stuttgart').name).toBe('Peter Wagner');
        expect(erkenneInhaber('Inhaber: Peter Wagner Musterstr. 12').name).toBe('Peter Wagner');
    });

    test('Telefonnummer direkt nach dem Namen stört nicht', () => {
        expect(erkenneInhaber('Inhaber: Peter Wagner 0711 123456').name).toBe('Peter Wagner');
    });

    test('„Inhaber und Geschäftsführer: …" findet den Namen hinter dem Doppelpunkt', () => {
        expect(erkenneInhaber('Inhaber und Geschäftsführer: Lena Hoffmann').name).toBe('Lena Hoffmann');
    });

    test('Firmenzeile vor der Rolle wird übersprungen, der Inhaber danach erkannt', () => {
        const r = erkenneInhaber('Impressum Malerbetrieb Schneider GmbH Geschäftsführer: Tobias Schneider Telefon: 0711 1');
        expect(r).toMatchObject({ name: 'Tobias Schneider', rolle: 'Geschäftsführer' });
    });
});

describe('erkenneInhaber — Gegenproben (darf KEINEN Namen liefern)', () => {
    test.each([
        ['Inhaber: Malerbetrieb Schneider GmbH'],
        ['Inhaber: Zahnarztpraxis Dr. Weber'],
        ['Betreiber: Friseursalon Aydın'],
        ['Inhaberin: Salon Schönheit'],
        ['Vertreten durch: Müller Schneider GmbH'],
        ['Inhaber: Max Müller e.K.'],
        ['Geschäftsführer: Max Mustermann'],
        ['Inhaber: Schneider'],
        ['Die Betreiber der Seiten behalten sich ausdrücklich rechtliche Schritte vor.'],
        ['Mitinhaber Klaus Bauer'],
        ['Seitenbetreiber Klaus Bauer'],
        ['Angaben gemäß § 5 DDG: Klaus Bauer'],
        ['Geschäftsführer: Klaus Bauer Anna Schmidt Jens Koch'],
        [''],
        [null]
    ])('%p', (eingabe) => {
        expect(erkenneInhaber(eingabe).name).toBeNull();
    });

    test('Mechanismus-Probe: dieselbe Zeile MIT Rolle liefert den Namen (Gegenprobe zu „Angaben gemäß")', () => {
        expect(erkenneInhaber('Angaben gemäß § 5 DDG: Klaus Bauer').name).toBeNull();
        expect(erkenneInhaber('Angaben gemäß § 5 DDG: Inhaber Klaus Bauer').name).toBe('Klaus Bauer');
    });
});

// Pruefer 2026-09-10: Faelle, die die Erstfassung falsch als Namen lieferte.
// Ein Betriebswort als Anrede („Sehr geehrter Herr Autohaus") ist schlimmer als keine.
describe('erkenneInhaber — Prüfer-Gegenproben (Betriebswörter, Fließtext, Zeilenumbrüche)', () => {
    test.each([
        ['Inhaber: Autohaus Schmidt'],
        ['Betreiber: Stadtwerke Ulm'],
        ['Inhaber: Müller Reisen'],
        ['Inhaber: Hofladen Meier'],
        ['Inhaber: Weinstube Krone'],
        ['Inhaber: Blumen Schulz'],
        ['Als Betreiber Ihrer Photovoltaikanlage Solar profitieren Sie'],
        ['Wir sind Betreiber Eines Großen Netzes']
    ])('kein Name: %p', (eingabe) => {
        expect(erkenneInhaber(eingabe).name).toBeNull();
    });

    test('Gegenprobe: dieselben Endungen an zweiter Stelle sind echte Nachnamen', () => {
        expect(erkenneInhaber('Inhaber: Peter Neuhaus').name).toBe('Peter Neuhaus');
        expect(erkenneInhaber('Inhaberin: Anna Althof').name).toBe('Anna Althof');
    });

    test('Branchen-/Kammerwort hinter dem Namen gehört nicht dazu', () => {
        expect(erkenneInhaber('Inhaber Klaus Bauer Dachdeckerei').name).toBe('Klaus Bauer');
        expect(erkenneInhaber('Geschäftsführer: Klaus Bauer Zuständige Kammer: HWK').name).toBe('Klaus Bauer');
    });

    test('textMitBloecken: ein Zeilenumbruch beendet den Namen (Mechanismus mit Gegenprobe)', () => {
        const html = '<p>Inhaber: Klaus Bauer<br>Stuttgart</p><p>Telefon: 0711 1</p>';
        expect(erkenneInhaber(textMitBloecken(html)).name).toBe('Klaus Bauer');
        // Ohne Blockgrenzen (alle Tags → Leerzeichen) klebt der Ort am Namen.
        const flach = html.replace(/<[^>]+>/g, ' ');
        expect(erkenneInhaber(flach).name).toBe('Klaus Bauer Stuttgart');
    });

    test('textMitBloecken: Definitionsliste und Tabelle (Rolle und Name in getrennten Zellen)', () => {
        expect(erkenneInhaber(textMitBloecken('<dl><dt>Inhaber</dt><dd>Klaus Bauer</dd><dd>Hauptstraße 1</dd></dl>')).name).toBe('Klaus Bauer');
        expect(erkenneInhaber(textMitBloecken('<table><tr><th>Geschäftsführerin:</th><td>Ayşe Kılıç</td></tr></table>'))).toMatchObject({ name: 'Ayşe Kılıç', anrede: 'Frau' });
    });

    test('textMitBloecken: Skripte, Styles und Kommentare tragen keinen Text bei', () => {
        const t = textMitBloecken('<script>var Inhaber = "Max Maier";</script><style>.x{}</style><!-- Inhaber: Paul Kern --><p>Start</p>');
        expect(t).toBe('| Start |');
        expect(erkenneInhaber(t).name).toBeNull();
    });
});

describe('entitiesAufloesen', () => {
    test('benannt, dezimal, hex — unbekannte bleiben stehen', () => {
        expect(entitiesAufloesen('T&uuml;rkisch &amp; &#8211; &#x2013; &foo;')).toBe('Türkisch & – – &foo;');
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('erkenneWerbewiderspruch', () => {
    test.each([
        ['eRecht24-Formel', 'Widerspruch gegen Werbe-E-Mails Der Nutzung von im Rahmen der Impressumspflicht veröffentlichten Kontaktdaten zur Übersendung von nicht ausdrücklich angeforderter Werbung und Informationsmaterialien wird hiermit widersprochen.'],
        ['ohne Überschrift', 'Der Nutzung der Kontaktdaten zur Übersendung von nicht ausdrücklich angeforderter Werbung wird hiermit ausdrücklich widersprochen.'],
        ['wir widersprechen', 'Wir widersprechen hiermit der Nutzung unserer Kontaktdaten zu Werbezwecken.'],
        ['rechtliche Schritte', 'Die Betreiber der Seiten behalten sich ausdrücklich rechtliche Schritte im Falle der unverlangten Zusendung von Werbeinformationen, etwa durch Spam-E-Mails, vor.'],
        ['untersagt', 'Die Verwendung der Kontaktdaten für Werbezwecke ist ausdrücklich untersagt.'],
        ['keine Werbung erwünscht', 'Keine Werbung erwünscht.'],
        ['mit Entities', 'Der Nutzung zur &Uuml;bersendung nicht angeforderter Werbung wird hiermit widersprochen.'],
        // Pruefer 2026-09-10: von der Erstfassung verfehlte Wortstellungen
        ['Satzende „widersprechen wir"', 'Der Nutzung unserer Daten zur Übersendung von Werbung widersprechen wir.'],
        ['erste Person Singular', 'Einer Nutzung der Kontaktdaten für Werbung widerspreche ich.'],
        ['unerwünscht', 'Kontaktaufnahme zu Werbezwecken ist unerwünscht.'],
        ['keine Werbeanrufe', 'Wir wünschen keine Werbeanrufe und keine Werbe-E-Mails.']
    ])('erkennt: %s', (_name, text) => {
        expect(erkenneWerbewiderspruch(text)).toBe(true);
    });

    test.each([
        ['Art. 21 DSGVO Belehrung', 'Werden Ihre personenbezogenen Daten verarbeitet, um Direktwerbung zu betreiben, so haben Sie das Recht, jederzeit Widerspruch gegen die Verarbeitung Sie betreffender personenbezogener Daten zum Zwecke derartiger Werbung einzulegen. Wenn Sie widersprechen, werden Ihre personenbezogenen Daten anschließend nicht mehr zum Zwecke der Direktwerbung verwendet (Widerspruch nach Art. 21 Abs. 2 DSGVO).'],
        ['Newsletter-Hinweis', 'Sie können der Verwendung Ihrer E-Mail-Adresse für Werbung jederzeit widersprechen.'],
        ['Widerspruch ohne Werbung', 'Der Verarbeitung Ihrer Daten zu Analysezwecken wird hiermit widersprochen.'],
        ['Werbung ohne Widerspruch', 'Wir machen Werbung für unser Handwerk in der Region.'],
        // Pruefer 2026-09-10: Gewerbe/Bewerbung/Wettbewerb sind keine Werbung
        ['Gewerbe neben fremdem Widerspruch', 'Zuständige Gewerbeaufsicht: Landratsamt. Der Verarbeitung Ihrer Daten zu Analysezwecken wird hiermit widersprochen.'],
        ['Bewerbung neben fremdem Widerspruch', 'Bewerbungen richten Sie bitte an uns. Wir widersprechen hiermit der Weitergabe an Dritte.'],
        ['Sie-Form bleibt Belehrung', 'Werden Daten für Direktwerbung genutzt und Sie widersprechen, werden sie nicht mehr verarbeitet.'],
        ['leer', '']
    ])('ignoriert: %s', (_name, text) => {
        expect(erkenneWerbewiderspruch(text)).toBe(false);
    });
});

// ─────────────────────────────────────────────────────────────────────────────
function fakeRes() {
    return {
        statusCode: 200, body: undefined, headers: {},
        set(k, v) { if (typeof k === 'string') this.headers[k] = v; return this; },
        status(c) { this.statusCode = c; return this; },
        json(b) { this.body = b; return this; },
        send(b) { this.body = b; return this; }
    };
}
let ipZaehler = 0;
function fakeReq(body) {
    // Eigene IP je Aufruf: das In-Memory-Rate-Limit (30/min) darf die Tests nicht beeinflussen.
    return { method: 'POST', headers: { origin: 'https://karriaro-webdesign.de' }, ip: `10.0.0.${++ipZaehler}`, body };
}
function htmlAntwort(text, ok = true) {
    return { ok, status: ok ? 200 : 404, text: async () => text, json: async () => JSON.parse(text) };
}

describe('enrichContact (Handler) — Felder kommen in der Antwort an (V3)', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    test('verlinktes Impressum mit Inhaberin + Werbewiderspruch → ownerRole/ownerAnrede/werbewiderspruch', async () => {
        const aufgerufen = [];
        global.fetch = jest.fn(async (u) => {
            aufgerufen.push(String(u));
            if (String(u) === 'https://salon-yildiz.de/') {
                return htmlAntwort('<html><body><a href="/rechtliches/impressum.html">Impressum</a><a href="https://fremd.example/impressum">x</a></body></html>');
            }
            if (String(u) === 'https://salon-yildiz.de/rechtliches/impressum.html') {
                return htmlAntwort('<h1>Impressum</h1><p>Angaben gem&auml;&szlig; &sect; 5 DDG:<br>Salon Yıldız</p><p>Inhaberin: Dr. med. Ayşe Yıldız<br>Hauptstraße 1</p><h2>Widerspruch gegen Werbe-E-Mails</h2><p>Der Nutzung von im Rahmen der Impressumspflicht ver&ouml;ffentlichten Kontaktdaten zur &Uuml;bersendung von nicht ausdr&uuml;cklich angeforderter Werbung wird hiermit widersprochen.</p>');
            }
            return htmlAntwort('', false);
        });
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'https://salon-yildiz.de/' }), res);

        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({
            owner: 'Ayşe Yıldız',
            ownerRole: 'Inhaberin',
            ownerAnrede: 'Frau',
            ownerTitel: 'Dr. med.',
            werbewiderspruch: true,
            impressumGeladen: true
        });
        // Bestehende Felder bleiben erhalten.
        expect(res.body).toHaveProperty('emails');
        expect(res.body).toHaveProperty('contactScore');
        // Nie ein fremder Host.
        expect(aufgerufen.some(u => u.includes('fremd.example'))).toBe(false);
    });

    test('Gegenprobe: Firmenzeile ohne Rolle, kein Widerspruch → owner null, werbewiderspruch false', async () => {
        global.fetch = jest.fn(async (u) => {
            if (String(u) === 'https://maler-schneider.de/') return htmlAntwort('<p>Willkommen</p>');
            if (String(u) === 'https://maler-schneider.de/impressum') {
                return htmlAntwort('<p>Angaben gemäß § 5 DDG: Malerbetrieb Schneider GmbH</p><p>Werden Ihre Daten für Direktwerbung verarbeitet, haben Sie das Recht, jederzeit Widerspruch einzulegen.</p>');
            }
            return htmlAntwort('', false);
        });
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'https://maler-schneider.de/' }), res);
        expect(res.body.owner).toBeNull();
        expect(res.body.ownerRole).toBeNull();
        expect(res.body.ownerAnrede).toBeNull();
        expect(res.body.werbewiderspruch).toBe(false);
        expect(res.body.impressumGeladen).toBe(true);
    });

    test('Impressum nicht ladbar → impressumGeladen false (nicht gemessen ≠ kein Widerspruch)', async () => {
        global.fetch = jest.fn(async (u) => {
            if (String(u) === 'https://ohne-impressum.de/') return htmlAntwort('<p>Start</p>');
            return htmlAntwort('', false);
        });
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'https://ohne-impressum.de/' }), res);
        expect(res.body.werbewiderspruch).toBe(false);
        expect(res.body.impressumGeladen).toBe(false);
    });
});

describe('enrichContact (Handler) — Prüfer-Fälle', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    test('absoluter www/https-Link bei http-Eingabe ohne www wird gefunden (WordPress-Normalfall)', async () => {
        const aufgerufen = [];
        global.fetch = jest.fn(async (u) => {
            aufgerufen.push(String(u));
            if (String(u) === 'http://maler-bauer.de/') {
                return htmlAntwort('<footer><a href="https://www.maler-bauer.de/rechtliches/impressum/#top">Impressum</a><a href="https://www.andere-firma.de/impressum">Partner</a></footer>');
            }
            if (String(u) === 'https://www.maler-bauer.de/rechtliches/impressum/') {
                return htmlAntwort('<dl><dt>Inhaber</dt><dd>Klaus Bauer</dd><dd>Stuttgart</dd></dl>');
            }
            return htmlAntwort('', false);
        });
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'http://maler-bauer.de/' }), res);
        expect(aufgerufen[1]).toBe('https://www.maler-bauer.de/rechtliches/impressum/');
        expect(res.body).toMatchObject({ owner: 'Klaus Bauer', ownerRole: 'Inhaber', impressumGeladen: true });
        expect(aufgerufen.some(u => u.includes('andere-firma'))).toBe(false);
    });

    test('Single-Page-Seite beantwortet /impressum mit der Startseite → impressumGeladen false', async () => {
        const start = '<html><body><h1>Salon</h1><p>Termine</p></body></html>';
        global.fetch = jest.fn(async () => htmlAntwort(start));
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'https://spa-salon.de/' }), res);
        expect(res.body.impressumGeladen).toBe(false);
    });

    test('Impressum schlägt Fließtext der Startseite', async () => {
        global.fetch = jest.fn(async (u) => {
            if (String(u) === 'https://solar-wagner.de/') return htmlAntwort('<p>Als Betreiber Großer Anlagen profitieren Sie.</p><a href="/impressum.html">Impressum</a>');
            if (String(u) === 'https://solar-wagner.de/impressum.html') return htmlAntwort('<p>Inhaber: Peter Wagner</p>');
            return htmlAntwort('', false);
        });
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'https://solar-wagner.de/' }), res);
        expect(res.body.owner).toBe('Peter Wagner');
    });

    test('Gegenprobe: ohne Impressum bleibt die Fußzeile der Startseite als Quelle', async () => {
        global.fetch = jest.fn(async (u) => {
            if (String(u) === 'https://mueller-meister.de/') return htmlAntwort('<footer>© 2026 · Inhaber Stefan Müller</footer>');
            return htmlAntwort('', false);
        });
        const res = fakeRes();
        await _test.enrichContactHandler(fakeReq({ url: 'https://mueller-meister.de/' }), res);
        expect(res.body).toMatchObject({ owner: 'Stefan Müller', impressumGeladen: false });
    });
});

// ─────────────────────────────────────────────────────────────────────────────
describe('searchPlaces (Handler) — V7', () => {
    const originalFetch = global.fetch;
    afterEach(() => { global.fetch = originalFetch; });

    function placesFetch(seiten) {
        const aufrufe = [];
        const fn = jest.fn(async (u, opt) => {
            const body = JSON.parse(opt.body);
            aufrufe.push({ body, maske: opt.headers['X-Goog-FieldMask'] });
            const idx = body.pageToken ? Number(body.pageToken.replace('tok', '')) : 0;
            const seite = seiten[idx];
            return { ok: seite.ok !== false, status: seite.ok === false ? 400 : 200, json: async () => seite.data };
        });
        return { fn, aufrufe };
    }

    test('ohne neue Parameter: exakt die bisherige Anfrage, nur pagesFetched zusätzlich', async () => {
        const { fn, aufrufe } = placesFetch([{ data: { places: [{ id: 'a' }], nextPageToken: 'tok1' } }]);
        global.fetch = fn;
        const res = fakeRes();
        await _test.searchPlacesHandler(fakeReq({ query: 'Friseur Stuttgart', maxResults: 20 }), res);

        expect(aufrufe).toHaveLength(1);
        expect(aufrufe[0].body).toEqual({ textQuery: 'Friseur Stuttgart', languageCode: 'de', maxResultCount: 20 });
        expect(aufrufe[0].maske).not.toMatch(/openingDate|nextPageToken/);
        expect(res.body).toEqual({ places: [{ id: 'a' }], nextPageToken: 'tok1', pagesFetched: 1 });
    });

    test('maxPages 3: blättert mit identischen Parametern und hängt die Seiten an', async () => {
        const { fn, aufrufe } = placesFetch([
            { data: { places: [{ id: 'a' }], nextPageToken: 'tok1' } },
            { data: { places: [{ id: 'b' }], nextPageToken: 'tok2' } },
            { data: { places: [{ id: 'c' }], nextPageToken: 'tok3' } }
        ]);
        global.fetch = fn;
        const res = fakeRes();
        await _test.searchPlacesHandler(fakeReq({ query: 'Maler Ulm', maxPages: 3 }), res);

        expect(aufrufe).toHaveLength(3);
        expect(aufrufe[1].body).toEqual({ textQuery: 'Maler Ulm', languageCode: 'de', maxResultCount: 10, pageToken: 'tok1' });
        expect(aufrufe[0].maske).toMatch(/,nextPageToken$/);
        expect(res.body.places.map(p => p.id)).toEqual(['a', 'b', 'c']);
        expect(res.body.pagesFetched).toBe(3);
        expect(res.body).not.toHaveProperty('nextPageToken');
    });

    test('maxPages 3 aber nur eine Folgeseite vorhanden → pagesFetched 2', async () => {
        const { fn } = placesFetch([
            { data: { places: [{ id: 'a' }], nextPageToken: 'tok1' } },
            { data: { places: [{ id: 'b' }] } }
        ]);
        global.fetch = fn;
        const res = fakeRes();
        await _test.searchPlacesHandler(fakeReq({ query: 'Maler Ulm', maxPages: 3 }), res);
        expect(res.body.pagesFetched).toBe(2);
        expect(res.body.places).toHaveLength(2);
    });

    test('Folgeseite scheitert → Teilergebnis mit pageError, kein stiller Verlust', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        const { fn } = placesFetch([
            { data: { places: [{ id: 'a' }], nextPageToken: 'tok1' } },
            { ok: false, data: { error: { status: 'INVALID_ARGUMENT' } } }
        ]);
        global.fetch = fn;
        const res = fakeRes();
        await _test.searchPlacesHandler(fakeReq({ query: 'Maler Ulm', maxPages: 2 }), res);
        expect(res.body).toMatchObject({ pagesFetched: 1, pageError: 'INVALID_ARGUMENT' });
        expect(warn).toHaveBeenCalled();
        warn.mockRestore();
    });

    test('includeFutureOpening: Parameter + Feldmaske nur auf Anforderung', async () => {
        const { fn, aufrufe } = placesFetch([{ data: { places: [{ id: 'neu', openingDate: { year: 2026, month: 10, day: 1 } }] } }]);
        global.fetch = fn;
        const res = fakeRes();
        await _test.searchPlacesHandler(fakeReq({ query: 'Café Freiburg', includeFutureOpening: true }), res);
        expect(aufrufe[0].body.includeFutureOpeningBusinesses).toBe(true);
        expect(aufrufe[0].maske).toMatch(/places\.openingDate/);
        expect(res.body.places[0].openingDate).toEqual({ year: 2026, month: 10, day: 1 });

        // Gegenprobe: ein String "true" ist keine Anforderung.
        const zweiter = placesFetch([{ data: {} }]);
        global.fetch = zweiter.fn;
        await _test.searchPlacesHandler(fakeReq({ query: 'Café Freiburg', includeFutureOpening: 'true' }), fakeRes());
        expect(zweiter.aufrufe[0].body).not.toHaveProperty('includeFutureOpeningBusinesses');
    });

    test('Folgeseite wirft (Netz/JSON) → Teilergebnis statt 500, erste Seite bleibt', async () => {
        const warn = jest.spyOn(console, 'warn').mockImplementation(() => {});
        let n = 0;
        global.fetch = jest.fn(async () => {
            n++;
            if (n === 1) return { ok: true, status: 200, json: async () => ({ places: [{ id: 'a' }], nextPageToken: 'tok1' }) };
            throw new Error('socket hang up');
        });
        const res = fakeRes();
        await _test.searchPlacesHandler(fakeReq({ query: 'Maler Ulm', maxPages: 3 }), res);
        expect(res.statusCode).toBe(200);
        expect(res.body).toMatchObject({ places: [{ id: 'a' }], pagesFetched: 1, pageError: 'socket hang up' });
        warn.mockRestore();
    });

    test.each([[undefined, 1], [0, 1], [1, 1], [2, 2], [3, 3], [9, 3], ['2', 2], ['abc', 1], [-4, 1]])(
        'searchPlacesSeitenzahl(%p) = %p', (ein, aus) => {
            expect(_test.searchPlacesSeitenzahl(ein)).toBe(aus);
        }
    );
});

// ─────────────────────────────────────────────────────────────────────────────
describe('Sonnet-Modell', () => {
    test('kein abgeschaltetes Modell mehr im Quelltext, alle vier Aufrufe nutzen die Konstante', () => {
        const quelle = fs.readFileSync(path.join(__dirname, '..', 'index.js'), 'utf8');
        // Nur Code-Zeilen pruefen: der Begruendungskommentar nennt den alten Namen.
        const code = quelle.split('\n').filter(z => !z.trim().startsWith('//')).join('\n');
        expect(code).not.toMatch(/claude-sonnet-4-20250514/);
        expect(_test.SONNET_MODEL).toBe('claude-sonnet-4-6');
        expect((code.match(/model:\s*SONNET_MODEL/g) || []).length).toBe(4);
        // Kein Assistant-Prefill in den Sonnet-Aufrufen (4.6 → HTTP 400).
        expect(code).not.toMatch(/role:\s*['"]assistant['"]/);
    });
});
