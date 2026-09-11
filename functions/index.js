const {onRequest, onCall} = require('firebase-functions/v2/https');
const {onSchedule} = require('firebase-functions/v2/scheduler');
const {onDocumentCreated} = require('firebase-functions/v2/firestore');
const {setGlobalOptions} = require('firebase-functions/v2');
const admin = require('firebase-admin');
const {defineSecret} = require('firebase-functions/params');
const nodemailer = require('nodemailer');
const PDFDocument = require('pdfkit');
const docx = require('docx');

// Pdfme for template-based PDF generation
const { generate } = require('@pdfme/generator');
const { BLANK_PDF } = require('@pdfme/common');
const { text, image, line, rectangle } = require('@pdfme/schemas');

// Define secrets
const stripeSecretKey = defineSecret('STRIPE_SECRET_KEY');
const stripeWebhookSecret = defineSecret('STRIPE_WEBHOOK_SECRET');
const smtpHost = defineSecret('SMTP_HOST');
const smtpUser = defineSecret('SMTP_USER');
const smtpPass = defineSecret('SMTP_PASS');
const dailyApiKey = defineSecret('DAILY_API_KEY');
const claudeApiKey = defineSecret('CLAUDE_API_KEY');

// 2026-09-10: claude-sonnet-4-20250514 ist abgeschaltet (Anthropic 404) — jede
// Sonnet-Function dieser Codebase lief damit ins Leere (generateCvContent gab
// 500, die Lead-Functions still ein leeres Objekt). Gleiche Stufe wie vorher,
// in der webdesign-Codebase seit Sprint 253 live. Die Aufrufe hier senden nur
// model/max_tokens/messages (kein Assistant-Prefill, kein budget_tokens) —
// beides wuerde auf 4.6 mit 400 abgelehnt.
const SONNET_MODEL = 'claude-sonnet-4-6';

// Reine Impressum-Auswertung (Inhaber, Werbewiderspruch) fuer enrichContact.
const { erkenneInhaber, erkenneWerbewiderspruch, textMitBloecken } = require('./lib/impressum-inhaber');

// Set global options (Standard für alle Functions)
setGlobalOptions({
  region: 'us-central1',
  maxInstances: 10,
  memory: '256MiB',
  cpu: 1
});

admin.initializeApp();

// CORS Headers - Nur erlaubte Domains
const ALLOWED_ORIGINS = [
    'https://karriaro.de',
    'https://www.karriaro.de',
    'https://karriaro-webdesign.de',
    'https://www.karriaro-webdesign.de',
    'https://mukiz79.github.io',  // GitHub Pages für Webdesign
    'https://apex-executive.web.app',
    'https://apex-executive.firebaseapp.com',
    'http://localhost:5000',  // Für lokale Entwicklung
    'http://localhost:3000'
];

function getCorsHeaders(req) {
    const origin = req.headers.origin || '';
    const allowedOrigin = ALLOWED_ORIGINS.includes(origin) ? origin : ALLOWED_ORIGINS[0];
    return {
        'Access-Control-Allow-Origin': allowedOrigin,
        'Access-Control-Allow-Methods': 'POST, OPTIONS',
        'Access-Control-Allow-Headers': 'Content-Type, Authorization',
        'Access-Control-Allow-Credentials': 'true'
    };
}

// Legacy corsHeaders für Abwärtskompatibilität (wird schrittweise ersetzt)
const corsHeaders = {
    'Access-Control-Allow-Origin': 'https://karriaro.de',
    'Access-Control-Allow-Methods': 'POST, OPTIONS',
    'Access-Control-Allow-Headers': 'Content-Type, Authorization'
};

// ========== RATE LIMITING (Firestore-basiert) ==========
async function checkRateLimit(identifier, action, maxRequests, windowMs) {
    const db = admin.firestore();
    const docRef = db.collection('rateLimits').doc(`${action}_${identifier.replace(/[\/\.]/g, '_')}`);

    try {
        const result = await db.runTransaction(async (transaction) => {
            const docSnap = await transaction.get(docRef);
            const now = Date.now();

            if (!docSnap.exists) {
                transaction.set(docRef, { count: 1, windowStart: now, expiresAt: new Date(now + windowMs) });
                return { allowed: true, remaining: maxRequests - 1 };
            }

            const data = docSnap.data();
            const windowStart = data.windowStart || 0;

            // Fenster abgelaufen → Reset
            if (now - windowStart > windowMs) {
                transaction.set(docRef, { count: 1, windowStart: now, expiresAt: new Date(now + windowMs) });
                return { allowed: true, remaining: maxRequests - 1 };
            }

            // Innerhalb des Fensters
            if (data.count >= maxRequests) {
                return { allowed: false, remaining: 0 };
            }

            transaction.update(docRef, { count: data.count + 1 });
            return { allowed: true, remaining: maxRequests - data.count - 1 };
        });

        return result;
    } catch (error) {
        console.error('Rate limit check failed:', error);
        // Bei Fehler: Zugriff erlauben (fail-open), damit der Service nicht ausfällt
        return { allowed: true, remaining: maxRequests };
    }
}

function getClientIp(req) {
    return req.headers['x-forwarded-for']?.split(',')[0]?.trim() || req.ip || 'unknown';
}

// 2026-06-09 Security-Audit (M4): HTML-Entity-Escape fuer User-Input, der in
// Mail-HTML-Bodies interpoliert wird (verhindert HTML-/Phishing-Injection +
// Attribut-Breakout in href). OWASP-Set.
function escapeHtml(input) {
    return String(input == null ? '' : input)
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#39;');
}

// ========== PRODUKTKATALOG - Single Source of Truth für Preise ==========
const PRODUCT_CATALOG = {
    // CV Pakete
    'cv-quick-check': { title: 'CV Quick-Check', price: 99, category: 'cv' },
    'young-professional': { title: 'Young Professional CV', price: 249, category: 'cv' },
    'senior-professional': { title: 'Senior Professional CV', price: 490, category: 'cv' },
    'executive-c-suite': { title: 'Executive C-Suite CV', price: 1290, category: 'cv' },

    // Mentoring
    'mentoring-single': { title: 'Single Mentoring Session', price: 350, category: 'mentoring' },
    'mentoring-3pack': { title: '3 Mentoring Sessions', price: 950, category: 'mentoring' },
    'mentoring-complete': { title: 'Komplett-Paket', price: 2450, category: 'mentoring' },

    // Webdesign Pakete
    'webdesign-starter': { title: 'Starter Paket', price: 790, category: 'webdesign' },
    'webdesign-business': { title: 'Business Paket', price: 1490, category: 'webdesign' },
    'webdesign-hosting': { title: 'Wartung & Hosting (1. Monat)', price: 49, category: 'webdesign' },

    // Addons
    'addon-express': { title: 'Express-Bearbeitung (48h)', price: 99, category: 'addon' },
    'addon-english': { title: 'Englische Version', price: 149, category: 'addon' },
    'addon-interview': { title: 'Interview-Coaching', price: 199, category: 'addon' },
    'addon-zeugnis': { title: 'Arbeitszeugnis-Optimierung', price: 49, category: 'addon' },
    'addon-website': { title: 'Executive Landing Page', price: 499, category: 'addon' },
    'addon-linkedin': { title: 'LinkedIn-Profil Optimierung', price: 149, category: 'addon' },

    // Inner Circle Membership
    'inner-circle-founding': { title: 'Inner Circle Founding Member', price: 2490, category: 'membership' },
    'inner-circle-regular': { title: 'Inner Circle Membership', price: 4990, category: 'membership' }
};

// Preisvalidierung - prüft ob Preis zum Produkt passt
function validateItemPrice(item) {
    // Suche nach Produkt im Katalog (nach ID oder Titel)
    let catalogProduct = null;
    let matchedKey = null;

    if (item.id && PRODUCT_CATALOG[item.id]) {
        catalogProduct = PRODUCT_CATALOG[item.id];
        matchedKey = item.id;
    } else {
        // Fallback: Suche nach Titel (für Abwärtskompatibilität)
        const itemTitleLower = item.title?.toLowerCase() || '';

        // Zuerst: Exakter Match
        for (const [id, product] of Object.entries(PRODUCT_CATALOG)) {
            if (product.title.toLowerCase() === itemTitleLower) {
                catalogProduct = product;
                matchedKey = id;
                break;
            }
        }

        // Dann: Titel beginnt mit Katalog-Titel (z.B. "Senior Professional CV (DE, Standard)" beginnt mit "Senior Professional CV")
        if (!catalogProduct) {
            for (const [id, product] of Object.entries(PRODUCT_CATALOG)) {
                if (itemTitleLower.startsWith(product.title.toLowerCase())) {
                    catalogProduct = product;
                    matchedKey = id;
                    break;
                }
            }
        }

        // Dann: Katalog-Titel ist im Item-Titel enthalten
        if (!catalogProduct) {
            for (const [id, product] of Object.entries(PRODUCT_CATALOG)) {
                if (itemTitleLower.includes(product.title.toLowerCase())) {
                    catalogProduct = product;
                    matchedKey = id;
                    break;
                }
            }
        }

        // Letzte Fallback: Prüfe auf Schlüsselwörter
        // WICHTIG: Die Reihenfolge ist kritisch! Spezifischere Keywords müssen zuerst geprüft werden
        // z.B. "Executive Mentoring" muss als mentoring erkannt werden, nicht als executive-c-suite
        if (!catalogProduct) {
            // Prioritäts-Array: Spezifischere Matches zuerst
            const keywordPriority = [
                // Mentoring MUSS zuerst geprüft werden (vor CV-Paketen mit "Executive" im Namen)
                { id: 'mentoring-single', keywords: ['executive mentoring', 'single session', 'mentoring - single'] },
                { id: 'mentoring-3pack', keywords: ['3 mentoring', '3er', '3-pack', '3pack', '3 sessions'] },
                { id: 'mentoring-complete', keywords: ['komplett', 'complete', '6 session'] },
                // CV-Pakete
                { id: 'quick-check', keywords: ['quick-check', 'quick check'] },
                { id: 'young-professional', keywords: ['young professional'] },
                { id: 'senior-professional', keywords: ['senior professional'] },
                { id: 'executive-c-suite', keywords: ['c-suite', 'csuite', 'executive cv'] }, // Nicht nur 'executive'!
                // Add-ons
                { id: 'addon-express', keywords: ['express', '48h', '48 stunden'] },
                { id: 'addon-english', keywords: ['english', 'englisch'] },
                { id: 'addon-interview', keywords: ['interview', 'coaching'] },
                { id: 'addon-zeugnis', keywords: ['zeugnis', 'arbeitszeugnis'] },
                { id: 'addon-website', keywords: ['landing', 'website', 'page'] },
                { id: 'addon-linkedin', keywords: ['linkedin'] }
            ];

            for (const { id, keywords } of keywordPriority) {
                if (keywords.some(kw => itemTitleLower.includes(kw))) {
                    catalogProduct = PRODUCT_CATALOG[id];
                    matchedKey = id;
                    break;
                }
            }
        }
    }

    if (!catalogProduct) {
        console.warn('⚠️ Produkt nicht im Katalog gefunden:', item.title);
        return { valid: false, reason: 'Produkt nicht gefunden', expectedPrice: null };
    }

    // Toleranz von 1 Cent für Rundungsfehler
    const priceDiff = Math.abs(item.price - catalogProduct.price);
    if (priceDiff > 0.01) {
        console.error('❌ Preismanipulation erkannt!', {
            product: item.title,
            submittedPrice: item.price,
            catalogPrice: catalogProduct.price
        });
        return {
            valid: false,
            reason: 'Preisabweichung',
            expectedPrice: catalogProduct.price,
            submittedPrice: item.price
        };
    }

    return { valid: true, catalogProduct };
}

// Validiere alle Items und korrigiere Preise
function validateAndCorrectPrices(items) {
    const validatedItems = [];
    const errors = [];

    for (const item of items) {
        const validation = validateItemPrice(item);

        if (!validation.valid) {
            errors.push({
                item: item.title,
                reason: validation.reason,
                expected: validation.expectedPrice,
                submitted: item.price
            });

            // Bei gefundenem Produkt: Korrigiere den Preis
            if (validation.expectedPrice) {
                validatedItems.push({
                    ...item,
                    price: validation.expectedPrice,
                    priceWasCorrected: true
                });
            }
        } else {
            validatedItems.push({
                ...item,
                price: validation.catalogProduct.price // Immer Katalogpreis verwenden
            });
        }
    }

    return { validatedItems, errors, hasErrors: errors.length > 0 };
}

// ========== CREATE CHECKOUT SESSION ==========
// minInstances: 1 hält diese kritische Function warm (verhindert Cold Starts)
// Kosten: ca. $8-10/Monat, aber viel bessere User Experience
exports.createCheckoutSession = onRequest({
    secrets: [stripeSecretKey],
    invoker: 'public',
    minInstances: 1  // Immer 1 Instanz warm halten für schnellen Checkout
}, async (req, res) => {
    // Handle CORS preflight
    const headers = getCorsHeaders(req);
    if (req.method === 'OPTIONS') {
        res.set(headers);
        return res.status(204).send('');
    }

    res.set(headers);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate Limiting: 10 Checkout-Versuche pro Stunde pro IP
    const ip = getClientIp(req);
    const rateCheck = await checkRateLimit(ip, 'checkout', 10, 60 * 60 * 1000);
    if (!rateCheck.allowed) {
        return res.status(429).json({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' });
    }

    try {
        const { items, userEmail, userId, consents, service, successUrl, cancelUrl } = req.body;

        if (!items || !Array.isArray(items) || items.length === 0) {
            return res.status(400).json({ error: 'Invalid items' });
        }

        // ========== SICHERHEIT: Preisvalidierung gegen Produktkatalog ==========
        const { validatedItems, errors, hasErrors } = validateAndCorrectPrices(items);

        if (hasErrors) {
            console.warn('⚠️ Preisvalidierung Fehler:', errors);
            // Wir loggen den Versuch, verwenden aber korrigierte Preise
            // Bei unbekannten Produkten: Abbruch
            const unknownProducts = errors.filter(e => e.reason === 'Produkt nicht gefunden');
            if (unknownProducts.length > 0) {
                return res.status(400).json({
                    error: 'Ungültige Produkte in Bestellung',
                    details: unknownProducts.map(p => p.item)
                });
            }
        }

        // Verwende validierte Items mit korrekten Preisen
        const itemsToProcess = validatedItems;

        // Initialize Stripe with secret
        const stripe = require('stripe')(stripeSecretKey.value());

        // Create line items mit validierten Preisen
        const lineItems = itemsToProcess.map(item => ({
            price_data: {
                currency: 'eur',
                product_data: {
                    name: item.title,
                    description: `Karriaro - ${item.title}`
                },
                unit_amount: Math.round(item.price * 100) // Jetzt garantiert Katalogpreis
            },
            quantity: 1
        }));

        // ========== METADATA-LIMIT FIX: Stripe hat 500 Zeichen pro Feld ==========
        // Wir speichern nur die essentiellen Daten (id, title gekürzt, price)
        // WICHTIG: Verwende validierte Items mit korrekten Preisen
        const compactItems = itemsToProcess.map(item => ({
            id: item.id || item.title?.substring(0, 20),
            t: item.title?.substring(0, 50), // Titel gekürzt
            p: item.price
        }));

        // Falls immer noch zu lang, nur IDs und Preise speichern
        let itemsMetadata = JSON.stringify(compactItems);
        if (itemsMetadata.length > 450) {
            const minimalItems = itemsToProcess.map(item => ({
                t: item.title?.substring(0, 30),
                p: item.price
            }));
            itemsMetadata = JSON.stringify(minimalItems);
        }

        // Berechne erwarteten Gesamtbetrag für Validierung im Webhook
        const expectedTotal = itemsToProcess.reduce((sum, item) => sum + item.price, 0);

        // Determine URLs based on service or custom URLs
        const defaultOrigin = service === 'webdesign' ? 'https://karriaro-webdesign.de' : 'https://karriaro.de';
        const origin = req.headers.origin || defaultOrigin;
        const finalSuccessUrl = successUrl || `${origin}?payment=success&session_id={CHECKOUT_SESSION_ID}`;
        const finalCancelUrl = cancelUrl || `${origin}?payment=cancelled`;

        // Create checkout session
        const session = await stripe.checkout.sessions.create({
            payment_method_types: ['card', 'paypal'],
            line_items: lineItems,
            mode: 'payment',
            customer_email: userEmail || undefined, // Optional - Stripe sammelt Email wenn nicht vorhanden
            client_reference_id: userId || 'new_customer',
            success_url: finalSuccessUrl,
            cancel_url: finalCancelUrl,
            metadata: {
                userId: userId || '',
                userEmail: userEmail || '', // Preserve original user email for order lookup
                items: itemsMetadata,
                itemsFull: JSON.stringify(itemsToProcess).substring(0, 450), // Validierte Items
                expectedTotal: expectedTotal.toString(), // Für Webhook-Validierung
                createAccount: !userId ? 'true' : 'false', // Flag für Account-Erstellung
                service: service || 'cv-manufaktur', // Service-Typ für Rechnungen
                // Rechtliche Zustimmungen (DSGVO/Fernabsatz)
                consents: consents ? JSON.stringify(consents) : ''
            },
            billing_address_collection: 'required',
            phone_number_collection: {
                enabled: true
            },
            customer_creation: 'always', // Erstellt immer einen Stripe Customer und sammelt E-Mail
            locale: 'de'
        });

        return res.status(200).json({
            sessionId: session.id,
            url: session.url
        });

    } catch (error) {
        console.error('Stripe Checkout Error:', error);
        return res.status(500).json({
            error: 'Failed to create checkout session',
            message: error.message
        });
    }
});

// ========== STRIPE WEBHOOK ==========
exports.stripeWebhook = onRequest({
    secrets: [stripeSecretKey, stripeWebhookSecret, smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    console.log('🔔 Webhook received! Method:', req.method);

    const sig = req.headers['stripe-signature'];
    console.log('📝 Stripe signature present:', !!sig);

    let event;

    try {
        const stripe = require('stripe')(stripeSecretKey.value());
        const webhookSecret = stripeWebhookSecret.value()?.trim();
        console.log('🔑 Webhook secret starts with:', webhookSecret ? webhookSecret.substring(0, 10) + '...' : 'NOT SET');

        // Für Firebase Functions Gen2: rawBody kann Buffer oder String sein
        const payload = req.rawBody || req.body;
        const payloadString = typeof payload === 'string' ? payload : (Buffer.isBuffer(payload) ? payload : JSON.stringify(payload));

        console.log('📦 Payload type:', typeof payload, 'isBuffer:', Buffer.isBuffer(payload));

        event = stripe.webhooks.constructEvent(
            payloadString,
            sig,
            webhookSecret
        );
        console.log('✅ Webhook signature verified! Event type:', event.type);
    } catch (err) {
        console.error('❌ Webhook signature verification failed:', err.message);
        return res.status(400).send(`Webhook Error: ${err.message}`);
    }

    if (event.type === 'checkout.session.completed') {
        console.log('🛒 Processing checkout.session.completed event');
        const session = event.data.object;

        try {
            // ========== SICHERHEIT: Betragsvalidierung ==========
            const expectedTotal = parseFloat(session.metadata.expectedTotal || '0');
            const actualTotal = session.amount_total / 100; // Stripe gibt Cents zurück

            if (expectedTotal > 0 && Math.abs(expectedTotal - actualTotal) > 0.01) {
                console.error('🚨 SICHERHEITSWARNUNG: Betragsabweichung!', {
                    sessionId: session.id,
                    expectedTotal,
                    actualTotal,
                    difference: actualTotal - expectedTotal
                });
                // Wir erstellen die Order trotzdem, aber mit Warnung
                // In Produktion könnte man hier die Order zur manuellen Prüfung markieren
            }

            // ========== DUPLIKAT-CHECK: Verhindere doppelte Order-Erstellung bei Webhook-Retries ==========
            const existingOrderQuery = await admin.firestore().collection('orders')
                .where('stripeSessionId', '==', session.id)
                .limit(1)
                .get();

            if (!existingOrderQuery.empty) {
                console.log('⚠️ Order bereits vorhanden für Session:', session.id, '- Überspringe Duplikat');
                return res.status(200).json({ received: true, duplicate: true });
            }

            let userId = session.client_reference_id;
            // WICHTIG: Bevorzuge die Original-User-E-Mail aus Metadaten, falls vorhanden
            // Dies stellt sicher, dass Bestellungen dem richtigen Account zugeordnet werden,
            // auch wenn der Kunde bei Stripe eine andere E-Mail eingibt
            const metadataEmail = session.metadata?.userEmail;
            // E-Mail kann in customer_email ODER customer_details.email sein (je nach Checkout-Konfiguration)
            const stripeEmail = session.customer_email || session.customer_details?.email;
            const customerEmail = (metadataEmail && metadataEmail.trim()) ? metadataEmail : stripeEmail;
            const customerName = session.customer_details?.name || 'Karriaro User';
            const createAccount = session.metadata.createAccount === 'true';

            console.log('📧 Email Resolution: metadata=' + metadataEmail + ', stripe=' + stripeEmail + ', using=' + customerEmail);

            // Automatische Account-Erstellung für neue Kunden
            if (createAccount && customerEmail && (!userId || userId === 'new_customer')) {
                try {
                    // Prüfe ob User mit dieser Email bereits existiert
                    let userRecord;
                    try {
                        userRecord = await admin.auth().getUserByEmail(customerEmail);
                        console.log('User exists already:', customerEmail);
                        userId = userRecord.uid;
                    } catch (error) {
                        // User existiert nicht - erstelle neuen Account
                        if (error.code === 'auth/user-not-found') {
                            // Generiere sicheres temporäres Passwort
                            const tempPassword = Math.random().toString(36).slice(-16) + Math.random().toString(36).slice(-16);

                            userRecord = await admin.auth().createUser({
                                email: customerEmail,
                                password: tempPassword,
                                displayName: customerName,
                                emailVerified: true // Wir vertrauen Stripe's Email-Verifizierung
                            });

                            userId = userRecord.uid;

                            // Erstelle User-Dokument in Firestore
                            await admin.firestore().collection('users').doc(userId).set({
                                email: customerEmail,
                                name: customerName,
                                createdAt: admin.firestore.FieldValue.serverTimestamp(),
                                createdVia: 'stripe_checkout',
                                stripeCustomerId: session.customer,
                                needsPasswordReset: true // User soll Passwort zurücksetzen
                            });

                            // Sende Password-Reset Email
                            try {
                                const resetLink = await admin.auth().generatePasswordResetLink(customerEmail);
                                console.log('Password reset link generated:', resetLink);

                                // Send welcome email with reset link
                                const transporter = nodemailer.createTransport({
                                    host: smtpHost.value(),
                                    port: 587,
                                    secure: false,
                                    auth: {
                                        user: smtpUser.value(),
                                        pass: smtpPass.value()
                                    }
                                });

                                await transporter.sendMail({
                                    from: '"Karriaro" <noreply@karriaro.de>',
                                    replyTo: 'kontakt@karriaro.de',
                                    to: customerEmail,
                                    subject: 'Willkommen bei Karriaro - Bitte Passwort festlegen',
                                    html: `
                                        <div style="font-family: 'Georgia', serif; max-width: 600px; margin: 0 auto; background: #1a1a2e; padding: 40px; color: #fff;">
                                            <div style="text-align: center; margin-bottom: 30px;">
                                                <h1 style="color: #C9B99A; font-size: 28px; margin: 0;">Karriaro</h1>
                                            </div>
                                            <div style="background: white; padding: 30px; border-radius: 8px; color: #333;">
                                                <h2 style="color: #1a1a2e; margin-top: 0;">Willkommen bei Karriaro!</h2>
                                                <p>Vielen Dank für Ihre Bestellung. Wir haben automatisch ein Konto für Sie erstellt.</p>
                                                <p>Bitte klicken Sie auf den folgenden Button, um Ihr Passwort festzulegen:</p>
                                                <div style="text-align: center; margin: 30px 0;">
                                                    <a href="${resetLink}" style="background: #C9B99A; color: #1a1a2e; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Passwort festlegen</a>
                                                </div>
                                                <p style="color: #666; font-size: 14px;">Oder kopieren Sie diesen Link in Ihren Browser:<br><a href="${resetLink}" style="color: #1a1a2e;">${resetLink}</a></p>
                                                <p>Sobald Ihr Passwort festgelegt ist, können Sie sich in Ihrem Dashboard einloggen und Ihre Bestellungen einsehen.</p>
                                                <hr style="border: none; border-top: 1px solid #eee; margin: 20px 0;">
                                                <p style="color: #666; font-size: 12px;">Bei Fragen stehen wir Ihnen gerne zur Verfügung: kontakt@karriaro.de</p>
                                            </div>
                                        </div>
                                    `
                                });
                                console.log('Welcome email with password reset sent to:', customerEmail);
                            } catch (resetError) {
                                console.error('Error generating password reset link or sending email:', resetError);
                            }

                            console.log('New user created:', userId, customerEmail);
                        } else {
                            throw error;
                        }
                    }
                } catch (authError) {
                    console.error('Error creating user account:', authError);
                    // Fahre fort mit Order-Erstellung auch wenn Account-Erstellung fehlschlägt
                    userId = `guest_${session.id}`;
                }
            }

            // Order in Firestore speichern
            // WICHTIG: Firestore akzeptiert keine undefined-Werte, also filtern wir sie raus

            // ========== ITEMS PARSING: Unterstützt sowohl kompakte als auch volle Items ==========
            let parsedItems = [];
            try {
                const rawItems = JSON.parse(session.metadata.items || '[]');
                // Prüfe ob kompaktes Format (t statt title)
                parsedItems = rawItems.map(item => ({
                    id: item.id || item.t?.substring(0, 20),
                    title: item.title || item.t, // Unterstützt beide Formate
                    price: item.price || item.p
                }));
            } catch (parseError) {
                console.error('Error parsing items metadata:', parseError);
                // Fallback: Versuche itemsFull
                try {
                    parsedItems = JSON.parse(session.metadata.itemsFull || '[]');
                } catch (e) {
                    parsedItems = [{ title: 'Karriaro Bestellung', price: session.amount_total / 100 }];
                }
            }

            // Parse rechtliche Zustimmungen aus metadata
            let consentsData = null;
            try {
                if (session.metadata.consents) {
                    consentsData = JSON.parse(session.metadata.consents);
                }
            } catch (parseErr) {
                console.warn('Could not parse consents metadata:', parseErr);
            }

            // Normalize email to lowercase for consistent lookups
            const normalizedEmail = customerEmail ? customerEmail.toLowerCase().trim() : null;

            const orderData = {
                userId: userId || `guest_${session.id}`,
                customerEmail: normalizedEmail,
                customerEmailOriginal: customerEmail || null, // Keep original for display
                customerName: customerName || 'Kunde',
                items: parsedItems,
                total: session.amount_total / 100,
                currency: session.currency || 'eur',
                paymentStatus: 'paid',
                stripeSessionId: session.id,
                stripePaymentIntent: session.payment_intent || null,
                stripeCustomerId: session.customer || null,
                status: 'confirmed',
                date: admin.firestore.FieldValue.serverTimestamp(),
                billingDetails: session.customer_details || null,
                paymentMethod: session.payment_method_types?.[0] || 'card',
                // Service-Typ für Multi-Service-Rechnungen (cv-manufaktur, webdesign, mentoring)
                service: session.metadata?.service || 'cv-manufaktur',
                // Rechtliche Zustimmungen für DSGVO/Fernabsatz-Compliance
                consents: consentsData || null
            };

            // Nur hinzufügen wenn vorhanden (vermeidet undefined)
            if (session.shipping_details) {
                orderData.shippingDetails = session.shipping_details;
            }

            const orderRef = await admin.firestore().collection('orders').add(orderData);

            console.log('📦 Order saved successfully:', orderRef.id, 'Session:', session.id, 'User:', userId);

            // Sende Bestellbestätigung mit PDF-Rechnung
            try {
                console.log('📧 Sending order confirmation email to:', customerEmail);
                console.log('📧 SMTP Config - Host:', smtpHost.value() || 'NOT SET', 'User:', smtpUser.value() ? smtpUser.value().substring(0, 5) + '***' : 'NOT SET');
                await sendOrderConfirmationEmail(orderData, orderRef.id, session.id);
                console.log('✅ Order confirmation email sent successfully to:', customerEmail);
            } catch (emailError) {
                console.error('❌ Failed to send order confirmation email:', emailError.message);
                console.error('❌ Email error details:', JSON.stringify(emailError));
                // Wir werfen den Fehler nicht, da die Bestellung trotzdem gespeichert wurde
            }

            // ========== AUTOMATISCHER FRAGEBOGEN-VERSAND FÜR CV-BESTELLUNGEN ==========
            const isCvOrder = parsedItems.some(item => {
                const titleLower = (item.title || '').toLowerCase();
                return titleLower.includes('cv') ||
                       titleLower.includes('professional') ||
                       titleLower.includes('executive') ||
                       titleLower.includes('quick-check');
            });

            if (isCvOrder && customerEmail) {
                try {
                    console.log('📝 CV-Bestellung erkannt - sende Fragebogen-Link...');

                    // Erstelle CV-Projekt in Firestore
                    const cvProjectRef = await admin.firestore().collection('cvProjects').add({
                        orderId: orderRef.id,
                        userId: userId,
                        customerEmail: customerEmail,
                        customerName: customerName,
                        status: 'questionnaire_pending',
                        createdAt: admin.firestore.FieldValue.serverTimestamp(),
                        items: parsedItems
                    });

                    // Update Order mit CV-Projekt-Referenz und nächsten Schritten
                    await admin.firestore().collection('orders').doc(orderRef.id).update({
                        cvProjectId: cvProjectRef.id,
                        nextStep: 'questionnaire',
                        nextStepDescription: 'Bitte füllen Sie den Fragebogen aus',
                        workflow: {
                            currentStep: 1,
                            steps: [
                                { step: 1, name: 'Fragebogen ausfüllen', status: 'pending', icon: 'clipboard-list' },
                                { step: 2, name: 'CV wird erstellt', status: 'waiting', icon: 'pen-fancy' },
                                { step: 3, name: 'Review & Feedback', status: 'waiting', icon: 'comments' },
                                { step: 4, name: 'Fertigstellung', status: 'waiting', icon: 'check-circle' }
                            ]
                        }
                    });

                    // Sende Fragebogen-Email
                    await sendQuestionnaireEmailInternal(customerEmail, customerName, orderRef.id, cvProjectRef.id);
                    console.log('✅ Fragebogen-Email gesendet an:', customerEmail);

                } catch (cvError) {
                    console.error('❌ Fehler beim Erstellen des CV-Projekts:', cvError);
                }
            }

        } catch (error) {
            console.error('Error processing checkout.session.completed:', error);
        }
    }

    res.status(200).json({ received: true });
});

// ========== INTERNE FUNKTION: FRAGEBOGEN EMAIL SENDEN ==========
async function sendQuestionnaireEmailInternal(customerEmail, customerName, orderId, cvProjectId) {
    const host = smtpHost.value() || 'smtp.strato.de';
    const user = smtpUser.value();
    const pass = smtpPass.value();

    const transporter = nodemailer.createTransport({
        host: host,
        port: 465,
        secure: true,
        auth: { user, pass }
    });

    const questionnaireUrl = `https://karriaro.de/#questionnaire?order=${orderId}&project=${cvProjectId}`;

    await transporter.sendMail({
        from: `"Karriaro" <${user || 'noreply@karriaro.de'}>`,
        replyTo: 'kontakt@karriaro.de',
        to: customerEmail,
        subject: 'Nächster Schritt: Ihr persönlicher CV-Fragebogen - Karriaro',
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Georgia', serif; line-height: 1.8; color: #333; margin: 0; padding: 0; background: #f5f5f5; }
                    .container { max-width: 600px; margin: 0 auto; }
                    .header { background: #0B1120; color: #C6A87C; padding: 40px 30px; text-align: center; }
                    .header h1 { margin: 0; font-size: 28px; font-weight: 400; letter-spacing: 4px; }
                    .content { padding: 40px 30px; background: white; }
                    .step-box { background: linear-gradient(135deg, #0B1120 0%, #1a2940 100%); color: white; padding: 30px; border-radius: 12px; margin: 25px 0; text-align: center; }
                    .step-number { background: #C6A87C; color: #0B1120; width: 50px; height: 50px; border-radius: 50%; display: inline-flex; align-items: center; justify-content: center; font-size: 24px; font-weight: bold; margin-bottom: 15px; }
                    .btn { display: inline-block; background: #C6A87C; color: #0B1120; padding: 18px 40px; text-decoration: none; border-radius: 8px; font-weight: bold; font-size: 16px; margin: 20px 0; }
                    .btn:hover { background: #b8a06e; }
                    .timeline { margin: 30px 0; }
                    .timeline-item { display: flex; align-items: flex-start; margin: 15px 0; }
                    .timeline-icon { width: 40px; height: 40px; background: #e8e8e8; border-radius: 50%; display: flex; align-items: center; justify-content: center; margin-right: 15px; color: #666; flex-shrink: 0; }
                    .timeline-icon.active { background: #C6A87C; color: #0B1120; }
                    .timeline-text h4 { margin: 0 0 5px 0; color: #0B1120; }
                    .timeline-text p { margin: 0; color: #666; font-size: 14px; }
                    .footer { background: #0B1120; color: #888; padding: 30px; text-align: center; font-size: 12px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>KARRIARO</h1>
                        <p style="margin: 10px 0 0; opacity: 0.8; font-size: 14px;">CV-Manufaktur & Executive Mentoring</p>
                    </div>
                    <div class="content">
                        <h2 style="color: #0B1120; margin-top: 0;">Hallo ${customerName || 'lieber Kunde'},</h2>

                        <p>vielen Dank für Ihre Bestellung! Wir freuen uns, Sie auf Ihrem Karriereweg begleiten zu dürfen.</p>

                        <div class="step-box">
                            <div class="step-number">1</div>
                            <h3 style="margin: 0 0 10px; font-size: 20px;">Jetzt: Fragebogen ausfüllen</h3>
                            <p style="margin: 0 0 20px; opacity: 0.9;">Damit wir Ihren CV perfekt gestalten können, benötigen wir einige Informationen von Ihnen.</p>
                            <a href="${questionnaireUrl}" class="btn">Fragebogen starten →</a>
                        </div>

                        <h3 style="color: #0B1120;">So geht es weiter:</h3>

                        <div class="timeline">
                            <div class="timeline-item">
                                <div class="timeline-icon active">1</div>
                                <div class="timeline-text">
                                    <h4>Fragebogen ausfüllen</h4>
                                    <p>Erzählen Sie uns von Ihrer Karriere (ca. 15-20 Min.)</p>
                                </div>
                            </div>
                            <div class="timeline-item">
                                <div class="timeline-icon">2</div>
                                <div class="timeline-text">
                                    <h4>CV wird erstellt</h4>
                                    <p>Unsere Experten erstellen Ihren maßgeschneiderten CV</p>
                                </div>
                            </div>
                            <div class="timeline-item">
                                <div class="timeline-icon">3</div>
                                <div class="timeline-text">
                                    <h4>Review & Feedback</h4>
                                    <p>Sie erhalten Ihren Entwurf zur Prüfung</p>
                                </div>
                            </div>
                            <div class="timeline-item">
                                <div class="timeline-icon">4</div>
                                <div class="timeline-text">
                                    <h4>Fertigstellung</h4>
                                    <p>Nach Ihrer Freigabe erhalten Sie alle Dokumente</p>
                                </div>
                            </div>
                        </div>

                        <p style="color: #666; font-size: 14px;">
                            <strong>Tipp:</strong> Je detaillierter Ihre Angaben, desto besser können wir Ihren CV gestalten.
                            Nehmen Sie sich Zeit für den Fragebogen – es lohnt sich!
                        </p>

                        <hr style="border: none; border-top: 1px solid #eee; margin: 30px 0;">

                        <p>Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.</p>
                        <p>Mit besten Grüßen,<br><strong>Ihr Karriaro Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>Karriaro | CV-Manufaktur & Executive Mentoring</p>
                        <p>Diese E-Mail wurde automatisch generiert.</p>
                    </div>
                </div>
            </body>
            </html>
        `
    });
}

// ========== SEND ORDER CONFIRMATION EMAIL WITH PDF ==========
async function sendOrderConfirmationEmail(orderData, orderId, sessionId) {
    // Service-spezifische Konfiguration
    const service = orderData.service || 'cv-manufaktur';
    const isWebdesign = service === 'webdesign';

    // Generiere PDFs - für Webdesign nur Rechnung, für andere Services auch AGB/Datenschutz
    let pdfBuffer, agbBuffer, datenschutzBuffer;
    if (isWebdesign) {
        // Webdesign: Nur Rechnung (AGBs wurden bei Checkout akzeptiert und sind auf der Website)
        pdfBuffer = await generateInvoicePDF(orderData, orderId, sessionId);
    } else {
        // CV-Manufaktur/Mentoring: Rechnung + AGB + Datenschutz
        [pdfBuffer, agbBuffer, datenschutzBuffer] = await Promise.all([
            generateInvoicePDF(orderData, orderId, sessionId),
            generateAGBPDF(),
            generateDatenschutzPDF()
        ]);
    }

    // Konfiguriere SMTP-Transport
    const host = smtpHost.value() || 'smtp.gmail.com';
    const user = smtpUser.value();
    const pass = smtpPass.value();

    // Gmail-spezifische Konfiguration
    const isGmail = host.includes('gmail.com');

    const transportConfig = {
        host: host,
        port: isGmail ? 587 : 465,
        secure: !isGmail, // Gmail braucht TLS (secure: false), andere SSL (secure: true)
        auth: {
            user: user,
            pass: pass
        }
    };

    // Gmail braucht explizit STARTTLS
    if (isGmail) {
        transportConfig.requireTLS = true;
    }

    const transporter = nodemailer.createTransport(transportConfig);

    console.log(`Email configured: host=${host}, user=${user ? user.substring(0, 5) + '***' : 'NOT SET'}, service=${service}`);

    const shortOrderId = 'KAR-' + sessionId.slice(-8).toUpperCase();

    // Service-spezifische E-Mail-Konfiguration
    const emailConfig = {
        'cv-manufaktur': {
            fromName: 'Karriaro',
            replyTo: 'kontakt@karriaro.de',
            headerTitle: 'KARRIARO',
            headerSubtitle: 'Premium Career Services',
            footerText: 'Karriaro | Premium Career Services',
            dashboardUrl: 'https://karriaro.de/',
            dashboardText: 'Bestellung im Dashboard ansehen',
            primaryColor: '#C6A87C'
        },
        'webdesign': {
            fromName: 'Karriaro Webdesign',
            replyTo: 'kontakt@karriaro-webdesign.de',
            headerTitle: 'KARRIARO',
            headerSubtitle: 'Webdesign',
            footerText: 'Karriaro Webdesign | karriaro-webdesign.de',
            dashboardUrl: 'https://karriaro-webdesign.de/',
            dashboardText: 'Zurück zur Website',
            primaryColor: '#3B82F6'
        },
        'mentoring': {
            fromName: 'Karriaro',
            replyTo: 'kontakt@karriaro.de',
            headerTitle: 'KARRIARO',
            headerSubtitle: 'Executive Mentoring',
            footerText: 'Karriaro | Executive Mentoring',
            dashboardUrl: 'https://karriaro.de/',
            dashboardText: 'Bestellung im Dashboard ansehen',
            primaryColor: '#C6A87C'
        }
    };

    const emailCfg = emailConfig[service] || emailConfig['cv-manufaktur'];

    // Attachments basierend auf Service
    const attachments = [
        {
            filename: `Rechnung_${shortOrderId}.pdf`,
            content: pdfBuffer,
            contentType: 'application/pdf'
        }
    ];

    // Nur für CV-Manufaktur und Mentoring: AGB und Datenschutz anhängen
    if (!isWebdesign && agbBuffer && datenschutzBuffer) {
        attachments.push(
            {
                filename: 'AGB_Karriaro.pdf',
                content: agbBuffer,
                contentType: 'application/pdf'
            },
            {
                filename: 'Datenschutzerklaerung_Karriaro.pdf',
                content: datenschutzBuffer,
                contentType: 'application/pdf'
            }
        );
    }

    // Anhang-Info für E-Mail-Text
    const attachmentInfo = isWebdesign
        ? '<li>Ihre Rechnung als PDF</li>'
        : `<li>Ihre Rechnung als PDF</li>
           <li>Unsere Allgemeinen Geschäftsbedingungen (AGB)</li>
           <li>Unsere Datenschutzerklärung</li>`;

    // Webdesign-spezifische nächste Schritte
    const nextStepsHtml = isWebdesign
        ? `<div style="background: #f0f9ff; border: 1px solid #bae6fd; border-radius: 8px; padding: 20px; margin: 20px 0;">
               <h3 style="margin: 0 0 10px 0; color: #0369a1;">Wie geht es weiter?</h3>
               <ol style="margin: 0; padding-left: 20px; color: #374151;">
                   <li>Wir melden uns innerhalb von 24 Stunden bei Ihnen</li>
                   <li>Gemeinsam besprechen wir die Details Ihres Projekts</li>
                   <li>Nach Freigabe des Konzepts beginnen wir mit der Entwicklung</li>
               </ol>
           </div>`
        : '';

    const mailOptions = {
        from: `"${emailCfg.fromName}" <${smtpUser.value() || 'noreply@karriaro.de'}>`,
        replyTo: emailCfg.replyTo,
        to: orderData.customerEmail,
        subject: `Bestellbestätigung ${shortOrderId} - ${emailCfg.fromName}`,
        html: `
            <!DOCTYPE html>
            <html>
            <head>
                <meta charset="utf-8">
                <style>
                    body { font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; line-height: 1.6; color: #333; }
                    .container { max-width: 600px; margin: 0 auto; padding: 20px; }
                    .header { background: #0B1120; color: ${emailCfg.primaryColor}; padding: 30px; text-align: center; }
                    .header h1 { margin: 0; font-size: 24px; }
                    .header p { margin: 5px 0 0 0; font-size: 12px; color: #9ca3af; letter-spacing: 2px; }
                    .content { padding: 30px; background: #f9f9f9; }
                    .order-box { background: white; border: 1px solid #e5e7eb; border-radius: 8px; padding: 20px; margin: 20px 0; }
                    .order-number { font-size: 24px; font-weight: bold; color: #0B1120; letter-spacing: 2px; }
                    .items-table { width: 100%; border-collapse: collapse; margin: 20px 0; }
                    .items-table th, .items-table td { padding: 12px; text-align: left; border-bottom: 1px solid #e5e7eb; }
                    .items-table th { background: #f3f4f6; font-size: 12px; text-transform: uppercase; }
                    .total-row { font-weight: bold; font-size: 18px; }
                    .footer { text-align: center; padding: 20px; color: #666; font-size: 12px; }
                    .btn { display: inline-block; background: ${emailCfg.primaryColor}; color: ${isWebdesign ? '#ffffff' : '#0B1120'}; padding: 12px 30px; text-decoration: none; font-weight: bold; border-radius: 4px; }
                </style>
            </head>
            <body>
                <div class="container">
                    <div class="header">
                        <h1>${emailCfg.headerTitle}</h1>
                        <p>${emailCfg.headerSubtitle}</p>
                    </div>
                    <div class="content">
                        <h2>Vielen Dank für Ihre Bestellung!</h2>
                        <p>Hallo ${orderData.customerName || 'geschätzter Kunde'},</p>
                        <p>wir haben Ihre Bestellung erhalten und werden diese schnellstmöglich bearbeiten.</p>

                        <div class="order-box">
                            <p style="margin: 0 0 10px 0; color: #666; font-size: 12px;">BESTELLNUMMER</p>
                            <p class="order-number">${shortOrderId}</p>
                        </div>

                        <table class="items-table">
                            <thead>
                                <tr>
                                    <th>Produkt</th>
                                    <th style="text-align: right;">Preis</th>
                                </tr>
                            </thead>
                            <tbody>
                                ${orderData.items.map(item => `
                                    <tr>
                                        <td>${item.title}</td>
                                        <td style="text-align: right;">€${item.price.toFixed(2)}</td>
                                    </tr>
                                `).join('')}
                                <tr class="total-row">
                                    <td>Gesamtbetrag</td>
                                    <td style="text-align: right;">€${orderData.total.toFixed(2)}</td>
                                </tr>
                            </tbody>
                        </table>

                        ${nextStepsHtml}

                        <p>Im Anhang finden Sie:</p>
                        <ul style="margin: 10px 0; padding-left: 20px; color: #374151;">
                            ${attachmentInfo}
                        </ul>

                        <p style="text-align: center; margin-top: 30px;">
                            <a href="${emailCfg.dashboardUrl}" class="btn">${emailCfg.dashboardText}</a>
                        </p>

                        <p style="margin-top: 30px;">Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.</p>
                        <p>Mit besten Grüßen,<br><strong>Ihr ${emailCfg.fromName} Team</strong></p>
                    </div>
                    <div class="footer">
                        <p>${emailCfg.footerText}</p>
                        <p>Diese E-Mail wurde automatisch generiert.</p>
                    </div>
                </div>
            </body>
            </html>
        `,
        attachments
    };

    await transporter.sendMail(mailOptions);
}

// ========== SERVICE CONFIGURATION ==========
const serviceConfig = {
    'cv-manufaktur': {
        name: 'KARRIARO',
        subtitle: 'Premium Career Services',
        domain: 'karriaro.de'
    },
    'webdesign': {
        name: 'KARRIARO',
        subtitle: 'Webdesign',
        domain: 'karriaro-webdesign.de'
    },
    'mentoring': {
        name: 'KARRIARO',
        subtitle: 'Executive Mentoring',
        domain: 'karriaro.de'
    }
};

// ========== GENERATE INVOICE PDF ==========
function generateInvoicePDF(orderData, orderId, sessionId) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Service-spezifische Konfiguration
        const service = orderData.service || 'cv-manufaktur';
        const config = serviceConfig[service] || serviceConfig['cv-manufaktur'];

        const shortOrderId = 'KAR-' + (sessionId ? sessionId.slice(-8).toUpperCase() : orderId.slice(-8).toUpperCase());
        const invoiceDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });
        const invoiceNumber = `RE-${new Date().getFullYear()}-${orderId.slice(-6).toUpperCase()}`;

        // Header - Service-spezifisch
        doc.fontSize(24).font('Helvetica-Bold').text(config.name, 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(config.subtitle, 50, 80);

        // Rechnung Label
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#0B1120')
           .text('RECHNUNG', 350, 50, { align: 'right' });

        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(`Rechnungsnummer: ${invoiceNumber}`, 350, 85, { align: 'right' })
           .text(`Bestellnummer: ${shortOrderId}`, 350, 100, { align: 'right' })
           .text(`Datum: ${invoiceDate}`, 350, 115, { align: 'right' });

        // Trennlinie
        doc.moveTo(50, 150).lineTo(545, 150).strokeColor('#C6A87C').lineWidth(2).stroke();

        // Kundenadresse
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Rechnungsempfänger:', 50, 170);
        doc.fontSize(10).font('Helvetica').fillColor('#333333')
           .text(orderData.customerName || 'Kunde', 50, 185)
           .text(orderData.customerEmail, 50, 200);

        if (orderData.billingDetails?.address) {
            const addr = orderData.billingDetails.address;
            if (addr.line1) doc.text(addr.line1, 50, 215);
            if (addr.postal_code || addr.city) {
                doc.text(`${addr.postal_code || ''} ${addr.city || ''}`, 50, 230);
            }
            if (addr.country) doc.text(addr.country, 50, 245);
        }

        // Artikeltabelle
        const tableTop = 290;
        const tableHeaders = ['Beschreibung', 'Menge', 'Einzelpreis', 'Gesamt'];
        const colWidths = [250, 60, 100, 85];
        let xPos = 50;

        // Tabellenkopf
        doc.rect(50, tableTop, 495, 25).fillColor('#f3f4f6').fill();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');

        tableHeaders.forEach((header, i) => {
            doc.text(header, xPos + 5, tableTop + 8, {
                width: colWidths[i] - 10,
                align: i > 0 ? 'right' : 'left'
            });
            xPos += colWidths[i];
        });

        // Artikel
        let yPos = tableTop + 35;
        doc.font('Helvetica').fontSize(10);

        orderData.items.forEach(item => {
            xPos = 50;
            doc.fillColor('#333333')
               .text(item.title, xPos + 5, yPos, { width: colWidths[0] - 10 })
               .text('1', xPos + colWidths[0] + 5, yPos, { width: colWidths[1] - 10, align: 'right' })
               .text(`€${item.price.toFixed(2)}`, xPos + colWidths[0] + colWidths[1] + 5, yPos, { width: colWidths[2] - 10, align: 'right' })
               .text(`€${item.price.toFixed(2)}`, xPos + colWidths[0] + colWidths[1] + colWidths[2] + 5, yPos, { width: colWidths[3] - 10, align: 'right' });

            yPos += 25;

            // Trennlinie zwischen Artikeln
            doc.moveTo(50, yPos - 5).lineTo(545, yPos - 5).strokeColor('#e5e7eb').lineWidth(0.5).stroke();
        });

        // Summen
        yPos += 15;
        const netAmount = orderData.total / 1.19; // 19% MwSt zurückrechnen
        const vatAmount = orderData.total - netAmount;

        doc.fontSize(10).font('Helvetica')
           .text('Nettobetrag:', 350, yPos, { width: 100, align: 'right' })
           .text(`€${netAmount.toFixed(2)}`, 455, yPos, { width: 85, align: 'right' });

        yPos += 20;
        doc.text('USt. 19%:', 350, yPos, { width: 100, align: 'right' })
           .text(`€${vatAmount.toFixed(2)}`, 455, yPos, { width: 85, align: 'right' });

        yPos += 25;
        doc.rect(350, yPos - 5, 195, 30).fillColor('#0B1120').fill();
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#C6A87C')
           .text('Gesamtbetrag:', 355, yPos + 3, { width: 95, align: 'right' })
           .text(`€${orderData.total.toFixed(2)}`, 455, yPos + 3, { width: 85, align: 'right' });

        // Zahlungsinformation
        yPos += 60;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Zahlungsinformation', 50, yPos);
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(`Status: Bezahlt`, 50, yPos + 15)
           .text(`Zahlungsmethode: ${orderData.paymentMethod === 'card' ? 'Kreditkarte' : orderData.paymentMethod === 'paypal' ? 'PayPal' : orderData.paymentMethod}`, 50, yPos + 30);

        // Footer
        const footerY = 750;
        doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

        const footerEmail = service === 'webdesign' ? 'kontakt@karriaro-webdesign.de' : 'kontakt@karriaro.de';
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text(`${config.name} | ${config.subtitle} | ${config.domain} | ${footerEmail}`, 50, footerY + 10, { align: 'center', width: 495 })
           .text('Diese Rechnung wurde maschinell erstellt und ist ohne Unterschrift gültig.', 50, footerY + 22, { align: 'center', width: 495 });

        doc.end();
    });
}

// ========== GENERATE CREDIT NOTE PDF (GUTSCHRIFT) ==========
function generateCreditNotePDF(orderData, orderId, refundData) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        const creditNoteDate = new Date().toLocaleDateString('de-DE', {
            day: '2-digit',
            month: '2-digit',
            year: 'numeric'
        });

        // Gutschrift-Nummer: GS-JAHR-RANDOM6
        const creditNoteNumber = `GS-${new Date().getFullYear()}-${orderId.slice(-6).toUpperCase()}`;
        const originalInvoiceNumber = `RE-${new Date(orderData.createdAt?.seconds * 1000 || Date.now()).getFullYear()}-${orderId.slice(-6).toUpperCase()}`;

        // Service-spezifische Konfiguration
        const service = orderData.service || 'cv-manufaktur';
        const config = serviceConfig[service] || serviceConfig['cv-manufaktur'];

        // Header - Service-spezifisch
        doc.fontSize(24).font('Helvetica-Bold').text(config.name, 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(config.subtitle, 50, 80);

        // Gutschrift Label (rot)
        doc.fontSize(28).font('Helvetica-Bold').fillColor('#dc2626')
           .text('GUTSCHRIFT', 350, 50, { align: 'right' });

        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(`Gutschriftnummer: ${creditNoteNumber}`, 350, 85, { align: 'right' })
           .text(`Urspr. Rechnung: ${originalInvoiceNumber}`, 350, 100, { align: 'right' })
           .text(`Datum: ${creditNoteDate}`, 350, 115, { align: 'right' });

        // Trennlinie
        doc.moveTo(50, 150).lineTo(545, 150).strokeColor('#dc2626').lineWidth(2).stroke();

        // Kundenadresse
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Gutschrift an:', 50, 170);
        doc.fontSize(10).font('Helvetica').fillColor('#333333')
           .text(orderData.customerName || 'Kunde', 50, 185)
           .text(orderData.customerEmail, 50, 200);

        if (orderData.billingDetails?.address) {
            const addr = orderData.billingDetails.address;
            if (addr.line1) doc.text(addr.line1, 50, 215);
            if (addr.postal_code || addr.city) {
                doc.text(`${addr.postal_code || ''} ${addr.city || ''}`, 50, 230);
            }
            if (addr.country) doc.text(addr.country, 50, 245);
        }

        // Grund für Gutschrift
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Grund der Gutschrift:', 50, 280);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text(refundData.reason || 'Stornierung/Rückerstattung auf Kundenwunsch', 50, 295, { width: 495 });

        // Artikeltabelle
        const tableTop = 340;
        const tableHeaders = ['Beschreibung', 'Erstattungsbetrag'];
        const colWidths = [360, 135];
        let xPos = 50;

        // Tabellenkopf
        doc.rect(50, tableTop, 495, 25).fillColor('#fef2f2').fill();
        doc.fontSize(9).font('Helvetica-Bold').fillColor('#333333');

        tableHeaders.forEach((header, i) => {
            doc.text(header, xPos + 5, tableTop + 8, {
                width: colWidths[i] - 10,
                align: i > 0 ? 'right' : 'left'
            });
            xPos += colWidths[i];
        });

        // Erstattungsposten
        let yPos = tableTop + 35;
        doc.font('Helvetica').fontSize(10);

        // Wenn Teilerstattung: Zeige welche Teile erstattet wurden
        const refundAmount = refundData.amount;
        const isPartial = refundData.isPartialRefund;

        if (isPartial) {
            // Bei Teilerstattung: Zeige nur den erstatteten Teil
            doc.fillColor('#333333')
               .text('Teilerstattung - Mentoring Session', 55, yPos, { width: colWidths[0] - 10 })
               .text(`€${refundAmount.toFixed(2)}`, 410 + 5, yPos, { width: colWidths[1] - 10, align: 'right' });
            yPos += 25;

            doc.fontSize(9).fillColor('#666666')
               .text('(CV-Erstellung wird wie geplant fortgesetzt)', 55, yPos);
            yPos += 20;
        } else {
            // Vollständige Erstattung: Liste alle Items
            (orderData.items || []).forEach(item => {
                xPos = 50;
                doc.fillColor('#333333')
                   .text(item.title, xPos + 5, yPos, { width: colWidths[0] - 10 })
                   .text(`€${item.price.toFixed(2)}`, xPos + colWidths[0] + 5, yPos, { width: colWidths[1] - 10, align: 'right' });
                yPos += 25;
            });
        }

        // Trennlinie zwischen Artikeln
        doc.moveTo(50, yPos).lineTo(545, yPos).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

        // Summen
        yPos += 20;
        const netAmount = refundAmount / 1.19; // 19% MwSt zurückrechnen
        const vatAmount = refundAmount - netAmount;

        doc.fontSize(10).font('Helvetica')
           .text('Nettobetrag:', 350, yPos, { width: 100, align: 'right' })
           .text(`€${netAmount.toFixed(2)}`, 455, yPos, { width: 85, align: 'right' });

        yPos += 20;
        doc.text('USt. 19%:', 350, yPos, { width: 100, align: 'right' })
           .text(`€${vatAmount.toFixed(2)}`, 455, yPos, { width: 85, align: 'right' });

        yPos += 25;
        doc.rect(350, yPos - 5, 195, 30).fillColor('#dc2626').fill();
        doc.fontSize(12).font('Helvetica-Bold').fillColor('#ffffff')
           .text('Gutschriftbetrag:', 355, yPos + 3, { width: 95, align: 'right' })
           .text(`€${refundAmount.toFixed(2)}`, 455, yPos + 3, { width: 85, align: 'right' });

        // Erstattungshinweis
        yPos += 60;
        doc.fontSize(10).font('Helvetica-Bold').fillColor('#333333')
           .text('Erstattungshinweis', 50, yPos);
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(`Stripe Refund-ID: ${refundData.refundId || 'N/A'}`, 50, yPos + 15)
           .text('Die Gutschrift erfolgt innerhalb von 5-10 Werktagen auf Ihr ursprüngliches Zahlungsmittel.', 50, yPos + 30, { width: 495 });

        // Hinweis auf Originalrechnung
        yPos += 70;
        doc.rect(50, yPos, 495, 40).fillColor('#f3f4f6').fill();
        doc.fontSize(9).font('Helvetica').fillColor('#666666')
           .text(`Diese Gutschrift bezieht sich auf die Rechnung ${originalInvoiceNumber}.`, 60, yPos + 8)
           .text(`Ursprünglicher Rechnungsbetrag: €${(orderData.total || 0).toFixed(2)}`, 60, yPos + 22);

        // Footer
        const footerY = 750;
        doc.moveTo(50, footerY).lineTo(545, footerY).strokeColor('#e5e7eb').lineWidth(0.5).stroke();

        const creditNoteFooterEmail = service === 'webdesign' ? 'kontakt@karriaro-webdesign.de' : 'kontakt@karriaro.de';
        doc.fontSize(8).font('Helvetica').fillColor('#999999')
           .text(`${config.name} | ${config.subtitle} | ${config.domain} | ${creditNoteFooterEmail}`, 50, footerY + 10, { align: 'center', width: 495 })
           .text('Diese Gutschrift wurde maschinell erstellt und ist ohne Unterschrift gültig.', 50, footerY + 22, { align: 'center', width: 495 });

        doc.end();
    });
}

// ========== GENERATE AGB PDF ==========
function generateAGBPDF() {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#0B1120')
           .text('Allgemeine Geschäftsbedingungen (AGB)', 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text('Karriaro GmbH - Stand: Januar 2025', 50, 80);
        doc.moveTo(50, 95).lineTo(545, 95).strokeColor('#C6A87C').lineWidth(2).stroke();

        let yPos = 115;
        const sections = [
            { title: '§ 1 Geltungsbereich', content: '(1) Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen Karriaro GmbH (nachfolgend "Anbieter") und dem Kunden über die auf der Website karriaro.de angebotenen Dienstleistungen.\n\n(2) Abweichende Bedingungen des Kunden werden nicht anerkannt, es sei denn, der Anbieter stimmt ihrer Geltung ausdrücklich schriftlich zu.' },
            { title: '§ 2 Vertragsgegenstand', content: '(1) Der Anbieter erbringt Dienstleistungen im Bereich Karriereberatung, CV-Erstellung und Executive Coaching.\n\n(2) Der genaue Umfang der Leistungen ergibt sich aus der jeweiligen Produktbeschreibung zum Zeitpunkt der Bestellung.' },
            { title: '§ 3 Vertragsschluss', content: '(1) Die Darstellung der Produkte auf der Website stellt kein rechtlich bindendes Angebot, sondern eine Aufforderung zur Bestellung dar.\n\n(2) Mit dem Absenden der Bestellung gibt der Kunde ein verbindliches Angebot ab. Der Vertrag kommt zustande, wenn der Anbieter die Bestellung durch eine Auftragsbestätigung per E-Mail annimmt.' },
            { title: '§ 4 Preise und Zahlung', content: '(1) Alle Preise sind Endpreise und enthalten die gesetzliche Mehrwertsteuer.\n\n(2) Die Zahlung erfolgt über den Zahlungsdienstleister Stripe. Es werden folgende Zahlungsarten akzeptiert: Kreditkarte (Visa, Mastercard, American Express), SEPA-Lastschrift, Apple Pay, Google Pay.\n\n(3) Die Zahlung ist sofort bei Bestellung fällig.' },
            { title: '§ 5 Leistungserbringung', content: '(1) Die Bearbeitung beginnt nach Zahlungseingang und Erhalt aller erforderlichen Unterlagen vom Kunden.\n\n(2) Die voraussichtliche Bearbeitungszeit ist in der Produktbeschreibung angegeben und beginnt mit dem Eingang vollständiger Unterlagen.\n\n(3) Der Kunde ist verpflichtet, alle für die Leistungserbringung erforderlichen Informationen und Unterlagen rechtzeitig und vollständig zur Verfügung zu stellen.' },
            { title: '§ 6 Zufriedenheitsgarantie', content: '(1) Der Anbieter bietet eine Zufriedenheitsgarantie. Ist der Kunde mit dem Ergebnis nicht zufrieden, wird die Leistung kostenlos überarbeitet.\n\n(2) Die Überarbeitung ist innerhalb von 14 Tagen nach Lieferung schriftlich anzufordern.\n\n(3) Der Anspruch auf Überarbeitung besteht für maximal zwei Korrekturschleifen.' },
            { title: '§ 7 Widerrufsrecht', content: '(1) Verbraucher haben ein 14-tägiges Widerrufsrecht gemäß den gesetzlichen Bestimmungen.\n\n(2) Das Widerrufsrecht erlischt vorzeitig, wenn der Anbieter mit der Ausführung der Dienstleistung begonnen hat, nachdem der Kunde ausdrücklich zugestimmt und bestätigt hat, dass er sein Widerrufsrecht verliert.\n\n(3) Der Widerruf ist zu richten an: kontakt@karriaro.de' },
            { title: '§ 8 Vertraulichkeit', content: '(1) Der Anbieter verpflichtet sich, alle vom Kunden übermittelten Informationen und Unterlagen streng vertraulich zu behandeln.\n\n(2) Auf Wunsch wird eine gesonderte Vertraulichkeitsvereinbarung (NDA) abgeschlossen.' },
            { title: '§ 9 Urheberrecht', content: '(1) Mit vollständiger Bezahlung gehen alle Nutzungsrechte an den erstellten Dokumenten auf den Kunden über.\n\n(2) Der Kunde darf die Unterlagen für eigene Bewerbungszwecke uneingeschränkt nutzen.' },
            { title: '§ 10 Haftung', content: '(1) Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für vorsätzlich oder grob fahrlässig verursachte Schäden.\n\n(2) Der Anbieter garantiert nicht den Erfolg von Bewerbungen. Die erstellten Unterlagen erhöhen die Chancen, können aber keine Zusage garantieren.' },
            { title: '§ 11 Schlussbestimmungen', content: '(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.\n\n(2) Gerichtsstand für alle Streitigkeiten ist Berlin, sofern der Kunde Kaufmann ist.\n\n(3) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.' }
        ];

        sections.forEach((section, index) => {
            if (yPos > 700) {
                doc.addPage();
                yPos = 50;
            }
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#0B1120').text(section.title, 50, yPos);
            yPos += 18;
            doc.fontSize(9).font('Helvetica').fillColor('#333333').text(section.content, 50, yPos, { width: 495, lineGap: 3 });
            yPos = doc.y + 15;
        });

        // Footer
        doc.fontSize(8).fillColor('#999999')
           .text('Karriaro GmbH | karriaro.de | kontakt@karriaro.de', 50, 780, { align: 'center', width: 495 });

        doc.end();
    });
}

// ========== GENERATE DATENSCHUTZ PDF ==========
function generateDatenschutzPDF() {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({ size: 'A4', margin: 50 });
        const chunks = [];

        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Header
        doc.fontSize(24).font('Helvetica-Bold').fillColor('#0B1120')
           .text('Datenschutzerklärung', 50, 50);
        doc.fontSize(10).font('Helvetica').fillColor('#666666')
           .text('Karriaro GmbH - Stand: Januar 2025', 50, 80);
        doc.moveTo(50, 95).lineTo(545, 95).strokeColor('#C6A87C').lineWidth(2).stroke();

        let yPos = 115;
        const sections = [
            { title: '1. Datenschutz auf einen Blick', content: 'Die folgenden Hinweise geben einen einfachen Überblick darüber, was mit Ihren personenbezogenen Daten passiert, wenn Sie diese Website besuchen. Personenbezogene Daten sind alle Daten, mit denen Sie persönlich identifiziert werden können.' },
            { title: '2. Verantwortliche Stelle', content: 'Verantwortlich für die Datenverarbeitung auf dieser Website ist:\n\nKarriaro GmbH\nMusterstraße 1\n10115 Berlin\nE-Mail: kontakt@karriaro.de' },
            { title: '3. Datenerfassung auf dieser Website', content: 'Cookies: Unsere Website verwendet Cookies. Das sind kleine Textdateien, die Ihr Webbrowser auf Ihrem Endgerät speichert. Cookies helfen uns dabei, unser Angebot nutzerfreundlicher und sicherer zu machen.\n\nServer-Log-Dateien: Der Provider der Seiten erhebt und speichert automatisch Informationen in sogenannten Server-Log-Dateien, die Ihr Browser automatisch an uns übermittelt.' },
            { title: '4. Registrierung und Kundenkonto', content: 'Bei der Registrierung für ein Kundenkonto erheben wir folgende Daten:\n• E-Mail-Adresse\n• Vor- und Nachname\n• Telefonnummer (optional)\n• Unternehmen (optional)\n\nDiese Daten werden zur Vertragsabwicklung und zur Kommunikation mit Ihnen verwendet. Rechtsgrundlage ist Art. 6 Abs. 1 lit. b DSGVO.' },
            { title: '5. Zahlungsabwicklung', content: 'Wir nutzen den Zahlungsdienstleister Stripe für die sichere Abwicklung von Zahlungen. Bei der Zahlung werden folgende Daten an Stripe übermittelt:\n• Name und E-Mail-Adresse\n• Zahlungsinformationen\n• Rechnungsadresse\n\nStripe ist zertifiziert nach PCI-DSS Level 1 und verarbeitet Ihre Zahlungsdaten nach höchsten Sicherheitsstandards.' },
            { title: '6. Cloud-Dienste', content: 'Wir nutzen Google Firebase für die Speicherung von Nutzerdaten und hochgeladenen Dokumenten. Firebase ist ein Dienst der Google Ireland Limited. Die Datenverarbeitung erfolgt auf Servern in der EU.' },
            { title: '7. Ihre Rechte', content: 'Sie haben jederzeit das Recht:\n• Auskunft über Ihre gespeicherten Daten zu erhalten (Art. 15 DSGVO)\n• Berichtigung unrichtiger Daten zu verlangen (Art. 16 DSGVO)\n• Löschung Ihrer Daten zu verlangen (Art. 17 DSGVO)\n• Einschränkung der Verarbeitung zu verlangen (Art. 18 DSGVO)\n• Datenübertragbarkeit zu verlangen (Art. 20 DSGVO)\n• Widerspruch gegen die Verarbeitung einzulegen (Art. 21 DSGVO)\n\nZur Ausübung Ihrer Rechte wenden Sie sich bitte an: kontakt@karriaro.de' },
            { title: '8. Datensicherheit', content: 'Diese Website nutzt aus Sicherheitsgründen eine SSL- bzw. TLS-Verschlüsselung. Eine verschlüsselte Verbindung erkennen Sie daran, dass die Adresszeile des Browsers von "http://" auf "https://" wechselt und an dem Schloss-Symbol.' },
            { title: '9. Aufbewahrungsfristen', content: 'Wir speichern Ihre Daten nur so lange, wie es für die Erfüllung des jeweiligen Zwecks erforderlich ist oder gesetzliche Aufbewahrungsfristen bestehen (z.B. 10 Jahre für Rechnungen gemäß Handels- und Steuerrecht).' }
        ];

        sections.forEach((section, index) => {
            if (yPos > 700) {
                doc.addPage();
                yPos = 50;
            }
            doc.fontSize(11).font('Helvetica-Bold').fillColor('#0B1120').text(section.title, 50, yPos);
            yPos += 18;
            doc.fontSize(9).font('Helvetica').fillColor('#333333').text(section.content, 50, yPos, { width: 495, lineGap: 3 });
            yPos = doc.y + 15;
        });

        // Footer
        doc.fontSize(8).fillColor('#999999')
           .text('Karriaro GmbH | karriaro.de | kontakt@karriaro.de', 50, 780, { align: 'center', width: 495 });

        doc.end();
    });
}

// ========== SEND APPOINTMENT PROPOSAL EMAIL ==========
exports.sendAppointmentProposalEmail = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate Limiting: 20 E-Mails pro Stunde pro IP
    const rlCheck = await checkRateLimit(getClientIp(req), 'email', 20, 60 * 60 * 1000);
    if (!rlCheck.allowed) {
        return res.status(429).json({ error: 'Zu viele Anfragen. Bitte versuchen Sie es später erneut.' });
    }

    try {
        const { orderId, userId, customerEmail, proposals, message } = req.body;

        if (!customerEmail || !proposals || proposals.length === 0) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Format proposals for email
        const proposalsList = proposals.map((p, idx) => {
            const date = new Date(p.datetime);
            const dateStr = date.toLocaleDateString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', year: 'numeric' });
            const timeStr = date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            return `<tr>
                <td style="padding: 12px; background: ${idx % 2 === 0 ? '#f9fafb' : '#ffffff'}; border-bottom: 1px solid #e5e7eb;">
                    <strong style="color: #1f2937;">Option ${idx + 1}:</strong> ${dateStr} um ${timeStr} Uhr
                </td>
            </tr>`;
        }).join('');

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <style>
        body { font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, 'Helvetica Neue', Arial, sans-serif; line-height: 1.6; color: #333; }
        .container { max-width: 600px; margin: 0 auto; padding: 20px; }
        .header { text-align: center; padding: 30px 0; border-bottom: 2px solid #C9B99A; }
        .logo { font-size: 28px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px; }
        .logo-sub { font-size: 10px; color: #C9B99A; letter-spacing: 2px; text-transform: uppercase; }
        .content { padding: 30px 0; }
        .proposals-table { width: 100%; border-collapse: collapse; margin: 20px 0; border: 1px solid #e5e7eb; border-radius: 8px; overflow: hidden; }
        .cta-button { display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px; margin: 20px 0; }
        .footer { text-align: center; padding: 20px 0; color: #6b7280; font-size: 12px; border-top: 1px solid #e5e7eb; }
        .message-box { background: #f3f4f6; padding: 15px; border-radius: 8px; margin: 15px 0; font-style: italic; }
    </style>
</head>
<body>
    <div class="container">
        <div class="header">
            <div class="logo">KARRIARO</div>
            <div class="logo-sub">Premium Career Services</div>
        </div>

        <div class="content">
            <h2 style="color: #1a1a2e; margin-bottom: 10px;">Terminvorschläge für Sie</h2>
            <p>Wir haben folgende Terminvorschläge für Ihr Coaching-Gespräch:</p>

            ${message ? `<div class="message-box">"${message}"</div>` : ''}

            <table class="proposals-table">
                ${proposalsList}
            </table>

            <p style="text-align: center;">
                <a href="https://karriaro.de/#dashboard" class="cta-button">
                    Termin auswählen
                </a>
            </p>

            <p style="color: #6b7280; font-size: 14px;">
                Klicken Sie auf den Button oben, um einen der vorgeschlagenen Termine zu bestätigen.
                Falls keiner der Termine passt, können Sie dies ebenfalls in Ihrem Dashboard angeben.
            </p>
        </div>

        <div class="footer">
            <p>Karriaro | Premium Career Services</p>
            <p>Diese E-Mail wurde automatisch gesendet.</p>
        </div>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"Karriaro" <noreply@karriaro.de>',
            replyTo: 'kontakt@karriaro.de',
            to: customerEmail,
            subject: 'Terminvorschläge für Ihr Coaching | Karriaro',
            html: emailHtml
        });

        console.log(`Appointment proposal email sent to ${customerEmail} for order ${orderId}`);
        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Failed to send appointment proposal email:', error);
        return res.status(500).json({ error: 'Failed to send email', message: error.message });
    }
});

// ========== NOTIFY ADMIN: CUSTOMER ACCEPTED APPOINTMENT ==========
exports.notifyAdminAppointmentAccepted = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerName, customerEmail, datetime, orderId } = req.body;
        const ADMIN_EMAIL = 'muammer.kizilaslan@gmail.com';

        const dateStr = new Date(datetime).toLocaleDateString('de-DE', {
            weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
        });
        const timeStr = new Date(datetime).toLocaleTimeString('de-DE', {
            hour: '2-digit', minute: '2-digit'
        });

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">KARRIARO</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">PREMIUM CAREER SERVICES</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #22c55e; margin-bottom: 10px;">✅ Termin bestätigt!</h2>
        <p>Großartige Neuigkeiten! Ein Kunde hat einen Termin bestätigt:</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>E-Mail:</strong> ${customerEmail}</p>
            <p style="margin: 5px 0;"><strong>Termin:</strong> ${dateStr} um ${timeStr} Uhr</p>
        </div>
        <p style="text-align: center;">
            <a href="https://karriaro.de/#admin" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Zum Admin-Bereich
            </a>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"Karriaro" <noreply@karriaro.de>',
            replyTo: 'kontakt@karriaro.de',
            to: ADMIN_EMAIL,
            subject: `✅ Termin bestätigt von ${customerName} | Karriaro`,
            html: emailHtml
        });

        console.log(`Admin notified: appointment accepted by ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify admin:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== NOTIFY ADMIN: CUSTOMER DECLINED APPOINTMENTS ==========
exports.notifyAdminAppointmentDeclined = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerName, customerEmail, reason, orderId } = req.body;
        const ADMIN_EMAIL = 'muammer.kizilaslan@gmail.com';

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">KARRIARO</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">PREMIUM CAREER SERVICES</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #f59e0b; margin-bottom: 10px;">⏳ Neue Terminvorschläge benötigt</h2>
        <p>Ein Kunde hat die vorgeschlagenen Termine abgelehnt und bittet um neue Vorschläge:</p>
        <div style="background: #fffbeb; border: 1px solid #fde68a; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>E-Mail:</strong> ${customerEmail}</p>
            ${reason && reason !== 'Keine Angabe' ? `<p style="margin: 5px 0;"><strong>Grund:</strong> "${reason}"</p>` : ''}
        </div>
        <p>Bitte senden Sie dem Kunden neue Terminvorschläge.</p>
        <p style="text-align: center;">
            <a href="https://karriaro.de/#admin" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Neue Termine vorschlagen
            </a>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"Karriaro" <noreply@karriaro.de>',
            replyTo: 'kontakt@karriaro.de',
            to: ADMIN_EMAIL,
            subject: `⏳ Neue Terminvorschläge benötigt von ${customerName} | Karriaro`,
            html: emailHtml
        });

        console.log(`Admin notified: appointments declined by ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify admin:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== NOTIFY CUSTOMER: DOCUMENT UPLOADED BY ADMIN ==========
exports.notifyCustomerDocumentReady = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerEmail, customerName, documentName } = req.body;

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">KARRIARO</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">PREMIUM CAREER SERVICES</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #22c55e; margin-bottom: 10px;">📄 Neues Dokument für Sie!</h2>
        <p>Hallo ${customerName || 'geschätzter Kunde'},</p>
        <p>wir freuen uns, Ihnen mitzuteilen, dass ein neues Dokument für Sie bereitsteht:</p>
        <div style="background: #f0fdf4; border: 1px solid #bbf7d0; padding: 20px; border-radius: 8px; margin: 20px 0; text-align: center;">
            <p style="font-size: 18px; font-weight: bold; color: #1a1a2e; margin: 0;">📎 ${documentName}</p>
        </div>
        <p>Sie können das Dokument jetzt in Ihrem Dashboard unter "Ihre Ergebnisse" herunterladen.</p>
        <p style="text-align: center;">
            <a href="https://karriaro.de/#dashboard" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Zum Dashboard
            </a>
        </p>
        <p style="color: #6b7280; font-size: 14px; margin-top: 30px;">
            Bei Fragen stehen wir Ihnen jederzeit zur Verfügung.<br>
            Herzliche Grüße,<br>
            <strong>Ihr Karriaro Team</strong>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"Karriaro" <noreply@karriaro.de>',
            replyTo: 'kontakt@karriaro.de',
            to: customerEmail,
            subject: '📄 Neues Dokument für Sie bereit | Karriaro',
            html: emailHtml
        });

        console.log(`Customer notified: document ready for ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify customer:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== NOTIFY ADMIN: CUSTOMER UPLOADED DOCUMENT ==========
exports.notifyAdminDocumentUploaded = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { customerName, customerEmail, documentName } = req.body;
        const ADMIN_EMAIL = 'muammer.kizilaslan@gmail.com';

        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: { user: smtpUser.value(), pass: smtpPass.value() }
        });

        const emailHtml = `
<!DOCTYPE html>
<html>
<head><meta charset="utf-8"></head>
<body style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; line-height: 1.6; color: #333; max-width: 600px; margin: 0 auto; padding: 20px;">
    <div style="text-align: center; padding: 20px 0; border-bottom: 2px solid #C9B99A;">
        <div style="font-size: 24px; font-weight: bold; color: #1a1a2e; letter-spacing: 3px;">KARRIARO</div>
        <div style="font-size: 10px; color: #C9B99A; letter-spacing: 2px;">PREMIUM CAREER SERVICES</div>
    </div>
    <div style="padding: 30px 0;">
        <h2 style="color: #3b82f6; margin-bottom: 10px;">📤 Neues Dokument hochgeladen</h2>
        <p>Ein Kunde hat ein neues Dokument hochgeladen:</p>
        <div style="background: #eff6ff; border: 1px solid #bfdbfe; padding: 20px; border-radius: 8px; margin: 20px 0;">
            <p style="margin: 5px 0;"><strong>Kunde:</strong> ${customerName}</p>
            <p style="margin: 5px 0;"><strong>E-Mail:</strong> ${customerEmail}</p>
            <p style="margin: 5px 0;"><strong>Dokument:</strong> ${documentName}</p>
        </div>
        <p style="text-align: center;">
            <a href="https://karriaro.de/#admin" style="display: inline-block; background: #C9B99A; color: #1a1a2e; padding: 14px 28px; text-decoration: none; font-weight: bold; border-radius: 8px;">
                Im Admin-Bereich ansehen
            </a>
        </p>
    </div>
</body>
</html>`;

        await transporter.sendMail({
            from: '"Karriaro" <noreply@karriaro.de>',
            replyTo: 'kontakt@karriaro.de',
            to: ADMIN_EMAIL,
            subject: `📤 Neues Dokument von ${customerName} | Karriaro`,
            html: emailHtml
        });

        console.log(`Admin notified: document uploaded by ${customerEmail}`);
        return res.status(200).json({ success: true });
    } catch (error) {
        console.error('Failed to notify admin:', error);
        return res.status(500).json({ error: 'Failed to send email' });
    }
});

// ========== ADMIN: SET EMAIL VERIFIED ==========
exports.setEmailVerified = onRequest({
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    // Rate Limiting: 5 pro Stunde pro IP (Admin-Funktion)
    const rlCheck = await checkRateLimit(getClientIp(req), 'setEmailVerified', 5, 60 * 60 * 1000);
    if (!rlCheck.allowed) {
        return res.status(429).json({ error: 'Zu viele Anfragen.' });
    }

    try {
        const { uid, email, adminEmail } = req.body;

        // Prüfe ob Anfrage von Admin kommt (einfache Prüfung)
        const ADMIN_EMAILS = ['muammer.kizilaslan@gmx.de', 'kizilaslaneva@gmail.com'];
        if (!adminEmail || !ADMIN_EMAILS.includes(adminEmail)) {
            return res.status(403).json({ error: 'Unauthorized - Admin access required' });
        }

        let userToUpdate;

        if (uid) {
            userToUpdate = await admin.auth().getUser(uid);
        } else if (email) {
            userToUpdate = await admin.auth().getUserByEmail(email);
        } else {
            return res.status(400).json({ error: 'uid or email required' });
        }

        // Setze emailVerified auf true
        await admin.auth().updateUser(userToUpdate.uid, {
            emailVerified: true
        });

        console.log(`Email verified set to true for user: ${userToUpdate.email}`);

        return res.status(200).json({
            success: true,
            message: `Email verified für ${userToUpdate.email} wurde auf true gesetzt`,
            user: {
                uid: userToUpdate.uid,
                email: userToUpdate.email,
                emailVerified: true
            }
        });

    } catch (error) {
        console.error('Error setting email verified:', error);
        return res.status(500).json({
            error: 'Failed to update user',
            message: error.message
        });
    }
});

// ========== NOTIFY MENTOR ON ASSIGNMENT ==========
exports.notifyMentorAssignment = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { coachEmail, coachName, orderId, customerName, customerEmail, productTitle } = req.body;

        if (!coachEmail || !orderId) {
            return res.status(400).json({ error: 'coachEmail and orderId required' });
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        // Email content
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <title>Neue Session zugewiesen - Karriaro</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">
                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 40px 30px;">
                            <h1 style="color: #C9B99A; font-size: 24px; margin: 0; font-family: Georgia, serif;">Neue Session zugewiesen</h1>
                            <p style="color: #ffffff; font-size: 14px; margin: 10px 0 0;">Karriaro Mentoring</p>
                        </td>
                    </tr>
                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #333333; font-size: 16px; margin: 0 0 20px;">
                                Hallo ${coachName || 'Mentor'},
                            </p>
                            <p style="color: #333333; font-size: 16px; margin: 0 0 20px;">
                                Ihnen wurde eine neue Mentoring-Session zugewiesen:
                            </p>
                            <div style="background: #f8f9fa; border-radius: 12px; padding: 20px; margin: 20px 0;">
                                <p style="margin: 0 0 10px;"><strong>Kunde:</strong> ${customerName || 'Nicht angegeben'}</p>
                                <p style="margin: 0 0 10px;"><strong>Email:</strong> ${customerEmail || 'Nicht angegeben'}</p>
                                <p style="margin: 0;"><strong>Produkt:</strong> ${productTitle || 'Mentoring Session'}</p>
                            </div>
                            <p style="color: #333333; font-size: 16px; margin: 20px 0;">
                                Bitte loggen Sie sich in Ihr Mentor-Dashboard ein, um Ihre Verfügbarkeit zu aktualisieren und die Terminplanung zu starten.
                            </p>
                            <div style="text-align: center; margin: 30px 0;">
                                <a href="https://karriaro.de/#dashboard" style="background: #C9B99A; color: #1a1a2e; padding: 15px 30px; text-decoration: none; border-radius: 5px; font-weight: bold; display: inline-block;">Zum Dashboard</a>
                            </div>
                        </td>
                    </tr>
                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <p style="color: #999999; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} Karriaro Career Services
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        // Send email
        await transporter.sendMail({
            from: `"Karriaro" <${smtpUser.value()}>`,
            replyTo: 'kontakt@karriaro.de',
            to: coachEmail,
            subject: `Neue Mentoring-Session zugewiesen - ${customerName || 'Kunde'}`,
            html: emailHtml
        });

        console.log(`Mentor assignment notification sent to ${coachEmail} for order ${orderId}`);

        return res.status(200).json({
            success: true,
            message: 'Notification sent successfully'
        });

    } catch (error) {
        console.error('Error sending mentor notification:', error);
        return res.status(500).json({
            error: 'Failed to send notification',
            message: error.message
        });
    }
});

// ========== GET ORDER BY SESSION ID ==========
exports.getOrderBySessionId = onCall(async (request) => {
    // Check authentication
    if (!request.auth) {
        throw new Error('User must be authenticated');
    }

    const { sessionId } = request.data;

    try {
        const ordersRef = admin.firestore().collection('orders');
        const snapshot = await ordersRef
            .where('stripeSessionId', '==', sessionId)
            .where('userId', '==', request.auth.uid)
            .limit(1)
            .get();

        if (snapshot.empty) {
            return { found: false };
        }

        const doc = snapshot.docs[0];
        return {
            found: true,
            order: {
                id: doc.id,
                ...doc.data()
            }
        };
    } catch (error) {
        console.error('Error fetching order:', error);
        throw new Error('Failed to fetch order');
    }
});

// ========== DAILY.CO VIDEO INTEGRATION ==========

// Create a Daily.co meeting room for an appointment
exports.createMeetingRoom = onRequest({
    secrets: [dailyApiKey],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, appointmentDatetime, customerName, mentorName } = req.body;

        if (!orderId || !appointmentDatetime) {
            return res.status(400).json({ error: 'orderId and appointmentDatetime required' });
        }

        // Create unique room name based on order ID
        const roomName = `karriaro-${orderId.slice(-8).toLowerCase()}-${Date.now()}`;

        // Calculate expiry time (appointment time + 2 hours)
        const appointmentDate = new Date(appointmentDatetime);
        const expiryTime = Math.floor(appointmentDate.getTime() / 1000) + (2 * 60 * 60); // +2 hours
        const notBeforeTime = Math.floor(appointmentDate.getTime() / 1000) - (15 * 60); // 15 min before

        // Create Daily.co room via API
        const response = await fetch('https://api.daily.co/v1/rooms', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dailyApiKey.value()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                name: roomName,
                privacy: 'private',
                properties: {
                    exp: expiryTime,
                    nbf: notBeforeTime,
                    max_participants: 4,
                    enable_chat: true,
                    enable_screenshare: true,
                    enable_recording: 'cloud', // Optional: enable recording
                    start_video_off: false,
                    start_audio_off: false,
                    lang: 'de'
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Daily.co API error:', errorData);
            return res.status(500).json({ error: 'Failed to create meeting room', details: errorData });
        }

        const roomData = await response.json();

        // Store meeting room URL in the order
        const orderRef = admin.firestore().collection('orders').doc(orderId);
        await orderRef.update({
            meetingRoom: {
                url: roomData.url,
                roomName: roomData.name,
                createdAt: new Date(),
                expiresAt: new Date(expiryTime * 1000)
            }
        });

        console.log(`Meeting room created for order ${orderId}: ${roomData.url}`);

        return res.status(200).json({
            success: true,
            meetingUrl: roomData.url,
            roomName: roomData.name,
            expiresAt: new Date(expiryTime * 1000).toISOString()
        });

    } catch (error) {
        console.error('Error creating meeting room:', error);
        return res.status(500).json({ error: 'Failed to create meeting room', message: error.message });
    }
});

// Create meeting token for secure access
exports.createMeetingToken = onRequest({
    secrets: [dailyApiKey],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { roomName, userName, userId, isOwner } = req.body;

        if (!roomName || !userName) {
            return res.status(400).json({ error: 'roomName and userName required' });
        }

        // Token expires in 2 hours
        const expiryTime = Math.floor(Date.now() / 1000) + (2 * 60 * 60);

        // Create meeting token
        const response = await fetch('https://api.daily.co/v1/meeting-tokens', {
            method: 'POST',
            headers: {
                'Authorization': `Bearer ${dailyApiKey.value()}`,
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                properties: {
                    room_name: roomName,
                    user_name: userName,
                    user_id: userId || undefined,
                    exp: expiryTime,
                    is_owner: isOwner || false,
                    enable_screenshare: true,
                    start_video_off: false,
                    start_audio_off: false
                }
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Daily.co token API error:', errorData);
            return res.status(500).json({ error: 'Failed to create meeting token', details: errorData });
        }

        const tokenData = await response.json();

        return res.status(200).json({
            success: true,
            token: tokenData.token
        });

    } catch (error) {
        console.error('Error creating meeting token:', error);
        return res.status(500).json({ error: 'Failed to create meeting token', message: error.message });
    }
});

// ========== SEND CV QUESTIONNAIRE EMAIL ==========
exports.sendQuestionnaireEmail = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }

    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectId, customerEmail, customerName, questionnaireUrl } = req.body;

        if (!projectId || !customerEmail || !questionnaireUrl) {
            return res.status(400).json({ error: 'Missing required fields' });
        }

        // Create transporter
        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 587,
            secure: false,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        // Email content
        const emailHtml = `
<!DOCTYPE html>
<html>
<head>
    <meta charset="utf-8">
    <meta name="viewport" content="width=device-width, initial-scale=1.0">
    <title>CV-Fragebogen - Karriaro</title>
</head>
<body style="margin: 0; padding: 0; font-family: 'Segoe UI', Arial, sans-serif; background-color: #f4f4f4;">
    <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f4f4f4;">
        <tr>
            <td style="padding: 40px 20px;">
                <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="600" style="margin: 0 auto; background-color: #ffffff; border-radius: 16px; overflow: hidden; box-shadow: 0 4px 6px rgba(0,0,0,0.1);">

                    <!-- Header -->
                    <tr>
                        <td style="background: linear-gradient(135deg, #1a1a2e 0%, #16213e 100%); padding: 40px 40px 30px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%">
                                <tr>
                                    <td>
                                        <div style="width: 50px; height: 50px; background: linear-gradient(135deg, #C9B99A 0%, #B8A88A 100%); border-radius: 12px; display: inline-block; text-align: center; line-height: 50px;">
                                            <span style="color: #1a1a2e; font-size: 24px; font-weight: bold; font-family: Georgia, serif;">A</span>
                                        </div>
                                    </td>
                                </tr>
                                <tr>
                                    <td style="padding-top: 20px;">
                                        <h1 style="color: #ffffff; font-size: 28px; margin: 0; font-family: Georgia, serif;">CV-Fragebogen</h1>
                                        <p style="color: #C9B99A; font-size: 16px; margin: 10px 0 0;">Karriaro Career Services</p>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Content -->
                    <tr>
                        <td style="padding: 40px;">
                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                Guten Tag${customerName ? ' ' + customerName.split(' ')[0] : ''},
                            </p>

                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 20px;">
                                vielen Dank für Ihre Bestellung bei Karriaro. Um Ihren optimierten Lebenslauf zu erstellen, benötigen wir einige Informationen von Ihnen.
                            </p>

                            <p style="color: #333333; font-size: 16px; line-height: 1.6; margin: 0 0 30px;">
                                Bitte füllen Sie den folgenden Fragebogen aus. Der Prozess dauert etwa 15-20 Minuten und Ihre Eingaben werden automatisch gespeichert.
                            </p>

                            <!-- CTA Button -->
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" style="margin: 0 auto;">
                                <tr>
                                    <td style="border-radius: 8px; background: linear-gradient(135deg, #C9B99A 0%, #B8A88A 100%);">
                                        <a href="${questionnaireUrl}" target="_blank" style="display: inline-block; padding: 16px 40px; font-size: 16px; font-weight: 600; color: #1a1a2e; text-decoration: none;">
                                            Fragebogen ausfüllen →
                                        </a>
                                    </td>
                                </tr>
                            </table>

                            <p style="color: #666666; font-size: 14px; line-height: 1.6; margin: 30px 0 0; text-align: center;">
                                Oder kopieren Sie diesen Link:<br>
                                <a href="${questionnaireUrl}" style="color: #C9B99A; word-break: break-all;">${questionnaireUrl}</a>
                            </p>
                        </td>
                    </tr>

                    <!-- Info Box -->
                    <tr>
                        <td style="padding: 0 40px 40px;">
                            <table role="presentation" cellspacing="0" cellpadding="0" border="0" width="100%" style="background-color: #f8f9fa; border-radius: 12px; padding: 20px;">
                                <tr>
                                    <td style="padding: 20px;">
                                        <p style="color: #333333; font-size: 14px; font-weight: 600; margin: 0 0 10px;">
                                            📋 Was wir benötigen:
                                        </p>
                                        <ul style="color: #666666; font-size: 14px; line-height: 1.8; margin: 0; padding-left: 20px;">
                                            <li>Persönliche Daten & Karriereziele</li>
                                            <li>Berufserfahrung & Ausbildung</li>
                                            <li>Skills & Qualifikationen</li>
                                            <li>Optional: Aktueller Lebenslauf & Stellenausschreibung</li>
                                        </ul>
                                    </td>
                                </tr>
                            </table>
                        </td>
                    </tr>

                    <!-- Footer -->
                    <tr>
                        <td style="background-color: #1a1a2e; padding: 30px 40px; text-align: center;">
                            <p style="color: #999999; font-size: 12px; margin: 0;">
                                © ${new Date().getFullYear()} Karriaro Career Services
                            </p>
                            <p style="color: #666666; font-size: 11px; margin: 10px 0 0;">
                                Diese E-Mail wurde automatisch generiert. Bei Fragen kontaktieren Sie uns unter kontakt@karriaro.de
                            </p>
                        </td>
                    </tr>
                </table>
            </td>
        </tr>
    </table>
</body>
</html>
        `;

        // Send email
        await transporter.sendMail({
            from: `"Karriaro" <${smtpUser.value()}>`,
            replyTo: 'kontakt@karriaro.de',
            to: customerEmail,
            subject: 'Ihr CV-Fragebogen - Karriaro',
            html: emailHtml
        });

        console.log(`Questionnaire email sent to ${customerEmail} for project ${projectId}`);

        return res.status(200).json({
            success: true,
            message: 'Email sent successfully'
        });

    } catch (error) {
        console.error('Error sending questionnaire email:', error);
        return res.status(500).json({
            error: 'Failed to send email',
            message: error.message
        });
    }
});

// ========== GENERATE CV CONTENT WITH CLAUDE API ==========
exports.generateCvContent = onRequest({
    secrets: [claudeApiKey],
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '512MiB'
}, async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }

    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            projectId,
            templateType,
            language,
            // New design options
            colorScheme = 'classic',
            layout = 'two-column',
            includeCover = false,
            includePhoto = false,
            tone = 'professional',
            focusAreas = [],
            // Custom PDF template info
            isCustomPdf = false,
            pdfFile = null
        } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        // Load CV project data from Firestore
        const projectRef = admin.firestore().collection('cvProjects').doc(projectId);
        const projectDoc = await projectRef.get();

        if (!projectDoc.exists) {
            return res.status(404).json({ error: 'CV Project not found' });
        }

        const projectData = projectDoc.data();
        const questionnaire = projectData.questionnaire || {};
        const documents = projectData.documents || {};

        // Build context from questionnaire
        const personalInfo = questionnaire.personal || {};
        const experience = questionnaire.experience || [];
        const education = questionnaire.education || [];
        const skills = questionnaire.skills || {};
        const additional = questionnaire.additional || {};

        // Template-specific requirements with detailed examples
        const templateExamples = {
            minimalist: {
                description: 'Clean, modern format for Young Professionals (0-5 Jahre Erfahrung). Fokus auf Potenzial und erste Erfolge.',
                summaryExample: 'Ambitionierter Marketing-Spezialist mit 3 Jahren Erfahrung in der Entwicklung datengetriebener Kampagnen. Nachgewiesene Steigerung der Conversion-Rate um 45% durch A/B-Testing und Kundenanalyse. Expertise in Google Analytics, HubSpot und Social Media Marketing.',
                achievementExamples: [
                    'Steigerung der Social-Media-Reichweite um 150% innerhalb von 6 Monaten durch gezielte Content-Strategie',
                    'Einführung eines neuen CRM-Systems, das die Kundenzufriedenheit um 20% erhöhte',
                    'Reduzierung der Bearbeitungszeit um 30% durch Prozessoptimierung'
                ]
            },
            creative: {
                description: 'Modern und kreativ für Marketing, Design und Tech-Rollen. Betont Innovation und kreative Problemlösung.',
                summaryExample: 'Kreativer UX Designer mit Leidenschaft für nutzerzentrierte Produktentwicklung. 5 Jahre Erfahrung in der Gestaltung digitaler Erlebnisse für Fortune-500-Unternehmen. Gewinner des Red Dot Design Award 2023.',
                achievementExamples: [
                    'Redesign der Unternehmens-App führte zu 40% höherer Nutzerengagement und 25% weniger Support-Anfragen',
                    'Entwicklung eines Design-Systems, das die Entwicklungszeit neuer Features um 60% verkürzte',
                    'Leitung eines cross-funktionalen Teams von 8 Designern bei der Neugestaltung der E-Commerce-Plattform'
                ]
            },
            corporate: {
                description: 'Klassisch-professionell für Senior Professionals (5-15 Jahre). Umfassende Darstellung von Verantwortung und Ergebnissen.',
                summaryExample: 'Erfahrener Finanzmanager mit über 10 Jahren Expertise in der strategischen Finanzplanung und Budgetverantwortung bis €50M. Nachgewiesene Erfolgsbilanz in der Optimierung von Finanzprozessen und Kostenreduktion. MBA-Abschluss und CFA-Zertifizierung.',
                achievementExamples: [
                    '20-prozentige Senkung der Betriebskosten durch Implementierung von Lean-Management-Prinzipien',
                    'Jährliche Steigerung der Neukundenaufträge um 15% durch strategische Vertriebspartnerschaften',
                    'Erfolgreiche Integration zweier Tochtergesellschaften mit Synergieeffekten von €2,5M jährlich'
                ]
            },
            executive: {
                description: 'Executive Brief für C-Suite und Direktoren. Fokus auf strategische Vision, P&L-Verantwortung und transformative Führung.',
                summaryExample: 'Visionärer Geschäftsführer mit 20+ Jahren Erfahrung in der Transformation mittelständischer Unternehmen. Nachgewiesene P&L-Verantwortung bis €500M und erfolgreiche Führung von 500+ Mitarbeitern. Spezialisiert auf digitale Transformation und internationales Wachstum.',
                achievementExamples: [
                    'Steigerung des Unternehmensumsatzes von €150M auf €450M innerhalb von 5 Jahren',
                    'Erfolgreiche Durchführung eines IPO mit Bewertung von €800M',
                    'Transformation der Organisation: Reduktion der Time-to-Market um 62% bei gleichzeitiger Kostensenkung von 25%',
                    'Aufbau und Führung eines internationalen Teams von 150+ Mitarbeitern in 8 Ländern'
                ]
            },
            brand: {
                description: 'Personal Branding für Thought Leader. Betont einzigartigen Mehrwert, Expertise und Vordenkerrolle.',
                summaryExample: 'Anerkannter Experte für digitale Transformation und Keynote-Speaker mit über 100 Vorträgen auf internationalen Konferenzen. Autor von "Digital Leadership" (Bestseller 2023). Berater für DAX-30-Unternehmen in Fragen der Innovationsstrategie.',
                achievementExamples: [
                    'Entwicklung einer preisgekrönten Innovationsmethodik, die in 50+ Unternehmen implementiert wurde',
                    'Aufbau einer LinkedIn-Community von 75.000+ Followern als Thought Leader für Digital Leadership',
                    'Beratung von 15 DAX-Unternehmen bei der strategischen Neuausrichtung mit durchschnittlicher Umsatzsteigerung von 30%'
                ]
            }
        };

        const selectedTemplate = templateExamples[templateType] || templateExamples.corporate;

        // Tone descriptions for different writing styles
        const toneDescriptions = {
            professional: 'Sachlich-professionell, fokussiert auf Fakten und Ergebnisse',
            confident: 'Selbstbewusst und durchsetzungsstark, betont Führungsqualitäten',
            dynamic: 'Dynamisch und modern, betont Innovation und Agilität',
            executive: 'Authorativ und visionär, perfekt für C-Level-Positionen'
        };

        // Build the enhanced prompt for Claude
        const prompt = `Du bist ein Premium-CV-Experte bei Karriaro, einem exklusiven Karriereservice für Führungskräfte. Du erstellst Lebensläufe auf dem Niveau professioneller CV-Writer, die €500-2000 pro CV berechnen.

DEINE AUFGABE:
Erstelle einen perfekt optimierten, professionellen Lebenslauf${includeCover ? ' MIT ANSCHREIBEN' : ''}, der sofort beeindruckt.

=== DESIGN-EINSTELLUNGEN ===
TEMPLATE-TYP: ${templateType || 'corporate'}
TEMPLATE-BESCHREIBUNG: ${selectedTemplate.description}
FARBSCHEMA: ${colorScheme} (beeinflusst Struktur und Ton)
LAYOUT: ${layout === 'single-column' ? 'Eine Spalte (klassisch)' : layout === 'two-column' ? 'Zwei Spalten (modern)' : 'Sidebar (kompakt)'}
FOTO-PLATZHALTER: ${includePhoto ? 'Ja - Platzhalter für Bewerbungsfoto einplanen' : 'Nein'}
SPRACHE: ${language || 'Deutsch'}
TON/STIL: ${toneDescriptions[tone] || toneDescriptions.professional}
${focusAreas.length > 0 ? `FOKUS-BEREICHE (besonders betonen): ${focusAreas.join(', ')}` : ''}

=== BEISPIELE FÜR DIESEN TEMPLATE-TYP ===

BEISPIEL-SUMMARY (so sollte es klingen):
"${selectedTemplate.summaryExample}"

BEISPIEL-ACHIEVEMENTS (diese Qualität erwarten wir):
${selectedTemplate.achievementExamples.map((a, i) => `${i + 1}. "${a}"`).join('\n')}

=== KANDIDATEN-DATEN ===

PERSÖNLICHE DATEN:
- Name: ${personalInfo.fullName || 'Nicht angegeben'}
- E-Mail: ${personalInfo.email || ''}
- Telefon: ${personalInfo.phone || ''}
- Standort: ${personalInfo.location || ''}
- LinkedIn: ${personalInfo.linkedin || ''}
- Website: ${personalInfo.website || ''}
- Gewünschte Position: ${personalInfo.targetRole || ''}
- Karriereziel: ${personalInfo.careerGoal || ''}

BERUFSERFAHRUNG:
${experience.length > 0 ? experience.map((exp, i) => `
Position ${i + 1}:
- Firma: ${exp.company || ''}
- Position: ${exp.role || ''}
- Zeitraum: ${exp.startDate || ''} - ${exp.endDate || 'heute'}
- Beschreibung: ${exp.description || ''}
- Erfolge: ${(exp.achievements || []).join(', ') || 'Keine angegeben'}
`).join('\n') : 'Keine Berufserfahrung angegeben'}

AUSBILDUNG:
${education.length > 0 ? education.map((edu, i) => `
Ausbildung ${i + 1}:
- Institution: ${edu.institution || ''}
- Abschluss: ${edu.degree || ''}
- Fachrichtung: ${edu.field || ''}
- Zeitraum: ${edu.startDate || ''} - ${edu.endDate || ''}
- Note: ${edu.grade || ''}
- Highlights: ${edu.highlights || ''}
`).join('\n') : 'Keine Ausbildung angegeben'}

SKILLS:
- Technische Skills: ${(skills.technical || []).join(', ') || 'Keine angegeben'}
- Soft Skills: ${(skills.soft || []).join(', ') || 'Keine angegeben'}
- Sprachen: ${(skills.languages || []).map(l => `${l.language} (${l.level})`).join(', ') || 'Keine angegeben'}
- Zertifikate: ${(skills.certifications || []).join(', ') || 'Keine angegeben'}

ZUSÄTZLICHE INFORMATIONEN:
- Eigene Zusammenfassung: ${additional.summary || ''}
- Top-Stärken: ${additional.strengths || ''}
- Ziel-Branchen: ${(additional.industries || []).join(', ') || ''}

${documents.existingCv?.extractedText ? `
AKTUELLER LEBENSLAUF (extrahierter Text):
${documents.existingCv.extractedText.substring(0, 4000)}
` : ''}

${documents.targetJob?.extractedText ? `
ZIELSTELLE (Stellenbeschreibung):
${documents.targetJob.extractedText.substring(0, 2500)}
` : ''}

=== PREMIUM-QUALITÄTSSTANDARDS ===

1. POWER-VERBEN für Achievements (IMMER verwenden):
   - Deutsch: Steigerte, Reduzierte, Implementierte, Führte, Entwickelte, Optimierte, Transformierte, Etablierte, Verhandelte, Akquirierte
   - Englisch: Spearheaded, Orchestrated, Championed, Accelerated, Pioneered, Streamlined, Negotiated, Cultivated

2. ACHIEVEMENT-FORMEL (Action + Ergebnis + Metrik + Kontext):
   SCHWACH: "Verantwortlich für Vertrieb"
   STARK: "Steigerung des Vertriebsumsatzes um 35% (€2,4M) durch Einführung eines Key-Account-Programms mit 12 Großkunden"

3. QUANTIFIZIERUNG (IMMER mit Zahlen):
   - Umsatz/Budget in € oder $
   - Prozentuale Verbesserungen
   - Teamgrößen (z.B. "Führung von 25 Mitarbeitern")
   - Zeitersparnisse (z.B. "Reduktion um 40%")
   - Anzahl Projekte/Kunden/Länder

4. ATS-KEYWORDS (aus Zielstelle extrahieren):
   - Strategische Planung, Change Management, P&L-Verantwortung
   - Digital Transformation, Stakeholder Management
   - Cross-funktionale Führung, Business Development

5. SUMMARY-STRUKTUR (3-4 kraftvolle Sätze):
   Satz 1: Titel + Jahre Erfahrung + Hauptexpertise
   Satz 2: Größter quantifizierbarer Erfolg
   Satz 3: Kernkompetenzen/Spezialisierung
   Satz 4 (optional): Einzigartiger Mehrwert/USP

6. EXECUTIVE-FOKUS (bei C-Level/Director):
   - P&L-Verantwortung mit Zahlen
   - Strategische Initiativen
   - Board/Stakeholder-Kommunikation
   - M&A, IPO, Internationalisierung
   - Digitale Transformation

AUSGABEFORMAT:
Antworte AUSSCHLIESSLICH mit einem validen JSON-Objekt (keine Markdown-Codeblöcke, kein zusätzlicher Text):
{
  "personal": {
    "fullName": "Vollständiger Name",
    "title": "Professioneller Titel (z.B. 'Chief Financial Officer | Strategische Finanzführung')",
    "email": "email@beispiel.de",
    "phone": "+49 170 1234567",
    "location": "München, Deutschland",
    "linkedin": "linkedin.com/in/name",
    "website": "website.de"${includePhoto ? ',\n    "photoPlaceholder": true' : ''}
  },
  "summary": "Kraftvolles Executive Summary nach der 3-4 Satz Struktur. Mit konkreten Zahlen und Erfolgen.",
  "experience": [
    {
      "company": "Firmenname",
      "role": "Exakte Positionsbezeichnung",
      "period": "01/2020 - heute",
      "location": "Stadt, Deutschland",
      "description": "Eine Zeile Kernverantwortung",
      "achievements": [
        "Quantifizierter Erfolg 1 mit Power-Verb und Zahlen",
        "Quantifizierter Erfolg 2 mit messbarem Impact",
        "Quantifizierter Erfolg 3 mit Kontext",
        "Quantifizierter Erfolg 4 (bei Senior-Rollen)"
      ]
    }
  ],
  "education": [
    {
      "institution": "Universität/Hochschule",
      "degree": "Abschlussbezeichnung",
      "field": "Studienrichtung",
      "period": "2010 - 2014",
      "grade": "Note (falls gut)",
      "highlights": "Relevante Auszeichnungen/Stipendien"
    }
  ],
  "skills": {
    "technical": ["Skill 1", "Skill 2", "Skill 3"],
    "soft": ["Leadership", "Strategisches Denken", "Change Management"],
    "languages": [{"language": "Deutsch", "level": "Muttersprache"}, {"language": "Englisch", "level": "Verhandlungssicher"}],
    "certifications": ["Relevante Zertifizierung 1", "Zertifizierung 2"]
  },
  "expertise": ["Kernkompetenz 1", "Kernkompetenz 2", "Kernkompetenz 3", "Kernkompetenz 4", "Kernkompetenz 5"]${includeCover ? `,
  "coverLetter": {
    "greeting": "Sehr geehrte Damen und Herren,",
    "opening": "Kraftvoller Einstieg, der Bezug zur Stelle nimmt und Interesse weckt (2-3 Sätze)",
    "body": "Hauptteil mit konkreten Erfolgen und Mehrwert für das Unternehmen (3-4 Sätze). Zeige Bezug zu den Anforderungen.",
    "closing": "Abschluss mit Call-to-Action und Gesprächswunsch (2 Sätze)",
    "signature": "Mit freundlichen Grüßen"
  }` : ''}
}`;

        console.log(`Generating CV for project ${projectId} with template ${templateType}`);

        // Call Claude API
        const response = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: {
                'x-api-key': claudeApiKey.value(),
                'anthropic-version': '2023-06-01',
                'content-type': 'application/json'
            },
            body: JSON.stringify({
                model: SONNET_MODEL,
                max_tokens: 4096,
                messages: [{ role: 'user', content: prompt }]
            })
        });

        if (!response.ok) {
            const errorData = await response.json();
            console.error('Claude API error:', errorData);
            return res.status(500).json({ error: 'Claude API error', details: errorData });
        }

        const claudeResponse = await response.json();
        const responseText = claudeResponse.content[0].text;

        // Parse the JSON response from Claude
        let generatedCvData;
        try {
            // Try to extract JSON from the response (in case Claude adds extra text)
            const jsonMatch = responseText.match(/\{[\s\S]*\}/);
            if (jsonMatch) {
                generatedCvData = JSON.parse(jsonMatch[0]);
            } else {
                throw new Error('No JSON found in response');
            }
        } catch (parseError) {
            console.error('Failed to parse Claude response:', parseError);
            console.error('Response text:', responseText);
            return res.status(500).json({
                error: 'Failed to parse CV data',
                message: parseError.message,
                rawResponse: responseText.substring(0, 500)
            });
        }

        // Update the CV project with generated data
        await projectRef.update({
            generatedCv: {
                templateType: templateType || 'corporate',
                language: language || 'Deutsch',
                // Store all design options
                colorScheme: colorScheme,
                layout: layout,
                includeCover: includeCover,
                includePhoto: includePhoto,
                tone: tone,
                focusAreas: focusAreas,
                // Custom PDF template info
                isCustomPdf: isCustomPdf,
                pdfFile: pdfFile,
                // Generated content
                data: generatedCvData,
                generatedAt: admin.firestore.FieldValue.serverTimestamp(),
                model: SONNET_MODEL
            },
            status: 'ready',
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`CV generated successfully for project ${projectId} with design options: ${JSON.stringify({ colorScheme, layout, includeCover, includePhoto, tone })}`);

        return res.status(200).json({
            success: true,
            data: generatedCvData,
            templateType: templateType || 'corporate'
        });

    } catch (error) {
        console.error('Error generating CV:', error);
        return res.status(500).json({
            error: 'Failed to generate CV',
            message: error.message
        });
    }
});

// ========== EXTRACT TEXT FROM DOCUMENT ==========
exports.extractDocumentText = onRequest({
    invoker: 'public',
    timeoutSeconds: 60,
    memory: '512MiB'
}, async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }

    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectId, documentType, fileUrl, fileName } = req.body;

        if (!projectId || !documentType || !fileUrl) {
            return res.status(400).json({ error: 'projectId, documentType, and fileUrl are required' });
        }

        console.log(`Extracting text from ${fileName} for project ${projectId}`);

        let extractedText = '';
        const fileExtension = fileName?.toLowerCase().split('.').pop() || '';

        // Download the file
        const fileResponse = await fetch(fileUrl);
        if (!fileResponse.ok) {
            throw new Error('Failed to download file');
        }
        const fileBuffer = Buffer.from(await fileResponse.arrayBuffer());

        // Extract text based on file type
        if (fileExtension === 'pdf') {
            const pdfParse = require('pdf-parse');
            const pdfData = await pdfParse(fileBuffer);
            extractedText = pdfData.text;
        } else if (fileExtension === 'docx' || fileExtension === 'doc') {
            const mammoth = require('mammoth');
            const result = await mammoth.extractRawText({ buffer: fileBuffer });
            extractedText = result.value;
        } else if (fileExtension === 'txt') {
            extractedText = fileBuffer.toString('utf-8');
        } else {
            return res.status(400).json({ error: 'Unsupported file format. Supported: PDF, DOCX, DOC, TXT' });
        }

        // Clean up the extracted text
        extractedText = extractedText
            .replace(/\s+/g, ' ')
            .replace(/\n{3,}/g, '\n\n')
            .trim();

        // Update the CV project with extracted text
        const projectRef = admin.firestore().collection('cvProjects').doc(projectId);
        const updateField = `documents.${documentType}.extractedText`;

        await projectRef.update({
            [updateField]: extractedText.substring(0, 10000), // Limit to 10k chars
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`Text extracted successfully: ${extractedText.length} characters`);

        return res.status(200).json({
            success: true,
            textLength: extractedText.length,
            preview: extractedText.substring(0, 500)
        });

    } catch (error) {
        console.error('Error extracting document text:', error);
        return res.status(500).json({
            error: 'Failed to extract text',
            message: error.message
        });
    }
});

// ========== GENERATE CV DOCUMENT (WORD & PDF) ==========
exports.generateCvDocument = onRequest({
    invoker: 'public',
    timeoutSeconds: 120,
    memory: '1GiB'
}, async (req, res) => {
    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }

    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { projectId, format = 'docx', templateStyle = 'executive' } = req.body;

        if (!projectId) {
            return res.status(400).json({ error: 'projectId is required' });
        }

        // Load CV project data from Firestore
        const projectRef = admin.firestore().collection('cvProjects').doc(projectId);
        const projectDoc = await projectRef.get();

        if (!projectDoc.exists) {
            return res.status(404).json({ error: 'CV Project not found' });
        }

        const projectData = projectDoc.data();
        const cvData = projectData.generatedCv?.data;

        if (!cvData) {
            return res.status(400).json({ error: 'No generated CV data found. Please generate CV content first.' });
        }

        console.log(`Generating ${format.toUpperCase()} document for project ${projectId} with style ${templateStyle}`);

        let documentBuffer;
        let contentType;
        let fileExtension;

        if (format === 'docx') {
            documentBuffer = await generateWordDocument(cvData, templateStyle, projectData.generatedCv);
            contentType = 'application/vnd.openxmlformats-officedocument.wordprocessingml.document';
            fileExtension = 'docx';
        } else if (format === 'pdf') {
            // Check if this is a custom PDF template
            const isCustomPdf = projectData.generatedCv?.isCustomPdf || false;
            const pdfFile = projectData.generatedCv?.pdfFile || null;

            if (isCustomPdf && pdfFile) {
                // Use custom PDF template with pdfme
                documentBuffer = await generatePdfWithCustomTemplate(cvData, templateStyle, pdfFile);
            } else {
                // Use Pdfme for template-based PDF generation (new method)
                // Falls back to PDFKit for unsupported templates
                const pdfmeTemplates = ['schwarz-beige-modern', 'green-yellow-modern', 'minimalist', 'corporate'];
                if (pdfmeTemplates.includes(templateStyle)) {
                    documentBuffer = await generatePdfWithPdfme(cvData, templateStyle);
                } else {
                    documentBuffer = await generatePdfDocument(cvData, templateStyle, projectData.generatedCv);
                }
            }
            contentType = 'application/pdf';
            fileExtension = 'pdf';
        } else {
            return res.status(400).json({ error: 'Invalid format. Supported: docx, pdf' });
        }

        // Upload to Firebase Storage
        const bucket = admin.storage().bucket();
        const fileName = `cv-exports/${projectId}/${cvData.personal?.fullName?.replace(/\s+/g, '_') || 'CV'}_${templateStyle}_${Date.now()}.${fileExtension}`;
        const file = bucket.file(fileName);

        await file.save(documentBuffer, {
            metadata: {
                contentType: contentType,
                metadata: {
                    projectId: projectId,
                    templateStyle: templateStyle,
                    generatedAt: new Date().toISOString()
                }
            },
            public: true  // Make file publicly accessible
        });

        // Use public URL instead of signed URL (avoids IAM permission issues)
        const publicUrl = `https://storage.googleapis.com/${bucket.name}/${fileName}`;

        // Update project with export info
        await projectRef.update({
            [`exportedDocuments.${format}`]: {
                url: publicUrl,
                fileName: fileName,
                templateStyle: templateStyle,
                exportedAt: admin.firestore.FieldValue.serverTimestamp()
            },
            updatedAt: admin.firestore.FieldValue.serverTimestamp()
        });

        console.log(`${format.toUpperCase()} document generated successfully for project ${projectId}`);

        return res.status(200).json({
            success: true,
            downloadUrl: publicUrl,
            fileName: fileName,
            format: format
        });

    } catch (error) {
        console.error('Error generating CV document:', error);
        return res.status(500).json({
            error: 'Failed to generate document',
            message: error.message
        });
    }
});

// ========== WORD DOCUMENT GENERATOR ==========
async function generateWordDocument(cvData, templateStyle, generatedCvOptions) {
    const { Document, Paragraph, TextRun, HeadingLevel, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType, Header, Footer, PageNumber, NumberFormat, convertInchesToTwip, ImageRun } = docx;

    // Route to specific template generators
    if (templateStyle === 'schwarz-beige-modern' || templateStyle === 'canva-executive') {
        return generateSchwarzBeigeModernTemplate(cvData, generatedCvOptions);
    } else if (templateStyle === 'green-yellow-modern' || templateStyle === 'canva-creative') {
        return generateGreenYellowModernTemplate(cvData, generatedCvOptions);
    }

    // Default template (fallback)
    // Canva-style color schemes based on template style (without # prefix for docx)
    const colorSchemes = {
        // Original schemes
        executive: { primary: '1A365D', secondary: 'C9B99A', accent: '2D3748', text: '1A202C', lightBg: 'F7FAFC' },
        modern: { primary: '2563EB', secondary: '3B82F6', accent: '1E40AF', text: '1F2937', lightBg: 'EFF6FF' },
        classic: { primary: '1F2937', secondary: '6B7280', accent: '374151', text: '111827', lightBg: 'F9FAFB' },
        creative: { primary: '7C3AED', secondary: '8B5CF6', accent: '6D28D9', text: '1F2937', lightBg: 'F5F3FF' },
        minimal: { primary: '000000', secondary: '4B5563', accent: '1F2937', text: '111827', lightBg: 'FFFFFF' },
        // New Canva-style templates
        'elegant-navy': { primary: '1e3a5f', secondary: 'c9a227', accent: '4a6fa5', text: '333333', lightBg: 'f5f5f5' },
        'modern-minimal': { primary: '000000', secondary: '666666', accent: '999999', text: '333333', lightBg: 'ffffff' },
        'creative-bold': { primary: 'e63946', secondary: '1d3557', accent: 'a8dadc', text: '1d3557', lightBg: 'f1faee' },
        'corporate-classic': { primary: '2c3e50', secondary: '3498db', accent: '95a5a6', text: '2c3e50', lightBg: 'ecf0f1' },
        'executive-gold': { primary: '1a1a2e', secondary: 'c9b99a', accent: '4a4a6a', text: '1a1a2e', lightBg: 'f8f6f3' },
        'tech-modern': { primary: '6366f1', secondary: '818cf8', accent: 'a5b4fc', text: '1e293b', lightBg: 'f8fafc' },
        'elegant-burgundy': { primary: '722f37', secondary: 'd4a574', accent: '9c6644', text: '3d2c2e', lightBg: 'faf7f5' },
        'swiss-clean': { primary: '333333', secondary: 'e74c3c', accent: '7f8c8d', text: '333333', lightBg: 'ffffff' }
    };

    const colors = colorSchemes[templateStyle] || colorSchemes['elegant-navy'];
    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const expertise = cvData.expertise || [];

    // Create document sections
    const children = [];

    // === HEADER SECTION ===
    // Name
    children.push(new Paragraph({
        children: [
            new TextRun({
                text: personal.fullName || 'Name',
                bold: true,
                size: 56,
                color: colors.primary,
                font: 'Georgia'
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { after: 100 }
    }));

    // Title
    if (personal.title) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: personal.title,
                    size: 24,
                    color: colors.secondary,
                    font: 'Arial'
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 200 }
        }));
    }

    // Contact info line
    const contactParts = [];
    if (personal.email) contactParts.push(personal.email);
    if (personal.phone) contactParts.push(personal.phone);
    if (personal.location) contactParts.push(personal.location);

    if (contactParts.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: contactParts.join('  |  '),
                    size: 20,
                    color: colors.accent,
                    font: 'Arial'
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 100 }
        }));
    }

    // LinkedIn and Website
    const links = [];
    if (personal.linkedin) links.push(personal.linkedin);
    if (personal.website) links.push(personal.website);

    if (links.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: links.join('  |  '),
                    size: 18,
                    color: colors.secondary,
                    font: 'Arial'
                })
            ],
            alignment: AlignmentType.CENTER,
            spacing: { after: 400 }
        }));
    }

    // Divider line
    children.push(new Paragraph({
        border: {
            bottom: { color: colors.secondary, size: 12, style: BorderStyle.SINGLE }
        },
        spacing: { after: 400 }
    }));

    // === SUMMARY SECTION ===
    if (cvData.summary) {
        children.push(createSectionHeading('PROFIL', colors));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: cvData.summary,
                    size: 22,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 400 },
            alignment: AlignmentType.JUSTIFIED
        }));
    }

    // === EXPERTISE SECTION ===
    if (expertise.length > 0) {
        children.push(createSectionHeading('KERNKOMPETENZEN', colors));
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: expertise.join('  •  '),
                    size: 20,
                    color: colors.accent,
                    font: 'Arial'
                })
            ],
            spacing: { after: 400 },
            alignment: AlignmentType.CENTER
        }));
    }

    // === EXPERIENCE SECTION ===
    if (experience.length > 0) {
        children.push(createSectionHeading('BERUFSERFAHRUNG', colors));

        experience.forEach((exp, index) => {
            // Company and Role
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: exp.role || 'Position',
                        bold: true,
                        size: 24,
                        color: colors.primary,
                        font: 'Arial'
                    })
                ],
                spacing: { before: index > 0 ? 300 : 0, after: 50 }
            }));

            // Company, Location, Period
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: exp.company || '',
                        bold: true,
                        size: 20,
                        color: colors.text,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: exp.location ? `  |  ${exp.location}` : '',
                        size: 20,
                        color: colors.accent,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: `  |  ${exp.period || ''}`,
                        size: 20,
                        color: colors.secondary,
                        font: 'Arial'
                    })
                ],
                spacing: { after: 100 }
            }));

            // Description
            if (exp.description) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: exp.description,
                            italics: true,
                            size: 20,
                            color: colors.accent,
                            font: 'Arial'
                        })
                    ],
                    spacing: { after: 100 }
                }));
            }

            // Achievements
            if (exp.achievements && exp.achievements.length > 0) {
                exp.achievements.forEach(achievement => {
                    children.push(new Paragraph({
                        children: [
                            new TextRun({
                                text: '• ',
                                bold: true,
                                size: 20,
                                color: colors.secondary,
                                font: 'Arial'
                            }),
                            new TextRun({
                                text: achievement,
                                size: 20,
                                color: colors.text,
                                font: 'Arial'
                            })
                        ],
                        spacing: { after: 50 },
                        indent: { left: 360 }
                    }));
                });
            }
        });

        children.push(new Paragraph({ spacing: { after: 200 } }));
    }

    // === EDUCATION SECTION ===
    if (education.length > 0) {
        children.push(createSectionHeading('AUSBILDUNG', colors));

        education.forEach((edu, index) => {
            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: `${edu.degree || ''} ${edu.field ? `in ${edu.field}` : ''}`,
                        bold: true,
                        size: 22,
                        color: colors.primary,
                        font: 'Arial'
                    })
                ],
                spacing: { before: index > 0 ? 200 : 0, after: 50 }
            }));

            children.push(new Paragraph({
                children: [
                    new TextRun({
                        text: edu.institution || '',
                        size: 20,
                        color: colors.text,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: `  |  ${edu.period || ''}`,
                        size: 20,
                        color: colors.secondary,
                        font: 'Arial'
                    }),
                    new TextRun({
                        text: edu.grade ? `  |  Note: ${edu.grade}` : '',
                        size: 20,
                        color: colors.accent,
                        font: 'Arial'
                    })
                ],
                spacing: { after: 50 }
            }));

            if (edu.highlights) {
                children.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: edu.highlights,
                            italics: true,
                            size: 18,
                            color: colors.accent,
                            font: 'Arial'
                        })
                    ],
                    spacing: { after: 100 }
                }));
            }
        });

        children.push(new Paragraph({ spacing: { after: 200 } }));
    }

    // === SKILLS SECTION ===
    children.push(createSectionHeading('KENNTNISSE & FÄHIGKEITEN', colors));

    // Technical Skills
    if (skills.technical && skills.technical.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Fachkenntnisse: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: skills.technical.join(', '),
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 100 }
        }));
    }

    // Soft Skills
    if (skills.soft && skills.soft.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Soft Skills: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: skills.soft.join(', '),
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 100 }
        }));
    }

    // Languages
    if (skills.languages && skills.languages.length > 0) {
        const langString = skills.languages.map(l => `${l.language} (${l.level})`).join(', ');
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Sprachen: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: langString,
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 100 }
        }));
    }

    // Certifications
    if (skills.certifications && skills.certifications.length > 0) {
        children.push(new Paragraph({
            children: [
                new TextRun({
                    text: 'Zertifizierungen: ',
                    bold: true,
                    size: 20,
                    color: colors.primary,
                    font: 'Arial'
                }),
                new TextRun({
                    text: skills.certifications.join(', '),
                    size: 20,
                    color: colors.text,
                    font: 'Arial'
                })
            ],
            spacing: { after: 200 }
        }));
    }

    // Create the document
    const doc = new Document({
        creator: 'Karriaro',
        title: `CV - ${personal.fullName || 'Lebenslauf'}`,
        description: 'Professional CV generated by Karriaro',
        styles: {
            default: {
                document: {
                    run: {
                        font: 'Arial',
                        size: 22
                    }
                }
            }
        },
        sections: [{
            properties: {
                page: {
                    margin: {
                        top: 1440,    // 1 inch
                        right: 1440,
                        bottom: 1440,
                        left: 1440
                    }
                }
            },
            children: children
        }]
    });

    // Generate buffer
    return await docx.Packer.toBuffer(doc);

    // Helper function for section headings
    function createSectionHeading(title, colors) {
        return new Paragraph({
            children: [
                new TextRun({
                    text: title,
                    bold: true,
                    size: 26,
                    color: colors.primary,
                    font: 'Georgia',
                    allCaps: true
                })
            ],
            border: {
                bottom: { color: colors.secondary, size: 6, style: BorderStyle.SINGLE }
            },
            spacing: { before: 400, after: 200 }
        });
    }
}

// ========== PDF DOCUMENT GENERATOR ==========
async function generatePdfDocument(cvData, templateStyle, generatedCvOptions) {
    return new Promise((resolve, reject) => {
        const doc = new PDFDocument({
            size: 'A4',
            margins: { top: 50, bottom: 50, left: 50, right: 50 },
            bufferPages: true
        });

        const chunks = [];
        doc.on('data', chunk => chunks.push(chunk));
        doc.on('end', () => resolve(Buffer.concat(chunks)));
        doc.on('error', reject);

        // Canva-style color schemes (with # prefix for PDFKit)
        const colorSchemes = {
            // Original schemes
            executive: { primary: '#1A365D', secondary: '#C9B99A', accent: '#2D3748', text: '#1A202C' },
            modern: { primary: '#2563EB', secondary: '#3B82F6', accent: '#1E40AF', text: '#1F2937' },
            classic: { primary: '#1F2937', secondary: '#6B7280', accent: '#374151', text: '#111827' },
            creative: { primary: '#7C3AED', secondary: '#8B5CF6', accent: '#6D28D9', text: '#1F2937' },
            minimal: { primary: '#000000', secondary: '#4B5563', accent: '#1F2937', text: '#111827' },
            // New Canva-style templates
            'elegant-navy': { primary: '#1e3a5f', secondary: '#c9a227', accent: '#4a6fa5', text: '#333333' },
            'modern-minimal': { primary: '#000000', secondary: '#666666', accent: '#999999', text: '#333333' },
            'creative-bold': { primary: '#e63946', secondary: '#1d3557', accent: '#a8dadc', text: '#1d3557' },
            'corporate-classic': { primary: '#2c3e50', secondary: '#3498db', accent: '#95a5a6', text: '#2c3e50' },
            'executive-gold': { primary: '#1a1a2e', secondary: '#c9b99a', accent: '#4a4a6a', text: '#1a1a2e' },
            'tech-modern': { primary: '#6366f1', secondary: '#818cf8', accent: '#a5b4fc', text: '#1e293b' },
            'elegant-burgundy': { primary: '#722f37', secondary: '#d4a574', accent: '#9c6644', text: '#3d2c2e' },
            'swiss-clean': { primary: '#333333', secondary: '#e74c3c', accent: '#7f8c8d', text: '#333333' }
        };

        const colors = colorSchemes[templateStyle] || colorSchemes['elegant-navy'];
        const personal = cvData.personal || {};
        const experience = cvData.experience || [];
        const education = cvData.education || [];
        const skills = cvData.skills || {};
        const expertise = cvData.expertise || [];

        let yPos = 50;

        // === HEADER ===
        // Name
        doc.font('Helvetica-Bold')
           .fontSize(28)
           .fillColor(colors.primary)
           .text(personal.fullName || 'Name', 50, yPos, { align: 'center', width: 495 });
        yPos += 40;

        // Title
        if (personal.title) {
            doc.font('Helvetica')
               .fontSize(12)
               .fillColor(colors.secondary)
               .text(personal.title, 50, yPos, { align: 'center', width: 495 });
            yPos += 25;
        }

        // Contact line
        const contactParts = [];
        if (personal.email) contactParts.push(personal.email);
        if (personal.phone) contactParts.push(personal.phone);
        if (personal.location) contactParts.push(personal.location);

        if (contactParts.length > 0) {
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor(colors.accent)
               .text(contactParts.join('  |  '), 50, yPos, { align: 'center', width: 495 });
            yPos += 20;
        }

        // Links
        const links = [];
        if (personal.linkedin) links.push(personal.linkedin);
        if (personal.website) links.push(personal.website);

        if (links.length > 0) {
            doc.font('Helvetica')
               .fontSize(9)
               .fillColor(colors.secondary)
               .text(links.join('  |  '), 50, yPos, { align: 'center', width: 495 });
            yPos += 20;
        }

        // Divider
        yPos += 10;
        doc.moveTo(50, yPos)
           .lineTo(545, yPos)
           .strokeColor(colors.secondary)
           .lineWidth(2)
           .stroke();
        yPos += 25;

        // === SUMMARY ===
        if (cvData.summary) {
            yPos = addSectionHeading(doc, 'PROFIL', yPos, colors);
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor(colors.text)
               .text(cvData.summary, 50, yPos, { width: 495, align: 'justify' });
            yPos = doc.y + 20;
        }

        // === EXPERTISE ===
        if (expertise.length > 0) {
            yPos = addSectionHeading(doc, 'KERNKOMPETENZEN', yPos, colors);
            doc.font('Helvetica')
               .fontSize(10)
               .fillColor(colors.accent)
               .text(expertise.join('  •  '), 50, yPos, { width: 495, align: 'center' });
            yPos = doc.y + 20;
        }

        // === EXPERIENCE ===
        if (experience.length > 0) {
            yPos = addSectionHeading(doc, 'BERUFSERFAHRUNG', yPos, colors);

            experience.forEach((exp, index) => {
                // Check if we need a new page
                if (yPos > 700) {
                    doc.addPage();
                    yPos = 50;
                }

                // Role
                doc.font('Helvetica-Bold')
                   .fontSize(11)
                   .fillColor(colors.primary)
                   .text(exp.role || 'Position', 50, yPos);
                yPos = doc.y + 3;

                // Company, Location, Period
                const companyLine = [exp.company, exp.location, exp.period].filter(Boolean).join('  |  ');
                doc.font('Helvetica')
                   .fontSize(9)
                   .fillColor(colors.accent)
                   .text(companyLine, 50, yPos);
                yPos = doc.y + 5;

                // Description
                if (exp.description) {
                    doc.font('Helvetica-Oblique')
                       .fontSize(9)
                       .fillColor(colors.accent)
                       .text(exp.description, 50, yPos, { width: 495 });
                    yPos = doc.y + 5;
                }

                // Achievements
                if (exp.achievements && exp.achievements.length > 0) {
                    exp.achievements.forEach(achievement => {
                        doc.font('Helvetica')
                           .fontSize(9)
                           .fillColor(colors.text)
                           .text(`• ${achievement}`, 60, yPos, { width: 485, indent: 10 });
                        yPos = doc.y + 3;
                    });
                }

                yPos += 10;
            });
        }

        // === EDUCATION ===
        if (education.length > 0) {
            if (yPos > 650) {
                doc.addPage();
                yPos = 50;
            }

            yPos = addSectionHeading(doc, 'AUSBILDUNG', yPos, colors);

            education.forEach((edu) => {
                const degreeText = `${edu.degree || ''} ${edu.field ? `in ${edu.field}` : ''}`.trim();
                doc.font('Helvetica-Bold')
                   .fontSize(10)
                   .fillColor(colors.primary)
                   .text(degreeText, 50, yPos);
                yPos = doc.y + 3;

                const eduLine = [edu.institution, edu.period, edu.grade ? `Note: ${edu.grade}` : ''].filter(Boolean).join('  |  ');
                doc.font('Helvetica')
                   .fontSize(9)
                   .fillColor(colors.accent)
                   .text(eduLine, 50, yPos);
                yPos = doc.y + 3;

                if (edu.highlights) {
                    doc.font('Helvetica-Oblique')
                       .fontSize(8)
                       .fillColor(colors.accent)
                       .text(edu.highlights, 50, yPos, { width: 495 });
                    yPos = doc.y + 3;
                }

                yPos += 8;
            });
        }

        // === SKILLS ===
        if (yPos > 650) {
            doc.addPage();
            yPos = 50;
        }

        yPos = addSectionHeading(doc, 'KENNTNISSE & FÄHIGKEITEN', yPos, colors);

        if (skills.technical && skills.technical.length > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Fachkenntnisse: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(skills.technical.join(', '));
            yPos = doc.y + 5;
        }

        if (skills.soft && skills.soft.length > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Soft Skills: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(skills.soft.join(', '));
            yPos = doc.y + 5;
        }

        if (skills.languages && skills.languages.length > 0) {
            const langString = skills.languages.map(l => `${l.language} (${l.level})`).join(', ');
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Sprachen: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(langString);
            yPos = doc.y + 5;
        }

        if (skills.certifications && skills.certifications.length > 0) {
            doc.font('Helvetica-Bold').fontSize(9).fillColor(colors.primary).text('Zertifizierungen: ', 50, yPos, { continued: true });
            doc.font('Helvetica').fillColor(colors.text).text(skills.certifications.join(', '));
        }

        doc.end();

        // Helper function for section headings
        function addSectionHeading(doc, title, yPos, colors) {
            doc.font('Helvetica-Bold')
               .fontSize(12)
               .fillColor(colors.primary)
               .text(title, 50, yPos);

            const headingY = doc.y + 2;
            doc.moveTo(50, headingY)
               .lineTo(545, headingY)
               .strokeColor(colors.secondary)
               .lineWidth(1)
               .stroke();

            return headingY + 12;
        }
    });
}

// ========== PDFME TEMPLATE-BASED PDF GENERATION ==========
// Define reusable CV templates for Pdfme
const PDFME_CV_TEMPLATES = {
    // Schwarz Beige Modern - Executive/Senior Template
    'schwarz-beige-modern': {
        name: 'Schwarz Beige Modern',
        colors: {
            headerBg: '#3d3d3d',
            headerText: '#ffffff',
            primary: '#3d3d3d',
            secondary: '#c9a227',
            text: '#333333',
            lightText: '#666666'
        },
        // Template will be built dynamically based on CV data
    },
    // Green Yellow Modern - Young Professional Template
    'green-yellow-modern': {
        name: 'Green Yellow Modern',
        colors: {
            primary: '#2d8a8a',
            secondary: '#f5c842',
            headerBg: '#2d8a8a',
            text: '#333333',
            lightText: '#666666'
        }
    },
    // Minimalist Clean
    'minimalist': {
        name: 'Minimalist Clean',
        colors: {
            primary: '#000000',
            secondary: '#666666',
            text: '#333333',
            lightText: '#999999'
        }
    },
    // Corporate Classic
    'corporate': {
        name: 'Corporate Classic',
        colors: {
            primary: '#1e3a5f',
            secondary: '#c9a227',
            text: '#333333',
            lightText: '#666666'
        }
    }
};

// Generate PDF using Pdfme templates
async function generatePdfWithPdfme(cvData, templateStyle) {
    const templateConfig = PDFME_CV_TEMPLATES[templateStyle] || PDFME_CV_TEMPLATES['corporate'];
    const colors = templateConfig.colors;

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const summary = cvData.summary || '';
    const expertise = cvData.expertise || [];

    // A4 dimensions in mm: 210 x 297
    const pageWidth = 210;
    const pageHeight = 297;
    const margin = 15;
    const contentWidth = pageWidth - (margin * 2);

    // Build schemas dynamically based on CV content
    const schemas = [];
    const inputs = {};
    let yPos = margin;

    // ===== HEADER BACKGROUND (for dark header templates) =====
    if (templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate') {
        schemas.push({
            name: 'headerBg',
            type: 'rectangle',
            position: { x: 0, y: 0 },
            width: pageWidth,
            height: 45,
            color: colors.headerBg
        });
        inputs.headerBg = '';
        yPos = 8;
    }

    // ===== NAME =====
    schemas.push({
        name: 'fullName',
        type: 'text',
        position: { x: margin, y: yPos },
        width: contentWidth,
        height: 15,
        fontSize: 28,
        fontColor: templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate' ? colors.headerText : colors.primary,
        alignment: 'center',
        fontName: 'Helvetica-Bold'
    });
    inputs.fullName = (personal.fullName || 'Name').toUpperCase();
    yPos += 12;

    // ===== TITLE =====
    if (personal.title) {
        schemas.push({
            name: 'title',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 8,
            fontSize: 12,
            fontColor: templateStyle === 'schwarz-beige-modern' ? colors.secondary : (templateStyle === 'corporate' ? colors.headerText : colors.secondary),
            alignment: 'center'
        });
        inputs.title = personal.title;
        yPos += 10;
    }

    // ===== CONTACT INFO =====
    const contactParts = [];
    if (personal.email) contactParts.push(personal.email);
    if (personal.phone) contactParts.push(personal.phone);
    if (personal.location) contactParts.push(personal.location);

    if (contactParts.length > 0) {
        schemas.push({
            name: 'contact',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 9,
            fontColor: templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate' ? '#cccccc' : colors.lightText,
            alignment: 'center'
        });
        inputs.contact = contactParts.join('  |  ');
        yPos += 12;
    }

    // Move past header area
    if (templateStyle === 'schwarz-beige-modern' || templateStyle === 'corporate') {
        yPos = 50;
    }

    // ===== DIVIDER LINE =====
    schemas.push({
        name: 'divider1',
        type: 'line',
        position: { x: margin, y: yPos },
        width: contentWidth,
        height: 1,
        color: colors.secondary
    });
    inputs.divider1 = '';
    yPos += 8;

    // ===== SUMMARY/PROFILE =====
    if (summary) {
        schemas.push({
            name: 'summaryLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.summaryLabel = 'PROFIL';
        yPos += 7;

        schemas.push({
            name: 'summaryText',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 20,
            fontSize: 9,
            fontColor: colors.text,
            lineHeight: 1.4
        });
        inputs.summaryText = summary;
        yPos += 22;
    }

    // ===== EXPERTISE/KERNKOMPETENZEN =====
    if (expertise.length > 0) {
        schemas.push({
            name: 'expertiseLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.expertiseLabel = 'KERNKOMPETENZEN';
        yPos += 7;

        schemas.push({
            name: 'expertiseText',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 8,
            fontSize: 9,
            fontColor: colors.secondary,
            alignment: 'center'
        });
        inputs.expertiseText = expertise.join('  •  ');
        yPos += 12;
    }

    // ===== EXPERIENCE =====
    if (experience.length > 0) {
        schemas.push({
            name: 'expLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.expLabel = 'BERUFSERFAHRUNG';
        yPos += 8;

        experience.forEach((exp, idx) => {
            if (yPos > 260) return; // Prevent overflow (would need multi-page for full support)

            // Role
            schemas.push({
                name: `expRole${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth * 0.7,
                height: 6,
                fontSize: 10,
                fontColor: colors.primary,
                fontName: 'Helvetica-Bold'
            });
            inputs[`expRole${idx}`] = exp.role || 'Position';

            // Period (right aligned)
            schemas.push({
                name: `expPeriod${idx}`,
                type: 'text',
                position: { x: margin + contentWidth * 0.7, y: yPos },
                width: contentWidth * 0.3,
                height: 6,
                fontSize: 9,
                fontColor: colors.lightText,
                alignment: 'right'
            });
            inputs[`expPeriod${idx}`] = exp.period || '';
            yPos += 6;

            // Company
            schemas.push({
                name: `expCompany${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 9,
                fontColor: colors.secondary
            });
            inputs[`expCompany${idx}`] = [exp.company, exp.location].filter(Boolean).join(', ');
            yPos += 6;

            // Description/Achievements
            if (exp.description || (exp.achievements && exp.achievements.length > 0)) {
                const achievementText = exp.achievements ?
                    exp.achievements.map(a => `• ${a}`).join('\n') :
                    (exp.description || '');

                schemas.push({
                    name: `expDesc${idx}`,
                    type: 'text',
                    position: { x: margin + 3, y: yPos },
                    width: contentWidth - 3,
                    height: Math.min(25, 5 * (exp.achievements?.length || 2)),
                    fontSize: 8,
                    fontColor: colors.text,
                    lineHeight: 1.3
                });
                inputs[`expDesc${idx}`] = achievementText;
                yPos += Math.min(25, 5 * (exp.achievements?.length || 2)) + 3;
            }

            yPos += 5;
        });
    }

    // ===== EDUCATION =====
    if (education.length > 0 && yPos < 240) {
        schemas.push({
            name: 'eduLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.eduLabel = 'AUSBILDUNG';
        yPos += 8;

        education.forEach((edu, idx) => {
            if (yPos > 270) return;

            schemas.push({
                name: `eduDegree${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth * 0.7,
                height: 5,
                fontSize: 9,
                fontColor: colors.primary,
                fontName: 'Helvetica-Bold'
            });
            inputs[`eduDegree${idx}`] = `${edu.degree || ''} ${edu.field || ''}`.trim();

            schemas.push({
                name: `eduPeriod${idx}`,
                type: 'text',
                position: { x: margin + contentWidth * 0.7, y: yPos },
                width: contentWidth * 0.3,
                height: 5,
                fontSize: 8,
                fontColor: colors.lightText,
                alignment: 'right'
            });
            inputs[`eduPeriod${idx}`] = edu.period || '';
            yPos += 5;

            schemas.push({
                name: `eduInst${idx}`,
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 8,
                fontColor: colors.lightText
            });
            inputs[`eduInst${idx}`] = edu.institution || '';
            yPos += 8;
        });
    }

    // ===== SKILLS =====
    if (yPos < 260) {
        schemas.push({
            name: 'skillsLabel',
            type: 'text',
            position: { x: margin, y: yPos },
            width: contentWidth,
            height: 6,
            fontSize: 11,
            fontColor: colors.primary,
            fontName: 'Helvetica-Bold'
        });
        inputs.skillsLabel = 'KENNTNISSE & FÄHIGKEITEN';
        yPos += 8;

        if (skills.technical && skills.technical.length > 0) {
            schemas.push({
                name: 'techSkills',
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 8,
                fontColor: colors.text
            });
            inputs.techSkills = `Fachkenntnisse: ${skills.technical.join(', ')}`;
            yPos += 6;
        }

        if (skills.languages && skills.languages.length > 0) {
            schemas.push({
                name: 'langSkills',
                type: 'text',
                position: { x: margin, y: yPos },
                width: contentWidth,
                height: 5,
                fontSize: 8,
                fontColor: colors.text
            });
            inputs.langSkills = `Sprachen: ${skills.languages.map(l => `${l.language} (${l.level})`).join(', ')}`;
            yPos += 6;
        }
    }

    // Build the template
    const template = {
        basePdf: BLANK_PDF,
        schemas: [schemas]
    };

    // Generate PDF
    const plugins = { text, line, rectangle };
    const pdf = await generate({
        template,
        inputs: [inputs],
        plugins
    });

    return Buffer.from(pdf);
}

// ========== SCHWARZ BEIGE MODERN TEMPLATE (Canva Style) ==========
// Two-column layout with dark header, photo placeholder, beige accents
async function generateSchwarzBeigeModernTemplate(cvData, generatedCvOptions) {
    const { Document, Paragraph, TextRun, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType, convertInchesToTwip } = docx;

    const colors = {
        headerBg: '3d3d3d',      // Dark gray/charcoal header
        headerText: 'FFFFFF',    // White text on header
        sidebarBg: 'f5f5f5',     // Light gray sidebar
        primary: '3d3d3d',       // Dark gray for headings
        secondary: 'c9a227',     // Gold/beige accent (not heavily used in this template)
        text: '333333',          // Dark text
        lightText: '666666'      // Light gray text
    };

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const languages = skills.languages || [];

    // Helper to create section heading
    const createSectionHeading = (title) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: title.toUpperCase(),
                    bold: true,
                    size: 22,
                    font: 'Arial',
                    color: colors.primary,
                    characterSpacing: 40
                })
            ],
            spacing: { before: 300, after: 200 }
        });
    };

    // ===== HEADER SECTION (Full width dark background) =====
    const headerTable = new Table({
        rows: [
            new TableRow({
                children: [
                    // Photo placeholder cell
                    new TableCell({
                        width: { size: 25, type: WidthType.PERCENTAGE },
                        shading: { fill: colors.headerBg, type: ShadingType.CLEAR },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: '[FOTO]',
                                        color: '888888',
                                        size: 20
                                    })
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 400, after: 400 }
                            })
                        ],
                        verticalAlign: 'center'
                    }),
                    // Name and title cell
                    new TableCell({
                        width: { size: 75, type: WidthType.PERCENTAGE },
                        shading: { fill: colors.headerBg, type: ShadingType.CLEAR },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: (personal.fullName || 'VORNAME').split(' ')[0]?.toUpperCase() || 'VORNAME',
                                        bold: true,
                                        size: 56,
                                        font: 'Arial',
                                        color: colors.headerText,
                                        characterSpacing: 60
                                    })
                                ],
                                spacing: { before: 200 }
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: (personal.fullName || 'NACHNAME').split(' ').slice(1).join(' ')?.toUpperCase() || 'NACHNAME',
                                        bold: true,
                                        size: 56,
                                        font: 'Arial',
                                        color: colors.headerText,
                                        characterSpacing: 60
                                    })
                                ]
                            }),
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: (personal.title || 'POSITION').toUpperCase(),
                                        size: 20,
                                        font: 'Arial',
                                        color: colors.headerText,
                                        characterSpacing: 100
                                    })
                                ],
                                spacing: { before: 100, after: 200 }
                            })
                        ],
                        verticalAlign: 'center'
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // ===== CONTACT ROW =====
    const contactInfo = [];
    if (personal.phone) contactInfo.push(`📞 ${personal.phone}`);
    if (personal.email) contactInfo.push(`✉ ${personal.email}`);
    if (personal.location) contactInfo.push(`📍 ${personal.location}`);

    const contactRow = new Paragraph({
        children: [
            new TextRun({
                text: contactInfo.join('     '),
                size: 18,
                font: 'Arial',
                color: colors.lightText
            })
        ],
        alignment: AlignmentType.CENTER,
        spacing: { before: 200, after: 300 },
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: 'e0e0e0' }
        }
    });

    // ===== MAIN CONTENT (Two columns) =====
    // Left column: Bildung, Skills, Sprachen
    // Right column: Berufserfahrung

    const leftColumnContent = [];
    const rightColumnContent = [];

    // LEFT COLUMN - Education
    leftColumnContent.push(createSectionHeading('Bildung'));
    education.forEach(edu => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: `${edu.degree || ''} ${edu.field || ''}`.trim(),
                    bold: true,
                    size: 20,
                    font: 'Arial',
                    color: colors.primary
                })
            ],
            spacing: { before: 100 }
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.institution || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ]
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.period || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.lightText
                })
            ],
            spacing: { after: 150 }
        }));
    });

    // LEFT COLUMN - Skills
    leftColumnContent.push(createSectionHeading('Skills'));
    const allSkills = [...(skills.technical || []), ...(skills.soft || [])];
    allSkills.forEach(skill => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: skill,
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ],
            spacing: { after: 50 }
        }));
    });

    // LEFT COLUMN - Languages
    leftColumnContent.push(createSectionHeading('Sprachen'));
    languages.forEach(lang => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: lang.language || '',
                    bold: true,
                    size: 18,
                    font: 'Arial',
                    color: colors.primary
                })
            ]
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: lang.level || '',
                    italics: true,
                    size: 16,
                    font: 'Arial',
                    color: colors.lightText
                })
            ],
            spacing: { after: 100 }
        }));
    });

    // RIGHT COLUMN - Experience
    rightColumnContent.push(createSectionHeading('Berufserfahrung'));
    experience.forEach(exp => {
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.period || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.lightText,
                    characterSpacing: 20
                })
            ],
            spacing: { before: 150 }
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: (exp.role || '').toUpperCase(),
                    bold: true,
                    size: 20,
                    font: 'Arial',
                    color: colors.primary
                })
            ]
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.company || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ]
        }));
        if (exp.description) {
            rightColumnContent.push(new Paragraph({
                children: [
                    new TextRun({
                        text: exp.description,
                        size: 18,
                        font: 'Arial',
                        color: colors.lightText
                    })
                ],
                spacing: { before: 50, after: 100 }
            }));
        }
        if (exp.achievements && exp.achievements.length > 0) {
            exp.achievements.forEach(achievement => {
                rightColumnContent.push(new Paragraph({
                    children: [
                        new TextRun({
                            text: `• ${achievement}`,
                            size: 18,
                            font: 'Arial',
                            color: colors.text
                        })
                    ],
                    indent: { left: 200 }
                }));
            });
        }
    });

    // Two-column table for main content
    const mainContentTable = new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 35, type: WidthType.PERCENTAGE },
                        children: leftColumnContent,
                        margins: { top: 200, bottom: 200, left: 200, right: 200 }
                    }),
                    new TableCell({
                        width: { size: 65, type: WidthType.PERCENTAGE },
                        children: rightColumnContent,
                        margins: { top: 200, bottom: 200, left: 300, right: 200 }
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // Create document
    const doc = new Document({
        creator: 'Karriaro',
        title: `CV - ${personal.fullName || 'Lebenslauf'}`,
        description: 'Professional CV - Schwarz Beige Modern Template',
        sections: [{
            properties: {
                page: {
                    margin: { top: 0, right: 0, bottom: 400, left: 0 }
                }
            },
            children: [headerTable, contactRow, mainContentTable]
        }]
    });

    return await docx.Packer.toBuffer(doc);
}

// ========== GREEN YELLOW MODERN TEMPLATE (Canva Style) ==========
// Creative design with teal/yellow accents, photo, modern layout
async function generateGreenYellowModernTemplate(cvData, generatedCvOptions) {
    const { Document, Paragraph, TextRun, AlignmentType, BorderStyle, TableCell, TableRow, Table, WidthType, ShadingType } = docx;

    const colors = {
        primary: '2d8a8a',       // Teal/petrol
        secondary: 'f5c842',     // Yellow accent
        headerBg: '2d8a8a',      // Teal header
        sidebarBg: '2d8a8a',     // Teal sidebar
        white: 'FFFFFF',
        text: '333333',
        lightText: '666666'
    };

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const languages = skills.languages || [];

    // Helper for yellow section headings
    const createSectionHeading = (title, color = colors.secondary) => {
        return new Paragraph({
            children: [
                new TextRun({
                    text: title.toUpperCase(),
                    bold: true,
                    size: 24,
                    font: 'Arial',
                    color: color,
                    characterSpacing: 40
                })
            ],
            spacing: { before: 300, after: 200 }
        });
    };

    // ===== HEADER with yellow accent bar =====
    const yellowBar = new Paragraph({
        shading: { fill: colors.secondary, type: ShadingType.CLEAR },
        spacing: { after: 0 },
        children: [new TextRun({ text: ' ', size: 40 })]
    });

    // ===== HEADER ROW (Photo + Name/Title/Profile) =====
    const headerContent = [];

    // Name
    headerContent.push(new Paragraph({
        children: [
            new TextRun({
                text: (personal.fullName || 'NAME').toUpperCase(),
                bold: true,
                size: 48,
                font: 'Georgia',
                color: colors.secondary
            })
        ],
        spacing: { before: 200 }
    }));

    // Title
    headerContent.push(new Paragraph({
        children: [
            new TextRun({
                text: personal.title || 'POSITION',
                size: 22,
                font: 'Arial',
                color: colors.text
            })
        ],
        spacing: { after: 100 },
        border: {
            bottom: { style: BorderStyle.SINGLE, size: 6, color: colors.text }
        }
    }));

    // Profile section
    headerContent.push(new Paragraph({
        children: [
            new TextRun({
                text: 'P R O F I L E',
                bold: true,
                size: 22,
                font: 'Arial',
                color: colors.secondary,
                characterSpacing: 40
            })
        ],
        spacing: { before: 200, after: 100 }
    }));

    if (cvData.summary) {
        headerContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: cvData.summary,
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ],
            spacing: { after: 200 }
        }));
    }

    const headerTable = new Table({
        rows: [
            new TableRow({
                children: [
                    // Photo placeholder
                    new TableCell({
                        width: { size: 30, type: WidthType.PERCENTAGE },
                        children: [
                            new Paragraph({
                                children: [
                                    new TextRun({
                                        text: '[FOTO]',
                                        color: '888888',
                                        size: 20
                                    })
                                ],
                                alignment: AlignmentType.CENTER,
                                spacing: { before: 400, after: 400 }
                            })
                        ],
                        shading: { fill: 'f0f0f0', type: ShadingType.CLEAR },
                        verticalAlign: 'center'
                    }),
                    // Name, title, profile
                    new TableCell({
                        width: { size: 70, type: WidthType.PERCENTAGE },
                        children: headerContent,
                        margins: { left: 300, right: 200, top: 200, bottom: 200 }
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // ===== CONTACT BAR =====
    const contactInfo = [];
    if (personal.phone) contactInfo.push(`• ${personal.phone}`);
    if (personal.email) contactInfo.push(`• ${personal.email}`);
    if (personal.location) contactInfo.push(`• ${personal.location}`);

    const contactBar = new Paragraph({
        children: [
            new TextRun({
                text: contactInfo.join('     '),
                size: 18,
                font: 'Arial',
                color: colors.text
            })
        ],
        alignment: AlignmentType.LEFT,
        spacing: { before: 100, after: 200 },
        indent: { left: 200 }
    });

    // ===== MAIN CONTENT (Two columns) =====
    const leftColumnContent = [];
    const rightColumnContent = [];

    // LEFT COLUMN - Skills (yellow headings)
    leftColumnContent.push(createSectionHeading('S K I L L S'));
    const allSkills = [...(skills.technical || []), ...(skills.soft || [])];
    allSkills.forEach(skill => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: `• ${skill}`,
                    size: 18,
                    font: 'Arial',
                    color: colors.primary
                })
            ],
            spacing: { after: 50 }
        }));
    });

    // LEFT COLUMN - Education
    leftColumnContent.push(createSectionHeading('E D U C A T I O N'));
    education.forEach(edu => {
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: (edu.degree || '').toUpperCase(),
                    bold: true,
                    size: 18,
                    font: 'Arial',
                    color: colors.secondary
                })
            ],
            spacing: { before: 100 }
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.institution || '',
                    size: 16,
                    font: 'Arial',
                    color: colors.primary
                })
            ]
        }));
        leftColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: edu.period || '',
                    size: 16,
                    font: 'Arial',
                    color: colors.lightText
                })
            ],
            spacing: { after: 150 }
        }));
    });

    // RIGHT COLUMN - Experience
    rightColumnContent.push(createSectionHeading('E X P E R I E N C E'));
    experience.forEach(exp => {
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: (exp.role || '').toUpperCase(),
                    bold: true,
                    size: 20,
                    font: 'Arial',
                    color: colors.secondary
                })
            ],
            spacing: { before: 150 }
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.company || '',
                    size: 18,
                    font: 'Arial',
                    color: colors.text
                })
            ]
        }));
        rightColumnContent.push(new Paragraph({
            children: [
                new TextRun({
                    text: exp.period || '',
                    size: 16,
                    font: 'Arial',
                    color: colors.lightText
                })
            ]
        }));
        if (exp.description || (exp.achievements && exp.achievements.length > 0)) {
            const descText = exp.description || (exp.achievements ? exp.achievements[0] : '');
            rightColumnContent.push(new Paragraph({
                children: [
                    new TextRun({
                        text: `• ${descText}`,
                        size: 18,
                        font: 'Arial',
                        color: colors.text
                    })
                ],
                spacing: { before: 50, after: 100 },
                indent: { left: 200 }
            }));
        }
    });

    // Two-column table for main content
    const mainContentTable = new Table({
        rows: [
            new TableRow({
                children: [
                    new TableCell({
                        width: { size: 40, type: WidthType.PERCENTAGE },
                        children: leftColumnContent,
                        margins: { top: 100, bottom: 200, left: 300, right: 200 }
                    }),
                    new TableCell({
                        width: { size: 60, type: WidthType.PERCENTAGE },
                        children: rightColumnContent,
                        margins: { top: 100, bottom: 200, left: 200, right: 300 }
                    })
                ]
            })
        ],
        width: { size: 100, type: WidthType.PERCENTAGE },
        borders: {
            top: { style: BorderStyle.NONE },
            bottom: { style: BorderStyle.NONE },
            left: { style: BorderStyle.NONE },
            right: { style: BorderStyle.NONE },
            insideHorizontal: { style: BorderStyle.NONE },
            insideVertical: { style: BorderStyle.NONE }
        }
    });

    // Create document
    const doc = new Document({
        creator: 'Karriaro',
        title: `CV - ${personal.fullName || 'Lebenslauf'}`,
        description: 'Professional CV - Green Yellow Modern Template',
        sections: [{
            properties: {
                page: {
                    margin: { top: 0, right: 0, bottom: 400, left: 0 }
                }
            },
            children: [yellowBar, headerTable, contactBar, mainContentTable]
        }]
    });

    return await docx.Packer.toBuffer(doc);
}

// ========== CUSTOM PDF TEMPLATE GENERATOR ==========
// Generates PDF using a custom template with pdfme
async function generatePdfWithCustomTemplate(cvData, templateStyle, pdfFilePath) {
    console.log(`Generating PDF with custom template: ${templateStyle}, PDF: ${pdfFilePath}`);

    const personal = cvData.personal || {};
    const experience = cvData.experience || [];
    const education = cvData.education || [];
    const skills = cvData.skills || {};
    const summary = cvData.summary || '';

    // Load the base PDF from hosting URL
    const baseUrl = 'https://karriaro.de';
    const pdfUrl = `${baseUrl}${pdfFilePath}`;

    console.log(`Loading PDF from: ${pdfUrl}`);

    // Fetch the base PDF
    let basePdfBuffer;
    try {
        const pdfResponse = await fetch(pdfUrl);
        if (!pdfResponse.ok) {
            throw new Error(`Failed to load PDF template: ${pdfResponse.status}`);
        }
        basePdfBuffer = Buffer.from(await pdfResponse.arrayBuffer());
    } catch (error) {
        console.error('Error loading base PDF:', error);
        // Fallback to default template
        return generatePdfWithPdfme(cvData, 'corporate');
    }

    // Convert to base64 for pdfme
    const basePdfBase64 = `data:application/pdf;base64,${basePdfBuffer.toString('base64')}`;

    // Template schema for "Lebenslauf Template 1" - matching the visual layout
    // These positions were determined by analyzing the PDF structure
    const template = {
        basePdf: basePdfBase64,
        schemas: [
            [
                // Name (First Name)
                {
                    name: 'firstName',
                    type: 'text',
                    position: { x: 22, y: 92 },
                    width: 155,
                    height: 30,
                    fontSize: 44,
                    fontColor: '#1a3a5c'
                },
                // Name (Last Name)
                {
                    name: 'lastName',
                    type: 'text',
                    position: { x: 22, y: 122 },
                    width: 155,
                    height: 30,
                    fontSize: 44,
                    fontColor: '#1a3a5c'
                },
                // Job Title
                {
                    name: 'jobTitle',
                    type: 'text',
                    position: { x: 22, y: 158 },
                    width: 155,
                    height: 12,
                    fontSize: 13,
                    fontColor: '#d4912a'
                },
                // Profile Section Title
                {
                    name: 'profileTitle',
                    type: 'text',
                    position: { x: 22, y: 185 },
                    width: 80,
                    height: 14,
                    fontSize: 18,
                    fontColor: '#1a3a5c'
                },
                // Profile Text
                {
                    name: 'profileText',
                    type: 'text',
                    position: { x: 22, y: 205 },
                    width: 160,
                    height: 55,
                    fontSize: 9,
                    fontColor: '#333333',
                    lineHeight: 1.5
                },
                // Languages Section Title
                {
                    name: 'languagesTitle',
                    type: 'text',
                    position: { x: 22, y: 270 },
                    width: 80,
                    height: 14,
                    fontSize: 18,
                    fontColor: '#1a3a5c'
                },
                // Languages
                {
                    name: 'languages',
                    type: 'text',
                    position: { x: 22, y: 290 },
                    width: 160,
                    height: 15,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Skills Section Title
                {
                    name: 'skillsTitle',
                    type: 'text',
                    position: { x: 22, y: 315 },
                    width: 80,
                    height: 14,
                    fontSize: 18,
                    fontColor: '#1a3a5c'
                },
                // Skills
                {
                    name: 'skills',
                    type: 'text',
                    position: { x: 22, y: 335 },
                    width: 160,
                    height: 55,
                    fontSize: 9,
                    fontColor: '#333333',
                    lineHeight: 1.5
                },
                // Contact Section Title
                {
                    name: 'contactTitle',
                    type: 'text',
                    position: { x: 22, y: 400 },
                    width: 80,
                    height: 14,
                    fontSize: 18,
                    fontColor: '#1a3a5c'
                },
                // Phone
                {
                    name: 'phone',
                    type: 'text',
                    position: { x: 32, y: 425 },
                    width: 130,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Email
                {
                    name: 'email',
                    type: 'text',
                    position: { x: 32, y: 440 },
                    width: 130,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Address
                {
                    name: 'address',
                    type: 'text',
                    position: { x: 32, y: 470 },
                    width: 130,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Website
                {
                    name: 'website',
                    type: 'text',
                    position: { x: 32, y: 485 },
                    width: 130,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Education Section Title
                {
                    name: 'educationTitle',
                    type: 'text',
                    position: { x: 215, y: 185 },
                    width: 170,
                    height: 14,
                    fontSize: 18,
                    fontColor: '#1a3a5c'
                },
                // Education Institution
                {
                    name: 'eduInstitution',
                    type: 'text',
                    position: { x: 215, y: 215 },
                    width: 170,
                    height: 12,
                    fontSize: 11,
                    fontColor: '#333333'
                },
                // Education Degree
                {
                    name: 'eduDegree',
                    type: 'text',
                    position: { x: 215, y: 228 },
                    width: 170,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Education Period
                {
                    name: 'eduPeriod',
                    type: 'text',
                    position: { x: 215, y: 240 },
                    width: 170,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#d4912a'
                },
                // Education Details
                {
                    name: 'eduDetails',
                    type: 'text',
                    position: { x: 215, y: 255 },
                    width: 170,
                    height: 40,
                    fontSize: 9,
                    fontColor: '#333333',
                    lineHeight: 1.4
                },
                // Career Section Title
                {
                    name: 'careerTitle',
                    type: 'text',
                    position: { x: 215, y: 305 },
                    width: 170,
                    height: 14,
                    fontSize: 18,
                    fontColor: '#1a3a5c'
                },
                // Job 1 Title
                {
                    name: 'job1Role',
                    type: 'text',
                    position: { x: 215, y: 330 },
                    width: 170,
                    height: 12,
                    fontSize: 11,
                    fontColor: '#333333'
                },
                // Job 1 Company
                {
                    name: 'job1Company',
                    type: 'text',
                    position: { x: 215, y: 343 },
                    width: 170,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Job 1 Period
                {
                    name: 'job1Period',
                    type: 'text',
                    position: { x: 215, y: 355 },
                    width: 170,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#d4912a'
                },
                // Job 1 Details
                {
                    name: 'job1Details',
                    type: 'text',
                    position: { x: 215, y: 370 },
                    width: 170,
                    height: 50,
                    fontSize: 9,
                    fontColor: '#333333',
                    lineHeight: 1.4
                },
                // Job 2 Title
                {
                    name: 'job2Role',
                    type: 'text',
                    position: { x: 215, y: 430 },
                    width: 170,
                    height: 12,
                    fontSize: 11,
                    fontColor: '#333333'
                },
                // Job 2 Company
                {
                    name: 'job2Company',
                    type: 'text',
                    position: { x: 215, y: 443 },
                    width: 170,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#333333'
                },
                // Job 2 Period
                {
                    name: 'job2Period',
                    type: 'text',
                    position: { x: 215, y: 455 },
                    width: 170,
                    height: 10,
                    fontSize: 9,
                    fontColor: '#d4912a'
                },
                // Job 2 Details
                {
                    name: 'job2Details',
                    type: 'text',
                    position: { x: 215, y: 470 },
                    width: 170,
                    height: 50,
                    fontSize: 9,
                    fontColor: '#333333',
                    lineHeight: 1.4
                }
            ]
        ]
    };

    // Extract name parts
    const nameParts = (personal.fullName || 'Vorname Nachname').split(' ');
    const firstName = nameParts[0] || '';
    const lastName = nameParts.slice(1).join(' ') || '';

    // Format skills
    const allSkills = [...(skills.technical || []), ...(skills.soft || [])];
    const skillsText = allSkills.length > 0
        ? '• ' + allSkills.slice(0, 10).join(' | ')
        : '';

    // Format languages
    const languagesText = (skills.languages || [])
        .map(l => l.language)
        .join(' | ');

    // Format job details with bullet points
    const formatAchievements = (achievements) => {
        if (!achievements || achievements.length === 0) return '';
        return achievements.slice(0, 4).map(a => '• ' + a).join('\n');
    };

    // Create input values matching the schema
    const inputs = [{
        firstName: firstName,
        lastName: lastName,
        jobTitle: personal.title || '',
        profileTitle: 'Profil',
        profileText: summary || '',
        languagesTitle: 'Sprachen',
        languages: languagesText || 'Deutsch | Englisch',
        skillsTitle: 'Fähigkeiten',
        skills: skillsText || '',
        contactTitle: 'Kontakt',
        phone: personal.phone || '',
        email: personal.email || '',
        address: personal.location || '',
        website: personal.website || personal.linkedin || '',
        educationTitle: 'Akademische Geschichte',
        eduInstitution: education[0]?.institution || '',
        eduDegree: `${education[0]?.degree || ''} ${education[0]?.field ? '- ' + education[0].field : ''}`.trim(),
        eduPeriod: education[0]?.period || '',
        eduDetails: education[0]?.highlights || '',
        careerTitle: 'Berufliche Karriere',
        job1Role: experience[0]?.role || '',
        job1Company: experience[0]?.company || '',
        job1Period: experience[0]?.period || '',
        job1Details: formatAchievements(experience[0]?.achievements),
        job2Role: experience[1]?.role || '',
        job2Company: experience[1]?.company || '',
        job2Period: experience[1]?.period || '',
        job2Details: formatAchievements(experience[1]?.achievements)
    }];

    console.log('Generating PDF with inputs:', JSON.stringify(inputs[0], null, 2));

    // Generate PDF with pdfme
    const plugins = { text };

    try {
        const pdfBuffer = await generate({
            template,
            inputs,
            plugins
        });

        return Buffer.from(pdfBuffer);
    } catch (error) {
        console.error('Error generating PDF with pdfme:', error);
        // Fallback to default template
        return generatePdfWithPdfme(cvData, 'corporate');
    }
}

// ========== ADMIN: CLEANUP DUPLICATE USERS ==========
// Bereinigt doppelte User-Dokumente (behält den neuesten pro Email)
exports.cleanupDuplicateUsers = onRequest({
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 300
}, async (req, res) => {
    const corsHeaders = getCorsHeaders(req);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        // Verify admin (check Authorization header or request body)
        const { adminEmail } = req.body;
        if (adminEmail !== 'muammer.kizilaslan@gmail.com') {
            return res.status(403).json({ error: 'Unauthorized - Admin only' });
        }

        const db = admin.firestore();
        const usersSnapshot = await db.collection('users').get();

        // Gruppiere User nach Email
        const emailGroups = new Map();

        usersSnapshot.docs.forEach(doc => {
            const data = doc.data();
            const email = (data.email || doc.id).toLowerCase();

            if (!emailGroups.has(email)) {
                emailGroups.set(email, []);
            }
            emailGroups.get(email).push({
                id: doc.id,
                data: data,
                createdAt: data.createdAt?.toDate?.() || data.createdAt || null
            });
        });

        // Finde Duplikate und lösche die älteren
        const duplicates = [];
        const toDelete = [];

        emailGroups.forEach((users, email) => {
            if (users.length > 1) {
                // Sortiere nach createdAt (neueste zuerst)
                users.sort((a, b) => {
                    if (!a.createdAt && !b.createdAt) return 0;
                    if (!a.createdAt) return 1;
                    if (!b.createdAt) return -1;
                    return new Date(b.createdAt) - new Date(a.createdAt);
                });

                // Behalte den ersten (neuesten), lösche den Rest
                const keep = users[0];
                const deleteThese = users.slice(1);

                duplicates.push({
                    email,
                    keep: keep.id,
                    delete: deleteThese.map(u => u.id)
                });

                deleteThese.forEach(u => toDelete.push(u.id));
            }
        });

        // Dry-run Mode (default) - nur Preview ohne Löschen
        const dryRun = req.body.dryRun !== false;

        if (!dryRun && toDelete.length > 0) {
            // Tatsächlich löschen
            const batch = db.batch();
            toDelete.forEach(userId => {
                batch.delete(db.collection('users').doc(userId));
            });
            await batch.commit();
        }

        return res.status(200).json({
            success: true,
            dryRun,
            totalUsers: usersSnapshot.size,
            uniqueEmails: emailGroups.size,
            duplicateGroups: duplicates.length,
            documentsToDelete: toDelete.length,
            deletedDocuments: dryRun ? 0 : toDelete.length,
            details: duplicates,
            message: dryRun
                ? `Dry-Run: ${toDelete.length} Duplikate gefunden. Setze dryRun: false um zu löschen.`
                : `${toDelete.length} doppelte User-Dokumente gelöscht.`
        });

    } catch (error) {
        console.error('Error cleaning up duplicate users:', error);
        return res.status(500).json({
            error: 'Fehler beim Bereinigen der Duplikate',
            details: error.message
        });
    }
});

// ========== DSGVO: COMPLETE USER DATA DELETION (Art. 17 DSGVO) ==========
// Löscht alle Daten eines Users vollständig aus Firestore und Storage
exports.deleteUserCompletely = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    invoker: 'public',
    memory: '512MiB',
    timeoutSeconds: 300
}, async (req, res) => {
    const corsHeaders = getCorsHeaders(req);

    // Handle CORS preflight
    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { adminEmail, userId, userEmail, reason, dryRun = true } = req.body;

        // Verify admin
        if (adminEmail !== 'muammer.kizilaslan@gmail.com') {
            return res.status(403).json({ error: 'Unauthorized - Admin only' });
        }

        if (!userId && !userEmail) {
            return res.status(400).json({ error: 'userId or userEmail required' });
        }

        const db = admin.firestore();
        const storage = admin.storage().bucket();

        // Find user
        let targetUserId = userId;
        let targetUserData = null;

        if (userId) {
            const userDoc = await db.collection('users').doc(userId).get();
            if (userDoc.exists) {
                targetUserData = userDoc.data();
            }
        } else if (userEmail) {
            const usersQuery = await db.collection('users')
                .where('email', '==', userEmail.toLowerCase())
                .limit(1)
                .get();
            if (!usersQuery.empty) {
                targetUserId = usersQuery.docs[0].id;
                targetUserData = usersQuery.docs[0].data();
            }
        }

        if (!targetUserId) {
            return res.status(404).json({ error: 'User not found' });
        }

        const deletionReport = {
            userId: targetUserId,
            userEmail: targetUserData?.email || userEmail,
            reason: reason || 'DSGVO Art. 17 - Recht auf Löschung',
            timestamp: new Date().toISOString(),
            dryRun,
            deletedItems: {
                userProfile: false,
                orders: [],
                cvProjects: [],
                storageFiles: [],
                authAccount: false
            },
            retainedItems: {
                invoices: [] // Rechnungen müssen 10 Jahre aufbewahrt werden
            }
        };

        // 1. Find all orders for this user
        const ordersQuery = await db.collection('orders')
            .where('userId', '==', targetUserId)
            .get();

        for (const orderDoc of ordersQuery.docs) {
            const orderData = orderDoc.data();
            const orderId = orderDoc.id;

            // Check if order has invoice (must be retained for 10 years)
            if (orderData.paymentStatus === 'paid') {
                deletionReport.retainedItems.invoices.push({
                    orderId,
                    reason: 'Steuerrechtliche Aufbewahrungspflicht (10 Jahre)',
                    anonymizedFields: ['customerName', 'customerEmail', 'customerPhone']
                });

                // Anonymize instead of delete
                if (!dryRun) {
                    await db.collection('orders').doc(orderId).update({
                        customerName: '[GELÖSCHT]',
                        customerEmail: '[GELÖSCHT]',
                        customerPhone: '[GELÖSCHT]',
                        userId: '[GELÖSCHT]',
                        anonymizedAt: admin.firestore.FieldValue.serverTimestamp(),
                        anonymizedReason: 'DSGVO Art. 17'
                    });
                }
            } else {
                // Unpaid orders can be deleted completely
                deletionReport.deletedItems.orders.push(orderId);
                if (!dryRun) {
                    await db.collection('orders').doc(orderId).delete();
                }
            }
        }

        // 2. Find all CV projects for this user
        const cvProjectsQuery = await db.collection('cvProjects')
            .where('userId', '==', targetUserId)
            .get();

        for (const projectDoc of cvProjectsQuery.docs) {
            deletionReport.deletedItems.cvProjects.push(projectDoc.id);
            if (!dryRun) {
                await db.collection('cvProjects').doc(projectDoc.id).delete();
            }
        }

        // 3. Delete Storage files
        const storagePaths = [
            `profile-pictures/${targetUserId}`,
            `users/${targetUserId}/`,
            `cv-documents/`  // Will need to filter by user
        ];

        // Delete profile picture
        try {
            const profilePicFile = storage.file(`profile-pictures/${targetUserId}`);
            const [exists] = await profilePicFile.exists();
            if (exists) {
                if (!dryRun) await profilePicFile.delete();
                deletionReport.deletedItems.storageFiles.push(`profile-pictures/${targetUserId}`);
            }
        } catch (e) {
            console.log('No profile picture found');
        }

        // Delete user folder in Storage
        try {
            const [files] = await storage.getFiles({ prefix: `users/${targetUserId}/` });
            for (const file of files) {
                if (!dryRun) await file.delete();
                deletionReport.deletedItems.storageFiles.push(file.name);
            }
        } catch (e) {
            console.log('No user storage folder found');
        }

        // Delete delivered documents
        try {
            const [deliveredFiles] = await storage.getFiles({ prefix: `delivered/${targetUserId}/` });
            for (const file of deliveredFiles) {
                if (!dryRun) await file.delete();
                deletionReport.deletedItems.storageFiles.push(file.name);
            }
        } catch (e) {
            console.log('No delivered files found');
        }

        // 4. Delete user profile from Firestore
        if (!dryRun) {
            await db.collection('users').doc(targetUserId).delete();
        }
        deletionReport.deletedItems.userProfile = true;

        // 5. Delete Firebase Auth account
        try {
            // Versuche Auth-User über die E-Mail zu finden (zuverlässiger als userId)
            const emailToDelete = targetUserData?.email || userEmail;
            if (emailToDelete) {
                try {
                    const authUser = await admin.auth().getUserByEmail(emailToDelete);
                    if (!dryRun) {
                        await admin.auth().deleteUser(authUser.uid);
                        console.log('Auth account deleted via email lookup:', authUser.uid);
                    }
                    deletionReport.deletedItems.authAccount = true;
                    deletionReport.deletedItems.authUid = authUser.uid;
                } catch (emailError) {
                    // Fallback: Versuche mit der targetUserId
                    console.log('Email lookup failed, trying userId:', emailError.message);
                    if (!dryRun) {
                        await admin.auth().deleteUser(targetUserId);
                        console.log('Auth account deleted via userId:', targetUserId);
                    }
                    deletionReport.deletedItems.authAccount = true;
                }
            } else {
                // Kein Email vorhanden, versuche mit userId
                if (!dryRun) {
                    await admin.auth().deleteUser(targetUserId);
                }
                deletionReport.deletedItems.authAccount = true;
            }
        } catch (e) {
            console.error('Could not delete auth account:', e.message);
            deletionReport.deletedItems.authAccount = false;
            deletionReport.deletedItems.authError = e.message;
        }

        // 6. Log deletion for audit trail
        if (!dryRun) {
            await db.collection('auditLog').add({
                action: 'DSGVO_USER_DELETION',
                targetUserId,
                targetUserEmail: targetUserData?.email || userEmail,
                performedBy: adminEmail,
                reason: reason || 'DSGVO Art. 17 - Recht auf Löschung',
                report: deletionReport,
                timestamp: admin.firestore.FieldValue.serverTimestamp()
            });
        }

        // 7. Send confirmation email to admin
        if (!dryRun) {
            const transporter = nodemailer.createTransport({
                host: smtpHost.value(),
                port: 465,
                secure: true,
                auth: { user: smtpUser.value(), pass: smtpPass.value() }
            });

            await transporter.sendMail({
                from: '"Karriaro System" <noreply@karriaro.de>',
                replyTo: 'kontakt@karriaro.de',
                to: adminEmail,
                subject: `DSGVO Löschung durchgeführt - ${targetUserData?.email || userEmail}`,
                html: `
                    <h2>DSGVO-konforme Datenlöschung durchgeführt</h2>
                    <p><strong>User:</strong> ${targetUserData?.email || userEmail}</p>
                    <p><strong>User-ID:</strong> ${targetUserId}</p>
                    <p><strong>Grund:</strong> ${reason || 'DSGVO Art. 17 - Recht auf Löschung'}</p>
                    <p><strong>Zeitpunkt:</strong> ${new Date().toLocaleString('de-DE')}</p>
                    <h3>Gelöschte Daten:</h3>
                    <ul>
                        <li>User-Profil: ${deletionReport.deletedItems.userProfile ? 'Ja' : 'Nein'}</li>
                        <li>Auth-Account: ${deletionReport.deletedItems.authAccount ? 'Ja' : 'Nein'}</li>
                        <li>Bestellungen: ${deletionReport.deletedItems.orders.length}</li>
                        <li>CV-Projekte: ${deletionReport.deletedItems.cvProjects.length}</li>
                        <li>Dateien: ${deletionReport.deletedItems.storageFiles.length}</li>
                    </ul>
                    ${deletionReport.retainedItems.invoices.length > 0 ? `
                        <h3>Anonymisiert (nicht gelöscht - Aufbewahrungspflicht):</h3>
                        <ul>
                            ${deletionReport.retainedItems.invoices.map(inv =>
                                `<li>Rechnung ${inv.orderId}: ${inv.reason}</li>`
                            ).join('')}
                        </ul>
                    ` : ''}
                `
            });
        }

        return res.status(200).json({
            success: true,
            dryRun,
            message: dryRun
                ? 'Dry-Run abgeschlossen. Setze dryRun: false um die Löschung durchzuführen.'
                : 'DSGVO-konforme Datenlöschung erfolgreich durchgeführt.',
            report: deletionReport
        });

    } catch (error) {
        console.error('Error in DSGVO deletion:', error);
        return res.status(500).json({
            error: 'Fehler bei der Datenlöschung',
            details: error.message
        });
    }
});

// ========== SCHEDULED: AUTOMATIC DATA CLEANUP (DSGVO Compliance) ==========
// Läuft täglich um 3:00 Uhr und identifiziert Daten, die gelöscht werden sollten
exports.scheduledDataCleanup = onSchedule({
    schedule: '0 3 * * *', // Täglich um 3:00 Uhr
    timeZone: 'Europe/Berlin',
    memory: '512MiB',
    timeoutSeconds: 540,
    secrets: [smtpHost, smtpUser, smtpPass]
}, async (event) => {
    const db = admin.firestore();
    const now = new Date();

    const cleanupReport = {
        timestamp: now.toISOString(),
        inactiveUsers: [],
        oldCvProjects: [],
        expiredOrders: [],
        warnings: []
    };

    try {
        // 1. Find users inactive for > 2 years (will be warned, not deleted)
        const twoYearsAgo = new Date(now);
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const usersSnapshot = await db.collection('users').get();

        for (const userDoc of usersSnapshot.docs) {
            const userData = userDoc.data();
            const lastActivity = userData.lastLoginAt?.toDate?.() || userData.updatedAt?.toDate?.() || userData.createdAt?.toDate?.();

            if (lastActivity && lastActivity < twoYearsAgo && !userData.deletionWarningAt) {
                cleanupReport.inactiveUsers.push({
                    id: userDoc.id,
                    email: userData.email,
                    lastActivity: lastActivity.toISOString()
                });

                // Mark user as warned (will be deleted in 30 days if no activity)
                await db.collection('users').doc(userDoc.id).update({
                    deletionWarningAt: admin.firestore.FieldValue.serverTimestamp(),
                    scheduledDeletionAt: new Date(now.getTime() + 30 * 24 * 60 * 60 * 1000) // 30 days from now
                });
            }
        }

        // 2. Find CV projects older than 6 months after completion (without active order)
        const sixMonthsAgo = new Date(now);
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const cvProjectsSnapshot = await db.collection('cvProjects')
            .where('status', '==', 'completed')
            .get();

        for (const projectDoc of cvProjectsSnapshot.docs) {
            const projectData = projectDoc.data();
            const completedAt = projectData.completedAt?.toDate?.() || projectData.updatedAt?.toDate?.();

            if (completedAt && completedAt < sixMonthsAgo && !projectData.retainData) {
                cleanupReport.oldCvProjects.push({
                    id: projectDoc.id,
                    completedAt: completedAt.toISOString()
                });

                // Don't delete automatically - just flag for review
                await db.collection('cvProjects').doc(projectDoc.id).update({
                    flaggedForDeletion: true,
                    flaggedAt: admin.firestore.FieldValue.serverTimestamp()
                });
            }
        }

        // 3. Log cleanup run
        await db.collection('auditLog').add({
            action: 'SCHEDULED_DATA_CLEANUP',
            performedBy: 'system',
            report: cleanupReport,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // 4. Send report to admin if there are items to review
        if (cleanupReport.inactiveUsers.length > 0 || cleanupReport.oldCvProjects.length > 0) {
            const transporter = nodemailer.createTransport({
                host: smtpHost.value(),
                port: 465,
                secure: true,
                auth: { user: smtpUser.value(), pass: smtpPass.value() }
            });

            await transporter.sendMail({
                from: '"Karriaro System" <noreply@karriaro.de>',
                replyTo: 'kontakt@karriaro.de',
                to: 'muammer.kizilaslan@gmail.com',
                subject: `DSGVO Daten-Cleanup Report - ${now.toLocaleDateString('de-DE')}`,
                html: `
                    <h2>Automatischer DSGVO Daten-Cleanup Report</h2>
                    <p><strong>Datum:</strong> ${now.toLocaleString('de-DE')}</p>

                    ${cleanupReport.inactiveUsers.length > 0 ? `
                        <h3>Inaktive User (>2 Jahre) - Löschwarnung gesendet</h3>
                        <ul>
                            ${cleanupReport.inactiveUsers.map(u =>
                                `<li>${u.email} - Letzte Aktivität: ${new Date(u.lastActivity).toLocaleDateString('de-DE')}</li>`
                            ).join('')}
                        </ul>
                        <p><em>Diese User werden in 30 Tagen automatisch gelöscht, wenn keine Aktivität erfolgt.</em></p>
                    ` : '<p>Keine inaktiven User gefunden.</p>'}

                    ${cleanupReport.oldCvProjects.length > 0 ? `
                        <h3>Alte CV-Projekte (>6 Monate) - Zur Überprüfung markiert</h3>
                        <ul>
                            ${cleanupReport.oldCvProjects.map(p =>
                                `<li>Projekt ${p.id} - Abgeschlossen: ${new Date(p.completedAt).toLocaleDateString('de-DE')}</li>`
                            ).join('')}
                        </ul>
                        <p><em>Bitte überprüfen und ggf. manuell löschen.</em></p>
                    ` : '<p>Keine alten CV-Projekte gefunden.</p>'}

                    <p style="color: #666; font-size: 12px; margin-top: 20px;">
                        Dieser Report wird automatisch generiert gemäß DSGVO Aufbewahrungsrichtlinien.
                    </p>
                `
            });
        }

        console.log('Scheduled data cleanup completed:', cleanupReport);
        return cleanupReport;

    } catch (error) {
        console.error('Error in scheduled data cleanup:', error);

        // Log error
        await db.collection('auditLog').add({
            action: 'SCHEDULED_DATA_CLEANUP_ERROR',
            performedBy: 'system',
            error: error.message,
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        throw error;
    }
});

// ========== ADMIN AUDIT LOGGING ==========
// Logs admin actions for DSGVO compliance
exports.logAdminAction = onRequest({
    invoker: 'public'
}, async (req, res) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { adminEmail, action, targetType, targetId, details } = req.body;

        // Verify admin
        if (adminEmail !== 'muammer.kizilaslan@gmail.com') {
            return res.status(403).json({ error: 'Unauthorized' });
        }

        const db = admin.firestore();

        await db.collection('auditLog').add({
            action,
            performedBy: adminEmail,
            targetType, // 'user', 'order', 'document', etc.
            targetId,
            details,
            ip: req.headers['x-forwarded-for'] || req.ip || 'unknown',
            userAgent: req.headers['user-agent'] || 'unknown',
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        return res.status(200).json({ success: true });

    } catch (error) {
        console.error('Error logging admin action:', error);
        return res.status(500).json({ error: 'Failed to log action' });
    }
});

// ========== REFUND MANAGEMENT ==========
// Process refunds for declined mentoring sessions (compliance conflicts)

exports.processRefund = onRequest({
    secrets: [stripeSecretKey, smtpHost, smtpUser, smtpPass],
    invoker: 'public'
}, async (req, res) => {
    const corsHeaders = getCorsHeaders(req);

    if (req.method === 'OPTIONS') {
        res.set(corsHeaders);
        return res.status(204).send('');
    }
    res.set(corsHeaders);

    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const { orderId, reason, amount, adminEmail } = req.body;

        // Verify admin
        if (adminEmail !== 'muammer.kizilaslan@gmail.com') {
            return res.status(403).json({ error: 'Nur Admin kann Rückerstattungen veranlassen' });
        }

        if (!orderId) {
            return res.status(400).json({ error: 'orderId ist erforderlich' });
        }

        const db = admin.firestore();

        // Get order
        const orderDoc = await db.collection('orders').doc(orderId).get();
        if (!orderDoc.exists) {
            return res.status(404).json({ error: 'Bestellung nicht gefunden' });
        }

        const order = orderDoc.data();

        // Check if already refunded (full refund)
        if (order.refundStatus === 'refunded') {
            return res.status(400).json({ error: 'Bestellung wurde bereits vollständig erstattet' });
        }

        // Get payment intent ID
        const paymentIntentId = order.stripePaymentIntent;
        if (!paymentIntentId) {
            return res.status(400).json({ error: 'Keine Stripe Payment Intent ID gefunden. Manuelle Erstattung im Stripe Dashboard erforderlich.' });
        }

        // Initialize Stripe
        const stripe = require('stripe')(stripeSecretKey.value());

        // Calculate refund amount (in cents for Stripe)
        const orderTotal = order.total || 0;
        const refundAmount = amount ? Math.min(amount, orderTotal) : orderTotal;
        const refundAmountCents = Math.round(refundAmount * 100);
        const isPartialRefund = refundAmount < orderTotal;

        // Check for previous partial refunds
        const previousRefunds = order.refundAmount || 0;
        const remainingRefundable = (orderTotal - previousRefunds) * 100;

        if (refundAmountCents > remainingRefundable) {
            return res.status(400).json({
                error: `Maximaler Erstattungsbetrag: €${(remainingRefundable / 100).toFixed(2)} (bereits €${previousRefunds.toFixed(2)} erstattet)`
            });
        }

        // Create refund
        console.log('💳 Creating refund for order:', orderId, 'PaymentIntent:', paymentIntentId, 'Amount:', refundAmountCents, 'cents');

        const refundParams = {
            payment_intent: paymentIntentId,
            amount: refundAmountCents, // Teilerstattung in Cents
            reason: 'requested_by_customer', // Stripe-valid reason
            metadata: {
                orderId: orderId,
                reason: reason || 'Compliance-Konflikt bei Mentoring',
                processedBy: adminEmail,
                isPartialRefund: isPartialRefund.toString()
            }
        };

        const refund = await stripe.refunds.create(refundParams);

        console.log('✅ Refund created:', refund.id, 'Status:', refund.status, 'Amount:', refund.amount);

        // Calculate total refunded amount (including previous refunds)
        const totalRefunded = previousRefunds + (refund.amount / 100);
        const isFullyRefunded = totalRefunded >= orderTotal;

        // Update order in Firestore
        await db.collection('orders').doc(orderId).update({
            refundStatus: isFullyRefunded ? 'refunded' : 'partially_refunded',
            refundId: refund.id,
            refundAmount: totalRefunded, // Total refunded amount (including previous)
            refundReason: reason || 'Compliance-Konflikt bei Mentoring',
            refundedAt: admin.firestore.FieldValue.serverTimestamp(),
            refundedBy: adminEmail,
            status: isFullyRefunded ? 'refunded' : 'partially_refunded',
            // Keep track of all refunds
            refundHistory: admin.firestore.FieldValue.arrayUnion({
                refundId: refund.id,
                amount: refund.amount / 100,
                reason: reason || 'Compliance-Konflikt bei Mentoring',
                processedBy: adminEmail,
                timestamp: new Date().toISOString()
            })
        });

        // Log to audit log
        await db.collection('auditLog').add({
            action: isPartialRefund ? 'PARTIAL_REFUND_PROCESSED' : 'REFUND_PROCESSED',
            performedBy: adminEmail,
            targetType: 'order',
            targetId: orderId,
            details: {
                refundId: refund.id,
                amount: refund.amount / 100,
                totalRefunded: totalRefunded,
                orderTotal: orderTotal,
                isPartialRefund: isPartialRefund,
                reason: reason || 'Compliance-Konflikt bei Mentoring',
                customerEmail: order.customerEmail
            },
            timestamp: admin.firestore.FieldValue.serverTimestamp()
        });

        // Send notification email to customer with credit note PDF
        if (order.customerEmail) {
            try {
                // Generate Credit Note PDF
                const creditNotePDF = await generateCreditNotePDF(order, orderId, {
                    amount: refund.amount / 100,
                    isPartialRefund: isPartialRefund,
                    reason: reason || 'Compliance-Konflikt bei Mentoring',
                    refundId: refund.id
                });

                console.log('📄 Credit note PDF generated for order:', orderId);

                const transporter = nodemailer.createTransport({
                    host: smtpHost.value(),
                    port: 587,
                    secure: false,
                    auth: {
                        user: smtpUser.value(),
                        pass: smtpPass.value()
                    }
                });

                const customerName = order.customerName || 'Kunde';
                const refundAmountFormatted = (refund.amount / 100).toFixed(2).replace('.', ',');
                const orderTotalFormatted = orderTotal.toFixed(2).replace('.', ',');
                const creditNoteNumber = `GS-${new Date().getFullYear()}-${orderId.slice(-6).toUpperCase()}`;

                // Different email content for partial vs full refund
                const refundMessage = isPartialRefund
                    ? `Wir haben Ihnen <strong>€${refundAmountFormatted}</strong> für den Mentoring-Anteil Ihrer Buchung zurückerstattet. Ihre CV-Bestellung (Gesamtwert: €${orderTotalFormatted}) bleibt davon unberührt und wird wie geplant bearbeitet.`
                    : `Wir haben Ihnen den vollständigen Betrag von <strong>€${refundAmountFormatted}</strong> zurückerstattet.`;

                await transporter.sendMail({
                    from: '"Karriaro" <kontakt@karriaro.de>',
                    to: order.customerEmail,
                    subject: isPartialRefund ? 'Teilerstattung Ihrer Buchung - Karriaro' : 'Rückerstattung Ihrer Buchung - Karriaro',
                    html: `
                        <div style="font-family: 'Segoe UI', Tahoma, Geneva, Verdana, sans-serif; max-width: 600px; margin: 0 auto;">
                            <div style="background: #0B1120; padding: 30px; text-align: center;">
                                <h1 style="color: #C6A87C; margin: 0; font-size: 24px;">KARRIARO</h1>
                            </div>
                            <div style="padding: 30px; background: #f9f9f9;">
                                <p style="color: #333;">Hallo ${customerName},</p>
                                <p style="color: #333;">
                                    wir bedauern, Ihnen mitteilen zu müssen, dass ${isPartialRefund ? 'der Mentoring-Teil' : 'Ihre Buchung'} leider nicht
                                    durchgeführt werden kann.
                                </p>
                                <p style="color: #333;">
                                    <strong>Grund:</strong> ${reason || 'Nach unserem Compliance-Check liegt ein Interessenkonflikt vor, der eine Zusammenarbeit ausschließt.'}
                                </p>
                                <div style="background: #f8f9fa; border-left: 4px solid #22c55e; padding: 15px; margin: 20px 0;">
                                    <p style="color: #333; margin: 0;">
                                        <strong>Gute Nachricht:</strong> ${refundMessage}
                                    </p>
                                    <p style="color: #666; margin: 10px 0 0; font-size: 14px;">
                                        Die Gutschrift erfolgt innerhalb von 5-10 Werktagen auf Ihr ursprüngliches Zahlungsmittel.
                                    </p>
                                </div>
                                <div style="background: #fef2f2; border: 1px solid #fecaca; padding: 15px; margin: 20px 0; border-radius: 8px;">
                                    <p style="color: #991b1b; margin: 0; font-weight: bold;">
                                        📄 Gutschrift ${creditNoteNumber} im Anhang
                                    </p>
                                    <p style="color: #666; margin: 10px 0 0; font-size: 14px;">
                                        Für Ihre Unterlagen und Buchhaltung finden Sie die offizielle Gutschrift als PDF im Anhang.
                                    </p>
                                </div>
                                <p style="color: #333;">
                                    ${isPartialRefund
                                        ? 'Ihre CV-Erstellung wird wie geplant fortgesetzt. Bei Fragen stehen wir Ihnen gerne zur Verfügung.'
                                        : 'Wenn Sie Fragen haben oder an unseren CV-Services interessiert sind, stehen wir Ihnen gerne zur Verfügung.'}
                                </p>
                                <p style="color: #333;">Mit besten Grüßen,<br><strong>Ihr Karriaro Team</strong></p>
                            </div>
                            <div style="text-align: center; padding: 20px; color: #666; font-size: 12px;">
                                <p style="margin: 0;">Karriaro | Premium Career Services</p>
                                <p style="margin: 5px 0 0;">Diese E-Mail wurde automatisch generiert.</p>
                            </div>
                        </div>
                    `,
                    attachments: [
                        {
                            filename: `Gutschrift_${creditNoteNumber}.pdf`,
                            content: creditNotePDF,
                            contentType: 'application/pdf'
                        }
                    ]
                });

                console.log('📧 Refund notification email with credit note sent to:', order.customerEmail);

            } catch (emailError) {
                console.error('⚠️ Failed to send refund email:', emailError.message);
                // Don't fail the refund if email fails
            }
        }

        return res.status(200).json({
            success: true,
            refundId: refund.id,
            amount: refund.amount / 100,
            status: refund.status,
            message: 'Rückerstattung erfolgreich verarbeitet'
        });

    } catch (error) {
        console.error('❌ Refund error:', error);

        // Check for specific Stripe errors
        if (error.type === 'StripeInvalidRequestError') {
            return res.status(400).json({
                error: 'Stripe-Fehler: ' + error.message,
                details: 'Möglicherweise wurde die Zahlung bereits erstattet oder ist zu alt.'
            });
        }

        return res.status(500).json({
            error: 'Fehler bei der Rückerstattung',
            details: error.message
        });
    }
});

// ========== CONCIERGE ANFRAGE EMAIL ==========
// Sendet Email bei neuer Anfrage aus dem Concierge-Modal

exports.onNewConciergeRequest = onDocumentCreated({
    document: 'strategyCalls/{docId}',
    secrets: [smtpHost, smtpUser, smtpPass]
}, async (event) => {
    const data = event.data.data();

    if (!data) {
        console.log('No data in document');
        return;
    }

    // Nur für Anfragen aus dem Concierge-Modal
    if (data.source !== 'concierge-modal') {
        console.log('Not a concierge request, skipping email');
        return;
    }

    // 2026-06-09 (H3): globales Rate-Limit gegen Mailbombing / Denial-of-Wallet.
    // Die Create-Rule erlaubt (bewusst) anonyme Anfragen; ohne diese Drossel
    // triggert JEDER Write genau eine Admin-SMTP-Mail. Max 20 Concierge-Mails/Std
    // insgesamt (rateLimits-Collection via Admin-SDK). fail-open bei Fehler.
    const conciergeRl = await checkRateLimit('global', 'concierge-mail', 20, 60 * 60 * 1000);
    if (!conciergeRl.allowed) {
        console.warn('⛔ Concierge-Mail rate-limited (20/h erreicht) — Benachrichtigung übersprungen');
        return;
    }

    const { name, email, message, createdAt } = data;
    // 2026-06-09 (M4): User-Input vor HTML-Interpolation escapen (Phishing-/
    // Attribut-Breakout-Schutz im Admin-Postfach).
    const safeName = escapeHtml(name);
    const safeEmail = escapeHtml(email);
    const safeMessage = escapeHtml(message);
    const adminEmail = 'muammer.kizilaslan@gmail.com';

    console.log('📧 Sending concierge request notification to admin...');

    try {
        const transporter = nodemailer.createTransport({
            host: smtpHost.value(),
            port: 465,
            secure: true,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        const timestamp = createdAt ? new Date(createdAt.toDate()).toLocaleString('de-DE') : new Date().toLocaleString('de-DE');

        await transporter.sendMail({
            from: `"Karriaro" <${smtpUser.value()}>`,
            to: adminEmail,
            subject: `🔔 Neue Anfrage von ${safeName}`,
            html: `
                <div style="font-family: -apple-system, BlinkMacSystemFont, 'Segoe UI', Roboto, sans-serif; max-width: 600px; margin: 0 auto; background: #0B1120; padding: 40px; border-radius: 16px;">
                    <div style="text-align: center; margin-bottom: 30px;">
                        <h1 style="color: #c9a87c; margin: 0; font-size: 24px;">Neue Anfrage</h1>
                        <p style="color: #9ca3af; margin: 10px 0 0;">über das Concierge-Modal</p>
                    </div>

                    <div style="background: rgba(255,255,255,0.05); border-radius: 12px; padding: 24px; margin-bottom: 20px;">
                        <table style="width: 100%; border-collapse: collapse;">
                            <tr>
                                <td style="color: #9ca3af; padding: 8px 0; width: 100px;">Name:</td>
                                <td style="color: #ffffff; padding: 8px 0; font-weight: bold;">${safeName}</td>
                            </tr>
                            <tr>
                                <td style="color: #9ca3af; padding: 8px 0;">E-Mail:</td>
                                <td style="color: #c9a87c; padding: 8px 0;">
                                    <a href="mailto:${safeEmail}" style="color: #c9a87c; text-decoration: none;">${safeEmail}</a>
                                </td>
                            </tr>
                            <tr>
                                <td style="color: #9ca3af; padding: 8px 0;">Zeitpunkt:</td>
                                <td style="color: #ffffff; padding: 8px 0;">${timestamp}</td>
                            </tr>
                        </table>
                    </div>

                    <div style="background: rgba(201, 168, 124, 0.1); border: 1px solid rgba(201, 168, 124, 0.3); border-radius: 12px; padding: 24px;">
                        <p style="color: #c9a87c; margin: 0 0 10px; font-weight: bold; font-size: 14px;">Nachricht:</p>
                        <p style="color: #ffffff; margin: 0; line-height: 1.6; white-space: pre-wrap;">${safeMessage}</p>
                    </div>

                    <div style="margin-top: 30px; text-align: center;">
                        <a href="mailto:${safeEmail}?subject=Re: Ihre Anfrage bei Karriaro"
                           style="display: inline-block; background: #c9a87c; color: #0B1120; padding: 14px 32px; border-radius: 50px; text-decoration: none; font-weight: bold; font-size: 14px;">
                            Direkt antworten
                        </a>
                    </div>

                    <div style="margin-top: 30px; text-align: center; color: #6b7280; font-size: 12px;">
                        <p style="margin: 0;">Karriaro | Premium Career Services</p>
                    </div>
                </div>
            `
        });

        console.log('✅ Concierge notification email sent to admin');

    } catch (error) {
        console.error('❌ Error sending concierge email:', error);
    }
});

// ========== CREATE MANUAL INVOICE (für Webdesign & andere Services) ==========
exports.createManualInvoice = onRequest({
    secrets: [smtpHost, smtpUser, smtpPass],
    cors: true,
    memory: '512MiB'
}, async (req, res) => {
    // Nur POST erlauben
    if (req.method !== 'POST') {
        return res.status(405).json({ error: 'Method not allowed' });
    }

    try {
        const {
            customerName,
            customerEmail,
            customerAddress, // { line1, postalCode, city, country }
            items, // [{ title, price, quantity }]
            service, // 'webdesign', 'cv-manufaktur', 'mentoring'
            paymentMethod, // 'vorkasse', 'stripe'
            notes, // Optionale Notizen
            adminEmail // Email des eingeloggten Admins
        } = req.body;

        // Admin-Authentifizierung über Email-Whitelist
        const ADMIN_EMAILS = [
            'kizilaslan.muammer@gmail.com',
            'muammer@karriaro.de',
            'kontakt@karriaro.de'
        ];

        // Erlaube auch Requests ohne adminEmail für Rückwärtskompatibilität
        // In Produktion sollte dies strenger sein
        if (adminEmail && !ADMIN_EMAILS.includes(adminEmail.toLowerCase())) {
            return res.status(401).json({ error: 'Unauthorized - not an admin' });
        }

        // Validierung
        if (!customerName || !customerEmail || !items || items.length === 0) {
            return res.status(400).json({ error: 'Missing required fields: customerName, customerEmail, items' });
        }

        // Berechne Gesamtsumme
        const total = items.reduce((sum, item) => sum + (item.price * (item.quantity || 1)), 0);

        // Erstelle Order-Dokument
        const orderData = {
            customerName,
            customerEmail: customerEmail.toLowerCase().trim(),
            customerEmailOriginal: customerEmail,
            items,
            total,
            currency: 'eur',
            paymentStatus: paymentMethod === 'vorkasse' ? 'pending' : 'paid',
            status: 'confirmed',
            date: admin.firestore.FieldValue.serverTimestamp(),
            service: service || 'webdesign',
            paymentMethod: paymentMethod || 'vorkasse',
            notes: notes || null,
            billingDetails: customerAddress ? {
                name: customerName,
                address: {
                    line1: customerAddress.line1 || '',
                    postal_code: customerAddress.postalCode || '',
                    city: customerAddress.city || '',
                    country: customerAddress.country || 'DE'
                }
            } : null,
            isManualInvoice: true
        };

        // Speichere in Firestore
        const orderRef = await admin.firestore().collection('orders').add(orderData);
        const orderId = orderRef.id;

        console.log('📦 Manual invoice created:', orderId);

        // Generiere PDF
        const pdfBuffer = await generateInvoicePDF(orderData, orderId, orderId);

        // Sende E-Mail mit Rechnung
        const transporter = nodemailer.createTransport({
            host: smtpHost.value() || 'smtp.gmail.com',
            port: 587,
            secure: false,
            requireTLS: true,
            auth: {
                user: smtpUser.value(),
                pass: smtpPass.value()
            }
        });

        const invoiceNumber = `RE-${new Date().getFullYear()}-${orderId.slice(-6).toUpperCase()}`;
        const serviceNames = {
            'webdesign': 'Karriaro Webdesign',
            'cv-manufaktur': 'Karriaro CV-Manufaktur',
            'mentoring': 'Karriaro Executive Mentoring'
        };
        const serviceName = serviceNames[service] || 'Karriaro';

        const paymentInfo = paymentMethod === 'vorkasse'
            ? `<p style="background: #fef3c7; padding: 15px; border-radius: 8px; color: #92400e;">
                 <strong>Zahlungshinweis:</strong> Bitte überweisen Sie den Betrag von <strong>${total.toFixed(2)} €</strong> auf folgendes Konto:<br><br>
                 <strong>Kontoinhaber:</strong> Muammer Kizilaslan<br>
                 <strong>IBAN:</strong> DE62 3707 0209 0079 9866 00<br>
                 <strong>BIC:</strong> DEUTDEDKP08<br>
                 <strong>Verwendungszweck:</strong> ${invoiceNumber}
               </p>`
            : '';

        await transporter.sendMail({
            from: `"${serviceName}" <${smtpUser.value()}>`,
            replyTo: 'kontakt@karriaro.de',
            to: customerEmail,
            subject: `Rechnung ${invoiceNumber} - ${serviceName}`,
            html: `
                <div style="font-family: Arial, sans-serif; max-width: 600px; margin: 0 auto; background: #0B1120; padding: 40px; border-radius: 12px;">
                    <h1 style="color: #c9a87c; margin-bottom: 20px;">${serviceName}</h1>
                    <p style="color: #ffffff; font-size: 16px;">Guten Tag ${customerName},</p>
                    <p style="color: #9ca3af; line-height: 1.6;">
                        vielen Dank für Ihren Auftrag. Anbei erhalten Sie Ihre Rechnung.
                    </p>
                    ${paymentInfo}
                    <p style="color: #9ca3af; margin-top: 20px;">
                        Bei Fragen stehen wir Ihnen gerne zur Verfügung.
                    </p>
                    <p style="color: #c9a87c; margin-top: 30px;">
                        Mit freundlichen Grüßen,<br>
                        Ihr ${serviceName} Team
                    </p>
                </div>
            `,
            attachments: [{
                filename: `Rechnung_${invoiceNumber}.pdf`,
                content: pdfBuffer,
                contentType: 'application/pdf'
            }]
        });

        console.log('✅ Invoice email sent to:', customerEmail);

        res.status(200).json({
            success: true,
            orderId,
            invoiceNumber,
            message: 'Invoice created and sent successfully'
        });

    } catch (error) {
        console.error('❌ Error creating manual invoice:', error);
        res.status(500).json({ error: error.message });
    }
});

// ========== ADMIN ROLE MANAGEMENT (Custom Claims) ==========

// Superadmin-Emails die Admin-Rollen vergeben dürfen (Bootstrap)
const SUPERADMIN_EMAILS = ['muammer.kizilaslan@gmail.com'];

exports.setAdminRole = onCall(async (request) => {
    // Prüfe ob Aufrufer authentifiziert ist
    if (!request.auth) {
        throw new Error('Nicht authentifiziert.');
    }

    // Prüfe ob Aufrufer Superadmin ist (per E-Mail oder bestehender Custom Claim)
    const callerEmail = request.auth.token.email;
    const callerIsAdmin = request.auth.token.admin === true || SUPERADMIN_EMAILS.includes(callerEmail);

    if (!callerIsAdmin) {
        throw new Error('Keine Berechtigung. Nur Admins können Rollen vergeben.');
    }

    const { targetUid } = request.data;
    if (!targetUid) {
        throw new Error('targetUid ist erforderlich.');
    }

    // Custom Claim setzen
    await admin.auth().setCustomUserClaims(targetUid, { admin: true });

    // Auch in Firestore User-Dokument setzen (für UI-Queries)
    const db = admin.firestore();
    const userDoc = db.collection('users').doc(targetUid);
    const userSnap = await userDoc.get();
    if (userSnap.exists) {
        await userDoc.update({ role: 'admin' });
    }

    const targetUser = await admin.auth().getUser(targetUid);
    console.log(`✅ Admin-Rolle gesetzt für: ${targetUser.email} (${targetUid})`);

    return { success: true, message: `Admin-Rolle gesetzt für ${targetUser.email}` };
});

exports.removeAdminRole = onCall(async (request) => {
    if (!request.auth) {
        throw new Error('Nicht authentifiziert.');
    }

    const callerEmail = request.auth.token.email;
    const callerIsAdmin = request.auth.token.admin === true || SUPERADMIN_EMAILS.includes(callerEmail);

    if (!callerIsAdmin) {
        throw new Error('Keine Berechtigung.');
    }

    const { targetUid } = request.data;
    if (!targetUid) {
        throw new Error('targetUid ist erforderlich.');
    }

    // Custom Claim entfernen
    await admin.auth().setCustomUserClaims(targetUid, { admin: false });

    // Firestore aktualisieren
    const db = admin.firestore();
    const userDoc = db.collection('users').doc(targetUid);
    const userSnap = await userDoc.get();
    if (userSnap.exists) {
        await userDoc.update({ role: 'user' });
    }

    const targetUser = await admin.auth().getUser(targetUid);
    console.log(`✅ Admin-Rolle entfernt für: ${targetUser.email} (${targetUid})`);

    return { success: true, message: `Admin-Rolle entfernt für ${targetUser.email}` };
});

// ========== LEAD INTELLIGENCE (Karriaro Webdesign) ==========
// Places API Proxy fuer das Lead-Intelligence-Tool auf karriaro-webdesign.de

const placesApiKey = defineSecret('PLACES_API_KEY');
const LEAD_ALLOWED_ORIGINS = ['https://karriaro-webdesign.de', 'http://localhost:3000', 'http://localhost:5000', 'http://localhost:8080'];
const LEAD_RATE_LIMIT = new Map();

function leadCors(req, res) {
    const origin = req.headers.origin || '';
    if (LEAD_ALLOWED_ORIGINS.includes(origin)) res.set('Access-Control-Allow-Origin', origin);
    res.set('Access-Control-Allow-Methods', 'POST, OPTIONS');
    res.set('Access-Control-Allow-Headers', 'Content-Type');
    if (req.method === 'OPTIONS') { res.status(204).send(''); return true; }
    return false;
}

function leadRateLimit(req, res) {
    const ip = req.ip || req.headers['x-forwarded-for'] || 'unknown';
    const now = Date.now();
    const entry = LEAD_RATE_LIMIT.get(ip) || { count: 0, reset: now + 60000 };
    if (now > entry.reset) { entry.count = 0; entry.reset = now + 60000; }
    entry.count++;
    LEAD_RATE_LIMIT.set(ip, entry);
    if (entry.count > 30) { res.status(429).json({ error: 'Rate limit: max 30/min' }); return true; }
    return false;
}

// Places Text Search — "Friseur Hamburg" oder "beispiel.de"
const SEARCH_PLACES_FELDER = 'places.id,places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName,places.regularOpeningHours,places.photos,places.businessStatus,places.location,places.primaryType,places.reviews,places.internationalPhoneNumber';

// maxPages: 1–3, alles andere (fehlend, Unsinn) → 1 = bisheriges Verhalten.
function searchPlacesSeitenzahl(wert) {
    const n = Number.parseInt(wert, 10);
    if (!Number.isFinite(n)) return 1;
    return Math.min(3, Math.max(1, n));
}

// 2026-09-10: Folgeseiten (nextPageToken) und bald eröffnende Betriebe.
// Ohne maxPages/includeFutureOpening laeuft exakt die bisherige Anfrage
// (gleiche Feldmaske, gleicher Body) — die Antwort traegt nur zusaetzlich
// pagesFetched. Jede Folgeseite ist eine eigene, eigens abgerechnete
// Places-Anfrage (Text Search mit reviews/phone = teure SKU).
// Places API (New), laut Discovery-Dokument v1: beim Blaettern muessen alle
// Parameter ausser pageToken/pageSize/maxResultCount identisch bleiben, sonst
// INVALID_ARGUMENT; openingDate ist nur bei businessStatus FUTURE_OPENING belegt.
async function searchPlacesHandler(req, res) {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { query, maxResults = 10, maxPages, includeFutureOpening } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });
    const seiten = searchPlacesSeitenzahl(maxPages);
    const mitEroeffnung = includeFutureOpening === true;
    const feldmaske = SEARCH_PLACES_FELDER
        + (mitEroeffnung ? ',places.openingDate' : '')
        + (seiten > 1 ? ',nextPageToken' : '');
    const grundBody = { textQuery: query, languageCode: 'de', maxResultCount: Math.min(maxResults, 20) };
    if (mitEroeffnung) grundBody.includeFutureOpeningBusinesses = true;

    const holeSeite = async (pageToken) => {
        const r = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': placesApiKey.value(),
                'X-Goog-FieldMask': feldmaske
            },
            body: JSON.stringify(pageToken ? { ...grundBody, pageToken } : grundBody)
        });
        const data = await r.json();
        return { ok: r.ok && !(data && data.error), status: r.status, data: data || {} };
    };

    try {
        const erste = await holeSeite(null);
        if (seiten === 1 || !erste.ok) {
            return res.json({ ...erste.data, pagesFetched: erste.ok ? 1 : 0 });
        }
        const places = Array.isArray(erste.data.places) ? [...erste.data.places] : [];
        let token = erste.data.nextPageToken || null;
        let pagesFetched = 1;
        let pageError = null;
        while (token && pagesFetched < seiten) {
            // Pruefer 2026-09-10: ein Netz-/JSON-Fehler auf einer FOLGESEITE warf
            // bisher in den 500-Pfad und verwarf die schon bezahlte erste Seite.
            let naechste;
            try {
                naechste = await holeSeite(token);
            } catch (e) {
                pageError = e.message || 'Folgeseite nicht lesbar';
                console.warn('searchPlaces: Folgeseite fehlgeschlagen', { query, pagesFetched, pageError });
                break;
            }
            if (!naechste.ok) {
                pageError = naechste.data?.error?.status || `HTTP ${naechste.status}`;
                console.warn('searchPlaces: Folgeseite fehlgeschlagen', { query, pagesFetched, pageError });
                break;
            }
            pagesFetched++;
            if (Array.isArray(naechste.data.places)) places.push(...naechste.data.places);
            token = naechste.data.nextPageToken || null;
        }
        const antwort = { ...erste.data, places, pagesFetched };
        delete antwort.nextPageToken; // Token ist nur serverseitig verwendbar
        if (pageError) antwort.pageError = pageError;
        res.json(antwort);
    } catch (e) { res.status(500).json({ error: e.message }); }
}
exports.searchPlaces = onRequest({ secrets: [placesApiKey] }, searchPlacesHandler);

// Places Nearby Search — Konkurrenten im Umkreis
exports.nearbyPlaces = onRequest({ secrets: [placesApiKey] }, async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { lat, lng, type, radiusMeters = 5000, maxResults = 5 } = req.body || {};
    if (!lat || !lng || !type) return res.status(400).json({ error: 'lat, lng, type required' });
    try {
        const r = await fetch('https://places.googleapis.com/v1/places:searchNearby', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json',
                'X-Goog-Api-Key': placesApiKey.value(),
                'X-Goog-FieldMask': 'places.displayName,places.rating,places.userRatingCount,places.websiteUri,places.formattedAddress,places.primaryTypeDisplayName,places.businessStatus,places.location,places.primaryType,places.photos,places.regularOpeningHours,places.reviews'
            },
            body: JSON.stringify({
                includedPrimaryTypes: Array.isArray(type) ? type : [type],
                maxResultCount: Math.min(maxResults, 20),
                locationRestriction: { circle: { center: { latitude: lat, longitude: lng }, radius: radiusMeters } },
                languageCode: 'de'
            })
        });
        res.json(await r.json());
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== LEAD INTELLIGENCE: ADVANCED CLOUD FUNCTIONS ==========

// 2026-08-15 — Modell-Antworten robust nach JSON parsen. Neuere Modelle legen
// trotz „Antworte NUR als JSON" ```json-Zäune um die Antwort; das nackte
// JSON.parse warf dann 500 und die Vision-Stufe des Scanners war MONATE still
// tot (der Client fängt den Fehler und macht ohne Verdikt weiter — gefunden
// erst durch die Rangfolge-Verifikation vom 15.08.). Zäune strippen, zur Not
// das erste {...}-Segment greifen.
function parseClaudeJson(text) {
    const raw = String(text || '').trim()
        .replace(/^```(?:json)?\s*/i, '')
        .replace(/\s*```\s*$/, '');
    if (!raw) return {};
    try { return JSON.parse(raw); }
    catch {
        const m = raw.match(/\{[\s\S]*\}/);
        if (m) { try { return JSON.parse(m[0]); } catch { /* faellt durch */ } }
        throw new Error('Modell-Antwort ist kein JSON');
    }
}

// A1: LLM Content-Analyse — Fetcht HTML und analysiert mit Claude
exports.analyzeContent = onRequest({ secrets: [claudeApiKey] }, async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });
    try {
        // Fetch HTML
        const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Karriaro-LeadBot/1.0' }, signal: AbortSignal.timeout(10000) });
        const html = await htmlRes.text();
        // Extrahiere Text (grob: entferne Tags)
        const text = html.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 3000);

        // Claude Analyse
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': claudeApiKey.value(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', max_tokens: 500,
                messages: [{ role: 'user', content: `Analysiere diesen Website-Text eines lokalen Unternehmens. Antworte NUR als JSON: {"tonality":"premium|standard|discount","freshness":"aktuell|veraltet|unklar","hasUSP":true/false,"uspText":"...","hasCTA":true/false,"languageQuality":"gut|mittel|schlecht","copyrightYear":2024,"summary":"1 Satz"}\n\nText: ${text}` }]
            })
        });
        const claude = await claudeRes.json();
        const analysis = parseClaudeJson(claude.content?.[0]?.text);
        res.json(analysis);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// A2: Screenshot-Analyse via Claude Vision
exports.analyzeScreenshot = onRequest({ secrets: [claudeApiKey] }, async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { screenshotBase64 } = req.body || {};
    if (!screenshotBase64) return res.status(400).json({ error: 'screenshotBase64 required' });
    try {
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': claudeApiKey.value(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', max_tokens: 500,
                messages: [{ role: 'user', content: [
                    { type: 'image', source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64.replace(/^data:image\/\w+;base64,/, '') } },
                    { type: 'text', text: 'Bewerte dieses Website-Screenshot eines lokalen Unternehmens. Antworte NUR als JSON: {"designQuality":1-10,"isModern":true/false,"hasStockPhotos":true/false,"colorHarmony":1-10,"whitespace":"gut|mittel|schlecht","typography":"gut|mittel|schlecht","hasCTA":true/false,"designEra":"2010s|2015s|2020s|aktuell","overallImpression":"1 Satz"}' }
                ] }]
            })
        });
        const claude = await claudeRes.json();
        const analysis = parseClaudeJson(claude.content?.[0]?.text);
        res.json(analysis);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// A4: Sentiment-Analyse (vereinfacht, ohne externe API)
// Nutzt Claude fuer Review-Text-Analyse
exports.analyzeReviews = onRequest({ secrets: [claudeApiKey, placesApiKey] }, async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { placeQuery } = req.body || {};
    if (!placeQuery) return res.status(400).json({ error: 'placeQuery required' });
    try {
        // Finde Place mit Reviews
        const placeRes = await fetch('https://places.googleapis.com/v1/places:searchText', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'X-Goog-Api-Key': placesApiKey.value(), 'X-Goog-FieldMask': 'places.reviews,places.displayName' },
            body: JSON.stringify({ textQuery: placeQuery, languageCode: 'de', maxResultCount: 1 })
        });
        const placeData = await placeRes.json();
        const reviews = placeData.places?.[0]?.reviews || [];
        if (reviews.length === 0) return res.json({ sentiment: 'neutral', websiteComplaints: 0, summary: 'Keine Reviews gefunden' });

        const reviewTexts = reviews.slice(0, 5).map(r => r.text?.text || '').filter(t => t).join('\n---\n');
        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': claudeApiKey.value(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({
                model: 'claude-haiku-4-5-20251001', max_tokens: 300,
                messages: [{ role: 'user', content: `Analysiere diese Google-Bewertungen. Antworte NUR als JSON: {"sentiment":"positiv|neutral|negativ","websiteComplaints":0-5,"websiteIssues":["..."],"overallSatisfaction":1-10,"summary":"1 Satz"}\n\nReviews:\n${reviewTexts}` }]
            })
        });
        const analysis = parseClaudeJson((await claudeRes.json()).content?.[0]?.text);
        res.json(analysis);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// D15: Domain-Alter via RDAP (WHOIS-Nachfolger, kostenlos)
exports.domainAge = onRequest(async (req, res) => {
    if (leadCors(req, res)) return;
    const { domain } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain required' });
    try {
        // RDAP fuer .de Domains
        const tld = domain.split('.').pop();
        const rdapUrls = { 'de': 'https://rdap.denic.de/domain/', 'com': 'https://rdap.verisign.com/com/v1/domain/', 'net': 'https://rdap.verisign.com/net/v1/domain/', 'org': 'https://rdap.org/domain/' };
        const rdapBase = rdapUrls[tld] || `https://rdap.org/domain/`;
        const r = await fetch(`${rdapBase}${domain}`, { signal: AbortSignal.timeout(5000) });
        if (!r.ok) return res.json({ age: null, registrationDate: null, error: 'RDAP lookup failed' });
        const data = await r.json();
        const events = data.events || [];
        const registration = events.find(e => e.eventAction === 'registration');
        const regDate = registration?.eventDate ? new Date(registration.eventDate) : null;
        const ageYears = regDate ? Math.round((Date.now() - regDate.getTime()) / (365.25*24*60*60*1000) * 10) / 10 : null;
        res.json({ age: ageYears, registrationDate: regDate?.toISOString()?.slice(0,10) || null });
    } catch (e) { res.json({ age: null, error: e.message }); }
});

// D16: Domain Authority (OpenPageRank, kostenlos)
exports.domainAuthority = onRequest(async (req, res) => {
    if (leadCors(req, res)) return;
    const { domain } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain required' });
    try {
        const r = await fetch(`https://openpagerank.com/api/v1.0/getPageRank?domains[]=${domain}`, {
            headers: { 'API-OPR': 'kostenloser-key-nicht-noetig' }, signal: AbortSignal.timeout(5000)
        });
        const data = await r.json();
        const result = data.response?.[0];
        res.json({ pageRank: result?.page_rank_decimal || null, rank: result?.rank || null, domain });
    } catch (e) { res.json({ pageRank: null, error: e.message }); }
});

// B6: Google Trends (Proxy — Google Trends hat keine offizielle API)
// Vereinfacht: Nutze Google Suggest als Proxy fuer Suchvolumen
exports.searchVolume = onRequest(async (req, res) => {
    if (leadCors(req, res)) return;
    const { query } = req.body || {};
    if (!query) return res.status(400).json({ error: 'query required' });
    try {
        // Google Suggest gibt ~10 Vorschlaege — Anzahl = Proxy fuer Suchvolumen
        const r = await fetch(`https://suggestqueries.google.com/complete/search?client=firefox&q=${encodeURIComponent(query)}&hl=de`, { signal: AbortSignal.timeout(5000) });
        const data = await r.json();
        const suggestions = data[1] || [];
        res.json({ query, suggestions: suggestions.length, topSuggestions: suggestions.slice(0, 5), hasVolume: suggestions.length > 3 });
    } catch (e) { res.json({ suggestions: 0, error: e.message }); }
});

// KI-Branchenanalyse: Was ist Standard, was fehlt?
exports.analyzeBranchStandards = onRequest({ secrets: [claudeApiKey] }, async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { url, branche, websiteText, features } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });

    try {
        // Fetch HTML wenn kein Text mitgegeben
        let text = websiteText;
        if (!text) {
            const htmlRes = await fetch(url, { headers: { 'User-Agent': 'Karriaro-LeadBot/1.0' }, signal: AbortSignal.timeout(10000) });
            text = await htmlRes.text();
            text = text.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '').replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '').replace(/<[^>]+>/g, ' ').replace(/\s+/g, ' ').trim().slice(0, 4000);
        }

        const prompt = `Du bist ein Experte für Webdesign und digitale Geschäftsmodelle lokaler Unternehmen in Deutschland.

Analysiere diese Website eines ${branche || 'lokalen Unternehmens'}.

AUFGABE 1: Was ist 2026 STANDARD auf einer ${branche || 'Unternehmens'}-Website in Deutschland? Liste die 8-12 wichtigsten Features auf die Kunden erwarten.

AUFGABE 2: Prüfe den folgenden Website-Text und erkenne welche dieser Standard-Features VORHANDEN und welche NICHT VORHANDEN sind.

AUFGABE 3: Für jedes fehlende Feature: Erkläre in 1 Satz warum es wichtig ist und was das Unternehmen dadurch verliert — so dass ein Laie es sofort versteht.

AUFGABE 4: Gib eine Gesamtbewertung: Wie modern ist diese Website im Vergleich zum Branchenstandard 2026? (1-10)

Antworte NUR als JSON:
{
  "branche": "erkannte Branche",
  "standardFeatures": [
    {"name": "Feature-Name", "why": "Warum wichtig (1 Satz)", "isStandard2026": true}
  ],
  "found": ["Feature1", "Feature2"],
  "missing": [
    {"name": "Feature-Name", "why": "Warum wichtig", "impact": "Was verliert das Unternehmen dadurch"}
  ],
  "modernityScore": 5,
  "modernityLabel": "Veraltet / Durchschnitt / Modern / Vorbildlich",
  "topPitchArgument": "Das stärkste einzelne Argument warum eine neue Website nötig ist (1-2 Sätze)",
  "summary": "Gesamtbewertung in 2-3 Sätzen"
}

${features ? 'Bereits erkannte Features auf der Website: ' + features.join(', ') : ''}

Website-Text:
${text}`;

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': claudeApiKey.value(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: SONNET_MODEL, max_tokens: 1500, messages: [{ role: 'user', content: prompt }] })
        });
        // 2026-09-10: ein Anthropic-Fehler (z. B. 404 fuer ein abgeschaltetes
        // Modell) hat keinen content — frueher wurde daraus still „{}" mit 200.
        if (!claudeRes.ok) {
            const fehlerText = await claudeRes.text().catch(() => '');
            console.error('analyzeBranchStandards: Anthropic-Fehler', claudeRes.status, fehlerText.slice(0, 300));
            return res.status(502).json({ error: 'KI-Analyse nicht verfügbar', status: claudeRes.status });
        }
        const claude = await claudeRes.json();
        const responseText = claude.content?.[0]?.text || '{}';

        // Versuche JSON zu extrahieren (Claude gibt manchmal Markdown-Wrapper)
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const analysis = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Kein JSON in Antwort' };

        res.json(analysis);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== SOCIAL PROFILE ANALYZER (Lead Intelligence Signal 6-8, 11-12) ==========
// Analysiert öffentliche Social-Media-Profile: Follower, Posts, Aktivität
exports.analyzeSocialProfiles = onRequest(async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { profileUrls, websiteUrl } = req.body || {};
    if (!profileUrls && !websiteUrl) return res.status(400).json({ error: 'profileUrls or websiteUrl required' });

    const result = { instagram: null, facebook: null, linkedin: null, tiktok: null };

    try {
        // Wenn nur websiteUrl → erst Social-Links aus HTML extrahieren
        let urls = profileUrls || {};
        if (websiteUrl && Object.keys(urls).length === 0) {
            try {
                const htmlRes = await fetch(websiteUrl, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Karriaro-Bot/1.0)' },
                    signal: AbortSignal.timeout(8000)
                });
                const html = await htmlRes.text();
                // Social Links aus HTML extrahieren
                const igMatch = html.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+)\/?["']/i);
                const fbMatch = html.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+)\/?["']/i);
                const liMatch = html.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._-]+)\/?["']/i);
                const ttMatch = html.match(/href=["'](https?:\/\/(?:www\.)?tiktok\.com\/@[a-zA-Z0-9._-]+)\/?["']/i);
                if (igMatch) urls.instagram = igMatch[1];
                if (fbMatch) urls.facebook = fbMatch[1];
                if (liMatch) urls.linkedin = liMatch[1];
                if (ttMatch) urls.tiktok = ttMatch[1];
            } catch (e) { /* Website nicht erreichbar */ }
        }

        // Signal 6+7: Instagram (öffentliche Profildaten)
        if (urls.instagram) {
            try {
                const username = urls.instagram.match(/instagram\.com\/([a-zA-Z0-9._]+)/)?.[1];
                if (username) {
                    // Versuche öffentliche Profildaten via ?__a=1 oder HTML-Scraping
                    const igRes = await fetch(`https://www.instagram.com/${username}/`, {
                        headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
                        signal: AbortSignal.timeout(8000)
                    });
                    const igHtml = await igRes.text();

                    // Follower aus meta-Tags extrahieren
                    const followerMatch = igHtml.match(/(\d[\d,.]*[KkMm]?)\s*Follower/i) ||
                                         igHtml.match(/"edge_followed_by":\{"count":(\d+)/);
                    const postMatch = igHtml.match(/(\d[\d,.]*)\s*Posts?/i) ||
                                     igHtml.match(/"edge_owner_to_timeline_media":\{"count":(\d+)/);
                    const descMatch = igHtml.match(/content="([^"]*)" property="og:description"/);

                    let followers = null;
                    if (followerMatch) {
                        let f = followerMatch[1].replace(/,/g, '');
                        if (/k/i.test(f)) followers = Math.round(parseFloat(f) * 1000);
                        else if (/m/i.test(f)) followers = Math.round(parseFloat(f) * 1000000);
                        else followers = parseInt(f);
                    }

                    let posts = null;
                    if (postMatch) posts = parseInt(postMatch[1].replace(/,/g, ''));

                    // Bio/Beschreibung aus og:description
                    let bio = null;
                    if (descMatch) {
                        bio = descMatch[1].replace(/&amp;/g, '&').replace(/&quot;/g, '"').slice(0, 200);
                    }

                    result.instagram = {
                        url: urls.instagram,
                        username,
                        followers,
                        posts,
                        bio,
                        isActive: posts > 10,
                        estimatedPostsPerMonth: posts && followers ? Math.round(posts / Math.max(1, (Date.now() - new Date('2020-01-01').getTime()) / (30 * 24 * 60 * 60 * 1000))) : null
                    };
                }
            } catch (e) { result.instagram = { url: urls.instagram, error: 'Profil nicht erreichbar' }; }
        }

        // Signal 8: Facebook Page (öffentliche Daten)
        if (urls.facebook) {
            try {
                const fbRes = await fetch(urls.facebook, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
                    signal: AbortSignal.timeout(8000)
                });
                const fbHtml = await fbRes.text();

                // Likes/Followers aus HTML
                const likesMatch = fbHtml.match(/([\d,.]+)\s*(?:Likes?|Gefällt|people like)/i);
                const followMatch = fbHtml.match(/([\d,.]+)\s*(?:Followers?|Abonnenten|people follow)/i);

                result.facebook = {
                    url: urls.facebook,
                    likes: likesMatch ? parseInt(likesMatch[1].replace(/[,.\s]/g, '')) : null,
                    followers: followMatch ? parseInt(followMatch[1].replace(/[,.\s]/g, '')) : null,
                    detected: true
                };
            } catch (e) { result.facebook = { url: urls.facebook, error: 'Seite nicht erreichbar' }; }
        }

        // Signal 11: LinkedIn Company Page
        if (urls.linkedin) {
            result.linkedin = {
                url: urls.linkedin,
                detected: true,
                isCompanyPage: /\/company\//.test(urls.linkedin)
            };
            // LinkedIn erlaubt kein öffentliches Scraping — nur URL + Typ erkennen
        }

        // Signal 12: TikTok
        if (urls.tiktok) {
            try {
                const ttRes = await fetch(urls.tiktok, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (Macintosh; Intel Mac OS X 10_15_7) AppleWebKit/537.36' },
                    signal: AbortSignal.timeout(8000)
                });
                const ttHtml = await ttRes.text();
                const ttFollowers = ttHtml.match(/"followerCount":(\d+)/) || ttHtml.match(/([\d,.]+[KkMm]?)\s*Follower/);
                const ttLikes = ttHtml.match(/"heartCount":(\d+)/) || ttHtml.match(/([\d,.]+[KkMm]?)\s*Likes/);

                result.tiktok = {
                    url: urls.tiktok,
                    followers: ttFollowers ? parseInt(ttFollowers[1].replace(/[,.\s]/g, '')) : null,
                    likes: ttLikes ? parseInt(ttLikes[1].replace(/[,.\s]/g, '')) : null,
                    detected: true
                };
            } catch (e) { result.tiktok = { url: urls.tiktok, error: 'Nicht erreichbar' }; }
        }

        // Extrahierte Social-URLs zurückgeben (Signal 5)
        result.extractedUrls = urls;
        result.platformCount = Object.values(result).filter(v => v && (v.detected || v.username)).length;

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
});

// ========== EMAIL DELIVERABILITY CHECK (#11) ==========
// Prüft SPF, DKIM, DMARC einer Domain
exports.checkEmailDeliverability = onRequest(async (req, res) => {
    if (leadCors(req, res)) return;
    const { domain } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain required' });

    try {
        const dns = require('dns').promises;
        const cleanDomain = domain.replace(/^www\./, '');

        const results = { domain: cleanDomain, spf: false, dkim: false, dmarc: false, issues: [] };

        // SPF Check
        try {
            const txt = await dns.resolveTxt(cleanDomain);
            const spfRecord = txt.flat().find(r => r.startsWith('v=spf1'));
            results.spf = !!spfRecord;
            if (!spfRecord) results.issues.push('Kein SPF-Record — E-Mails landen möglicherweise im Spam');
        } catch { results.issues.push('SPF-Record nicht abrufbar'); }

        // DMARC Check
        try {
            const dmarc = await dns.resolveTxt(`_dmarc.${cleanDomain}`);
            const dmarcRecord = dmarc.flat().find(r => r.startsWith('v=DMARC1'));
            results.dmarc = !!dmarcRecord;
            if (!dmarcRecord) results.issues.push('Kein DMARC-Record — kein Schutz gegen E-Mail-Spoofing');
        } catch { results.issues.push('DMARC nicht konfiguriert'); }

        // DKIM (Probe für gängige Selektoren)
        const selectors = ['google', 'default', 'selector1', 'k1', 'mail'];
        for (const sel of selectors) {
            try {
                const dkim = await dns.resolveTxt(`${sel}._domainkey.${cleanDomain}`);
                if (dkim.flat().some(r => r.includes('v=DKIM1'))) {
                    results.dkim = true;
                    break;
                }
            } catch { /* selector not found */ }
        }
        if (!results.dkim) results.issues.push('Kein DKIM gefunden — E-Mail-Authentifizierung unvollständig');

        // Score
        const score = (results.spf ? 33 : 0) + (results.dkim ? 34 : 0) + (results.dmarc ? 33 : 0);
        results.score = score;
        results.label = score >= 90 ? 'E-Mail gut konfiguriert' : score >= 50 ? 'E-Mail teilweise konfiguriert' : 'E-Mail schlecht konfiguriert — Spam-Risiko';
        results.pitchArg = score < 70
            ? `Ihre E-Mails von ${cleanDomain} haben ${results.issues.length} Konfigurationsprobleme. Kunden-E-Mails könnten im Spam landen, ohne dass Sie es merken.`
            : null;

        res.json(results);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== AUTO MOCKUP GENERATOR (#13) ==========
// Generiert einen Redesign-Vorschlag per KI
exports.generateMockupSuggestion = onRequest({ secrets: [claudeApiKey] }, async (req, res) => {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { domain, branche, currentIssues, screenshotBase64 } = req.body || {};
    if (!domain) return res.status(400).json({ error: 'domain required' });

    try {
        const messages = [];
        const content = [];

        // Screenshot als Referenz (wenn verfügbar)
        if (screenshotBase64) {
            content.push({
                type: 'image',
                source: { type: 'base64', media_type: 'image/jpeg', data: screenshotBase64.replace(/^data:image\/[^;]+;base64,/, '') }
            });
        }

        content.push({
            type: 'text',
            text: `Du bist ein preisgekrönter Webdesigner. Erstelle einen konkreten Redesign-Vorschlag für ${domain} (${branche || 'lokales Unternehmen'}).

${currentIssues ? 'Aktuelle Probleme: ' + currentIssues : ''}

Erstelle einen KONKRETEN Vorschlag als JSON:
{
  "headline": "Vorschlag-Überschrift (1 Satz)",
  "designDirection": "Modern minimalistisch / Warm und einladend / Premium elegant / etc.",
  "colorPalette": ["#hex1", "#hex2", "#hex3"],
  "keyFeatures": ["Feature 1", "Feature 2", "Feature 3", "Feature 4", "Feature 5"],
  "heroSection": "Beschreibung des Hero-Bereichs (1-2 Sätze)",
  "callToAction": "Empfohlener Haupt-CTA",
  "mobileFirst": "Wie die mobile Version aussehen sollte (1-2 Sätze)",
  "estimatedImpact": "Erwartete Verbesserung in einem Satz",
  "oneLinePitch": "Ein Satz den man dem Kunden sagen kann"
}`
        });

        messages.push({ role: 'user', content });

        const claudeRes = await fetch('https://api.anthropic.com/v1/messages', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json', 'x-api-key': claudeApiKey.value(), 'anthropic-version': '2023-06-01' },
            body: JSON.stringify({ model: SONNET_MODEL, max_tokens: 1000, messages })
        });
        // Siehe analyzeBranchStandards: Anthropic-Fehler nicht als leeres Objekt tarnen.
        if (!claudeRes.ok) {
            const fehlerText = await claudeRes.text().catch(() => '');
            console.error('generateMockupSuggestion: Anthropic-Fehler', claudeRes.status, fehlerText.slice(0, 300));
            return res.status(502).json({ error: 'KI-Vorschlag nicht verfügbar', status: claudeRes.status });
        }
        const claude = await claudeRes.json();
        const responseText = claude.content?.[0]?.text || '{}';
        const jsonMatch = responseText.match(/\{[\s\S]*\}/);
        const mockup = jsonMatch ? JSON.parse(jsonMatch[0]) : { error: 'Kein JSON' };

        res.json(mockup);
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CONTACT ENRICHMENT ==========
// Versucht Kontaktdaten aus Impressum/Website zu extrahieren
// Verlinkte Impressum-Seite derselben Origin (…/impressum.html, /de/impressum/,
// /imprint). Fremde Hosts werden nie angefragt.
// Pruefer 2026-09-10: derselbe Host gilt mit und ohne „www." und ueber http wie
// https. Places liefert oft „http://beispiel.de/", die Seite verlinkt aber
// absolut auf „https://www.beispiel.de/impressum/" (WordPress) — ein strenger
// Origin-Vergleich verwarf genau diesen haeufigsten Fall. Ein Sprungziel
// („impressum.html#top") zaehlt mit; ein reiner Anker („#impressum") nicht,
// der Inhalt steht dann ohnehin schon auf der Startseite.
function hostOhneWww(u) {
    try { return new URL(u).hostname.toLowerCase().replace(/^www\./, ''); } catch { return null; }
}

function impressumLinkAus(html, basisUrl, ...weitereUrls) {
    const erlaubt = new Set([basisUrl, ...weitereUrls].map(hostOhneWww).filter(Boolean));
    if (!erlaubt.size) return null;
    for (const m of String(html || '').matchAll(/href\s*=\s*["']([^"'#>]*(?:impressum|imprint)[^"'#>]*)(?:#[^"'>]*)?["']/gi)) {
        try {
            const ziel = new URL(m[1], basisUrl);
            if (/^https?:$/.test(ziel.protocol) && erlaubt.has(hostOhneWww(ziel.href))) return ziel.href;
        } catch { /* ungueltiger Link, naechster */ }
    }
    return null;
}

async function enrichContactHandler(req, res) {
    if (leadCors(req, res)) return;
    if (leadRateLimit(req, res)) return;
    const { url } = req.body || {};
    if (!url) return res.status(400).json({ error: 'url required' });

    try {
        // Lade die Website
        const htmlRes = await fetch(url, {
            headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Karriaro-Bot/1.0)' },
            signal: AbortSignal.timeout(10000)
        });
        let html = await htmlRes.text();

        // Impressum laden: zuerst die auf der Startseite verlinkte Seite, dann
        // /impressum. 2026-09-10: nur /impressum zu raten verfehlte jede Seite
        // mit /impressum.html oder Sprachpfad — Inhaber und Werbewiderspruch
        // standen dann nie im Text, und „kein Widerspruch gefunden" hiess in
        // Wahrheit „nicht geprueft" (siehe impressumGeladen).
        let impressumHtml = '';
        // Relative Links gegen die ENDGUELTIGE Adresse aufloesen (nach Weiterleitung).
        const basisUrl = (typeof htmlRes.url === 'string' && htmlRes.url) ? htmlRes.url : url;
        const kandidaten = [];
        const verlinkt = impressumLinkAus(html, basisUrl, url);
        if (verlinkt) kandidaten.push(verlinkt);
        for (const u of [basisUrl, url]) {
            try { kandidaten.push(new URL(u).origin + '/impressum'); } catch { /* url ungueltig */ }
        }
        for (const kandidat of [...new Set(kandidaten)]) {
            try {
                const impRes = await fetch(kandidat, {
                    headers: { 'User-Agent': 'Mozilla/5.0 (compatible; Karriaro-Bot/1.0)' },
                    signal: AbortSignal.timeout(5000)
                });
                if (!impRes.ok) continue;
                const seite = await impRes.text();
                // Pruefer 2026-09-10: Single-Page-Seiten beantworten /impressum mit
                // der Startseite (200). Das ist kein gelesenes Impressum — sonst
                // meldete impressumGeladen „geprueft", obwohl nichts geprueft wurde.
                if (!seite || seite === html) continue;
                impressumHtml = seite;
                break;
            } catch (e) {
                console.warn('enrichContact: Impressum nicht ladbar', { kandidat, fehler: e.message });
            }
        }

        const combined = html + ' ' + impressumHtml;

        // ⚠️ mailto:/tel: VOR dem Tag-Strip einsammeln.
        // Der Strip unten ersetzt jedes <…> durch ein Leerzeichen und loescht damit
        // auch <a href="mailto:kanzlei@example.de">Schreiben Sie uns</a> samt Adresse.
        // Sehr viele KMU-Seiten hinterlegen ihre Adresse AUSSCHLIESSLICH als Link
        // (Spam-Schutz) — die galten dadurch als "kein Kontakt" und fielen im
        // Outreach-Studio durch das Erreichbarkeits-Gate, obwohl die Adresse
        // im Quelltext stand.
        const linkedEmails = [];
        for (const m of combined.matchAll(/href\s*=\s*["']mailto:([^"'?>]+)/gi)) {
            const addr = String(m[1] || '').trim();
            if (addr.includes('@') && !/\s/.test(addr)) linkedEmails.push(addr);
        }
        const linkedPhones = [];
        for (const m of combined.matchAll(/href\s*=\s*["']tel:([^"'>]+)/gi)) {
            const num = String(m[1] || '').trim();
            if (num) linkedPhones.push(num);
        }

        // Entferne HTML-Tags für Pattern-Matching
        const strippedText = combined.replace(/<script[^>]*>[\s\S]*?<\/script>/gi, '')
            .replace(/<style[^>]*>[\s\S]*?<\/style>/gi, '')
            .replace(/<[^>]+>/g, ' ')
            .replace(/\s+/g, ' ');
        // Die verlinkten Adressen wieder anhaengen, damit die bestehenden Regex
        // unveraendert weiterlaufen koennen.
        const text = strippedText + ' ' + linkedEmails.join(' ') + ' ' + linkedPhones.join(' ');

        const result = {
            emails: [],
            phones: [],
            address: null,
            owner: null,
            social: {}
        };

        // E-Mail-Adressen extrahieren (keine generischen wie info@, noreply@)
        const emailMatches = text.match(/[a-zA-Z0-9._%+-]+@[a-zA-Z0-9.-]+\.[a-zA-Z]{2,}/g) || [];
        const genericPrefixes = ['info', 'kontakt', 'contact', 'office', 'mail', 'hello', 'noreply', 'no-reply', 'webmaster', 'admin', 'support'];
        result.emails = [...new Set(emailMatches)]
            .filter(e => !genericPrefixes.some(g => e.toLowerCase().startsWith(g + '@')))
            .slice(0, 5);
        result.genericEmails = [...new Set(emailMatches)]
            .filter(e => genericPrefixes.some(g => e.toLowerCase().startsWith(g + '@')))
            .slice(0, 3);
        result.allEmails = [...new Set(emailMatches)].slice(0, 8);

        // Telefonnummern — mit Datum-Filter, sonst matched z.B. "07.05.2024" als Phone
        // (DD.MM.YYYY hat genau die richtige Laenge fuers alte Phone-Regex).
        const phoneMatches = text.match(/(?:\+49|0049|0)\s*[\d\s/.-]{8,15}/g) || [];
        const dateLike = /^\d{1,2}\.\d{1,2}\.\d{2,4}$/;          // 7.05.2024 / 07.05.24
        const dateLikeFlexible = /\b\d{1,2}\.\d{1,2}\.\d{2,4}\b/; // 07.05.2024 in Mitte
        const minDigits = 7; // deutsche Festnetz-/Mobile-Nummer hat min. 7 Ziffern nach Vorwahl
        result.phones = [...new Set(phoneMatches.map(p => p.replace(/\s+/g, ' ').trim()))]
            .filter(p => {
                const trimmed = p.trim();
                if (dateLike.test(trimmed) || dateLikeFlexible.test(trimmed)) return false;
                const digitCount = (trimmed.match(/\d/g) || []).length;
                return digitCount >= minDigits;
            })
            .slice(0, 3);

        // Inhabername: nur rollengebunden und nur, wenn sicher eine Person
        // (lib/impressum-inhaber.js). Pruefer 2026-09-10: ZUERST das Impressum,
        // erst danach die Startseite — deren Fliesstext kam im zusammengefuegten
        // Text vorher dran („Als Betreiber Ihrer …") und konnte den echten
        // Inhaber verdraengen. Text mit Blockgrenzen, damit ein Zeilenumbruch
        // den Namen beendet („Klaus Bauer<br>Stuttgart").
        let inhaber = impressumHtml ? erkenneInhaber(textMitBloecken(impressumHtml)) : { name: null };
        if (!inhaber.name) inhaber = erkenneInhaber(textMitBloecken(html));
        result.owner = inhaber.name;
        result.ownerRole = inhaber.name ? inhaber.rolle : null;
        result.ownerAnrede = inhaber.name ? inhaber.anrede : null;
        result.ownerTitel = inhaber.name ? inhaber.titel : null;

        // Werbewiderspruch im Impressum (§ 7 Abs. 1 S. 2 UWG) → Sperrliste im Client.
        // impressumGeladen trennt „kein Widerspruch gefunden" von „Impressum
        // gar nicht gelesen" (die Startseite allein traegt die Formel selten).
        result.werbewiderspruch = erkenneWerbewiderspruch(strippedText);
        result.impressumGeladen = impressumHtml.length > 0;

        // Social Media Links aus HTML
        const igMatch = combined.match(/href=["'](https?:\/\/(?:www\.)?instagram\.com\/[a-zA-Z0-9._]+)\/?["']/i);
        const fbMatch = combined.match(/href=["'](https?:\/\/(?:www\.)?facebook\.com\/[a-zA-Z0-9._-]+)\/?["']/i);
        const liMatch = combined.match(/href=["'](https?:\/\/(?:www\.)?linkedin\.com\/(?:company|in)\/[a-zA-Z0-9._-]+)\/?["']/i);
        if (igMatch) result.social.instagram = igMatch[1];
        if (fbMatch) result.social.facebook = fbMatch[1];
        if (liMatch) result.social.linkedin = liMatch[1];

        // Bewertung der Kontaktdaten-Qualität
        result.quality = result.emails.length > 0 ? 'persönlich' :
            result.genericEmails.length > 0 ? 'generisch' : 'keine';
        result.hasPersonalEmail = result.emails.length > 0;
        result.contactScore = (result.emails.length > 0 ? 40 : 0) +
            (result.genericEmails.length > 0 ? 20 : 0) +
            (result.phones.length > 0 ? 20 : 0) +
            (result.owner ? 10 : 0) +
            (Object.keys(result.social).length > 0 ? 10 : 0);

        res.json(result);
    } catch (e) {
        res.status(500).json({ error: e.message });
    }
}
exports.enrichContact = onRequest(enrichContactHandler);

// ========== PERSONALIZED LEAD PAGE (#7) ==========
// Generiert eine personalisierte Analyse-Seite für einen Lead
exports.leadPage = onRequest(async (req, res) => {
    // GET: Zeige die Seite
    const cors = getCorsHeaders(req);
    // Erlaube alle Origins für die Landingpage
    res.set({ ...cors, 'Access-Control-Allow-Origin': '*' });
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    const { domain } = req.query || {};
    if (!domain) {
        res.status(400).send('domain parameter required');
        return;
    }

    // Lade Lead-Daten aus Firestore (wenn vorhanden)
    let leadData = null;
    try {
        const db = admin.firestore();
        const snap = await db.collection('leadPages').doc(domain.replace(/[^a-zA-Z0-9]/g, '_')).get();
        if (snap.exists) leadData = snap.data();
    } catch (e) { /* no data */ }

    if (!leadData) {
        res.status(404).send('Keine Analyse für diese Domain gefunden.');
        return;
    }

    // Generiere HTML-Seite
    const scoreColor = leadData.score >= 55 ? '#30d158' : leadData.score >= 30 ? '#ff9f0a' : '#ff453a';
    const html = `<!DOCTYPE html><html lang="de"><head>
        <meta charset="UTF-8"><meta name="viewport" content="width=device-width, initial-scale=1.0">
        <title>Website-Analyse für ${leadData.name || domain} | Karriaro Webdesign</title>
        <meta name="robots" content="noindex">
        <style>
            *{margin:0;padding:0;box-sizing:border-box}
            body{font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;background:#fbfbfd;color:#1d1d1f;line-height:1.6}
            .container{max-width:640px;margin:0 auto;padding:40px 24px}
            h1{font-size:1.8rem;font-weight:700;margin-bottom:8px}
            .sub{color:#86868b;margin-bottom:32px}
            .score-ring{width:120px;height:120px;margin:0 auto 16px}
            .card{background:#fff;border:1px solid #e5e5ea;border-radius:16px;padding:24px;margin-bottom:16px}
            .metric{font-size:2.5rem;font-weight:800;text-align:center;color:${scoreColor}}
            .label{font-size:12px;color:#86868b;text-transform:uppercase;letter-spacing:0.08em;text-align:center}
            .row{display:flex;justify-content:space-between;padding:8px 0;border-bottom:1px solid #e5e5ea;font-size:14px}
            .row:last-child{border:none}
            .good{color:#30d158}.bad{color:#ff453a}.warn{color:#ff9f0a}
            .cta{display:block;text-align:center;padding:16px;background:#0071e3;color:#fff;border-radius:12px;font-size:16px;font-weight:600;text-decoration:none;margin-top:24px}
            .cta:hover{background:#0077ed}
            .footer{text-align:center;color:#86868b;font-size:12px;margin-top:32px}
        </style></head><body>
        <div class="container">
            <h1>Website-Analyse</h1>
            <div class="sub">${leadData.name || domain} · ${leadData.branche || ''}</div>
            <div class="card" style="text-align:center">
                <div class="metric">${leadData.score || '?'}</div>
                <div class="label">Lead-Score von 100</div>
            </div>
            <div class="card">
                <div class="row"><span>Performance</span><span class="${(leadData.perf||0) >= 75 ? 'good' : 'bad'}">${leadData.perf || '?'}/100</span></div>
                <div class="row"><span>SEO</span><span class="${(leadData.seo||0) >= 75 ? 'good' : 'bad'}">${leadData.seo || '?'}/100</span></div>
                <div class="row"><span>Barrierefreiheit</span><span class="${(leadData.a11y||0) >= 80 ? 'good' : 'bad'}">${leadData.a11y || '?'}/100</span></div>
                ${leadData.cms ? `<div class="row"><span>Technologie</span><span>${leadData.cms}</span></div>` : ''}
                ${leadData.bfsgRisk ? `<div class="row"><span>BFSG-Status</span><span class="${leadData.bfsgRisk === 'niedrig' ? 'good' : 'bad'}">${leadData.bfsgLabel || leadData.bfsgRisk}</span></div>` : ''}
            </div>
            ${leadData.problems ? `<div class="card"><h3 style="font-size:14px;font-weight:700;margin-bottom:12px">Was wir gefunden haben</h3>${leadData.problems.map(p => `<div style="padding:6px 0;font-size:13px;color:#86868b">• ${p}</div>`).join('')}</div>` : ''}
            ${leadData.mockupHeadline ? `<div class="card"><h3 style="font-size:14px;font-weight:700;margin-bottom:8px">Unser Vorschlag</h3><div style="font-size:13px;color:#86868b">${leadData.mockupHeadline}</div></div>` : ''}
            <a href="https://karriaro-webdesign.de/#kontakt" class="cta">Kostenlos beraten lassen</a>
            <div class="footer">Analyse erstellt von Karriaro Webdesign · karriaro-webdesign.de</div>
        </div></body></html>`;

    res.set('Content-Type', 'text/html').send(html);
});

// ========== SAVE LEAD PAGE DATA ==========
// Speichert Daten für die personalisierte Lead-Seite
exports.saveLeadPage = onRequest(async (req, res) => {
    if (leadCors(req, res)) return;
    const data = req.body || {};
    if (!data.domain) return res.status(400).json({ error: 'domain required' });

    try {
        const db = admin.firestore();
        const id = data.domain.replace(/[^a-zA-Z0-9]/g, '_');
        await db.collection('leadPages').doc(id).set({
            ...data,
            createdAt: admin.firestore.FieldValue.serverTimestamp()
        }, { merge: true });
        res.json({ success: true, url: `https://us-central1-apex-executive.cloudfunctions.net/leadPage?domain=${encodeURIComponent(data.domain)}` });
    } catch (e) { res.status(500).json({ error: e.message }); }
});

// ========== CALENDAR EVENT GENERATOR (#9) ==========
// Generiert eine .ics Datei für Google Calendar / Outlook
exports.calendarEvent = onRequest(async (req, res) => {
    const cors = getCorsHeaders(req);
    res.set({ ...cors, 'Access-Control-Allow-Origin': '*' });
    if (req.method === 'OPTIONS') { res.status(204).end(); return; }

    const { title, domain, score, date, time } = req.query || {};
    if (!title || !domain) return res.status(400).send('title and domain required');

    const startDate = date || new Date(Date.now() + 2 * 24 * 60 * 60 * 1000).toISOString().slice(0, 10);
    const startTime = time || '10:00';
    const dtStart = startDate.replace(/-/g, '') + 'T' + startTime.replace(':', '') + '00';
    // 30 Minuten Termin
    const endHour = parseInt(startTime.split(':')[0]);
    const endMin = parseInt(startTime.split(':')[1]) + 30;
    const dtEnd = startDate.replace(/-/g, '') + 'T' + String(endHour + Math.floor(endMin / 60)).padStart(2, '0') + String(endMin % 60).padStart(2, '0') + '00';

    const ics = `BEGIN:VCALENDAR
VERSION:2.0
PRODID:-//Karriaro//Lead Intelligence//DE
BEGIN:VEVENT
DTSTART:${dtStart}
DTEND:${dtEnd}
SUMMARY:${title}
DESCRIPTION:Lead: ${domain}\\nScore: ${score || '?'}\\n\\nVorbereitung:\\n- Website nochmal ansehen\\n- Pitch-Vorlage bereithalten\\n- Kostenlosen Entwurf vorbereiten
LOCATION:Telefon / Video
STATUS:CONFIRMED
END:VEVENT
END:VCALENDAR`;

    res.set('Content-Type', 'text/calendar; charset=utf-8');
    res.set('Content-Disposition', `attachment; filename="lead-${domain}.ics"`);
    res.send(ics);
});

// ========== TEST EXPORTS (nur für Unit-Tests verfügbar) ==========
if (process.env.NODE_ENV === 'test') {
    exports._test = {
        PRODUCT_CATALOG,
        validateItemPrice,
        validateAndCorrectPrices,
        checkRateLimit,
        getClientIp,
        SUPERADMIN_EMAILS,
        SONNET_MODEL,
        searchPlacesHandler,
        searchPlacesSeitenzahl,
        enrichContactHandler,
        impressumLinkAus
    };
}
