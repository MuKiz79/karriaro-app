/**
 * Inhaber- und Werbewiderspruchs-Erkennung aus Impressum-Text.
 *
 * Rein (kein Netz, kein Firebase) — enrichContact reicht den bereits von Tags
 * befreiten Text herein, die Tests fahren dieselben Funktionen direkt.
 *
 * 2026-09-10: ausgelagert aus enrichContact. Die alte Erkennung nahm die zwei
 * Grosswoerter hinter „Angaben gemäß …:" als Namen — auf einem typischen
 * Impressum ist das der FIRMENNAME („Malerbetrieb Schneider GmbH" wurde zu
 * „Malerbetrieb Schneider"), und eine Anrede „Sehr geehrter Herr Malerbetrieb"
 * ist schlimmer als gar keine. Sie scheiterte ausserdem an Doppelnamen,
 * Titeln, dreiteiligen Namen und jedem Buchstaben ausserhalb von A–Z/ÄÖÜ
 * (ı ş ğ ç). Grundsatz jetzt: ein Name nur, wenn er an einer ROLLE haengt
 * und sicher eine Person ist — im Zweifel kein Name.
 *
 * Werbewiderspruch: ein im Impressum erklaerter Widerspruch gegen Werbung ist
 * ein erkennbarer Widerspruch nach § 7 Abs. 1 S. 2 UWG. Die Erkennung ist
 * bewusst ASYMMETRISCH gebaut: die Belehrung ueber Betroffenenrechte aus einer
 * Datenschutzerklaerung (Art. 21 DSGVO, „Sie haben das Recht …") darf NICHT
 * ausloesen, jede Formel, mit der der Betrieb selbst widerspricht, schon.
 */
'use strict';

// Benannte Entities, die in deutschen Impressen tatsaechlich vorkommen.
// Unbekannte bleiben WOERTLICH stehen (nie still loeschen).
const ENTITIES = {
    amp: '&', nbsp: ' ', quot: '"', apos: "'", lt: '<', gt: '>', sect: '§',
    auml: 'ä', ouml: 'ö', uuml: 'ü', Auml: 'Ä', Ouml: 'Ö', Uuml: 'Ü', szlig: 'ß',
    eacute: 'é', egrave: 'è', aacute: 'á', agrave: 'à', ccedil: 'ç', Ccedil: 'Ç',
    ndash: '–', mdash: '—', shy: '', middot: '·', hellip: '…', copy: '©', reg: '®',
    laquo: '«', raquo: '»', bdquo: '„', ldquo: '“', rdquo: '”', lsquo: '‘', rsquo: '’'
};

function entitiesAufloesen(text) {
    return String(text || '').replace(/&(#[xX][0-9a-fA-F]+|#\d+|[a-zA-Z][a-zA-Z0-9]*);/g, (voll, k) => {
        if (k[0] === '#') {
            const code = (k[1] === 'x' || k[1] === 'X') ? parseInt(k.slice(2), 16) : parseInt(k.slice(1), 10);
            if (!Number.isFinite(code) || code <= 0 || code > 0x10ffff) return voll;
            try { return String.fromCodePoint(code); } catch { return voll; }
        }
        return Object.prototype.hasOwnProperty.call(ENTITIES, k) ? ENTITIES[k] : voll;
    });
}

function normalisiere(text) {
    return entitiesAufloesen(text)
        .replace(/[\u00ad\u200b-\u200d]/g, '')
        .replace(/\s+/g, ' ')
        .trim();
}

// ── Rollen ──────────────────────────────────────────────────────────────────
// Gross geschrieben und mit Unicode-Grenzen (\b greift vor Umlauten nicht).
// „Mitinhaber", „Seitenbetreiber", „Verantwortlichkeit" treffen dadurch nicht.
const ROLLEN_RE = /(?<![\p{L}\d])(Inhaberin|Inhaber|Geschäftsführerin|Geschäftsführer|Geschäftsführung|Geschaeftsfuehrerin|Geschaeftsfuehrer|Betreiberin|Betreiber|[Vv]ertreten\s+durch|Vertretungsberechtigte[rn]?|Vertretungsberechtigt|Inhaltlich\s+Verantwortliche[r]?|Verantwortliche[r]?|Verantwortlich)(\*in|\/-?in|\(in\))?(?![\p{L}])/gu;

function rolleAus(wort, genderSuffix) {
    const w = wort.replace(/\s+/g, ' ');
    const neutral = Boolean(genderSuffix);
    if (/^Inhaberin$/.test(w)) return { rolle: 'Inhaberin', weiblich: true };
    if (/^Inhaber$/.test(w)) return { rolle: 'Inhaber', weiblich: false, neutral };
    if (/^Gesch(?:ä|ae)ftsf(?:ü|ue)hrerin$/.test(w)) return { rolle: 'Geschäftsführerin', weiblich: true };
    if (/^Gesch(?:ä|ae)ftsf(?:ü|ue)hrer$/.test(w)) return { rolle: 'Geschäftsführer', weiblich: false, neutral };
    if (/^Geschäftsführung$/.test(w)) return { rolle: 'Geschäftsführung', weiblich: false };
    if (/^Betreiberin$/.test(w)) return { rolle: 'Betreiberin', weiblich: true };
    if (/^Betreiber$/.test(w)) return { rolle: 'Betreiber', weiblich: false, neutral };
    if (/^[Vv]ertret/.test(w)) return { rolle: 'Vertreten durch', weiblich: false };
    return { rolle: 'Verantwortlich', weiblich: false };
}

// ── Namensbausteine ─────────────────────────────────────────────────────────
const ANREDE_RE = /^(Herrn?|Frau)\s+/u;
const TITEL_RE = /^(Prof\.(?:\s?Dr\.)?|Dr\.(?:-Ing\.)?(?:\s?(?:med\.(?:\s?(?:dent|vet|univ)\.)?|rer\.\s?(?:nat|pol|oec)\.|phil\.|jur\.|iur\.|h\.\s?c\.))?|Dipl\.-\p{L}+\.?|Mag\.)\s*/u;
// Ein Namensteil: Grossbuchstabe + mindestens ein Kleinbuchstabe, optional ein
// zweiter Binnen-Grossteil (McDonald, DeLuca); Bindestrich-Doppelnamen.
const TEIL = '\\p{Lu}\\p{Ll}+(?:\\p{Lu}\\p{Ll}+)?';
const TOKEN_RE = new RegExp(`^(${TEIL}(?:-${TEIL})*)(?=$|[\\s,;.:()|/])`, 'u');
const PARTIKEL_RE = /^(von|van|de|der|den|zu|zur|vom|di|da|del|dos|du|la|le|ten|ter)\s+/u;
const RECHTSFORM_NACH_NAME_RE = /^(?:[,]?\s*)(?:&\s*Co\.?\s*(?:KG)?|und\s+Co\.?|GmbH|gGmbH|mbH|UG|KG|OHG|oHG|GbR|AG|SE|PartG(?:mbB)?|Ltd\.?|Inc\.?|e\.\s?K\.|e\.\s?Kfm\.|e\.\s?Kfr\.|e\.\s?V\.)(?![\p{L}])/u;

// Woerter, die nie Teil eines Personennamens sind (kleingeschrieben verglichen):
// Rechtsformen, Branchen-/Geschaeftswoerter, Impressum-Beschriftungen,
// grossgeschriebene Funktionswoerter am Satzanfang.
const STOPPWOERTER = new Set([
    // Rechtsformen
    'gmbh', 'ggmbh', 'mbh', 'ug', 'kg', 'ohg', 'gbr', 'ag', 'se', 'partg', 'ltd', 'inc', 'co',
    // Branchen / Betrieb
    'praxis', 'kanzlei', 'salon', 'studio', 'restaurant', 'friseur', 'friseurin', 'frisör',
    'zahnarzt', 'zahnärztin', 'zahnärzte', 'arzt', 'ärztin', 'ärzte', 'tierarzt', 'tierärztin',
    'rechtsanwalt', 'rechtsanwältin', 'rechtsanwälte', 'steuerberater', 'steuerberaterin',
    'notar', 'notarin', 'dachdecker', 'elektriker', 'installateur', 'fliesenleger',
    'physiotherapie', 'ergotherapie', 'kosmetik', 'fotografie', 'design', 'media', 'marketing',
    'immobilien', 'hausverwaltung', 'pflegedienst', 'team', 'firma', 'unternehmen', 'betrieb',
    'geschäft', 'laden', 'handwerk', 'meisterbetrieb', 'fachbetrieb', 'familienbetrieb',
    'café', 'cafe', 'bistro', 'bar', 'hotel', 'pension', 'gasthof', 'gasthaus', 'pizzeria',
    'bäckerei', 'metzgerei', 'konditorei', 'apotheke', 'spedition', 'logistik', 'shop',
    // Impressum-Beschriftungen
    'telefon', 'tel', 'fax', 'telefax', 'mobil', 'handy', 'mail', 'email', 'e-mail', 'internet',
    'web', 'website', 'webseite', 'homepage', 'kontakt', 'anschrift', 'adresse', 'sitz', 'postfach',
    'registergericht', 'amtsgericht', 'handelsregister', 'registernummer', 'register', 'hrb', 'hra',
    'umsatzsteuer', 'ust', 'steuernummer', 'aufsichtsbehörde', 'berufsbezeichnung', 'kammer',
    'berufskammer', 'berufsrecht', 'impressum', 'datenschutz', 'datenschutzerklärung', 'haftung',
    'haftungsausschluss', 'urheberrecht', 'copyright', 'hinweis', 'hinweise', 'angaben', 'stelle',
    'inhaber', 'inhaberin', 'geschäftsführer', 'geschäftsführerin', 'geschäftsführung',
    'vertreten', 'vertretungsberechtigt', 'verantwortlich', 'betreiber', 'betreiberin',
    'gesellschafter', 'gesellschafterin', 'vorstand', 'vorsitzender', 'vorsitzende',
    'deutschland', 'germany', 'österreich', 'schweiz', 'öffnungszeiten', 'termin', 'termine',
    'anfahrt', 'startseite', 'home', 'menü', 'navigation', 'leistungen', 'jobs', 'karriere',
    'über', 'uns', 'streitschlichtung', 'verbraucherstreitbeilegung', 'plattform',
    // Fusszeilen-Vokabular („Inhaber Stefan Müller Made by …" — gemessen an
    // einer echten Fusszeile, die sonst „Stefan Müller Made" ergab)
    'made', 'powered', 'built', 'designed', 'created', 'crafted', 'hosted', 'demo',
    'webdesign', 'manufaktur', 'follow', 'folgen', 'seit', 'jahre',
    // Funktionswoerter, Pronomen
    'am', 'an', 'im', 'in', 'auf', 'bei', 'zum', 'zur', 'der', 'die', 'das', 'den', 'dem', 'des',
    'und', 'oder', 'sowie', 'mit', 'für', 'von', 'vom', 'nach', 'gemäß', 'wir', 'sie', 'ich', 'er',
    'es', 'ihr', 'ihre', 'unser', 'unsere', 'bitte', 'hier', 'alle', 'rechte', 'dieser', 'diese',
    // Pruefer 2026-09-10: gebeugte Formen am Satzanfang bzw. nach einer Rolle im
    // Fliesstext der Startseite („Als Betreiber Ihrer Photovoltaikanlage …" ergab
    // den Namen „Ihrer Photovoltaikanlage Solar").
    'ihrer', 'ihren', 'ihrem', 'ihres', 'unserer', 'unseren', 'unserem', 'unseres', 'ein', 'eine',
    'eines', 'einer', 'einem', 'einen', 'sein', 'seine', 'seiner', 'seinen', 'dieses', 'diesem',
    'zuständig', 'zuständige', 'zuständiger', 'tätigkeit', 'tätigkeitsbereich',
    // Geschaeftswoerter, die nie Nachname sind („Inhaber: Müller Reisen")
    'reisen', 'touristik', 'transporte', 'transport', 'umzüge', 'bestattungen', 'bestattung',
    'automobile', 'elektro'
]);

// Nur als ERSTES Namenswort ein Betriebswort: „Autohaus Schmidt", „Weinstube
// Krone", „Blumen Schulz". An zweiter Stelle sind dieselben Endungen echte
// Nachnamen (Neuhaus, Althof, Wein) und bleiben erlaubt.
const ERSTWORT_ENDUNGEN = ['haus', 'hof', 'werk', 'markt', 'laden', 'stube', 'garten', 'handlung'];
const ERSTWORT_STOPP = new Set([
    'blumen', 'mode', 'moden', 'optik', 'auto', 'autos', 'reifen', 'fliesen', 'getränke', 'möbel',
    'sport', 'bio', 'natur', 'wein', 'weine', 'bücher', 'foto', 'kfz', 'taxi', 'pflege', 'stadt',
    'hotel', 'haus', 'hof', 'gasthof'
]);

function istErstwortStopp(wort) {
    const w = wort.toLowerCase();
    if (ERSTWORT_STOPP.has(w)) return true;
    return ERSTWORT_ENDUNGEN.some(e => w.length > e.length && w.endsWith(e));
}

// Endungen zusammengesetzter Geschaefts-/Branchenwoerter („Malerbetrieb",
// „Zahnarztpraxis", „Friseurmeister"). Greifen nur, wenn das Wort LAENGER ist
// als die Endung — der Nachname „Meister" bleibt damit erlaubt.
const BRANCHEN_ENDUNGEN = [
    'betrieb', 'praxis', 'kanzlei', 'salon', 'studio', 'werkstatt', 'service', 'technik', 'zentrum',
    'center', 'gruppe', 'agentur', 'immobilien', 'apotheke', 'bäckerei', 'metzgerei', 'konditorei',
    'gärtnerei', 'schreinerei', 'tischlerei', 'druckerei', 'reinigung', 'handel', 'vertrieb',
    'consulting', 'holding', 'verlag', 'restaurant', 'pizzeria', 'friseur', 'zahnarzt', 'versicherung',
    'versicherungen', 'beratung', 'gesellschaft', 'stiftung', 'verein', 'verband', 'genossenschaft',
    'akademie', 'schule', 'klinik', 'institut', 'meister', 'meisterin', 'dienst', 'dienste', 'logistik',
    'bau', 'elektrik', 'sanitär', 'heizung', 'bedachung', 'therapie', 'kosmetik',
    // Pruefer 2026-09-10: „Stadtwerke Ulm", „Klaus Bauer Dachdeckerei"
    'werke', 'erei'
];

// Berufsbezeichnung einer PERSON zwischen Rolle und Name („Inhaber &
// Dachdeckermeister Thomas Berger", „Inhaberin Friseurmeisterin Laura Müller").
// Bewusst nur Personen-Berufe — Betriebswoerter (Salon, Praxis, Betrieb)
// werden nie uebersprungen, dahinter steht meist ein Firmenname.
const BERUF_VOR_NAME_RE = /^\s*(?:(?:&|und|sowie|\/)\s+)?(?:\p{Lu}\p{Ll}*meister(?:in)?|Rechtsanw(?:alt|ältin)|(?:Zahn|Tier|Fach)?(?:[Aa]rzt|[Ää]rztin)|Steuerberater(?:in)?|Notar(?:in)?|Architekt(?:in)?|Heilpraktiker(?:in)?|Physiotherapeut(?:in)?|Ingenieur(?:in)?)(?![\p{L}])[\s:,]*/u;

// Gesetzes-/Fundstellenzeichen, die zwischen Rolle und Name stehen koennen.
const GESETZ_RE = /(?:§§?\s?\d+[a-z]?|Abs\.\s?\d+|S\.\s?\d+|Nr\.\s?\d+|MStV|RStV|TMG|DDG|DSGVO|UWG)(?![\p{L}\d])/gu;

const STRASSEN_ENDUNGEN = /(?:straße|strasse|allee|gasse|platz|chaussee|promenade|ufer)$/u;
const STRASSEN_ENDUNGEN_MIT_NUMMER = /(?:weg|ring|damm|steig|pfad|stieg|berg|feld|hof|markt|str)$/u;

function istStoppwort(wort) {
    const w = wort.toLowerCase();
    if (STOPPWOERTER.has(w)) return true;
    for (const endung of BRANCHEN_ENDUNGEN) {
        if (w.length > endung.length && w.endsWith(endung)) return true;
    }
    return false;
}

function istStrasse(wort, danach) {
    const w = wort.toLowerCase();
    if (STRASSEN_ENDUNGEN.test(w) && w.length > 5) return true;
    if (/^str$/u.test(w.slice(-3)) && /^\./.test(danach)) return true;      // „Musterstr."
    if (STRASSEN_ENDUNGEN_MIT_NUMMER.test(w) && /^\.?\s*\d/.test(danach)) return true; // „Hauptweg 3"
    return false;
}

/**
 * Liest ab dem Anfang von `rest` einen Personennamen.
 * @returns {{name:string, anrede:string|null, titel:string|null}|null}
 */
function nameAb(rest) {
    // „|" ist die Blockgrenze aus textMitBloecken (<dt>Inhaber</dt><dd>Name</dd>).
    let s = String(rest || '').replace(/^[\s:|–—-]+/u, '');
    let anrede = null;
    const titel = [];
    let m = s.match(ANREDE_RE);
    if (m) { anrede = m[1].startsWith('Herr') ? 'Herr' : 'Frau'; s = s.slice(m[0].length); }
    while ((m = s.match(TITEL_RE)) && m[0]) { titel.push(m[1].trim()); s = s.slice(m[0].length); }
    if (!anrede && (m = s.match(ANREDE_RE))) { anrede = m[1].startsWith('Herr') ? 'Herr' : 'Frau'; s = s.slice(m[0].length); }

    const teile = [];
    let namen = 0;
    while (namen <= 3) {
        if (namen > 0) {
            const p = s.match(PARTIKEL_RE);
            if (p) {
                const nach = s.slice(p[0].length);
                const t = nach.match(TOKEN_RE);
                if (!t || istStoppwort(t[1])) break;
                teile.push(p[1]);
                s = nach;
                continue;
            }
        }
        const t = s.match(TOKEN_RE);
        if (!t) break;
        const wort = t[1];
        const danach = s.slice(t[0].length);
        if (istStoppwort(wort) || istStrasse(wort, danach)) break;
        if (namen === 0 && istErstwortStopp(wort)) break;
        teile.push(wort);
        namen++;
        s = danach;
        const trenn = s.match(/^ +/);
        if (!trenn) break;              // Satzzeichen beendet den Namen
        s = s.slice(trenn[0].length);
    }

    // Ein Name braucht Vor- und Nachname; mehr als drei Teile ist unsicher
    // (zwei Personen hintereinander, Name + Ort …) → lieber keiner.
    if (namen < 2 || namen > 3) return null;
    // Endet die Folge auf einem Partikel, gehoert er nicht dazu.
    while (teile.length && PARTIKEL_RE.test(teile[teile.length - 1] + ' ')) teile.pop();
    // Direkt folgende Rechtsform → Firmenname („Müller Schneider GmbH").
    if (RECHTSFORM_NACH_NAME_RE.test(s)) return null;
    // Platzhalter aus Impressum-Vorlagen.
    if (teile.some(x => /^Muster/u.test(x))) return null;

    return { name: teile.join(' '), anrede, titel: titel.length ? titel.join(' ') : null };
}

/**
 * Erkennt den an eine Rolle gebundenen Inhabernamen.
 * @param {string} text  Impressum-/Seitentext (Tags bereits entfernt; Entities erlaubt)
 * @returns {{name:string|null, rolle:string|null, anrede:'Herr'|'Frau'|null, titel:string|null}}
 */
function erkenneInhaber(text) {
    const leer = { name: null, rolle: null, anrede: null, titel: null };
    const t = normalisiere(text);
    if (!t) return leer;

    for (const m of t.matchAll(ROLLEN_RE)) {
        const info = rolleAus(m[1], m[2]);
        const start = m.index + m[0].length;
        const rest = t.slice(start, start + 220);

        let treffer = nameAb(rest);
        if (!treffer) {
            // Zwischenstueck zwischen Rolle und Name ueberspringen:
            // „Verantwortlich nach § 18 Abs. 2 MStV: Max Müller",
            // „Verantwortlich für den Inhalt nach § 18 Abs. 2 MStV Max Müller" (ohne
            // Doppelpunkt — so steht es im Impressum von karriaro-webdesign.de),
            // „Betreiber dieser Website: …", „Inhaber und Geschäftsführer: …".
            // Kandidaten: der erste Doppelpunkt und jedes Gesetzeszeichen in den
            // ersten 90 Zeichen, von vorn nach hinten; nie ueber ein Satzende hinweg.
            const starts = [];
            const doppel = rest.indexOf(':');
            if (doppel > 0 && doppel <= 70) starts.push(doppel + 1);
            for (const g of rest.slice(0, 90).matchAll(GESETZ_RE)) starts.push(g.index + g[0].length);
            const beruf = rest.match(BERUF_VOR_NAME_RE);
            if (beruf) starts.push(beruf[0].length);
            starts.sort((a, b) => a - b);
            for (const s of starts) {
                if (/\.\s+\p{Lu}\p{Ll}/u.test(rest.slice(0, s))) break;
                treffer = nameAb(rest.slice(s));
                if (treffer) break;
            }
        }
        if (!treffer) continue;

        const anrede = treffer.anrede || (info.weiblich ? 'Frau' : null);
        return { name: treffer.name, rolle: info.rolle, anrede, titel: treffer.titel };
    }
    return leer;
}

// ── HTML → Text mit Blockgrenzen ────────────────────────────────────────────
// Pruefer 2026-09-10: Wer alle Tags durch Leerzeichen ersetzt, verliert die
// Zeilenumbrueche — aus „Inhaber: Klaus Bauer<br>Stuttgart" wurde der Name
// „Klaus Bauer Stuttgart", aus <dt>Inhaber</dt><dd>…</dd> gar keiner. Block-
// Elemente und <br> werden deshalb zu „ | ", das einen Namen beendet.
const BLOCK_TAG_RE = /<br\s*\/?>|<\/?(?:p|div|li|ul|ol|dl|dt|dd|h[1-6]|tr|td|th|table|tbody|thead|address|section|article|header|footer|nav|main|aside|blockquote|figure|figcaption|form|label|button)(?=[\s/>])[^>]*>/giu;

/**
 * @param {string} html
 * @returns {string} sichtbarer Text, Blockgrenzen als „ | " (Entities bleiben, erkenneInhaber loest sie auf)
 */
function textMitBloecken(html) {
    return String(html || '')
        .replace(/<(script|style|noscript|template)\b[^>]*>[\s\S]*?<\/\1\s*>/giu, ' ')
        .replace(/<!--[\s\S]*?-->/gu, ' ')
        .replace(BLOCK_TAG_RE, ' | ')
        .replace(/<[^>]+>/gu, ' ')
        .replace(/\s+/gu, ' ')
        .trim();
}

// ── Werbewiderspruch ────────────────────────────────────────────────────────
// Pruefer 2026-09-10: ein blosses /werb/ traf auch Gewerbe, Bewerbung,
// Wettbewerb und Erwerb — jede Impressums-Zeile „Gewerbeaufsicht" machte die
// Werbungs-Naehe eines beliebigen „wird hiermit widersprochen" wahr.
const WERBUNG_RE = /(?<!ge|be|er)werb/iu;

// Formeln, mit denen der BETRIEB selbst widerspricht. Jede traegt ein
// Subjekt/Adverb der Erklaerung (wir/ich/hiermit/wird … widersprochen) oder
// eine eindeutige Ueberschrift — die Belehrung „Sie haben das Recht,
// Widerspruch einzulegen" erfuellt keine davon.
const WIDERSPRUCH_FORMELN = [
    // „… zur Übersendung von nicht ausdrücklich angeforderter Werbung … wird hiermit widersprochen."
    { re: /wird\s+(?:hiermit\s+)?(?:ausdrücklich\s+)?widersprochen/giu, werbungNah: true },
    // „Wir widersprechen hiermit …", „widersprechen wir hiermit ausdrücklich …"
    // Pruefer 2026-09-10: auch Satzende-Stellung („… von Werbung widersprechen wir.")
    // und die erste Person Singular („… widerspreche ich.").
    { re: /(?<![\p{L}])(?:wir|ich)\s+widersprechen?(?![\p{L}])|widersprechen?\s+(?:wir|ich)(?![\p{L}])|hiermit\s+(?:ausdrücklich\s+)?widersprechen/giu, werbungNah: true },
    // Ueberschriften: „Widerspruch gegen Werbe-E-Mails", „Werbewiderspruch"
    { re: /Widerspruch\s+(?:gegen\s+)?Werbe[-\s]?(?:E-?Mails?|mails?|anrufe|sendungen|post)/giu, werbungNah: false },
    { re: /Werbewiderspruch/giu, werbungNah: false },
    // „… behalten sich ausdrücklich rechtliche Schritte im Falle der unverlangten Zusendung von Werbeinformationen … vor."
    { re: /rechtliche\s+Schritte\s+im\s+Falle\s+(?:der|einer)\s+(?:unverlangten|unaufgeforderten)\s+Zusendung\s+von\s+Werbe/giu, werbungNah: false },
    // „Die Nutzung … für Werbezwecke ist untersagt / nicht gestattet / nicht erwünscht."
    { re: /(?:Werbung|Werbezwecke|Werbe-?E-?Mails|Werbeanrufe|werbliche\s+Zwecke)[^.!?]{0,80}?(?:ist|sind|wird|werden)\s+(?:hiermit\s+)?(?:ausdrücklich\s+)?(?:untersagt|unerwünscht|nicht\s+(?:erwünscht|gestattet|gewünscht|erlaubt))/giu, werbungNah: false },
    // „Wir wünschen keine Werbung", „Keine Werbung erwünscht", „Wir wünschen keine Werbeanrufe"
    { re: /(?:wünschen|wollen)\s+(?:wir\s+)?keine\s+(?:\p{L}+\s+)?(?:Werbung|Werbe-?E-?Mails?|Werbeanrufe|Werbepost|Werbesendungen)|keine\s+(?:(?:unaufgeforderte|unverlangte)\s+)?(?:Werbung|Werbe-?E-?Mails?|Werbeanrufe)\s+(?:erwünscht|gewünscht)/giu, werbungNah: false }
];

/**
 * @param {string} text  Impressum-/Seitentext (Tags entfernt)
 * @returns {boolean} true, sobald eine Widerspruchsformel gefunden wurde
 */
function erkenneWerbewiderspruch(text) {
    const t = normalisiere(text);
    if (!t || !WERBUNG_RE.test(t)) return false;
    for (const { re, werbungNah } of WIDERSPRUCH_FORMELN) {
        re.lastIndex = 0;
        for (const m of t.matchAll(re)) {
            if (!werbungNah) return true;
            const von = Math.max(0, m.index - 320);
            const bis = Math.min(t.length, m.index + m[0].length + 200);
            if (WERBUNG_RE.test(t.slice(von, bis))) return true;
        }
    }
    return false;
}

module.exports = {
    erkenneInhaber,
    erkenneWerbewiderspruch,
    textMitBloecken,
    entitiesAufloesen,
    normalisiere
};
