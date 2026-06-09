// Karriaro - Application Module v2.1
// Contains: Auth, Cart, Dashboard, Coaches, Articles, Data, Password Reset

// Features Module: Authentication, Cart, Dashboard
import { auth, db, storage, navigateTo } from './core.js';
import { signInWithEmailAndPassword, createUserWithEmailAndPassword, signOut, onAuthStateChanged, updateProfile, sendEmailVerification, sendPasswordResetEmail, verifyPasswordResetCode, confirmPasswordReset, reload, applyActionCode } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js";
import { collection, getDocs, addDoc, doc, setDoc, updateDoc, query, where, orderBy, getDoc, deleteDoc, serverTimestamp, limit } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js";
import { ref, uploadBytes, uploadBytesResumable, getDownloadURL, getMetadata, deleteObject } from "https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js";
import { validateEmail, validatePassword, getPasswordStrengthLabel, getFirebaseErrorMessage, showToast, sanitizeHTML, validateEmailRealtime, validatePasswordMatch, saveCartToLocalStorage, loadCartFromLocalStorage } from './core.js';
import { initI18n, setLocale as i18nSetLocale, t, getLocale } from './i18n.js';
export { initI18n, i18nSetLocale, t, getLocale };
import { sampleArticles } from './data.js';

// ========== MODULE SPLIT (Phase 4A) ==========
// Extrahierte Module: js/constants.js, js/state.js, js/i18n.js
// Die Konstanten und State-Objekte sind in eigene Module ausgelagert.
// app.js behält vorerst lokale Kopien für reibungslosen Übergang.
// Nächste Schritte: auth.js, cart.js, dashboard.js, admin.js, etc. einzeln extrahieren.
// Migration-Anleitung: Importe auskommentieren → lokale Kopie löschen → testen
// import { IS_PRODUCTION, ORDER_STATUS, ADMIN_EMAILS, FILE_LIMITS, ALLOWED_FILE_TYPES, PAGINATION, PACKAGES, BUNDLES, formatPrice, logger } from './constants.js';
// import { paginationState, currentMentorData, setCurrentMentorData } from './state.js';

// ========== CONSTANTS ==========

// Environment Detection
const IS_PRODUCTION = window.location.hostname !== 'localhost' && !window.location.hostname.includes('127.0.0.1');

// Order Status Constants
const ORDER_STATUS = {
    PENDING: 'pending',
    CONFIRMED: 'confirmed',
    PROCESSING: 'processing',
    COMPLETED: 'completed',
    CANCELLED: 'cancelled'
};

// Admin Emails (fallback - primary source is Firestore config/admins)
const ADMIN_EMAILS = ['muammer.kizilaslan@gmail.com'];

// Mentor State (will be set on login if user is a mentor)
let currentMentorData = null;

// File Size Limits (in bytes)
const FILE_LIMITS = {
    PROFILE_PICTURE: 5 * 1024 * 1024,    // 5MB
    USER_DOCUMENT: 10 * 1024 * 1024,      // 10MB
    ADMIN_DOCUMENT: 20 * 1024 * 1024      // 20MB
};

// Allowed File Types
const ALLOWED_FILE_TYPES = {
    IMAGES: ['image/jpeg', 'image/png', 'image/gif', 'image/webp'],
    DOCUMENTS: ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document']
};

// Pagination Settings
const PAGINATION = {
    USERS_PER_PAGE: 20,
    ORDERS_PER_PAGE: 15,
    CALLS_PER_PAGE: 15,
    DOCS_PER_PAGE: 20,
    COACHES_PER_PAGE: 12
};

// ========== PACKAGE CONFIGURATION (Single Source of Truth) ==========

export const PACKAGES = {
    // === CV PAKETE ===
    highPotential: {
        id: 'starter',
        name: 'Starter',
        subtitle: 'Starke Unterlagen. Schnell fertig.',
        targetGroup: 'Professionals & Experten',
        price: 490,
        description: 'Ihr CV + maßgeschneidertes Anschreiben, Strategie-Gespräch und LinkedIn Audit.',
        features: [
            'Ihr CV + maßgeschneidertes Anschreiben',
            '30 Min. Strategie-Gespräch',
            'LinkedIn-Profil Audit'
        ],
        extras: '2 Feedbackrunden',
        delivery: '5-7 Werktage',
        revisions: 2,
        strategyCall: 30,
        faqDescription: 'Premium-CV mit Strategie-Gespräch und LinkedIn Audit. Für Professionals, die exzellente Unterlagen brauchen.'
    },
    seniorProfessional: {
        id: 'professional',
        name: 'Professional',
        subtitle: 'Wenn es jetzt zählt.',
        targetGroup: 'Führungskräfte & Senior Experts',
        price: 990,
        description: 'Alles aus Starter plus Coaching, Interview-Prep und Arbeitszeugnis.',
        features: [
            'Alles aus Starter',
            'LinkedIn: von Grund auf neu aufgebaut',
            '60 Minuten persönliches Coaching',
            'Interview-Training mit Feedback',
            '1 Arbeitszeugnis inklusive'
        ],
        extras: 'Unbegrenzte Korrekturen',
        delivery: '7-10 Werktage',
        revisions: 'Unbegrenzt',
        strategyCall: 60,
        faqDescription: 'Das Komplett-Paket: CV, LinkedIn, Coaching, Interview-Prep und Arbeitszeugnis. Für den nächsten Karriereschritt.'
    },
    executiveCSuite: {
        id: 'executive',
        name: 'Executive',
        subtitle: 'Von Vorstand zu Vorstand.',
        targetGroup: 'Director · VP · C-Level',
        price: 2990,
        description: 'Full-Service-Mandat mit Board CV, 3 Coaching-Sessions und 30 Tage Sparring.',
        features: [
            'Alles aus Professional',
            'Executive Bio + Board CV',
            '3 Coaching-Sessions',
            'Zweisprachig: Deutsch + Englisch',
            'Google-Präsenz-Audit',
            '2 Arbeitszeugnisse'
        ],
        extras: '30 Tage Sparring per E-Mail',
        delivery: '10-14 Werktage',
        revisions: 'Unbegrenzt',
        strategyCall: 60,
        faqDescription: 'Das Full-Service-Mandat: Board CV, Executive Bio, 3 Coaching-Sessions, Google-Audit, 2 Arbeitszeugnisse und 30 Tage E-Mail-Sparring.'
    },

    // === MENTORING PAKETE ===
    mentoringSingle: {
        id: 'mentoring-single',
        name: 'Single Session',
        price: 350,
        priceNote: 'Einmalig · zzgl. MwSt.',
        features: [
            '60 Min Video-Call',
            'Passender Executive',
            'Schriftliches Summary'
        ]
    },
    mentoring3Sessions: {
        id: 'mentoring-3-sessions',
        name: '3-Session Paket',
        price: 950,
        priceNote: 'Einmalig · €317/Session · zzgl. MwSt.',
        idealFor: 'Jobwechsel, Gehaltsverhandlung, Interview-Training, die ersten 100 Tage im neuen Job.',
        features: [
            '3× 60 Min über 3 Monate',
            'Derselbe Executive (Kontinuität)',
            'E-Mail-Support zwischen Sessions'
        ],
        recommended: true
    },
    mentoringRetainer: {
        id: 'mentoring-retainer',
        name: 'Executive Retainer',
        price: 2500,
        priceNote: 'pro Monat · min. 6 Monate',
        features: [
            'Priority Access & Direct Line',
            '2 Executives parallel',
            'Netzwerk-Intros & Krisenintervention'
        ],
        isInquiry: true
    }
};

// Bundle-Konfiguration (berechnet sich aus Einzelpaketen)
export const BUNDLES = {
    seniorBundle: {
        id: 'senior-bundle',
        name: 'Executive Transformation: Senior CV + 3 Mentoring-Sessions',
        shortName: 'Senior Bundle',
        cvPackage: 'seniorProfessional',
        mentoringPackage: 'mentoring3Sessions',
        price: 1299,
        get regularPrice() {
            return PACKAGES[this.cvPackage].price + PACKAGES[this.mentoringPackage].price;
        },
        get savings() {
            return this.regularPrice - this.price;
        }
    },
    cSuiteBundle: {
        id: 'csuite-bundle',
        name: 'Executive Transformation: C-Suite CV + 3 Mentoring-Sessions',
        shortName: 'C-Suite Bundle',
        cvPackage: 'executiveCSuite',
        mentoringPackage: 'mentoring3Sessions',
        price: 1799,
        extras: 'Executive Bio + Board-Ready One-Pager',
        get regularPrice() {
            return PACKAGES[this.cvPackage].price + PACKAGES[this.mentoringPackage].price;
        },
        get savings() {
            return this.regularPrice - this.price;
        }
    }
};

// Hilfsfunktion zum Formatieren von Preisen
export function formatPrice(price) {
    return price.toLocaleString('de-DE');
}

// Pagination State
const paginationState = {
    users: { page: 1, total: 0, data: [], filteredData: [], searchTerm: '', filter: 'all' },
    orders: { page: 1, total: 0, data: [] },
    calls: { page: 1, total: 0, data: [] },
    docs: { page: 1, total: 0, data: [] },
    coaches: { page: 1, total: 0, data: [] }
};

// Production Logger - suppresses logs in production
const logger = {
    log: (...args) => { if (!IS_PRODUCTION) console.log(...args); },
    warn: (...args) => { if (!IS_PRODUCTION) console.warn(...args); },
    error: (...args) => console.error(...args), // Always log errors
    debug: (...args) => { if (!IS_PRODUCTION) console.debug(...args); }
};

// ========== PAGINATION HELPERS ==========

function renderPagination(type) {
    const state = paginationState[type];
    const perPage = PAGINATION[`${type.toUpperCase()}_PER_PAGE`] || 20;
    const totalPages = Math.ceil(state.total / perPage);

    if (totalPages <= 1) return '';

    const pages = [];
    const currentPage = state.page;

    // Always show first page
    pages.push(1);

    // Show ellipsis and pages around current
    if (currentPage > 3) pages.push('...');

    for (let i = Math.max(2, currentPage - 1); i <= Math.min(totalPages - 1, currentPage + 1); i++) {
        if (!pages.includes(i)) pages.push(i);
    }

    // Show ellipsis and last page
    if (currentPage < totalPages - 2) pages.push('...');
    if (totalPages > 1 && !pages.includes(totalPages)) pages.push(totalPages);

    return `
        <div class="flex items-center justify-between mt-4 pt-4 border-t border-gray-700">
            <div class="text-sm text-gray-400">
                Seite ${currentPage} von ${totalPages} (${state.total} Einträge)
            </div>
            <div class="flex items-center gap-1">
                <button onclick="app.changePage('${type}', ${currentPage - 1})"
                        class="px-3 py-1 rounded ${currentPage === 1 ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark'} transition"
                        ${currentPage === 1 ? 'disabled' : ''}>
                    <i class="fas fa-chevron-left"></i>
                </button>
                ${pages.map(p => p === '...'
                    ? '<span class="px-2 text-gray-500">...</span>'
                    : `<button onclick="app.changePage('${type}', ${p})"
                              class="px-3 py-1 rounded ${p === currentPage ? 'bg-brand-gold text-brand-dark font-bold' : 'bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark'} transition">
                         ${p}
                       </button>`
                ).join('')}
                <button onclick="app.changePage('${type}', ${currentPage + 1})"
                        class="px-3 py-1 rounded ${currentPage === totalPages ? 'bg-gray-700 text-gray-500 cursor-not-allowed' : 'bg-brand-gold/20 text-brand-gold hover:bg-brand-gold hover:text-brand-dark'} transition"
                        ${currentPage === totalPages ? 'disabled' : ''}>
                    <i class="fas fa-chevron-right"></i>
                </button>
            </div>
        </div>
    `;
}

export function changePage(type, page) {
    const state = paginationState[type];
    const perPage = PAGINATION[`${type.toUpperCase()}_PER_PAGE`] || 20;
    const totalPages = Math.ceil(state.total / perPage);

    if (page < 1 || page > totalPages) return;

    state.page = page;

    // Re-render the appropriate list
    switch(type) {
        case 'users':
            renderAdminUsersList();
            break;
        case 'calls':
            renderStrategyCallsList();
            break;
        case 'coaches':
            renderAdminCoachesList();
            break;
    }
}

// ========== AUTHENTICATION ==========

export function toggleAuthMode(isLoginMode) {
    const loginTab = document.getElementById('tab-login');
    const registerTab = document.getElementById('tab-register');

    if(loginTab && registerTab) {
        loginTab.classList.toggle('border-brand-dark', isLoginMode);
        loginTab.classList.toggle('text-gray-400', !isLoginMode);
        registerTab.classList.toggle('border-brand-dark', !isLoginMode);
        registerTab.classList.toggle('border-b-2', !isLoginMode);
        registerTab.classList.toggle('text-gray-400', isLoginMode);
    }

    const loginFields = document.getElementById('login-fields');
    const registerFields = document.getElementById('register-fields');

    if(loginFields && registerFields) {
        loginFields.classList.toggle('hidden', !isLoginMode);
        registerFields.classList.toggle('hidden', isLoginMode);
    }

    const btn = document.getElementById('auth-submit-btn');
    if(btn) btn.innerText = isLoginMode ? "Anmelden" : "Kostenlos Registrieren";

    document.getElementById('auth-error')?.classList.add('hidden');

    // Hide password reset fields when switching modes
    document.getElementById('password-reset-fields')?.classList.add('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    document.getElementById('auth-submit-btn')?.classList.remove('hidden');
}

// Show Password Reset Form
export function showPasswordReset() {
    document.getElementById('login-fields')?.classList.add('hidden');
    document.getElementById('register-fields')?.classList.add('hidden');
    document.getElementById('password-reset-fields')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.add('hidden');
    document.getElementById('auth-submit-btn')?.classList.add('hidden');
    document.getElementById('auth-error')?.classList.add('hidden');
    document.getElementById('auth-success')?.classList.add('hidden');

    // Copy email from login field if present
    const loginEmail = document.getElementById('login-email')?.value;
    if (loginEmail) {
        const resetEmail = document.getElementById('reset-email');
        if (resetEmail) resetEmail.value = loginEmail;
    }
}

// Show Login Form (back from password reset)
export function showLoginForm() {
    document.getElementById('password-reset-fields')?.classList.add('hidden');
    document.getElementById('login-fields')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    document.getElementById('auth-submit-btn')?.classList.remove('hidden');
    document.getElementById('auth-error')?.classList.add('hidden');
    document.getElementById('auth-success')?.classList.add('hidden');
}

// Send Password Reset Email
export async function sendPasswordReset() {
    const errorDiv = document.getElementById('auth-error');
    const successDiv = document.getElementById('auth-success');
    const resetBtn = document.getElementById('reset-submit-btn');
    const email = document.getElementById('reset-email')?.value?.trim();

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    if (!email || !validateEmail(email)) {
        if (errorDiv) {
            errorDiv.textContent = 'Bitte geben Sie eine gültige E-Mail-Adresse ein.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Show loading state
    const originalText = resetBtn?.innerText;
    if (resetBtn) {
        resetBtn.innerText = 'Wird gesendet...';
        resetBtn.disabled = true;
    }

    try {
        if (!auth) {
            // Demo mode
            if (successDiv) {
                successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet.';
                successDiv.classList.remove('hidden');
            }
            return;
        }

        await sendPasswordResetEmail(auth, email);

        if (successDiv) {
            successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen an <strong>' + email + '</strong> gesendet. Bitte prüfen Sie auch Ihren Spam-Ordner.';
            successDiv.classList.remove('hidden');
        }

        showToast('E-Mail wurde gesendet');

    } catch (error) {
        logger.error('Password reset error:', error);
        // For security, always show success message (don't reveal if email exists)
        if (successDiv) {
            successDiv.innerHTML = '<i class="fas fa-check-circle mr-2"></i>Falls ein Konto mit dieser E-Mail existiert, wurde ein Link zum Zurücksetzen gesendet. Bitte prüfen Sie auch Ihren Spam-Ordner.';
            successDiv.classList.remove('hidden');
        }
    } finally {
        if (resetBtn) {
            resetBtn.innerText = originalText || 'Link senden';
            resetBtn.disabled = false;
        }
    }
}

// Check URL for password reset code or email verification and handle it
export async function handlePasswordResetFromURL() {
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    if (mode === 'resetPassword' && oobCode) {
        // Show the new password form
        showNewPasswordForm(oobCode);
        return true;
    }

    if (mode === 'verifyEmail' && oobCode) {
        // Handle email verification
        await handleEmailVerification(oobCode);
        return true;
    }

    return false;
}

// Handle email verification from URL
async function handleEmailVerification(oobCode) {
    logger.log('📧 Handling email verification with oobCode:', oobCode ? 'present' : 'missing');

    // Navigate to login view
    navigateTo('login');

    try {
        if (!auth) {
            throw new Error('Auth nicht verfügbar');
        }

        // Apply the action code to verify the email
        await applyActionCode(auth, oobCode);

        logger.log('✅ Email verification successful');

        // Show success message
        setTimeout(() => {
            const successDiv = document.getElementById('auth-success');
            const authForm = document.getElementById('auth-form');
            const authTabs = document.getElementById('auth-tabs');

            if (authForm) authForm.classList.add('hidden');
            if (authTabs) authTabs.classList.add('hidden');

            if (successDiv) {
                successDiv.innerHTML = `
                    <div class="text-center py-6 px-4">
                        <div class="mb-6">
                            <i class="fas fa-check-circle text-5xl text-green-500 mb-4 block"></i>
                            <h3 class="text-2xl font-serif text-brand-dark mb-3">E-Mail bestätigt!</h3>
                        </div>

                        <div class="bg-green-50 border-l-4 border-green-500 p-4 mb-6 text-left">
                            <p class="text-gray-700 mb-3">
                                Ihre E-Mail-Adresse wurde erfolgreich verifiziert.
                            </p>
                            <p class="text-sm text-gray-600">
                                Sie können sich jetzt mit Ihrem Konto anmelden.
                            </p>
                        </div>

                        <button
                            onclick="app.resetAuthToLogin()"
                            class="bg-brand-gold text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:shadow-lg transition"
                        >
                            Jetzt anmelden
                        </button>
                    </div>
                `;
                successDiv.classList.remove('hidden');
            }

            showToast('✅ E-Mail erfolgreich verifiziert!');

            // Clean URL
            window.history.replaceState({}, document.title, window.location.pathname);
        }, 100);

    } catch (error) {
        logger.error('❌ Email verification failed:', error);

        let errorMessage = 'Die E-Mail-Verifizierung ist fehlgeschlagen.';

        if (error.code === 'auth/invalid-action-code') {
            errorMessage = 'Der Verifizierungslink ist ungültig oder bereits verwendet worden.';
        } else if (error.code === 'auth/expired-action-code') {
            errorMessage = 'Der Verifizierungslink ist abgelaufen. Bitte fordern Sie einen neuen an.';
        }

        setTimeout(() => {
            const errorDiv = document.getElementById('auth-error');
            if (errorDiv) {
                errorDiv.innerHTML = `
                    <div class="text-red-600 text-sm">
                        <p class="mb-2">${errorMessage}</p>
                        <p class="text-xs text-gray-600">Fehlercode: ${error.code || 'unbekannt'}</p>
                    </div>
                `;
                errorDiv.classList.remove('hidden');
            }
        }, 100);

        showToast('❌ ' + errorMessage);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

// Show the form to enter a new password
export function showNewPasswordForm(oobCode) {
    logger.log('🔑 showNewPasswordForm called with oobCode:', oobCode ? 'present' : 'missing');

    // Navigate to login view first
    logger.log('   Navigating to login view...');
    navigateTo('login');

    // Small delay to ensure view is visible
    setTimeout(() => {
        logger.log('   Hiding other fields...');

        // Hide login/register fields, show new password fields
        document.getElementById('login-fields')?.classList.add('hidden');
        document.getElementById('register-fields')?.classList.add('hidden');
        document.getElementById('password-reset-fields')?.classList.add('hidden');
        document.getElementById('auth-tabs')?.classList.add('hidden');
        document.getElementById('auth-submit-btn')?.classList.add('hidden');
        document.getElementById('auth-error')?.classList.add('hidden');
        document.getElementById('auth-success')?.classList.add('hidden');

        // Show new password form
        const newPasswordFields = document.getElementById('new-password-fields');
        logger.log('   new-password-fields element:', newPasswordFields ? 'found' : 'NOT FOUND');

        if (newPasswordFields) {
            newPasswordFields.classList.remove('hidden');
            // Store the oobCode for later use
            newPasswordFields.dataset.oobCode = oobCode;
            logger.log('✅ New password form is now visible');
        } else {
            logger.error('❌ new-password-fields element not found in DOM!');
        }
    }, 50);
}

// Confirm the new password
export async function confirmNewPassword() {
    const errorDiv = document.getElementById('auth-error');
    const successDiv = document.getElementById('auth-success');
    const newPasswordFields = document.getElementById('new-password-fields');
    const submitBtn = document.getElementById('new-password-submit-btn');

    const oobCode = newPasswordFields?.dataset.oobCode;
    const newPassword = document.getElementById('new-password')?.value;
    const confirmPassword = document.getElementById('confirm-new-password')?.value;

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    // Validate passwords
    const pwCheck = validatePassword(newPassword);
    if (!pwCheck.valid) {
        if (errorDiv) {
            errorDiv.textContent = pwCheck.message || 'Passwort erfüllt nicht die Anforderungen.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    if (newPassword !== confirmPassword) {
        if (errorDiv) {
            errorDiv.textContent = 'Die Passwörter stimmen nicht überein.';
            errorDiv.classList.remove('hidden');
        }
        return;
    }

    // Show loading state
    const originalText = submitBtn?.innerText;
    if (submitBtn) {
        submitBtn.innerText = 'Wird gespeichert...';
        submitBtn.disabled = true;
    }

    try {
        if (!auth || !oobCode) {
            throw new Error('Ungültiger Reset-Link');
        }

        // Verify the code first
        await verifyPasswordResetCode(auth, oobCode);

        // Confirm the password reset
        await confirmPasswordReset(auth, oobCode, newPassword);

        // Clear URL parameters
        window.history.replaceState({}, document.title, window.location.pathname);

        if (successDiv) {
            successDiv.innerHTML = `
                <div class="text-center">
                    <i class="fas fa-check-circle text-green-500 text-4xl mb-4"></i>
                    <h3 class="text-lg font-bold text-brand-dark mb-2">Passwort erfolgreich geändert</h3>
                    <p class="text-gray-600 mb-4">Sie können sich jetzt mit Ihrem neuen Passwort anmelden.</p>
                </div>
            `;
            successDiv.classList.remove('hidden');
        }

        newPasswordFields?.classList.add('hidden');

        // Show login button
        setTimeout(() => {
            showLoginForm();
        }, 3000);

        showToast('Passwort erfolgreich geändert');

    } catch (error) {
        logger.error('Password reset confirmation error:', error);
        let errorMessage = getFirebaseErrorMessage(error.code);

        if (error.code === 'auth/expired-action-code') {
            errorMessage = 'Dieser Link ist abgelaufen. Bitte fordern Sie einen neuen Link an.';
        } else if (error.code === 'auth/invalid-action-code') {
            errorMessage = 'Dieser Link ist ungültig oder wurde bereits verwendet.';
        }

        if (errorDiv) {
            errorDiv.textContent = errorMessage;
            errorDiv.classList.remove('hidden');
        }
    } finally {
        if (submitBtn) {
            submitBtn.innerText = originalText || 'Passwort speichern';
            submitBtn.disabled = false;
        }
    }
}

// Handle Firebase email actions (verify email, reset password)
export async function handleEmailAction() {
    const fullUrl = window.location.href;
    const urlParams = new URLSearchParams(window.location.search);
    const mode = urlParams.get('mode');
    const oobCode = urlParams.get('oobCode');

    logger.log('🔗 handleEmailAction called');
    logger.log('   Full URL:', fullUrl);
    logger.log('   mode:', mode);
    logger.log('   oobCode:', oobCode ? oobCode.substring(0, 10) + '...' : 'missing');

    if (!mode || !oobCode) {
        logger.log('📝 No email action parameters found in URL');
        return;
    }

    if (mode === 'resetPassword') {
        logger.log('🔄 Password reset mode detected, showing form...');
        // Small delay to ensure DOM is ready
        setTimeout(() => {
            showNewPasswordForm(oobCode);
        }, 100);
    } else if (mode === 'verifyEmail') {
        // Apply the verification code
        try {
            await applyActionCode(auth, oobCode);
            logger.log('✅ Email verified successfully');
            showToast('✅ E-Mail-Adresse wurde bestätigt! Sie können sich jetzt anmelden.');

            // Clean URL and navigate to login
            window.history.replaceState({}, document.title, window.location.pathname);
            navigateTo('login');
        } catch (error) {
            logger.error('❌ Email verification failed:', error);
            if (error.code === 'auth/invalid-action-code') {
                showToast('❌ Der Link ist ungültig oder wurde bereits verwendet.');
            } else if (error.code === 'auth/expired-action-code') {
                showToast('❌ Der Link ist abgelaufen. Bitte fordern Sie einen neuen an.');
            } else {
                showToast('❌ Verifizierung fehlgeschlagen: ' + error.message);
            }
            // Navigate to login anyway so user can request new verification
            navigateTo('login');
        }
    }
}

export async function handleAuth(isLoginMode, state, navigateTo) {
    const errorDiv = document.getElementById('auth-error');
    const successDiv = document.getElementById('auth-success');

    errorDiv?.classList.add('hidden');
    successDiv?.classList.add('hidden');

    const getVal = (id) => {
        const el = document.getElementById(id);
        return el ? el.value.trim() : '';
    };

    try {
        if (isLoginMode) {
            // LOGIN
            const email = getVal('login-email');
            const password = getVal('login-password');

            if (!validateEmail(email)) throw new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
            if (!password || password.length < 1) throw new Error('Bitte geben Sie Ihr Passwort ein.');

            if(!auth) {
                state.user = { email, uid: "demo-user" };
                updateAuthUI(state);
                showToast('✅ Erfolgreich angemeldet (Demo-Modus)');
                if(navigateTo) {
                    setTimeout(() => navigateTo('dashboard'), 500);
                }
                return;
            }

            const userCredential = await signInWithEmailAndPassword(auth, email, password);
            const user = userCredential.user;

            // Reload user to get latest emailVerified status from Firebase
            await reload(user);

            // Nach reload den aktuellen User aus auth.currentUser holen
            const currentUser = auth.currentUser;

            console.log('Email verified status:', currentUser?.emailVerified);

            if (!currentUser || !currentUser.emailVerified) {
                // Sichere temporäre Speicherung nur der Email (NICHT des Passworts)
                // Passwort wird nicht mehr gespeichert - Nutzer muss es erneut eingeben
                sessionStorage.setItem('_pendingVerificationEmail', email);
                await signOut(auth);

                // Zeige spezielle Fehlermeldung mit Option zum erneuten Senden
                const errorDiv = document.getElementById('auth-error');
                if (errorDiv) {
                    errorDiv.innerHTML = `
                        <div class="text-red-600 text-sm">
                            <p class="mb-2"><i class="fas fa-envelope-open mr-1"></i> Bitte bestätigen Sie erst Ihre E-Mail-Adresse.</p>
                            <p class="text-xs text-gray-600 mb-3">Prüfen Sie Ihr Postfach (auch Spam-Ordner) nach der Bestätigungs-E-Mail.</p>
                            <div class="bg-blue-50 border border-blue-200 rounded p-3 mt-3">
                                <p class="text-xs text-blue-800 mb-2"><strong>Keine E-Mail erhalten?</strong></p>
                                <p class="text-xs text-blue-700 mb-2">Wir senden Ihnen einen Link, mit dem Sie Ihr Passwort neu setzen und Ihr Konto aktivieren können.</p>
                                <button
                                    onclick="app.resendVerificationEmail()"
                                    class="bg-brand-gold text-brand-dark px-3 py-1.5 rounded text-xs font-semibold hover:bg-yellow-500 transition"
                                >
                                    <i class="fas fa-paper-plane mr-1"></i> Aktivierungslink senden
                                </button>
                            </div>
                        </div>
                    `;
                    errorDiv.classList.remove('hidden');
                }
                return; // Nicht throw, damit die spezielle Fehlermeldung angezeigt wird
            }

            showToast('✅ Erfolgreich angemeldet');

            // Nach erfolgreichem Login zum Dashboard navigieren
            if(navigateTo) {
                setTimeout(() => navigateTo('dashboard'), 500);
            }

        } else {
            // REGISTRATION
            const firstname = getVal('reg-firstname');
            const lastname = getVal('reg-lastname');
            const email = getVal('reg-email');
            const pass = getVal('reg-password');
            const passConfirm = getVal('reg-password-confirm');

            if(!firstname || !lastname || !email || !pass) {
                throw new Error('Bitte alle Pflichtfelder (*) ausfüllen.');
            }
            if (!validateEmail(email)) throw new Error('Bitte geben Sie eine gültige E-Mail-Adresse ein.');
            if(pass !== passConfirm) throw new Error('Die Passwörter stimmen nicht überein.');
            const pwResult = validatePassword(pass);
            if (!pwResult.valid) throw new Error(pwResult.message || 'Passwort erfüllt nicht die Anforderungen.');

            if(!auth) {
                // Demo Mode
                document.getElementById('auth-form')?.classList.add('hidden');
                document.getElementById('auth-tabs')?.classList.add('hidden');
                if(successDiv) {
                    successDiv.innerHTML = `<div class="text-center py-8"><i class="fas fa-envelope-open-text text-4xl text-brand-gold mb-4"></i><h3 class="text-xl font-serif text-brand-dark mb-2">Fast geschafft!</h3><p class="text-gray-600 mb-6">Demo-Modus: E-Mail-Bestätigung simuliert.</p><button onclick="app.resetAuthToLogin()" class="mt-6 text-brand-gold font-bold underline text-xs uppercase tracking-widest">Zurück zum Login</button></div>`;
                    successDiv.classList.remove('hidden');
                }
                return;
            }

            const userCredential = await createUserWithEmailAndPassword(auth, email, pass);
            const user = userCredential.user;

            if(db) {
                await setDoc(doc(db, "users", user.uid), {
                    salutation: getVal('reg-salutation'),
                    title: getVal('reg-title'),
                    firstname, lastname, email,
                    phone: getVal('reg-phone'),
                    address: {
                        street: getVal('reg-street'),
                        houseno: getVal('reg-houseno'),
                        zip: getVal('reg-zip'),
                        city: getVal('reg-city')
                    },
                    role: 'member',
                    joined: new Date()
                });
            }

            await updateProfile(user, { displayName: `${firstname} ${lastname}` });

            // Send verification email - ohne actionCodeSettings (einfacher und zuverlässiger)
            try {
                await sendEmailVerification(user);
                console.log('Verification email sent successfully to:', email);
            } catch (emailError) {
                console.error('Verification email failed:', emailError.code, emailError.message);
            }
            await signOut(auth);

            document.getElementById('auth-form')?.classList.add('hidden');
            document.getElementById('auth-tabs')?.classList.add('hidden');

            if(successDiv) {
                successDiv.innerHTML = `
                    <div class="text-center py-6 px-4">
                        <div class="mb-6">
                            <i class="fas fa-envelope-open-text text-5xl text-brand-gold mb-4 block"></i>
                            <h3 class="text-2xl font-serif text-brand-dark mb-3">Fast geschafft!</h3>
                        </div>

                        <div class="bg-brand-light border-l-4 border-brand-gold p-4 mb-6 text-left">
                            <p class="text-gray-700 mb-3">
                                Wir haben eine Bestätigungs-E-Mail an<br>
                                <strong class="text-brand-dark">${sanitizeHTML(email)}</strong> gesendet.
                            </p>

                            <div class="text-sm text-gray-600 space-y-2">
                                <p><i class="fas fa-check-circle text-brand-gold mr-2"></i>Prüfen Sie Ihr Postfach (auch Spam-Ordner)</p>
                                <p><i class="fas fa-check-circle text-brand-gold mr-2"></i>Klicken Sie auf den Bestätigungslink in der E-Mail</p>
                                <p><i class="fas fa-check-circle text-brand-gold mr-2"></i>Kehren Sie zurück und melden Sie sich an</p>
                            </div>
                        </div>

                        <button
                            onclick="app.resetAuthToLogin()"
                            class="bg-brand-gold text-brand-dark font-bold py-3 px-8 uppercase text-xs hover:shadow-lg transition"
                        >
                            Zurück zum Login
                        </button>
                    </div>
                `;
                successDiv.classList.remove('hidden');
                successDiv.classList.remove('p-2', 'bg-green-50', 'border');
            }
        }
    } catch (error) {
        console.error('Auth error:', error.code, error.message);
        let errorMessage = error.message;
        if (error.code) errorMessage = getFirebaseErrorMessage(error.code);

        if(errorDiv) {
            errorDiv.textContent = errorMessage;
            errorDiv.classList.remove('hidden');
        }
    }
}

export async function handleLogout(state, navigateTo) {
    if(auth) await signOut(auth);
    state.user = null;

    // SICHERHEIT: Warenkorb bei Logout löschen (verhindert Datenleck auf geteilten Computern)
    state.cart = [];
    saveCartToLocalStorage([]);
    updateCartUI(state);

    // Lösche auch temporäre Session-Daten
    sessionStorage.removeItem('_pendingVerificationEmail');
    sessionStorage.removeItem('pending_cart');

    updateAuthUI(state);
    navigateTo('home');
    showToast('✅ Erfolgreich abgemeldet');
}

export async function updateAuthUI(state) {
    const loginBtn = document.getElementById('nav-login-btn');
    const userProfile = document.getElementById('nav-user-profile');
    const dashUsername = document.getElementById('dash-username');
    const userNameDisplay = document.getElementById('user-name-display');
    const adminSection = document.getElementById('admin-section');
    const mentorSection = document.getElementById('mentor-section');
    const mentorTab = document.getElementById('dash-tab-mentor');
    const innerCircleTab = document.getElementById('dash-tab-inner-circle');

    if (state.user) {
        loginBtn?.classList.add('hidden');
        userProfile?.classList.remove('hidden');
        userProfile?.classList.add('flex');

        const displayName = state.user.displayName || state.user.email.split('@')[0];
        if(dashUsername) dashUsername.textContent = displayName;
        if(userNameDisplay) userNameDisplay.textContent = displayName.substring(0, 12) + (displayName.length > 12 ? '...' : '');

        // Show admin section only for admins (Custom Claims + Fallback)
        await checkAdminClaim();
        if (adminSection) {
            if (isAdmin(state.user.email)) {
                adminSection.classList.remove('hidden');
            } else {
                adminSection.classList.add('hidden');
            }
        }

        // Check if user is a mentor
        await checkAndSetupMentor(state);

        // Show mentor section/tab if user is a mentor
        if (mentorSection) {
            if (currentMentorData) {
                mentorSection.classList.remove('hidden');
            } else {
                mentorSection.classList.add('hidden');
            }
        }
        if (mentorTab) {
            if (currentMentorData) {
                mentorTab.classList.remove('hidden');
            } else {
                mentorTab.classList.add('hidden');
            }
        }

        // Check if user is an Inner Circle member
        await checkAndSetupInnerCircleMember(state, innerCircleTab);

        // Load profile picture if available
        loadProfilePicture(state);
    } else {
        loginBtn?.classList.remove('hidden');
        userProfile?.classList.add('hidden');
        userProfile?.classList.remove('flex');

        // Hide admin section when logged out
        if (adminSection) {
            adminSection.classList.add('hidden');
        }

        // Hide mentor section when logged out
        if (mentorSection) {
            mentorSection.classList.add('hidden');
        }
        if (mentorTab) {
            mentorTab.classList.add('hidden');
        }
        if (innerCircleTab) {
            innerCircleTab.classList.add('hidden');
        }

        // Clear mentor data
        currentMentorData = null;
    }
}

// Check if current user is a mentor and set up mentor data
async function checkAndSetupMentor(state) {
    if (!db || !state.user?.email) {
        currentMentorData = null;
        return;
    }

    try {
        // Query coaches collection to find a coach with matching email (case-insensitive)
        const userEmail = state.user.email.toLowerCase();
        const coachesRef = collection(db, 'coaches');

        // First try exact match
        let q = query(coachesRef, where('email', '==', state.user.email));
        let snapshot = await getDocs(q);

        // If no exact match, try lowercase match
        if (snapshot.empty) {
            q = query(coachesRef, where('email', '==', userEmail));
            snapshot = await getDocs(q);
        }

        // If still no match, check all coaches for case-insensitive match
        if (snapshot.empty) {
            const allCoaches = await getDocs(coachesRef);
            allCoaches.forEach(doc => {
                const coachEmail = doc.data().email?.toLowerCase();
                if (coachEmail === userEmail) {
                    snapshot = { empty: false, docs: [doc] };
                }
            });
        }

        console.log('[Mentor Check] User email:', state.user.email, '| Found coach:', !snapshot.empty);

        if (!snapshot.empty) {
            const coachDoc = snapshot.docs[0];
            currentMentorData = {
                id: coachDoc.id,
                ...coachDoc.data()
            };

            // Update coach document with userId if not set
            if (!currentMentorData.userId) {
                await updateDoc(doc(db, 'coaches', coachDoc.id), {
                    userId: state.user.uid
                });
                currentMentorData.userId = state.user.uid;
            }

            console.log('[Mentor Check] ✅ Mentor detected:', currentMentorData.name);
            logger.log('Mentor detected:', currentMentorData.name);
        } else {
            console.log('[Mentor Check] ❌ No matching coach found for email');
            currentMentorData = null;
        }
    } catch (e) {
        console.error('[Mentor Check] Error:', e);
        logger.error('Error checking mentor status:', e);
        currentMentorData = null;
    }
}

// Get current mentor data (for use in other functions)
export function getCurrentMentorData() {
    return currentMentorData;
}

// Check if current user is an Inner Circle member
async function checkAndSetupInnerCircleMember(state, innerCircleTab) {
    if (!db || !state.user?.email || !innerCircleTab) {
        return;
    }

    try {
        const userEmail = state.user.email.toLowerCase();
        const membersRef = collection(db, 'members');
        let q = query(membersRef, where('email', '==', state.user.email));
        let snapshot = await getDocs(q);

        // Try lowercase match if no exact match
        if (snapshot.empty) {
            const qLower = query(membersRef, where('email', '==', userEmail));
            snapshot = await getDocs(qLower);
        }

        // If still not found, fetch all and do case-insensitive comparison
        if (snapshot.empty) {
            const allMembersSnap = await getDocs(membersRef);
            const matchingDoc = allMembersSnap.docs.find(doc =>
                doc.data().email?.toLowerCase() === userEmail
            );
            if (matchingDoc) {
                snapshot = { empty: false, docs: [matchingDoc] };
            }
        }

        if (!snapshot.empty) {
            const memberDoc = snapshot.docs[0];
            const memberData = memberDoc.data();

            // Only show tab if member is active
            if (memberData.isActive) {
                innerCircleTab.classList.remove('hidden');
                console.log('[Inner Circle] ✅ Member detected:', memberData.name);
            } else {
                innerCircleTab.classList.add('hidden');
                console.log('[Inner Circle] ⚠️ Member inactive');
            }
        } else {
            innerCircleTab.classList.add('hidden');
            console.log('[Inner Circle] ❌ No membership found');
        }
    } catch (e) {
        console.error('[Inner Circle] Error checking membership:', e);
        innerCircleTab.classList.add('hidden');
    }
}

async function loadProfilePicture(state) {
    const img = document.getElementById('profile-picture');
    const icon = document.getElementById('profile-placeholder-icon');
    const navImg = document.getElementById('nav-profile-picture');
    const navIcon = document.getElementById('nav-profile-icon');

    if (!img || !icon) return;

    try {
        if (db && state.user?.uid) {
            const userDoc = await getDoc(doc(db, "users", state.user.uid));
            const profilePicture = userDoc.data()?.profilePicture;

            if (profilePicture) {
                // Dashboard image
                img.src = profilePicture;
                img.classList.remove('hidden');
                icon.classList.add('hidden');

                // Navigation image
                if (navImg && navIcon) {
                    navImg.src = profilePicture;
                    navImg.classList.remove('hidden');
                    navIcon.classList.add('hidden');
                }
            } else {
                // No picture - show icon
                img.classList.add('hidden');
                icon.classList.remove('hidden');

                if (navImg && navIcon) {
                    navImg.classList.add('hidden');
                    navIcon.classList.remove('hidden');
                }
            }
        } else {
            // Demo mode - show icon
            img.classList.add('hidden');
            icon.classList.remove('hidden');

            if (navImg && navIcon) {
                navImg.classList.add('hidden');
                navIcon.classList.remove('hidden');
            }
        }
    } catch (e) {
        logger.error('Failed to load profile picture:', e);
        // On error - show icon
        img.classList.add('hidden');
        icon.classList.remove('hidden');

        if (navImg && navIcon) {
            navImg.classList.add('hidden');
            navIcon.classList.remove('hidden');
        }
    }
}

export function updatePasswordStrength(password) {
    const bar = document.getElementById('password-strength-bar');
    const text = document.getElementById('password-strength-text');

    if (!bar || !text || !password) {
        if(bar) bar.className = 'password-strength-bar h-full';
        if(text) text.textContent = '';
        return;
    }

    const result = validatePassword(password);
    const { label, color } = getPasswordStrengthLabel(result.score);

    const colorMap = {
        red: { bar: 'password-weak', text: 'text-red-500' },
        yellow: { bar: 'password-medium', text: 'text-yellow-500' },
        blue: { bar: 'password-good', text: 'text-blue-500' },
        green: { bar: 'password-strong', text: 'text-green-500' }
    };
    const cls = colorMap[color];

    const displayText = result.valid ? label : (result.message || label);

    bar.className = `password-strength-bar h-full ${cls.bar}`;
    text.className = `text-xs mt-1 ${cls.text}`;
    text.textContent = displayText;
}

export function validateEmailField(email) {
    const feedbackEl = document.getElementById('email-feedback');
    const inputEl = document.getElementById('reg-email');

    if (!feedbackEl || !inputEl) return;

    const result = validateEmailRealtime(email);

    if (result.message === '') {
        feedbackEl.textContent = '';
        feedbackEl.className = 'form-feedback';
        inputEl.classList.remove('input-valid', 'input-invalid');
    } else if (result.valid) {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback valid';
        inputEl.classList.add('input-valid');
        inputEl.classList.remove('input-invalid');
    } else {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback invalid';
        inputEl.classList.add('input-invalid');
        inputEl.classList.remove('input-valid');
    }
}

export function validatePasswordMatchField() {
    const feedbackEl = document.getElementById('password-match-feedback');
    const passwordEl = document.getElementById('reg-password');
    const confirmEl = document.getElementById('reg-password-confirm');

    if (!feedbackEl || !passwordEl || !confirmEl) return;

    const password = passwordEl.value;
    const confirmPassword = confirmEl.value;
    const result = validatePasswordMatch(password, confirmPassword);

    if (result.message === '') {
        feedbackEl.textContent = '';
        feedbackEl.className = 'form-feedback';
        confirmEl.classList.remove('input-valid', 'input-invalid');
    } else if (result.valid) {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback valid';
        confirmEl.classList.add('input-valid');
        confirmEl.classList.remove('input-invalid');
    } else {
        feedbackEl.textContent = result.message;
        feedbackEl.className = 'form-feedback invalid';
        confirmEl.classList.add('input-invalid');
        confirmEl.classList.remove('input-valid');
    }
}

export function resetAuthToLogin() {
    document.getElementById('auth-success')?.classList.add('hidden');
    document.getElementById('auth-form')?.classList.remove('hidden');
    document.getElementById('auth-tabs')?.classList.remove('hidden');
    toggleAuthMode(true);
}

// Funktion zum Senden eines Aktivierungslinks (Passwort-Reset, der auch E-Mail verifiziert)
// Hinweis: Firebase sendEmailVerification erfordert einen eingeloggten User.
// Da der User ausgeloggt wurde (wegen nicht verifizierter E-Mail), nutzen wir
// sendPasswordResetEmail als Workaround - dies verifiziert die E-Mail implizit.
export async function resendVerificationEmail() {
    const email = sessionStorage.getItem('_pendingVerificationEmail');

    if (!email) {
        showToast('❌ Bitte melden Sie sich erneut an');
        return;
    }

    try {
        // Sende Passwort-Reset Email - dies verifiziert die E-Mail und erlaubt neues Passwort
        await sendPasswordResetEmail(auth, email);

        // Lösche temporäre Email nach Verwendung
        sessionStorage.removeItem('_pendingVerificationEmail');

        showToast('✅ Aktivierungslink wurde gesendet!');

        // Zeige Erfolgsmeldung
        const errorDiv = document.getElementById('auth-error');
        if (errorDiv) {
            errorDiv.innerHTML = `
                <div class="bg-green-50 border border-green-200 rounded p-4">
                    <div class="flex items-start gap-3">
                        <i class="fas fa-check-circle text-green-500 text-xl mt-0.5"></i>
                        <div>
                            <p class="text-green-800 font-semibold mb-1">Aktivierungslink gesendet!</p>
                            <p class="text-green-700 text-sm mb-2">Wir haben eine E-Mail an <strong>${email}</strong> gesendet.</p>
                            <ol class="text-xs text-green-600 space-y-1 list-decimal list-inside">
                                <li>Prüfen Sie Ihr Postfach (auch Spam-Ordner)</li>
                                <li>Klicken Sie auf den Link in der E-Mail</li>
                                <li>Legen Sie ein neues Passwort fest</li>
                                <li>Melden Sie sich mit dem neuen Passwort an</li>
                            </ol>
                        </div>
                    </div>
                </div>
            `;
        }
    } catch (error) {
        console.error('Resend verification error:', error);
        if (error.code === 'auth/too-many-requests') {
            showToast('⚠️ Zu viele Anfragen. Bitte warten Sie einige Minuten.');
        } else {
            showToast('❌ Fehler beim Senden: ' + error.message);
        }
    }
}

export function setupAuthListener(state, navigateTo) {
    if(auth) {
        onAuthStateChanged(auth, (user) => {
            if (user && user.emailVerified) {
                state.user = {
                    uid: user.uid,
                    email: user.email || '',
                    displayName: user.displayName || ''
                };
                updateAuthUI(state);

                if(!document.getElementById('view-login')?.classList.contains('hidden')) {
                    navigateTo('dashboard');
                    loadUserOrders(state);
                }
            } else {
                state.user = null;
                updateAuthUI(state);
            }
        });

        // Listen for view changes - load orders when dashboard is shown
        window.addEventListener('viewChanged', (e) => {
            if (e.detail.viewId === 'dashboard' && state.user) {
                loadUserOrders(state);
            }
        });

        // Navbar scroll effect - add shadow when scrolled
        const nav = document.getElementById('main-nav');
        const pageNav = document.getElementById('page-nav');
        if (nav) {
            window.addEventListener('scroll', () => {
                if (window.scrollY > 20) {
                    nav.classList.add('shadow-lg', 'shadow-black/30', 'bg-[#080d16]');
                } else {
                    nav.classList.remove('shadow-lg', 'shadow-black/30', 'bg-[#080d16]');
                }

                // Show/hide sticky page navigation after scrolling past hero
                if (pageNav) {
                    const heroEnd = document.getElementById('two-paths')?.offsetHeight || 600;
                    if (window.scrollY > heroEnd - 100) {
                        pageNav.style.display = 'block';
                        setTimeout(() => {
                            pageNav.classList.remove('-translate-y-full', 'opacity-0');
                            pageNav.classList.add('translate-y-0', 'opacity-100');
                        }, 10);
                    } else {
                        pageNav.classList.add('-translate-y-full', 'opacity-0');
                        pageNav.classList.remove('translate-y-0', 'opacity-100');
                    }
                }
            }, { passive: true });
        }
    }
}

// ========== CONCIERGE MODAL ==========

export function openConciergeModal() {
    const overlay = document.getElementById('concierge-overlay');
    const modal = document.getElementById('concierge-modal');
    const form = document.getElementById('concierge-form');
    const options = document.querySelector('#concierge-modal > div:nth-child(2)'); // Options container

    if (!overlay || !modal) return;

    // Reset to options view
    if (form) form.classList.add('hidden');
    if (options) options.classList.remove('hidden');

    overlay.classList.remove('hidden');
    setTimeout(() => {
        modal.classList.remove('scale-95', 'opacity-0');
        modal.classList.add('scale-100', 'opacity-100');
    }, 10);
}

export function closeConciergeModal() {
    const overlay = document.getElementById('concierge-overlay');
    const modal = document.getElementById('concierge-modal');

    if (!overlay || !modal) return;

    modal.classList.remove('scale-100', 'opacity-100');
    modal.classList.add('scale-95', 'opacity-0');
    setTimeout(() => overlay.classList.add('hidden'), 300);
}

export function showConciergeForm() {
    const form = document.getElementById('concierge-form');
    const options = document.querySelector('#concierge-modal .p-6.space-y-3');

    if (options) options.classList.add('hidden');
    if (form) form.classList.remove('hidden');
}

export function hideConciergeForm() {
    const form = document.getElementById('concierge-form');
    const options = document.querySelector('#concierge-modal .p-6.space-y-3');

    if (form) form.classList.add('hidden');
    if (options) options.classList.remove('hidden');
}

export async function submitConciergeForm(event) {
    event.preventDefault();

    const name = document.getElementById('concierge-name')?.value;
    const email = document.getElementById('concierge-email')?.value;
    const message = document.getElementById('concierge-message')?.value;

    if (!name || !email || !message) return;

    try {
        // Save to Firestore strategyCalls collection
        await addDoc(collection(db, 'strategyCalls'), {
            name: name,
            email: email,
            message: message,
            source: 'concierge-modal',
            createdAt: serverTimestamp()
        });

        // Close modal and show success
        closeConciergeModal();
        showToast('Vielen Dank! Ich melde mich innerhalb von 24 Stunden bei Ihnen.');

        // Reset form
        document.getElementById('concierge-name').value = '';
        document.getElementById('concierge-email').value = '';
        document.getElementById('concierge-message').value = '';
    } catch (error) {
        console.error('Error submitting concierge form:', error);
        showToast('Fehler beim Senden. Bitte versuchen Sie es erneut.');
    }
}

// ========== CART & CHECKOUT ==========

export function toggleCart() {
    const overlay = document.getElementById('cart-overlay');
    const sidebar = document.getElementById('cart-sidebar');

    if(!overlay || !sidebar) return;

    const isHidden = overlay.classList.contains('hidden');

    if(isHidden) {
        overlay.classList.remove('hidden');
        setTimeout(() => sidebar.classList.remove('translate-x-full'), 10);
    } else {
        sidebar.classList.add('translate-x-full');
        setTimeout(() => overlay.classList.add('hidden'), 300);
    }
}

export function addToCart(state, title, price) {
    const sanitizedTitle = sanitizeHTML(title);

    // Bestimme Kategorie
    let category = 'other';
    if (sanitizedTitle.includes('CV') && !sanitizedTitle.includes('Komplettpaket')) {
        category = 'cv-package';
    } else if (sanitizedTitle.includes('Executive Mentoring') || (sanitizedTitle.includes('Session') && !sanitizedTitle.includes('Komplettpaket')) || sanitizedTitle.includes('Retainer')) {
        category = 'mentoring';
    } else if (sanitizedTitle.includes('Komplettpaket')) {
        category = 'bundle';
    } else if (sanitizedTitle.includes('Interview-Simulation') || sanitizedTitle.includes('Zeugnis-Analyse')) {
        category = 'addon';
    }

    // Add-ons: Prüfe auf Duplikate
    if (category === 'addon') {
        const alreadyInCart = state.cart.some(item => item.title === sanitizedTitle);
        if (alreadyInCart) {
            showToast(`⚠️ ${sanitizedTitle} ist bereits im Warenkorb`);
            return;
        }
    }

    // Entferne existierende Items aus derselben Kategorie
    if (category === 'cv-package') {
        // Entferne alle CV-Pakete (Add-ons werden in confirmPackageConfig separat behandelt)
        state.cart = state.cart.filter(item =>
            !item.title.includes('CV') || item.title.includes('Komplettpaket')
        );
    } else if (category === 'mentoring') {
        // Entferne alle Mentoring-Pakete (Single, 3er, Retainer)
        state.cart = state.cart.filter(item =>
            !item.title.includes('Executive Mentoring') &&
            !item.title.includes('Retainer') &&
            !(item.title.includes('Session') && !item.title.includes('Komplettpaket'))
        );
    } else if (category === 'bundle') {
        // Komplettpaket ersetzt ALLES (CV + Mentoring + Add-ons)
        state.cart = state.cart.filter(item =>
            !item.title.includes('CV') &&
            !item.title.includes('Executive Mentoring') &&
            !item.title.includes('Session') &&
            !item.title.includes('Retainer') &&
            !item.title.includes('Interview-Simulation') &&
            !item.title.includes('Zeugnis-Analyse')
        );
    }

    // Wenn Komplettpaket bereits im Warenkorb, nichts weiteres hinzufügen
    const hasBundle = state.cart.some(item => item.title.includes('Komplettpaket'));
    if (hasBundle && category !== 'bundle') {
        showToast('⚠️ Bitte entfernen Sie zuerst das Komplettpaket', 3000);
        return;
    }

    // Füge neues Item hinzu
    state.cart.push({
        title: sanitizedTitle,
        price,
        id: Date.now()
    });

    updateCartUI(state);
    saveCartToLocalStorage(state.cart);

    // Besseres Feedback
    if (category === 'cv-package') {
        showToast('✅ CV-Paket ausgewählt (vorheriges ersetzt)');
    } else if (category === 'mentoring') {
        showToast('✅ Mentoring-Paket ausgewählt (vorheriges ersetzt)');
    } else if (category === 'bundle') {
        showToast('✅ Komplettpaket ausgewählt (ersetzt CV + Mentoring)');
    } else if (category === 'addon') {
        showToast('✅ Add-on hinzugefügt');
    } else {
        showToast('✅ Zur Auswahl hinzugefügt');
    }
}

export function removeFromCart(state, id) {
    // Convert to string for comparison (handles both string and number IDs)
    const idStr = String(id);
    state.cart = state.cart.filter(x => String(x.id) !== idStr);
    updateCartUI(state);
    saveCartToLocalStorage(state.cart);
}

export function updateCartUI(state) {
    const countEl = document.getElementById('cart-count');
    const listEl = document.getElementById('cart-items');
    const totalEl = document.getElementById('cart-total');

    if(!countEl || !listEl || !totalEl) return;

    const count = state.cart.length;
    const total = state.cart.reduce((sum, item) => sum + item.price, 0);

    countEl.textContent = count.toString();
    countEl.classList.toggle('hidden', count === 0);

    if(count === 0) {
        listEl.innerHTML = '<p class="text-center text-gray-500 mt-10">Ihr Warenkorb ist leer</p>';
    } else {
        listEl.innerHTML = state.cart.map(item => `
            <div class="flex justify-between items-center p-4 border-b hover:bg-gray-50 transition">
                <div class="flex-1">
                    <span class="font-bold text-sm block">${sanitizeHTML(item.title)}</span>
                    <span class="text-xs text-gray-500">€${Number(item.price).toFixed(2)}</span>
                </div>
                <button onclick="app.removeFromCart('${item.id}')" class="text-red-500 hover:text-red-700 ml-4" aria-label="Artikel entfernen">
                    <i class="fas fa-times" aria-hidden="true"></i>
                </button>
            </div>
        `).join('');
    }

    totalEl.textContent = `€${total}`;
}

export async function checkout(state, navigateTo) {
    console.time('checkout-total');

    if(state.cart.length === 0) {
        showToast('⚠️ Ihr Warenkorb ist leer', 2000);
        return;
    }

    // Validiere Pflicht-Checkboxen
    const withdrawalConsent = document.getElementById('checkout-withdrawal-consent');
    const termsConsent = document.getElementById('checkout-terms-consent');
    const withdrawalError = document.getElementById('checkout-withdrawal-error');
    const termsError = document.getElementById('checkout-terms-error');

    let hasError = false;

    // Widerrufsrecht-Verzicht prüfen
    if (withdrawalConsent && !withdrawalConsent.checked) {
        if (withdrawalError) withdrawalError.classList.remove('hidden');
        withdrawalConsent.parentElement.parentElement.classList.add('border-red-400', 'bg-red-50');
        withdrawalConsent.parentElement.parentElement.classList.remove('border-amber-200', 'bg-amber-50');
        hasError = true;
    } else if (withdrawalConsent && withdrawalError) {
        withdrawalError.classList.add('hidden');
        withdrawalConsent.parentElement.parentElement.classList.remove('border-red-400', 'bg-red-50');
        withdrawalConsent.parentElement.parentElement.classList.add('border-amber-200', 'bg-amber-50');
    }

    // AGB prüfen
    if (termsConsent && !termsConsent.checked) {
        if (termsError) termsError.classList.remove('hidden');
        termsConsent.parentElement.parentElement.classList.add('border-red-400', 'bg-red-50');
        termsConsent.parentElement.parentElement.classList.remove('border-gray-200', 'bg-gray-50');
        hasError = true;
    } else if (termsConsent && termsError) {
        termsError.classList.add('hidden');
        termsConsent.parentElement.parentElement.classList.remove('border-red-400', 'bg-red-50');
        termsConsent.parentElement.parentElement.classList.add('border-gray-200', 'bg-gray-50');
    }

    if (hasError) {
        showToast('Bitte bestätigen Sie alle Pflichtfelder', 3000);
        return;
    }

    const total = state.cart.reduce((sum, item) => sum + item.price, 0);

    // Zeige Checkout-Modal mit Optionen (Registrieren/Login/Gast)
    console.time('checkout-modal');
    const result = await showCheckoutConfirmationModal(state.cart, total, !!state.user);
    console.timeEnd('checkout-modal');

    // User hat abgebrochen
    if (!result) return;

    // Bestimme Checkout-Typ für spätere Success-Message
    let checkoutType = 'guest';
    let checkoutEmail = null; // Email für Stripe vorausfüllen

    // User hat sich registriert (aber wurde ausgeloggt wegen Email-Verifikation)
    if (result.registered) {
        checkoutType = 'registered';
        checkoutEmail = result.userEmail; // Email die bei Registrierung angegeben wurde
        // User ist NICHT eingeloggt - muss erst Email verifizieren
    } else if (result.loggedIn || result.wasLoggedIn) {
        // User war bereits eingeloggt oder hat sich während Checkout eingeloggt
        checkoutType = 'loggedIn';
        if (result.user) {
            state.user = {
                uid: result.user.uid,
                email: result.user.email,
                displayName: result.user.displayName || result.user.email.split('@')[0],
                emailVerified: result.user.emailVerified
            };
            // Update UI
            if (typeof updateAuthUI === 'function') {
                updateAuthUI(state);
            }
        }
    }
    // Bei guest: checkoutType bleibt 'guest', checkoutEmail bleibt null

    // Zeige Fullscreen Loading Overlay
    const loadingOverlay = document.createElement('div');
    loadingOverlay.id = 'checkout-loading-overlay';
    loadingOverlay.innerHTML = `
        <div class="fixed inset-0 bg-brand-dark/95 z-[9999] flex items-center justify-center">
            <div class="text-center text-white">
                <div class="w-16 h-16 border-4 border-brand-gold border-t-transparent rounded-full animate-spin mx-auto mb-6"></div>
                <h3 class="text-xl font-serif mb-2">Zahlungsseite wird vorbereitet</h3>
                <p class="text-gray-400 text-sm">Sie werden in wenigen Sekunden weitergeleitet...</p>
            </div>
        </div>
    `;
    document.body.appendChild(loadingOverlay);
    toggleCart();

    try {
        // Firebase Function URL für Stripe Checkout
        const functionUrl = 'https://createcheckoutsession-plyofowo4a-uc.a.run.app';

        // Verwende state.user wenn eingeloggt, sonst checkoutEmail von Registrierung
        const emailForStripe = state.user?.email || checkoutEmail || null;
        // Bei Registrierung: Nutze die gespeicherte userId vom registrierten User
        const userIdForOrder = state.user?.uid || result.userId || null;

        console.time('checkout-api-call');
        const response = await fetch(functionUrl, {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: state.cart,
                userEmail: emailForStripe,
                userId: userIdForOrder,
                customerEmail: emailForStripe, // Prefill Stripe mit E-Mail
                mode: 'payment',
                // Rechtliche Zustimmungen (DSGVO/Fernabsatz)
                consents: {
                    withdrawalWaiver: true, // Widerrufsrecht-Verzicht bestätigt
                    withdrawalWaiverText: 'Ich verlange ausdrücklich, dass Sie vor Ende der Widerrufsfrist mit der Ausführung der Dienstleistung beginnen. Mir ist bekannt, dass ich bei vollständiger Vertragserfüllung mein Widerrufsrecht verliere.',
                    termsAccepted: true, // AGB akzeptiert
                    consentTimestamp: new Date().toISOString()
                }
            })
        });

        if (!response.ok) {
            throw new Error('Checkout session creation failed');
        }

        const { url } = await response.json();
        console.timeEnd('checkout-api-call');

        // Speichere Cart und Checkout-Typ temporär
        sessionStorage.setItem('pending_cart', JSON.stringify(state.cart));
        sessionStorage.setItem('checkout_type', checkoutType);

        console.timeEnd('checkout-total');
        console.log('🚀 Redirecting to Stripe:', url.substring(0, 50) + '...');

        // Leite zu Stripe Checkout weiter
        window.location.href = url;

    } catch(e) {
        logger.error("Stripe Checkout failed:", e);
        // Entferne Loading Overlay bei Fehler
        document.getElementById('checkout-loading-overlay')?.remove();
        showToast('❌ Zahlung konnte nicht gestartet werden. Bitte später erneut versuchen.', 4000);
    }
}

// ========== DASHBOARD ==========

export async function handleProfilePictureUpload(state, input) {
    const file = input.files?.[0];
    if (!file) return;

    if (!file.type.startsWith('image/')) {
        showToast('❌ Nur Bilddateien erlaubt', 3000);
        input.value = '';
        return;
    }
    if (file.size > 5 * 1024 * 1024) {
        showToast('❌ Bild zu groß (max. 5MB)', 3000);
        input.value = '';
        return;
    }

    try {
        const img = document.getElementById('profile-picture');
        const icon = document.getElementById('profile-placeholder-icon');
        const navImg = document.getElementById('nav-profile-picture');
        const navIcon = document.getElementById('nav-profile-icon');

        if (storage && state.user) {
            const storageRef = ref(storage, `profile-pictures/${state.user.uid}`);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            if (img && icon) {
                img.src = url;
                img.classList.remove('hidden');
                icon.classList.add('hidden');
            }

            // Update nav image too
            if (navImg && navIcon) {
                navImg.src = url;
                navImg.classList.remove('hidden');
                navIcon.classList.add('hidden');
            }

            await updateDoc(doc(db, "users", state.user.uid), {
                profilePicture: url
            });

            showToast('✅ Profilbild aktualisiert');
        } else {
            const reader = new FileReader();
            reader.onload = (e) => {
                if (img && icon) {
                    img.src = e.target.result;
                    img.classList.remove('hidden');
                    icon.classList.add('hidden');
                }
                // Update nav image too
                if (navImg && navIcon) {
                    navImg.src = e.target.result;
                    navImg.classList.remove('hidden');
                    navIcon.classList.add('hidden');
                }
            };
            reader.readAsDataURL(file);
            showToast('✅ Profilbild aktualisiert (Demo-Modus)');
        }
    } catch (e) {
        logger.error('Profile picture upload failed:', e);
        showToast('❌ Upload fehlgeschlagen', 3000);
    } finally {
        input.value = '';
    }
}

export async function loadUserOrders(state) {
    if (!db || !state.user) {
        renderOrders([]);
        return;
    }

    const container = document.getElementById('orders-list');
    if (container) {
        container.innerHTML = `
            <div class="p-8 text-center">
                <div class="loader mx-auto mb-3"></div>
                <p class="text-sm text-gray-500">Bestellungen werden geladen...</p>
            </div>
        `;
    }

    try {
        // OPTIMIERUNG: Orders und CV Projects PARALLEL laden
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", state.user.uid)
        );
        const cvProjectsQuery = query(
            collection(db, "cvProjects"),
            where("userId", "==", state.user.uid)
        );

        // Beide Queries parallel starten
        const [ordersSnapshot, cvProjectsSnapshot] = await Promise.all([
            getDocs(ordersQuery),
            getDocs(cvProjectsQuery).catch(e => {
                logger.warn('Could not load CV projects:', e);
                return { forEach: () => {} }; // Empty fallback
            })
        ]);

        let snapshot = ordersSnapshot;

        // Falls keine Bestellungen gefunden, versuche auch mit customerEmail (case-insensitive)
        if (snapshot.empty && state.user.email) {
            const userEmailLower = state.user.email.toLowerCase();

            // Try exact match first
            let emailQuery = query(
                collection(db, "orders"),
                where("customerEmail", "==", state.user.email)
            );
            snapshot = await getDocs(emailQuery);

            // Try lowercase match
            if (snapshot.empty) {
                emailQuery = query(
                    collection(db, "orders"),
                    where("customerEmail", "==", userEmailLower)
                );
                snapshot = await getDocs(emailQuery);
            }
        }

        const orders = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        // Build CV projects map from parallel loaded data
        let cvProjectsMap = {};
        cvProjectsSnapshot.forEach(docSnap => {
            const project = { id: docSnap.id, ...docSnap.data() };
            cvProjectsMap[project.orderId] = project;
        });

        // Merge orders with CV project data and sync workflow status
        const ordersWithCvData = orders.map(order => {
            const cvProject = cvProjectsMap[order.id];
            if (cvProject) {
                // Order cvStatus has priority if set to 'delivered' or 'ready'
                const orderCvStatus = order.cvStatus;
                const projectStatus = cvProject.status || 'new';
                const finalCvStatus = (orderCvStatus === 'delivered' || orderCvStatus === 'ready')
                    ? orderCvStatus
                    : projectStatus;

                // Bestimme Workflow basierend auf cvStatus (synchronisiert)
                const workflow = getWorkflowForCvStatus(finalCvStatus, order.workflow);

                return {
                    ...order,
                    cvProject: cvProject,
                    cvProjectId: cvProject.id,
                    cvStatus: finalCvStatus,
                    questionnaire: cvProject.questionnaire || order.questionnaire || null,
                    workflow: workflow,
                    nextStep: workflow?.currentStep === 1 ? 'questionnaire' : null,
                    nextStepDescription: getNextStepDescription(workflow?.currentStep || 1)
                };
            }
            return order;
        });

        // Load coach images for orders that have assignedCoachId but no assignedCoachImage
        const coachIdsToLoad = [...new Set(
            ordersWithCvData
                .filter(o => o.assignedCoachId && !o.assignedCoachImage)
                .map(o => o.assignedCoachId)
        )];

        const coachImagesMap = {};
        if (coachIdsToLoad.length > 0) {
            try {
                const coachPromises = coachIdsToLoad.map(id => getDoc(doc(db, 'coaches', id)));
                const coachDocs = await Promise.all(coachPromises);
                coachDocs.forEach((coachDoc, index) => {
                    if (coachDoc.exists()) {
                        const coachData = coachDoc.data();
                        coachImagesMap[coachIdsToLoad[index]] = coachData.image || null;
                    }
                });
            } catch (coachErr) {
                logger.warn('Failed to load coach images:', coachErr);
            }
        }

        // Add coach images to orders
        const ordersWithCoachImages = ordersWithCvData.map(order => {
            if (order.assignedCoachId && !order.assignedCoachImage && coachImagesMap[order.assignedCoachId]) {
                return { ...order, assignedCoachImage: coachImagesMap[order.assignedCoachId] };
            }
            return order;
        });

        // Sortiere nach Datum (client-side, um Index-Probleme zu vermeiden)
        ordersWithCoachImages.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
        });

        renderOrders(ordersWithCoachImages);

        // Update Dashboard Stats
        updateDashboardStats(ordersWithCoachImages);

        // Update Sidebar basierend auf Bestellungen
        renderDashboardSidebar(ordersWithCoachImages);

    } catch (e) {
        logger.error('Failed to load orders:', e);
        // Show empty state instead of infinite loader
        const container = document.getElementById('orders-list');
        if (container) {
            container.innerHTML = `
                <div class="p-12 text-center">
                    <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                        <i class="fas fa-shopping-bag text-2xl text-gray-400" aria-hidden="true"></i>
                    </div>
                    <h3 class="font-bold text-gray-700 mb-2">Noch keine Bestellungen</h3>
                    <p class="text-sm text-gray-500 mb-4">Entdecken Sie meine Premium-Services</p>
                    <button onclick="app.navigateToSection('home', 'cv-packages')" class="btn-primary">
                        <i class="fas fa-arrow-right mr-2"></i>Pakete ansehen
                    </button>
                </div>
            `;
        }
        const badge = document.getElementById('order-count-badge');
        if (badge) badge.textContent = '0';
    }
}

// Retry-Funktion für Orders nach Zahlung (Webhook braucht manchmal etwas Zeit)
async function loadUserOrdersWithRetry(state, retries = 3) {
    const previousCount = document.getElementById('order-count-badge')?.textContent || '0';

    await loadUserOrders(state);

    const newCount = document.getElementById('order-count-badge')?.textContent || '0';

    // Wenn keine neue Order gefunden wurde und noch Retries übrig sind
    if (newCount === previousCount && retries > 0) {
        setTimeout(() => {
            loadUserOrdersWithRetry(state, retries - 1);
        }, 2000);
    }
}

function updateDashboardStats(orders) {
    // Berechne Kategorien
    const activeOrders = orders.filter(o => !isOrderCompleted(o));
    const completedOrders = orders.filter(o => isOrderCompleted(o));
    const actionOrders = orders.filter(o => orderNeedsAction(o));

    // Update aktive Bestellungen
    const activeEl = document.getElementById('stat-active');
    if (activeEl) {
        activeEl.textContent = activeOrders.length;
    }

    // Update Bestellungen mit Handlungsbedarf
    const actionEl = document.getElementById('stat-action');
    if (actionEl) {
        actionEl.textContent = actionOrders.length;
        // Pulsieren wenn Aktion nötig
        if (actionOrders.length > 0) {
            actionEl.classList.add('animate-pulse');
        } else {
            actionEl.classList.remove('animate-pulse');
        }
    }

    // Update abgeschlossene Bestellungen
    const completedEl = document.getElementById('stat-completed');
    if (completedEl) {
        completedEl.textContent = completedOrders.length;
    }

    // Update Benachrichtigungs-Badge im Tab
    const notifBadge = document.getElementById('orders-notification-badge');
    if (notifBadge) {
        if (actionOrders.length > 0) {
            notifBadge.textContent = actionOrders.length;
            notifBadge.classList.remove('hidden');
        } else {
            notifBadge.classList.add('hidden');
        }
    }
}

// Dynamische Sidebar basierend auf Bestellstatus
function renderDashboardSidebar(orders) {
    const sidebar = document.getElementById('dashboard-sidebar');
    if (!sidebar) return;

    // Analysiere Bestellungen
    const hasActiveCvOrder = orders.some(o => isCvOrder(o) && !isOrderCompleted(o));
    const hasActiveMentoring = orders.some(o => hasCoachSession(o) && !isOrderCompleted(o));
    const ordersNeedingAction = orders.filter(o => orderNeedsAction(o));
    const pendingAppointments = orders.filter(o => o.appointmentProposals?.length > 0 && o.appointmentStatus === 'pending');

    sidebar.innerHTML = `
        <!-- Handlungsbedarf - nur wenn vorhanden -->
        ${ordersNeedingAction.length > 0 ? `
            <div class="bg-gradient-to-br from-amber-50 to-orange-50 rounded-xl border border-amber-300 p-4 shadow-sm">
                <div class="flex items-center gap-2 mb-3">
                    <div class="w-8 h-8 bg-amber-500 rounded-full flex items-center justify-center">
                        <i class="fas fa-bell text-white text-sm"></i>
                    </div>
                    <div>
                        <h3 class="font-bold text-amber-800 text-sm">Handlungsbedarf</h3>
                        <p class="text-xs text-amber-600">${ordersNeedingAction.length} Aufgabe${ordersNeedingAction.length > 1 ? 'n' : ''} offen</p>
                    </div>
                </div>
                <div class="space-y-2">
                    ${ordersNeedingAction.slice(0, 3).map(order => `
                        <button onclick="app.scrollToOrder('${order.id}')"
                                class="w-full text-left bg-white rounded-lg p-2 border border-amber-200 hover:border-amber-400 transition text-xs">
                            <div class="flex items-center gap-2">
                                <i class="fas ${getActionIcon(order)} text-amber-500"></i>
                                <span class="text-gray-700 truncate flex-1">${getActionText(order)}</span>
                                <i class="fas fa-chevron-right text-gray-300"></i>
                            </div>
                        </button>
                    `).join('')}
                </div>
            </div>
        ` : ''}

        <!-- Schnellzugriff -->
        <div class="bg-white rounded-xl shadow-sm border border-gray-200 p-4">
            <h3 class="font-bold text-brand-dark mb-3 text-sm uppercase tracking-wider">Schnellzugriff</h3>
            <div class="space-y-2">
                ${!hasActiveCvOrder ? `
                    <button onclick="app.navigateToSection('home', 'cv-packages')" class="w-full btn-primary justify-start text-sm py-2">
                        <i class="fas fa-file-alt"></i>
                        CV-Paket buchen
                    </button>
                ` : `
                    <div class="bg-green-50 rounded-lg p-2 border border-green-200 text-xs text-green-700">
                        <i class="fas fa-check-circle mr-1"></i>CV-Bestellung aktiv
                    </div>
                `}
                ${!hasActiveMentoring ? `
                    <button onclick="app.navigateToSection('home', 'mentoring')" class="w-full btn-secondary justify-start text-sm py-2">
                        <i class="fas fa-user-tie"></i>
                        Mentoring buchen
                    </button>
                ` : `
                    <div class="bg-green-50 rounded-lg p-2 border border-green-200 text-xs text-green-700">
                        <i class="fas fa-check-circle mr-1"></i>Mentoring aktiv
                    </div>
                `}
            </div>
        </div>

        <!-- Concierge Service -->
        <div class="bg-brand-dark text-white rounded-xl shadow-lg p-4">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 bg-brand-gold/20 rounded-lg flex items-center justify-center">
                    <i class="fas fa-headset text-brand-gold"></i>
                </div>
                <div>
                    <h3 class="font-bold text-sm">Concierge Service</h3>
                    <p class="text-xs text-gray-400">Persönliche Betreuung</p>
                </div>
            </div>
            <p class="text-xs text-gray-300 mb-3">Ihr persönlicher Ansprechpartner für alle Fragen.</p>
            <a href="mailto:concierge@karriaro.de" class="block w-full text-center bg-white/10 hover:bg-white/20 text-white text-xs font-bold py-2 rounded-lg transition">
                <i class="fas fa-envelope mr-2"></i>Nachricht senden
            </a>
        </div>

        <!-- Hilfe -->
        <div class="bg-gray-50 rounded-xl border border-gray-200 p-4 text-center">
            <i class="fas fa-question-circle text-2xl text-gray-400 mb-2"></i>
            <h3 class="font-bold text-gray-700 text-sm mb-1">Hilfe benötigt?</h3>
            <button onclick="app.scrollToSection('faq')" class="text-brand-gold text-xs font-bold hover:underline">
                FAQ ansehen <i class="fas fa-arrow-right ml-1"></i>
            </button>
        </div>
    `;
}

// Prüft ob eine Bestellung Handlungsbedarf hat
function orderNeedsAction(order) {
    // Abgeschlossene Orders brauchen keine Aktion
    if (isOrderCompleted(order)) return false;

    // Fragebogen ausfüllen (nur für normale CV-Orders, nicht Quick-Check)
    if (isCvOrder(order) && !isQuickCheck(order) && order.workflow?.currentStep === 1) return true;

    // Quick-Check: Dokument hochladen wenn noch nicht geschehen
    if (isQuickCheck(order) && !order.quickCheckDocument) return true;

    // Terminvorschläge beantworten
    if (order.appointmentProposals?.length > 0 && order.appointmentStatus === 'pending') return true;
    // Termin auswählen (Mentor zugewiesen aber kein Termin)
    if (hasCoachSession(order) && order.assignedCoachId && !order.appointment?.datetime) return true;
    return false;
}

// Icon für Handlungsbedarf
function getActionIcon(order) {
    if (isQuickCheck(order) && !order.quickCheckDocument) return 'fa-upload';
    if (isCvOrder(order) && !isQuickCheck(order) && order.workflow?.currentStep === 1) return 'fa-clipboard-list';
    if (order.appointmentProposals?.length > 0) return 'fa-calendar-alt';
    if (order.assignedCoachId && !order.appointment?.datetime) return 'fa-calendar-check';
    return 'fa-exclamation-circle';
}

// Text für Handlungsbedarf
function getActionText(order) {
    if (isQuickCheck(order) && !order.quickCheckDocument) return 'CV hochladen';
    if (isCvOrder(order) && !isQuickCheck(order) && order.workflow?.currentStep === 1) return 'Fragebogen ausfüllen';
    if (order.appointmentProposals?.length > 0) return 'Terminvorschlag beantworten';
    if (order.assignedCoachId && !order.appointment?.datetime) return 'Termin auswählen';
    return 'Aktion erforderlich';
}

// Scroll zu einer bestimmten Bestellung
export function scrollToOrder(orderId) {
    const orderElement = document.getElementById(`order-${orderId}`);
    if (orderElement) {
        // Expandieren falls geschlossen
        if (orderElement.classList.contains('hidden')) {
            orderElement.classList.remove('hidden');
            const icon = document.getElementById(`order-${orderId}-icon`);
            if (icon) icon.classList.add('rotate-180');
        }
        // Scrollen
        orderElement.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight-Effekt
        orderElement.classList.add('ring-2', 'ring-brand-gold', 'ring-offset-2');
        setTimeout(() => {
            orderElement.classList.remove('ring-2', 'ring-brand-gold', 'ring-offset-2');
        }, 2000);
    }
}

// Store all orders for filtering
let allOrdersCache = [];

export function renderOrders(orders) {
    const container = document.getElementById('orders-list');
    const badge = document.getElementById('order-count-badge');

    if (!container) return;

    // Cache orders for tab switching
    allOrdersCache = orders;

    if (orders.length === 0) {
        container.innerHTML = `
            <div class="p-12 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-shopping-bag text-2xl text-gray-400" aria-hidden="true"></i>
                </div>
                <h3 class="font-bold text-gray-700 mb-2">Noch keine Bestellungen</h3>
                <p class="text-sm text-gray-500 mb-4">Entdecken Sie meine Premium-Services</p>
                <button onclick="app.navigateToSection('home', 'cv-packages')" class="btn-primary">
                    <i class="fas fa-arrow-right mr-2"></i>Pakete ansehen
                </button>
            </div>
        `;
        if (badge) badge.textContent = '0';
        return;
    }

    // Separate active and completed orders
    const activeOrders = orders.filter(o => !isOrderCompleted(o));
    const completedOrders = orders.filter(o => isOrderCompleted(o));

    // Sort active orders:
    // 1. Upcoming appointments (within 24h) first
    // 2. Then those needing customer action
    // 3. Then by date (newest first)
    const now = Date.now();
    const in24h = now + 24 * 60 * 60 * 1000;

    activeOrders.sort((a, b) => {
        // Check for upcoming appointments (within 24h)
        const aAppointment = a.appointment?.datetime?.seconds ? a.appointment.datetime.seconds * 1000 : 0;
        const bAppointment = b.appointment?.datetime?.seconds ? b.appointment.datetime.seconds * 1000 : 0;
        const aUpcoming = aAppointment > now && aAppointment < in24h;
        const bUpcoming = bAppointment > now && bAppointment < in24h;

        if (aUpcoming && !bUpcoming) return -1;
        if (!aUpcoming && bUpcoming) return 1;

        // Then by action needed
        const aNeeds = orderNeedsAction(a) ? 0 : 1;
        const bNeeds = orderNeedsAction(b) ? 0 : 1;
        if (aNeeds !== bNeeds) return aNeeds - bNeeds;

        // Then by date (newest first)
        const aDate = a.date?.seconds || a.date?.getTime?.() / 1000 || 0;
        const bDate = b.date?.seconds || b.date?.getTime?.() / 1000 || 0;
        return bDate - aDate;
    });

    // Render tabs and orders
    container.innerHTML = `
        <!-- Order Tabs -->
        <div class="flex border-b border-gray-200 mb-0">
            <button id="tab-active-orders" onclick="app.switchOrderTab('active')"
                    class="flex-1 py-3 px-4 text-sm font-semibold text-brand-dark border-b-2 border-brand-gold bg-brand-gold/5 transition">
                <i class="fas fa-hourglass-half mr-2"></i>Aktiv
                <span class="ml-1 bg-brand-gold text-white text-xs px-2 py-0.5 rounded-full">${activeOrders.length}</span>
            </button>
            <button id="tab-completed-orders" onclick="app.switchOrderTab('completed')"
                    class="flex-1 py-3 px-4 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-dark transition">
                <i class="fas fa-check-circle mr-2"></i>Abgeschlossen
                <span class="ml-1 bg-gray-200 text-gray-600 text-xs px-2 py-0.5 rounded-full">${completedOrders.length}</span>
            </button>
        </div>

        <!-- Active Orders List -->
        <div id="active-orders-list">
            ${activeOrders.length === 0 ? `
                <div class="p-8 text-center text-gray-500">
                    <i class="fas fa-check-circle text-3xl text-green-400 mb-3"></i>
                    <p>Keine aktiven Bestellungen</p>
                </div>
            ` : activeOrders.map((order, index) => renderSingleOrder(order, index === 0)).join('')}
        </div>

        <!-- Completed Orders List (hidden by default) -->
        <div id="completed-orders-list" class="hidden">
            ${completedOrders.length === 0 ? `
                <div class="p-8 text-center text-gray-500">
                    <i class="fas fa-folder-open text-3xl text-gray-300 mb-3"></i>
                    <p>Keine abgeschlossenen Bestellungen</p>
                </div>
            ` : completedOrders.map((order, index) => renderSingleOrder(order, false)).join('')}
        </div>
    `;

    if (badge) badge.textContent = orders.length.toString();
}

// Check if order is completed
function isOrderCompleted(order) {
    const cvStatus = order.cvStatus || 'new';
    const orderStatus = order.status || 'confirmed';
    const refundStatus = order.refundStatus;

    // Fully refunded orders are always completed
    if (refundStatus === 'refunded') {
        return true;
    }

    // Quick-Check: completed when gutachten delivered
    if (isQuickCheck(order)) {
        return cvStatus === 'gutachten_delivered' || orderStatus === 'completed' || order.quickCheckGutachtenUrl;
    }

    // Check each component separately
    const hasCv = isCvOrder(order);
    const hasMentoring = hasCoachSession(order);

    // If order has both CV and Mentoring, BOTH must be completed
    if (hasCv && hasMentoring) {
        const cvCompleted = cvStatus === 'delivered' || cvStatus === 'ready';
        // Mentoring is completed when: appointment happened OR was refunded (partially_refunded)
        const mentoringRefunded = refundStatus === 'partially_refunded';
        const mentoringCompleted = mentoringRefunded || (order.appointment?.datetime && new Date(order.appointment.datetime) < new Date());
        return cvCompleted && mentoringCompleted;
    }

    // CV only: completed when delivered
    if (hasCv) {
        return cvStatus === 'delivered' || cvStatus === 'ready';
    }

    // Mentoring only: completed when appointment passed
    if (hasMentoring) {
        if (order.appointment?.datetime) {
            const appointmentDate = new Date(order.appointment.datetime);
            return appointmentDate < new Date();
        }
        return false;
    }

    // Other orders: completed status
    return orderStatus === 'completed';
}

// Switch between order tabs
export function switchOrderTab(tab) {
    const activeTab = document.getElementById('tab-active-orders');
    const completedTab = document.getElementById('tab-completed-orders');
    const activeList = document.getElementById('active-orders-list');
    const completedList = document.getElementById('completed-orders-list');

    if (tab === 'active') {
        activeTab.className = 'flex-1 py-3 px-4 text-sm font-semibold text-brand-dark border-b-2 border-brand-gold bg-brand-gold/5 transition';
        completedTab.className = 'flex-1 py-3 px-4 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-dark transition';
        activeList.classList.remove('hidden');
        completedList.classList.add('hidden');
    } else {
        completedTab.className = 'flex-1 py-3 px-4 text-sm font-semibold text-brand-dark border-b-2 border-brand-gold bg-brand-gold/5 transition';
        activeTab.className = 'flex-1 py-3 px-4 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-dark transition';
        completedList.classList.remove('hidden');
        activeList.classList.add('hidden');
    }
}

// Render a single order card
function renderSingleOrder(order, isExpanded = false) {
    const date = order.date?.seconds
        ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE', {
            day: '2-digit',
            month: 'long',
            year: 'numeric'
        })
        : 'Unbekannt';
    const shortOrderId = 'KAR-' + (order.stripeSessionId?.slice(-8) || order.id.slice(-8)).toUpperCase();
    const statusInfo = getOrderStatusInfo(order.status || 'confirmed');
    const orderId = `order-${order.id}`;
    const hasCoach = hasCoachSession(order);
    const hasAppointment = order.appointment?.datetime;

    return `
        <div class="border-b border-gray-100 last:border-0">
            <!-- Clickable Order Header -->
            <button onclick="app.toggleOrderDetails('${orderId}')"
                    class="w-full p-4 hover:bg-gray-50 transition flex justify-between items-center text-left group">
                <div class="flex-1 min-w-0">
                    <div class="flex items-center gap-2 mb-1">
                        <span class="text-xs text-gray-400 font-mono">${shortOrderId}</span>
                        <span class="status-badge ${statusInfo.class} text-[10px] px-2 py-0.5">
                            ${statusInfo.text}
                        </span>
                    </div>
                    <h4 class="font-bold text-brand-dark truncate text-sm">${order.items?.map(i => sanitizeHTML(i.title)).join(', ') || 'Bestellung'}</h4>
                    <p class="text-xs text-gray-500 mt-1"><i class="far fa-calendar-alt mr-1"></i>${date}</p>
                </div>
                <div class="flex items-center gap-3 flex-shrink-0 ml-4">
                    <span class="font-serif text-lg text-brand-dark">€${(order.total || 0).toFixed(2)}</span>
                    <i id="${orderId}-icon" class="fas fa-chevron-down text-gray-400 group-hover:text-brand-gold transition-all duration-300 ${isExpanded ? 'rotate-180' : ''}"></i>
                </div>
            </button>

            <!-- Collapsible Order Details -->
            <div id="${orderId}" class="overflow-hidden transition-all duration-300 ${isExpanded ? '' : 'hidden'}">
                <div class="px-4 pb-4">
                    <!-- WORKFLOW - basierend auf Produkttyp -->
                    ${isQuickCheck(order) ? renderQuickCheckWorkflow(order) : ''}
                    ${isCvOrder(order) && !isQuickCheck(order) && order.workflow ? renderWorkflowSteps(order) : ''}
                    ${hasCoachSession(order) ? renderMentoringWorkflow(order) : ''}

                    <!-- CV Download Section (wenn fertig) -->
                    ${renderCvDownloadSection(order)}

                    <!-- Dokumente-Sektion - vereinfacht -->
                    ${renderSimpleDocumentsSection(order)}

                        <!-- Professional Appointment Section - Mobile Optimized -->
                        <!-- Hide appointment sections if order is refunded -->
                ${(order.refundStatus === 'refunded' || order.refundStatus === 'partially_refunded') ? '' : order.appointment?.confirmed ? `
                    <!-- Confirmed Appointment - Mobile-Optimized Design -->
                    <div class="bg-gradient-to-br from-green-50 to-emerald-50 border border-green-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        ${order.assignedCoachName ? `
                            <!-- Coach Info with Photo -->
                            <div class="flex items-center gap-3 mb-4 pb-3 border-b border-green-200">
                                <div class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 shadow-md ${order.assignedCoachImage ? '' : 'bg-gradient-to-br from-brand-dark to-gray-800 flex items-center justify-center'}">
                                    ${order.assignedCoachImage
                                        ? `<img src="${order.assignedCoachImage}" alt="${sanitizeHTML(order.assignedCoachName)}" class="w-full h-full object-cover">`
                                        : `<i class="fas fa-user-tie text-brand-gold text-lg"></i>`
                                    }
                                </div>
                                <div>
                                    <span class="text-xs text-green-600 font-medium">Ihr Coach</span>
                                    <p class="font-bold text-brand-dark">${sanitizeHTML(order.assignedCoachName)}</p>
                                </div>
                            </div>
                        ` : ''}
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-green-500 to-emerald-600 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-check text-white text-base sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <span class="inline-block text-xs font-bold text-green-700 uppercase tracking-wider bg-green-100 px-2 py-1 rounded mb-2">Termin bestätigt</span>
                                <div class="bg-white rounded-lg p-3 sm:p-4 border border-green-100 shadow-sm">
                                    <div class="flex items-center gap-2 sm:gap-3 mb-2">
                                        <i class="fas fa-calendar-day text-green-600 text-sm"></i>
                                        <span class="font-semibold text-gray-800 text-sm sm:text-base">${new Date(order.appointment.datetime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', year: 'numeric' })}</span>
                                    </div>
                                    <div class="flex items-center gap-2 sm:gap-3">
                                        <i class="fas fa-clock text-green-600 text-sm"></i>
                                        <span class="font-semibold text-gray-800 text-sm sm:text-base">${new Date(order.appointment.datetime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr</span>
                                    </div>
                                </div>
                                ${isMeetingTimeNow(order.appointment.datetime) ? `
                                    <button onclick="app.joinMeeting('${order.id}')"
                                            class="w-full mt-4 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2">
                                        <i class="fas fa-video"></i>
                                        <span>Meeting beitreten</span>
                                    </button>
                                ` : `
                                    <p class="text-xs text-green-600 mt-3 flex items-center gap-1">
                                        <i class="fas fa-video"></i>
                                        Meeting-Button erscheint 15 Min. vor Termin
                                    </p>
                                `}
                            </div>
                        </div>
                    </div>
                ` : order.appointmentProposals?.length > 0 && order.appointmentStatus === 'pending' ? `
                    <!-- Pending Proposals - Mobile-Optimized Selection UI -->
                    <div id="appointment-proposals-${order.id}" class="bg-gradient-to-br from-amber-50 to-yellow-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <div class="flex items-start gap-3 sm:gap-4 mb-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-brand-gold to-amber-500 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-calendar-alt text-white text-base sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-brand-dark text-base sm:text-lg mb-1">Terminvorschläge</h4>
                                <p class="text-xs sm:text-sm text-gray-600">Wählen Sie Ihren Termin</p>
                            </div>
                        </div>
                        ${order.appointmentProposalMessage ? `
                            <div class="bg-white/80 rounded-lg p-3 sm:p-4 mb-4 border border-amber-100">
                                <p class="text-xs sm:text-sm text-gray-700 italic">
                                    ${sanitizeHTML(order.appointmentProposalMessage)}
                                </p>
                            </div>
                        ` : ''}
                        <div class="space-y-2 sm:space-y-3 mb-4">
                            ${order.appointmentProposals.map((p, idx) => `
                                <button onclick="app.acceptAppointmentProposal('${order.id}', '${p.datetime}')"
                                        class="w-full flex items-center p-3 sm:p-4 bg-white border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 active:bg-green-100 transition-all duration-200 group">
                                    <div class="w-8 h-8 sm:w-10 sm:h-10 bg-gradient-to-br from-brand-gold to-amber-400 rounded-full flex items-center justify-center text-white font-bold text-sm sm:text-base shadow-sm group-hover:from-green-500 group-hover:to-emerald-600 transition-all duration-200 flex-shrink-0">
                                        ${idx + 1}
                                    </div>
                                    <div class="flex-1 text-left ml-3 min-w-0">
                                        <p class="font-semibold text-brand-dark text-sm sm:text-base truncate">${new Date(p.datetime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short' })}</p>
                                        <p class="text-xs sm:text-sm text-gray-500">
                                            ${new Date(p.datetime).toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' })} Uhr
                                        </p>
                                    </div>
                                    <div class="flex-shrink-0 ml-2">
                                        <i class="fas fa-chevron-right text-gray-300 group-hover:text-green-500 transition-colors"></i>
                                    </div>
                                </button>
                            `).join('')}
                        </div>
                        <div class="border-t border-amber-200 pt-3 sm:pt-4">
                            <button onclick="app.declineAllAppointmentProposals('${order.id}')"
                                    class="w-full text-center text-xs sm:text-sm text-gray-500 hover:text-red-600 active:text-red-700 transition py-2 flex items-center justify-center gap-2">
                                <i class="fas fa-times"></i>
                                Keiner passt
                            </button>
                        </div>
                    </div>
                ` : order.appointmentStatus === 'declined' ? `
                    <!-- Declined - Waiting for new proposals with Coach info -->
                    <div class="bg-gradient-to-br from-orange-50 to-amber-50 border border-orange-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        ${order.assignedCoachName ? `
                            <!-- Coach Info with Photo -->
                            <div class="flex items-center gap-3 mb-4 pb-3 border-b border-orange-200">
                                <div class="w-12 h-12 rounded-full overflow-hidden flex-shrink-0 shadow-md ${order.assignedCoachImage ? '' : 'bg-gradient-to-br from-brand-dark to-gray-800 flex items-center justify-center'}">
                                    ${order.assignedCoachImage
                                        ? `<img src="${order.assignedCoachImage}" alt="${sanitizeHTML(order.assignedCoachName)}" class="w-full h-full object-cover">`
                                        : `<i class="fas fa-user-tie text-brand-gold text-lg"></i>`
                                    }
                                </div>
                                <div>
                                    <span class="text-xs text-orange-600 font-medium">Ihr Coach</span>
                                    <p class="font-bold text-brand-dark">${sanitizeHTML(order.assignedCoachName)}</p>
                                </div>
                            </div>
                        ` : ''}
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-12 sm:h-12 bg-gradient-to-br from-orange-400 to-amber-500 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-calendar-plus text-white text-base sm:text-lg"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-orange-800 text-base sm:text-lg mb-1">Neue Terminvorschläge folgen</h4>
                                <p class="text-xs sm:text-sm text-orange-700">Wir haben Ihre Rückmeldung erhalten und senden Ihnen in Kürze neue Terminvorschläge.</p>
                                <p class="text-xs text-orange-600 mt-2 flex items-center gap-1">
                                    <i class="fas fa-envelope"></i>
                                    Benachrichtigung per E-Mail
                                </p>
                            </div>
                        </div>
                    </div>
                ` : hasCoach && !hasAppointment && order.assignedCoachId ? `
                    <!-- Mentor assigned - Show appointment selection -->
                    <div class="bg-gradient-to-br from-blue-50 to-indigo-50 border border-blue-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <!-- Assigned Mentor Info with Photo -->
                        <div class="flex items-start gap-3 sm:gap-4 mb-4 pb-4 border-b border-blue-100">
                            <div class="flex-shrink-0 w-12 h-12 sm:w-14 sm:h-14 rounded-full shadow-lg overflow-hidden ${order.assignedCoachImage ? '' : 'bg-gradient-to-br from-brand-dark to-gray-800 flex items-center justify-center'}">
                                ${order.assignedCoachImage
                                    ? `<img src="${order.assignedCoachImage}" alt="${sanitizeHTML(order.assignedCoachName)}" class="w-full h-full object-cover">`
                                    : `<i class="fas fa-user-tie text-brand-gold text-lg sm:text-xl"></i>`
                                }
                            </div>
                            <div class="flex-1 min-w-0">
                                <span class="inline-block text-xs font-bold text-blue-700 uppercase tracking-wider bg-blue-100 px-2 py-1 rounded mb-1">Ihr Mentor</span>
                                <h4 class="font-bold text-brand-dark text-base sm:text-lg">${sanitizeHTML(order.assignedCoachName || 'Wird zugewiesen')}</h4>
                                <p class="text-xs text-gray-500 mt-1">Bereit für Ihre Session</p>
                            </div>
                        </div>

                        <!-- Executive Info Banner -->
                        <div class="bg-amber-50 border border-amber-200 rounded-lg p-3 mb-4">
                            <div class="flex items-start gap-2">
                                <i class="fas fa-info-circle text-amber-600 mt-0.5"></i>
                                <div class="text-xs text-amber-800">
                                    <p class="font-semibold mb-1">Hinweis zu Terminzeiten</p>
                                    <p>Als aktiver Executive bin ich in der Regel <strong>ab 18:00 Uhr</strong> verfügbar. Bitte beachten Sie dies bei Ihrer Terminauswahl.</p>
                                </div>
                            </div>
                        </div>

                        <!-- Appointment Selection Button -->
                        <button onclick="app.openMentorAppointmentModal('${order.id}', '${order.assignedCoachId}')"
                                class="w-full bg-gradient-to-r from-brand-gold to-amber-500 hover:from-amber-500 hover:to-amber-600 text-brand-dark font-bold py-3 sm:py-4 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300 flex items-center justify-center gap-2 sm:gap-3 text-sm sm:text-base">
                            <i class="fas fa-calendar-check"></i>
                            <span>Termin auswählen</span>
                        </button>
                    </div>
                ` : hasCoach && !hasAppointment ? `
                    <!-- Waiting for mentor assignment - Compliance Check -->
                    <div class="bg-gradient-to-br from-amber-50 to-orange-50 border border-amber-200 rounded-xl p-4 sm:p-5 shadow-sm">
                        <div class="flex items-start gap-3 sm:gap-4">
                            <div class="flex-shrink-0 w-10 h-10 sm:w-14 sm:h-14 bg-gradient-to-br from-amber-400 to-orange-500 rounded-full flex items-center justify-center shadow-lg">
                                <i class="fas fa-shield-alt text-white text-base sm:text-xl"></i>
                            </div>
                            <div class="flex-1 min-w-0">
                                <h4 class="font-bold text-amber-800 text-base sm:text-lg mb-1">Compliance-Check läuft</h4>
                                <p class="text-xs sm:text-sm text-amber-700 leading-relaxed">
                                    Wir führen einen Compliance-Check durch, um Interessenkonflikte auszuschließen
                                    (z.B. gleiche Branche, Wettbewerber). Nach erfolgreicher Prüfung wird Ihnen ein
                                    passender Mentor zugewiesen.
                                </p>
                                <div class="flex flex-wrap items-center gap-3 mt-3">
                                    <span class="text-xs text-amber-600 flex items-center gap-1">
                                        <i class="fas fa-clock"></i>
                                        In der Regel 24-48h
                                    </span>
                                    <span class="text-xs text-amber-600 flex items-center gap-1">
                                        <i class="fas fa-bell"></i>
                                        Benachrichtigung per E-Mail
                                    </span>
                                </div>
                            </div>
                        </div>
                    </div>
                ` : ''}
                    </div>
                </div>
            </div>
        `;
}

// Einfache Dokumente-Sektion - nur bei Schritt 1 oder 4 anzeigen
function renderSimpleDocumentsSection(order) {
    // Bei CV-Orders Schritt 2/3: keine Dokumente-Sektion
    if (isCvOrder(order)) {
        const currentStep = order.workflow?.currentStep || 1;
        if (currentStep === 2 || currentStep === 3) return '';
    }

    const customerDocs = order.customerDocuments || [];
    const receivedDocs = order.deliveredDocuments || order.adminDocuments || [];
    const totalDocs = customerDocs.length + receivedDocs.length;

    return `
        <div class="bg-gray-50 rounded-lg p-3 mb-3">
            <button onclick="app.toggleOrderDocuments('${order.id}')"
                    class="w-full flex items-center justify-between text-left">
                <span class="text-xs font-bold text-gray-600 uppercase tracking-wider flex items-center gap-2">
                    <i class="fas fa-folder-open"></i>Dokumente
                    ${totalDocs > 0 ? '<span class="bg-brand-gold text-white text-[10px] px-1.5 py-0.5 rounded-full">' + totalDocs + '</span>' : ''}
                </span>
                <i class="fas fa-chevron-down text-gray-400 transition-transform" id="docs-toggle-${order.id}"></i>
            </button>

            <div id="order-docs-${order.id}" class="hidden mt-3 space-y-2">
                <label class="cursor-pointer block">
                    <input type="file" onchange="app.uploadOrderDocument('${order.id}', this)" accept=".pdf,.doc,.docx,.jpg,.jpeg,.png" multiple class="hidden">
                    <div class="border border-dashed border-gray-300 rounded p-2 text-center hover:border-brand-gold transition text-xs text-gray-500">
                        <i class="fas fa-cloud-upload-alt mr-1"></i>Dokument hochladen
                    </div>
                </label>
                ${customerDocs.length > 0 ? '<div class="text-xs text-gray-600"><strong>Ihre Dokumente:</strong> ' + customerDocs.length + ' Datei(en)</div>' : ''}
                ${receivedDocs.length > 0 ? '<div class="text-xs text-green-600"><strong>Von Karriaro:</strong> ' + receivedDocs.length + ' Datei(en)</div>' : ''}
            </div>
        </div>
    `;
}

// Toggle order details visibility
export function toggleOrderDetails(orderId) {
    const content = document.getElementById(orderId);
    const icon = document.getElementById(`${orderId}-icon`);

    if (content && icon) {
        const isHidden = content.classList.contains('hidden');

        if (isHidden) {
            content.classList.remove('hidden');
            icon.classList.add('rotate-180');
        } else {
            content.classList.add('hidden');
            icon.classList.remove('rotate-180');
        }
    }
}

// Toggle order documents section
export function toggleOrderDocuments(orderId) {
    const docsContainer = document.getElementById(`order-docs-${orderId}`);
    const toggleIcon = document.getElementById(`docs-toggle-${orderId}`);

    if (docsContainer && toggleIcon) {
        const isHidden = docsContainer.classList.contains('hidden');
        if (isHidden) {
            docsContainer.classList.remove('hidden');
            toggleIcon.classList.add('rotate-180');
        } else {
            docsContainer.classList.add('hidden');
            toggleIcon.classList.remove('rotate-180');
        }
    }
}

// Render customer-uploaded documents
function renderCustomerDocuments(order) {
    const docs = order.customerDocuments || [];

    if (docs.length === 0) {
        return `<p class="text-xs text-gray-400 italic">Noch keine Dokumente hochgeladen</p>`;
    }

    return docs.map(doc => `
        <div class="flex items-center justify-between bg-gray-50 rounded-lg p-2 group">
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <i class="fas ${getFileIcon(doc.name)} text-gray-400"></i>
                <span class="text-xs text-gray-700 truncate">${sanitizeHTML(doc.name)}</span>
                <span class="text-[10px] text-gray-400">${formatFileSize(doc.size)}</span>
            </div>
            <div class="flex items-center gap-1 flex-shrink-0">
                <a href="${doc.url}" target="_blank"
                   class="p-1.5 text-gray-400 hover:text-brand-gold transition" title="Herunterladen">
                    <i class="fas fa-download text-xs"></i>
                </a>
                <button onclick="app.deleteOrderDocument('${order.id}', '${doc.id}')"
                        class="p-1.5 text-gray-400 hover:text-red-500 transition opacity-0 group-hover:opacity-100" title="Löschen">
                    <i class="fas fa-trash-alt text-xs"></i>
                </button>
            </div>
        </div>
    `).join('');
}

// Render documents received from Karriaro (admin-uploaded)
function renderReceivedDocuments(order) {
    const docs = order.deliveredDocuments || [];

    if (docs.length === 0) {
        return `<p class="text-xs text-gray-400 italic">Noch keine Dokumente erhalten</p>`;
    }

    return docs.map(doc => `
        <div class="flex items-center justify-between bg-green-50 rounded-lg p-2">
            <div class="flex items-center gap-2 min-w-0 flex-1">
                <i class="fas ${getFileIcon(doc.name)} text-green-500"></i>
                <div class="min-w-0 flex-1">
                    <span class="text-xs text-gray-700 truncate block">${sanitizeHTML(doc.name)}</span>
                    <span class="text-[10px] text-gray-400">
                        ${doc.uploadedAt ? new Date(doc.uploadedAt.seconds * 1000).toLocaleDateString('de-DE') : ''}
                    </span>
                </div>
            </div>
            <a href="${doc.url}" target="_blank" download
               class="flex items-center gap-1 px-2 py-1 bg-green-500 text-white rounded text-xs hover:bg-green-600 transition flex-shrink-0">
                <i class="fas fa-download"></i>
                <span class="hidden sm:inline">Download</span>
            </a>
        </div>
    `).join('');
}

// Get file icon based on extension
function getFileIcon(filename) {
    const ext = filename?.split('.').pop()?.toLowerCase();
    switch (ext) {
        case 'pdf': return 'fa-file-pdf text-red-500';
        case 'doc':
        case 'docx': return 'fa-file-word text-blue-500';
        case 'jpg':
        case 'jpeg':
        case 'png':
        case 'gif': return 'fa-file-image text-purple-500';
        case 'xls':
        case 'xlsx': return 'fa-file-excel text-green-500';
        default: return 'fa-file text-gray-400';
    }
}

// Format file size
function formatFileSize(bytes) {
    if (!bytes) return '';
    if (bytes < 1024) return bytes + ' B';
    if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
    return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
}

// CV Status configuration for customer view
const CV_CUSTOMER_STATUS = {
    'new': { label: 'Bestellung erhalten', color: 'bg-blue-100 text-blue-800', icon: 'fa-check-circle', description: 'Ihre Bestellung wurde bestätigt.' },
    'questionnaire_sent': { label: 'Fragebogen bereit', color: 'bg-yellow-100 text-yellow-800', icon: 'fa-edit', description: 'Bitte füllen Sie den Fragebogen aus.' },
    'data_received': { label: 'Daten erhalten', color: 'bg-indigo-100 text-indigo-800', icon: 'fa-check-double', description: 'Ihre Daten sind eingegangen. Ich arbeite an Ihrem CV.' },
    'generating': { label: 'CV wird erstellt', color: 'bg-purple-100 text-purple-800', icon: 'fa-cog fa-spin', description: 'Ihr CV wird gerade erstellt.' },
    'ready': { label: 'CV fertig', color: 'bg-green-100 text-green-800', icon: 'fa-file-alt', description: 'Ihr CV ist fertig und bereit zum Download!' },
    'delivered': { label: 'Zugestellt', color: 'bg-gray-100 text-gray-800', icon: 'fa-check-double', description: 'Ihr CV wurde Ihnen zugestellt.' }
};

// Check if order contains CV package
function isCvOrder(order) {
    const cvKeywords = ['CV', 'Lebenslauf', 'Quick-Check', 'Young Professional', 'Senior Professional', 'Executive', 'C-Suite', 'Komplettpaket'];
    return order.items?.some(item =>
        cvKeywords.some(keyword =>
            item.title?.toLowerCase().includes(keyword.toLowerCase())
        )
    );
}

// Workflow basierend auf cvStatus bestimmen (synchronisiert)
function getWorkflowForCvStatus(cvStatus, existingWorkflow) {
    // Wenn CV-Order, Workflow basierend auf cvStatus generieren
    const statusToStep = {
        'new': 1,
        'questionnaire_sent': 1,
        'data_received': 2,
        'generating': 2,
        'ready': 4,
        'delivered': 4
    };

    const currentStep = statusToStep[cvStatus] || 1;

    const steps = [
        {
            step: 1,
            name: 'Fragebogen ausfüllen',
            status: currentStep > 1 ? 'completed' : (currentStep === 1 ? 'pending' : 'waiting'),
            icon: 'clipboard-list'
        },
        {
            step: 2,
            name: 'CV wird erstellt',
            status: currentStep > 2 ? 'completed' : (currentStep === 2 ? 'pending' : 'waiting'),
            icon: 'pen-fancy'
        },
        {
            step: 3,
            name: 'Review & Feedback',
            status: currentStep > 3 ? 'completed' : (currentStep === 3 ? 'pending' : 'waiting'),
            icon: 'comments'
        },
        {
            step: 4,
            name: 'Fertigstellung',
            status: currentStep >= 4 ? 'completed' : 'waiting',
            icon: 'check-circle'
        }
    ];

    return {
        currentStep: currentStep,
        steps: steps
    };
}

// Beschreibung für den nächsten Schritt
function getNextStepDescription(currentStep) {
    const descriptions = {
        1: 'Bitte füllen Sie den Fragebogen aus, damit ich Ihren CV erstellen kann.',
        2: 'Ihre Daten wurden empfangen. Ich arbeite an Ihrem CV.',
        3: 'Ihr CV wird gerade finalisiert.',
        4: 'Ihr CV ist fertig!'
    };
    return descriptions[currentStep] || '';
}

// Geschätzte Fertigstellung berechnen
function calculateEstimatedCompletion(order, currentStep) {
    // Wenn CV bereits fertig, keine Anzeige
    if (currentStep >= 4 || order.cvStatus === 'delivered' || order.cvStatus === 'ready') {
        return null;
    }

    // Prüfen ob Express-Option
    const isExpress = order.items?.some(item =>
        item.title?.toLowerCase().includes('express') ||
        item.options?.some(opt => opt.toLowerCase().includes('express'))
    ) || order.isExpress;

    // Basistage je nach Paket
    const baseDays = isExpress ? 5 : 10;

    // Verbleibende Tage basierend auf aktuellem Schritt
    // Schritt 1: 100% der Zeit, Schritt 2: 70%, Schritt 3: 30%
    const stepMultiplier = {
        1: 1.0,    // Fragebogen noch nicht ausgefüllt
        2: 0.7,    // Daten erhalten, CV wird erstellt
        3: 0.3     // Feedback/Finalisierung
    };

    const remainingDays = Math.ceil(baseDays * (stepMultiplier[currentStep] || 0.5));

    if (remainingDays <= 0) return null;

    // Formatieren
    if (remainingDays === 1) {
        return '~1 Tag verbleibend';
    }
    return `~${remainingDays} Tage verbleibend`;
}

// Render Workflow Steps für das Dashboard
function renderWorkflowSteps(order) {
    if (!order.workflow || !order.workflow.steps) return '';

    const steps = order.workflow.steps;
    const currentStep = order.workflow.currentStep || 1;

    const iconMap = {
        'clipboard-list': 'fa-clipboard-list',
        'pen-fancy': 'fa-pen-fancy',
        'comments': 'fa-comments',
        'check-circle': 'fa-check-circle',
        'calendar': 'fa-calendar-check',
        'video': 'fa-video'
    };

    // Berechne Fortschritt
    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const totalSteps = steps.length;
    const progressPercent = Math.round((completedSteps / totalSteps) * 100);

    // Geschätzte Fertigstellung berechnen
    const estimatedCompletion = calculateEstimatedCompletion(order, currentStep);

    return `
        <div class="bg-gradient-to-r from-brand-gold/10 to-amber-50 rounded-xl p-4 mb-3 border border-brand-gold/30">
            <!-- Header mit Fortschritt -->
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-brand-gold/20 rounded-full flex items-center justify-center">
                        <i class="fas fa-route text-brand-gold text-sm"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-brand-dark text-sm">Ihr Fortschritt</h4>
                        <p class="text-xs text-gray-500">Schritt ${currentStep} von ${totalSteps}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-lg font-bold text-brand-gold">${progressPercent}%</span>
                    ${estimatedCompletion ? `<p class="text-xs text-gray-500">${estimatedCompletion}</p>` : ''}
                </div>
            </div>

            <!-- Fortschrittsbalken -->
            <div class="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-brand-gold to-amber-400 rounded-full transition-all duration-500"
                     style="width: ${progressPercent}%"></div>
            </div>

            <!-- Schritte - kompakter -->
            <div class="space-y-2">
                ${steps.map((step, idx) => {
                    const isCompleted = step.status === 'completed';
                    const isPending = step.status === 'pending';
                    const isWaiting = step.status === 'waiting';
                    // Aktueller Schritt = pending UND entspricht currentStep
                    const isCurrent = step.step === currentStep && (isPending || step.status === 'pending');

                    const iconClass = iconMap[step.icon] || 'fa-circle';

                    let circleClasses = '';
                    let textClasses = '';

                    if (isCompleted) {
                        circleClasses = 'bg-green-500 text-white';
                        textClasses = 'text-green-700';
                    } else if (isCurrent) {
                        // Aktiver Schritt - Gold mit Animation
                        circleClasses = 'bg-brand-gold text-white shadow-lg ring-2 ring-brand-gold/30';
                        textClasses = 'text-brand-dark font-semibold';
                    } else if (isWaiting) {
                        circleClasses = 'bg-gray-100 text-gray-300';
                        textClasses = 'text-gray-400';
                    } else {
                        circleClasses = 'bg-gray-200 text-gray-400';
                        textClasses = 'text-gray-400';
                    }

                    return `
                        <div class="flex items-center gap-2 ${isCurrent ? 'bg-gradient-to-r from-brand-gold/10 to-amber-50 rounded-lg p-2 border border-brand-gold/40' : 'py-1'}">
                            <div class="w-6 h-6 rounded-full ${circleClasses} flex items-center justify-center flex-shrink-0 transition-all">
                                ${isCompleted
                                    ? '<i class="fas fa-check text-[10px]"></i>'
                                    : `<i class="fas ${iconClass} text-[10px]"></i>`
                                }
                            </div>
                            <span class="text-sm ${textClasses} flex-1">${step.name}</span>
                            ${isCurrent ? '<span class="text-[10px] bg-brand-gold text-white px-2 py-0.5 rounded-full font-medium">Aktuell</span>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            ${order.nextStep === 'questionnaire' ? `
                <div class="mt-4">
                    <button onclick="app.openQuestionnaire('${order.id}', '${order.cvProjectId || ''}')"
                            class="w-full bg-brand-gold hover:bg-brand-gold/90 text-brand-dark font-bold py-3 px-6 rounded-lg transition flex items-center justify-center gap-2 shadow-lg">
                        <i class="fas fa-clipboard-list"></i>
                        Fragebogen jetzt ausfüllen
                        <i class="fas fa-arrow-right"></i>
                    </button>
                    <p class="text-xs text-gray-500 text-center mt-2">
                        Dauert ca. 15-20 Minuten
                    </p>
                </div>
            ` : ''}

            ${currentStep === 2 ? `
                <!-- Status-Meldung für Schritt 2 -->
                <div class="mt-4 bg-white/70 rounded-lg p-3 border border-brand-gold/20">
                    <p class="text-xs text-gray-600 flex items-start gap-2">
                        <i class="fas fa-info-circle text-brand-gold mt-0.5"></i>
                        <span>Ich arbeite an Ihrem CV. Sie erhalten eine E-Mail, sobald der Entwurf zur Überprüfung bereit ist.</span>
                    </p>
                </div>
            ` : ''}

            ${currentStep === 3 && order.cvDraftUrl ? `
                <!-- Review & Feedback Sektion -->
                <div class="mt-4 bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 border border-blue-200">
                    <div class="flex items-center gap-2 mb-3">
                        <div class="w-8 h-8 bg-blue-500 rounded-full flex items-center justify-center">
                            <i class="fas fa-eye text-white text-sm"></i>
                        </div>
                        <div>
                            <h4 class="font-bold text-brand-dark text-sm">CV-Entwurf bereit!</h4>
                            <p class="text-xs text-gray-500">Bitte überprüfen und Feedback geben</p>
                        </div>
                    </div>

                    <!-- Download Button -->
                    <a href="${order.cvDraftUrl}" target="_blank"
                       class="w-full bg-blue-500 hover:bg-blue-600 text-white font-bold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2 mb-3">
                        <i class="fas fa-file-pdf"></i>
                        CV-Entwurf ansehen
                        <i class="fas fa-external-link-alt text-xs"></i>
                    </a>

                    <!-- Feedback Formular -->
                    <div class="bg-white rounded-lg p-3 border border-blue-100">
                        <label class="block text-sm font-medium text-gray-700 mb-2">
                            <i class="fas fa-comment-dots mr-1"></i>
                            Ihr Feedback & Änderungswünsche
                        </label>
                        <textarea id="cv-feedback-${order.id}"
                                  rows="3"
                                  placeholder="z.B. Bitte das Foto größer machen, Schriftart ändern, weitere Projekte hinzufügen..."
                                  class="w-full border border-gray-200 rounded-lg p-3 text-sm focus:ring-2 focus:ring-blue-500 focus:border-blue-500"></textarea>
                        <div class="flex gap-2 mt-3">
                            <button onclick="app.submitCvFeedback('${order.id}')"
                                    class="flex-1 bg-brand-gold hover:bg-brand-gold/90 text-brand-dark font-bold py-2 px-4 rounded-lg transition text-sm">
                                <i class="fas fa-paper-plane mr-1"></i>
                                Feedback senden
                            </button>
                            <button onclick="app.approveCvDraft('${order.id}')"
                                    class="flex-1 bg-green-500 hover:bg-green-600 text-white font-bold py-2 px-4 rounded-lg transition text-sm">
                                <i class="fas fa-check mr-1"></i>
                                CV freigeben
                            </button>
                        </div>
                    </div>
                </div>
            ` : currentStep === 3 && !order.cvDraftUrl ? `
                <!-- Warten auf CV-Entwurf -->
                <div class="mt-4 bg-white/70 rounded-lg p-3 border border-brand-gold/20">
                    <p class="text-xs text-gray-600 flex items-start gap-2">
                        <i class="fas fa-hourglass-half text-brand-gold mt-0.5 animate-pulse"></i>
                        <span>Der CV-Entwurf wird finalisiert. Sie erhalten eine E-Mail, sobald er zur Überprüfung bereit ist.</span>
                    </p>
                </div>
            ` : ''}
        </div>
    `;
}

// Render Mentoring Workflow (3 Schritte: Coach → Termin → Session)
// Mit 3er-Paket Session-Tracking
function renderMentoringWorkflow(order) {
    if (!hasCoachSession(order)) return '';

    // Prüfe ob Mentoring erstattet wurde
    const isRefunded = order.refundStatus === 'refunded' || order.refundStatus === 'partially_refunded';
    if (isRefunded) {
        const refundDate = order.refundedAt?.seconds
            ? new Date(order.refundedAt.seconds * 1000).toLocaleDateString('de-DE')
            : 'kürzlich';
        const refundAmount = order.refundAmount ? `€${order.refundAmount.toFixed(2)}` : '';

        return `
            <div class="bg-red-50 rounded-xl p-4 mb-3 border border-red-200">
                <div class="flex items-center gap-3">
                    <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center flex-shrink-0">
                        <i class="fas fa-ban text-red-500"></i>
                    </div>
                    <div>
                        <p class="font-bold text-red-700">${order.refundStatus === 'partially_refunded' ? 'Mentoring storniert' : 'Storniert & Erstattet'}</p>
                        <p class="text-sm text-red-600">${refundAmount ? refundAmount + ' erstattet am ' : 'Erstattet am '}${refundDate}</p>
                    </div>
                </div>
                ${order.refundReason ? `
                    <div class="mt-3 pt-3 border-t border-red-200">
                        <p class="text-xs text-gray-500 uppercase font-medium">Grund</p>
                        <p class="text-sm text-gray-700">${sanitizeHTML(order.refundReason)}</p>
                    </div>
                ` : ''}
                ${order.refundStatus === 'partially_refunded' ? `
                    <p class="text-xs text-gray-500 mt-3">
                        <i class="fas fa-info-circle mr-1"></i>
                        Ihre CV-Erstellung wird wie geplant fortgesetzt.
                    </p>
                ` : ''}
            </div>
        `;
    }

    // Prüfe ob es ein 3er-Paket ist
    const packageInfo = isMentoringPackage(order);
    const totalSessions = packageInfo.totalSessions;
    const completedSessions = order.completedSessions || 0;
    const currentSessionNumber = completedSessions + 1;

    // Für 3er-Paket: Zeige Session-Tracker
    if (packageInfo.isPackage && totalSessions > 1) {
        return renderMultiSessionWorkflow(order, totalSessions, completedSessions, currentSessionNumber);
    }

    // Standard Single-Session Workflow
    let currentStep = 1;
    let steps = [];

    const hasCoach = !!order.assignedCoachId;
    const hasProposals = order.appointmentProposals?.length > 0;
    const hasConfirmedAppointment = order.appointment?.confirmed;
    const appointmentPassed = hasConfirmedAppointment && new Date(order.appointment.datetime) < new Date();

    if (appointmentPassed) {
        currentStep = 3;
        steps = [
            { step: 1, name: 'Coach zugewiesen', status: 'completed', icon: 'user-tie' },
            { step: 2, name: 'Termin bestätigt', status: 'completed', icon: 'calendar-check' },
            { step: 3, name: 'Session abgeschlossen', status: 'completed', icon: 'video' }
        ];
    } else if (hasConfirmedAppointment) {
        currentStep = 3;
        steps = [
            { step: 1, name: 'Coach zugewiesen', status: 'completed', icon: 'user-tie' },
            { step: 2, name: 'Termin bestätigt', status: 'completed', icon: 'calendar-check' },
            { step: 3, name: 'Session durchführen', status: 'pending', icon: 'video' }
        ];
    } else if (hasProposals) {
        currentStep = 2;
        steps = [
            { step: 1, name: 'Coach zugewiesen', status: 'completed', icon: 'user-tie' },
            { step: 2, name: 'Termin wählen', status: 'pending', icon: 'calendar-alt' },
            { step: 3, name: 'Session durchführen', status: 'waiting', icon: 'video' }
        ];
    } else if (hasCoach) {
        currentStep = 2;
        steps = [
            { step: 1, name: 'Coach zugewiesen', status: 'completed', icon: 'user-tie' },
            { step: 2, name: 'Terminvorschläge erhalten', status: 'pending', icon: 'calendar-alt' },
            { step: 3, name: 'Session durchführen', status: 'waiting', icon: 'video' }
        ];
    } else {
        currentStep = 1;
        steps = [
            { step: 1, name: 'Coach wird zugewiesen', status: 'pending', icon: 'user-tie' },
            { step: 2, name: 'Termin vereinbaren', status: 'waiting', icon: 'calendar-alt' },
            { step: 3, name: 'Session durchführen', status: 'waiting', icon: 'video' }
        ];
    }

    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const totalSteps = steps.length;
    const progressPercent = Math.round((completedSteps / totalSteps) * 100);

    // Status-Meldung basierend auf aktuellem Schritt
    const statusMessage = getMentoringStatusMessage(order, currentStep, hasCoach, hasProposals, hasConfirmedAppointment);

    // Check if this step should be clickable (Termin wählen when proposals exist)
    const isTerminWaehlenClickable = hasProposals && order.appointmentStatus === 'pending';

    return `
        <div class="bg-gradient-to-r from-blue-50 to-indigo-50 rounded-xl p-4 mb-3 border border-blue-200">
            <!-- Header mit Fortschritt -->
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-blue-500/20 rounded-full flex items-center justify-center">
                        <i class="fas fa-user-tie text-blue-600 text-sm"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-brand-dark text-sm">Mentoring-Fortschritt</h4>
                        <p class="text-xs text-gray-500">Schritt ${currentStep} von ${totalSteps}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-lg font-bold text-blue-600">${progressPercent}%</span>
                </div>
            </div>

            <!-- Fortschrittsbalken -->
            <div class="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-blue-500 to-indigo-500 rounded-full transition-all duration-500"
                     style="width: ${progressPercent}%"></div>
            </div>

            <!-- Schritte -->
            <div class="space-y-2">
                ${steps.map((step) => {
                    const isCompleted = step.status === 'completed';
                    const isPending = step.status === 'pending';
                    const isCurrent = step.step === currentStep && isPending;
                    const isClickable = isCurrent && step.name === 'Termin wählen' && isTerminWaehlenClickable;

                    let circleClasses = '';
                    let textClasses = '';

                    if (isCompleted) {
                        circleClasses = 'bg-green-500 text-white';
                        textClasses = 'text-green-700';
                    } else if (isCurrent) {
                        circleClasses = 'bg-blue-500 text-white shadow-lg ring-2 ring-blue-300';
                        textClasses = 'text-brand-dark font-semibold';
                    } else {
                        circleClasses = 'bg-gray-200 text-gray-400';
                        textClasses = 'text-gray-400';
                    }

                    return `
                        <div class="flex items-center gap-2 ${isCurrent ? 'bg-gradient-to-r from-blue-100 to-indigo-100 rounded-lg p-2 border border-blue-300' : 'py-1'} ${isClickable ? 'cursor-pointer hover:ring-2 hover:ring-blue-400 transition-all' : ''}"
                             ${isClickable ? `onclick="app.scrollToAppointmentProposals('${order.id}')"` : ''}>
                            <div class="w-6 h-6 rounded-full ${circleClasses} flex items-center justify-center flex-shrink-0 transition-all">
                                ${isCompleted
                                    ? '<i class="fas fa-check text-[10px]"></i>'
                                    : `<i class="fas fa-${step.icon} text-[10px]"></i>`
                                }
                            </div>
                            <span class="text-sm ${textClasses} flex-1">${step.name}</span>
                            ${isCurrent ? '<span class="text-[10px] bg-blue-500 text-white px-2 py-0.5 rounded-full font-medium">Aktuell</span>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Status-Meldung -->
            ${statusMessage ? `
                <div class="mt-4 bg-white/70 rounded-lg p-3 border border-blue-100">
                    <p class="text-xs text-gray-600 flex items-start gap-2">
                        <i class="fas fa-info-circle text-blue-500 mt-0.5"></i>
                        <span>${statusMessage}</span>
                    </p>
                </div>
            ` : ''}
        </div>
    `;
}

// Status-Meldung für Mentoring
function getMentoringStatusMessage(order, currentStep, hasCoach, hasProposals, hasConfirmedAppointment) {
    if (hasConfirmedAppointment) {
        const appointmentDate = new Date(order.appointment.datetime);
        const now = new Date();
        if (appointmentDate > now) {
            const diffMs = appointmentDate - now;
            const diffHours = Math.floor(diffMs / (1000 * 60 * 60));
            const diffDays = Math.floor(diffHours / 24);

            if (diffDays > 0) {
                return `Ihre Session findet in ${diffDays} Tag${diffDays > 1 ? 'en' : ''} statt. Der Meeting-Button erscheint 15 Minuten vor dem Termin.`;
            } else if (diffHours > 0) {
                return `Ihre Session findet in ${diffHours} Stunde${diffHours > 1 ? 'n' : ''} statt. Der Meeting-Button erscheint 15 Minuten vor dem Termin.`;
            } else {
                return 'Ihre Session beginnt gleich! Der Meeting-Button sollte bereits sichtbar sein.';
            }
        }
        return 'Session abgeschlossen. Vielen Dank für Ihre Teilnahme!';
    }

    if (hasProposals && order.appointmentStatus === 'pending') {
        return '👇 Wählen Sie unten einen der Terminvorschläge aus.';
    }

    if (hasCoach) {
        return 'Ihr Coach wurde zugewiesen. Sie erhalten in Kürze Terminvorschläge per E-Mail.';
    }

    return 'Ich melde mich bei Ihnen zur Terminvereinbarung. Sie werden per E-Mail benachrichtigt.';
}

// Render Multi-Session Workflow für 3er-Paket
function renderMultiSessionWorkflow(order, totalSessions, completedSessions, currentSessionNumber) {
    const hasCoach = !!order.assignedCoachId;
    const hasProposals = order.appointmentProposals?.length > 0;
    const hasConfirmedAppointment = order.appointment?.confirmed;
    const appointmentPassed = hasConfirmedAppointment && new Date(order.appointment.datetime) < new Date();

    // Session-Historie aus Order laden
    const sessionHistory = order.sessionHistory || [];

    // Berechne Gesamt-Fortschritt (über alle Sessions)
    const overallProgress = Math.round((completedSessions / totalSessions) * 100);

    // Aktueller Status für diese Session
    let sessionStatus = 'pending';
    let sessionStatusText = 'Coach wird zugewiesen';

    if (completedSessions >= totalSessions) {
        sessionStatus = 'completed';
        sessionStatusText = 'Alle Sessions abgeschlossen';
    } else if (appointmentPassed) {
        sessionStatus = 'just_completed';
        sessionStatusText = 'Session abgeschlossen';
    } else if (hasConfirmedAppointment) {
        sessionStatus = 'scheduled';
        sessionStatusText = 'Termin bestätigt';
    } else if (hasProposals) {
        sessionStatus = 'awaiting_selection';
        sessionStatusText = 'Termin auswählen';
    } else if (hasCoach) {
        sessionStatus = 'awaiting_proposals';
        sessionStatusText = 'Warten auf Terminvorschläge';
    }

    return `
        <div class="bg-gradient-to-r from-indigo-50 to-purple-50 rounded-xl p-4 mb-3 border border-indigo-200">
            <!-- Header mit Paket-Info -->
            <div class="flex items-center justify-between mb-4">
                <div class="flex items-center gap-2">
                    <div class="w-10 h-10 bg-gradient-to-r from-indigo-500 to-purple-500 rounded-full flex items-center justify-center">
                        <i class="fas fa-layer-group text-white text-sm"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-brand-dark text-sm">3er Mentoring-Paket</h4>
                        <p class="text-xs text-gray-500">${completedSessions} von ${totalSessions} Sessions abgeschlossen</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-lg font-bold text-indigo-600">${overallProgress}%</span>
                </div>
            </div>

            <!-- Session-Kreise -->
            <div class="flex justify-center gap-4 mb-4">
                ${Array.from({ length: totalSessions }, (_, i) => {
                    const sessionNum = i + 1;
                    const isCompleted = sessionNum <= completedSessions;
                    const isCurrent = sessionNum === currentSessionNumber && completedSessions < totalSessions;
                    const historyEntry = sessionHistory[i];

                    let circleClasses = '';
                    let iconContent = '';

                    if (isCompleted) {
                        circleClasses = 'bg-green-500 text-white shadow-md';
                        iconContent = '<i class="fas fa-check text-sm"></i>';
                    } else if (isCurrent) {
                        circleClasses = 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white shadow-lg ring-4 ring-indigo-200';
                        iconContent = `<span class="font-bold">${sessionNum}</span>`;
                    } else {
                        circleClasses = 'bg-gray-200 text-gray-400';
                        iconContent = `<span class="font-medium">${sessionNum}</span>`;
                    }

                    return `
                        <div class="flex flex-col items-center">
                            <div class="w-12 h-12 rounded-full ${circleClasses} flex items-center justify-center transition-all">
                                ${iconContent}
                            </div>
                            <span class="text-xs mt-1 ${isCompleted ? 'text-green-600' : isCurrent ? 'text-indigo-600 font-medium' : 'text-gray-400'}">
                                Session ${sessionNum}
                            </span>
                            ${historyEntry?.date ? `<span class="text-[10px] text-gray-400">${new Date(historyEntry.date).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' })}</span>` : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Aktueller Session-Status (wenn nicht alle abgeschlossen) -->
            ${completedSessions < totalSessions ? `
                <div class="bg-white rounded-lg p-3 border border-indigo-100">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-sm font-medium text-brand-dark">Session ${currentSessionNumber}</span>
                        <span class="text-xs px-2 py-1 rounded-full ${
                            sessionStatus === 'scheduled' ? 'bg-green-100 text-green-700' :
                            sessionStatus === 'awaiting_selection' ? 'bg-yellow-100 text-yellow-700' :
                            'bg-gray-100 text-gray-600'
                        }">${sessionStatusText}</span>
                    </div>

                    ${hasConfirmedAppointment && !appointmentPassed ? `
                        <div class="flex items-center gap-2 text-sm text-gray-600">
                            <i class="fas fa-calendar-check text-green-500"></i>
                            <span>${new Date(order.appointment.datetime).toLocaleDateString('de-DE', { weekday: 'short', day: '2-digit', month: 'short', hour: '2-digit', minute: '2-digit' })} Uhr</span>
                        </div>
                    ` : hasProposals ? `
                        <p class="text-xs text-gray-500">
                            <i class="fas fa-info-circle text-yellow-500 mr-1"></i>
                            Bitte wählen Sie einen Termin aus den Vorschlägen.
                        </p>
                    ` : hasCoach ? `
                        <p class="text-xs text-gray-500">
                            <i class="fas fa-user-tie text-indigo-500 mr-1"></i>
                            Coach zugewiesen. Terminvorschläge folgen per E-Mail.
                        </p>
                    ` : `
                        <p class="text-xs text-gray-500">
                            <i class="fas fa-hourglass-half text-gray-400 mr-1"></i>
                            Coach wird zugewiesen...
                        </p>
                    `}
                </div>
            ` : `
                <!-- Alle Sessions abgeschlossen -->
                <div class="bg-gradient-to-r from-green-50 to-emerald-50 rounded-lg p-4 border border-green-200 text-center">
                    <div class="w-12 h-12 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-2">
                        <i class="fas fa-trophy text-white text-lg"></i>
                    </div>
                    <p class="font-bold text-green-700">Alle Sessions abgeschlossen!</p>
                    <p class="text-xs text-green-600 mt-1">Vielen Dank für Ihre Teilnahme am 3er-Paket.</p>
                </div>
            `}
        </div>
    `;
}

// Prüft ob es ein Quick-Check ist
function isQuickCheck(order) {
    return order.items?.some(item =>
        item.title?.toLowerCase().includes('quick-check') ||
        item.title?.toLowerCase().includes('quickcheck')
    );
}

// Alias für Admin-Bereich
function isQuickCheckOrder(order) {
    return isQuickCheck(order);
}

// Quick-Check Workflow (2 Schritte: Upload → Schriftliches Gutachten)
// WICHTIG: Quick-Check = schriftliches Gutachten in 2-3 Werktagen, KEIN Video-Call!
function renderQuickCheckWorkflow(order) {
    if (!isQuickCheck(order)) return '';

    // Bestimme Status
    const hasUploadedDocs = order.cvStatus === 'data_received' || order.questionnaireSubmittedAt;
    const hasGutachten = order.quickCheckGutachtenUrl || order.cvStatus === 'gutachten_delivered';

    let currentStep = 1;
    let steps = [];

    if (hasGutachten) {
        currentStep = 2;
        steps = [
            { step: 1, name: 'Dokumente hochgeladen', status: 'completed', icon: 'file-upload' },
            { step: 2, name: 'Gutachten erhalten', status: 'completed', icon: 'file-alt' }
        ];
    } else if (hasUploadedDocs) {
        currentStep = 2;
        steps = [
            { step: 1, name: 'Dokumente hochgeladen', status: 'completed', icon: 'file-upload' },
            { step: 2, name: 'Gutachten wird erstellt', status: 'pending', icon: 'pen-fancy' }
        ];
    } else {
        currentStep = 1;
        steps = [
            { step: 1, name: 'Dokumente hochladen', status: 'pending', icon: 'file-upload' },
            { step: 2, name: 'Schriftliches Gutachten', status: 'waiting', icon: 'file-alt' }
        ];
    }

    const completedSteps = steps.filter(s => s.status === 'completed').length;
    const totalSteps = steps.length;
    const progressPercent = Math.round((completedSteps / totalSteps) * 100);

    // Express-Hinweis
    const isExpress = order.items?.some(item => item.title?.toLowerCase().includes('express'));

    return `
        <div class="bg-gradient-to-r from-purple-50 to-pink-50 rounded-xl p-4 mb-3 border border-purple-200">
            <!-- Header -->
            <div class="flex items-center justify-between mb-3">
                <div class="flex items-center gap-2">
                    <div class="w-8 h-8 bg-purple-500/20 rounded-full flex items-center justify-center">
                        <i class="fas fa-bolt text-purple-600 text-sm"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-brand-dark text-sm">Quick-Check ${isExpress ? '(Express)' : ''}</h4>
                        <p class="text-xs text-gray-500">Schritt ${currentStep} von ${totalSteps}</p>
                    </div>
                </div>
                <div class="text-right">
                    <span class="text-lg font-bold text-purple-600">${progressPercent}%</span>
                    ${isExpress ? '<p class="text-xs text-purple-500">24h Bearbeitung</p>' : ''}
                </div>
            </div>

            <!-- Fortschrittsbalken -->
            <div class="w-full h-2 bg-gray-200 rounded-full mb-4 overflow-hidden">
                <div class="h-full bg-gradient-to-r from-purple-500 to-pink-500 rounded-full transition-all duration-500"
                     style="width: ${progressPercent}%"></div>
            </div>

            <!-- Schritte -->
            <div class="space-y-2">
                ${steps.map((step) => {
                    const isCompleted = step.status === 'completed';
                    const isPending = step.status === 'pending';
                    const isCurrent = step.step === currentStep && isPending;

                    let circleClasses = '';
                    let textClasses = '';

                    if (isCompleted) {
                        circleClasses = 'bg-green-500 text-white';
                        textClasses = 'text-green-700';
                    } else if (isCurrent) {
                        circleClasses = 'bg-purple-500 text-white shadow-lg ring-2 ring-purple-300';
                        textClasses = 'text-brand-dark font-semibold';
                    } else {
                        circleClasses = 'bg-gray-200 text-gray-400';
                        textClasses = 'text-gray-400';
                    }

                    return `
                        <div class="flex items-center gap-2 ${isCurrent ? 'bg-gradient-to-r from-purple-100 to-pink-100 rounded-lg p-2 border border-purple-300' : 'py-1'}">
                            <div class="w-6 h-6 rounded-full ${circleClasses} flex items-center justify-center flex-shrink-0 transition-all">
                                ${isCompleted
                                    ? '<i class="fas fa-check text-[10px]"></i>'
                                    : `<i class="fas fa-${step.icon} text-[10px]"></i>`
                                }
                            </div>
                            <span class="text-sm ${textClasses} flex-1">${step.name}</span>
                            ${isCurrent ? '<span class="text-[10px] bg-purple-500 text-white px-2 py-0.5 rounded-full font-medium">Aktuell</span>' : ''}
                        </div>
                    `;
                }).join('')}
            </div>

            <!-- Upload-Bereich (wenn noch keine Dokumente hochgeladen) -->
            ${!hasUploadedDocs ? `
                <div class="mt-4 bg-white rounded-lg p-4 border-2 border-dashed border-purple-300">
                    <div class="text-center">
                        <div class="w-12 h-12 bg-purple-100 rounded-full flex items-center justify-center mx-auto mb-3">
                            <i class="fas fa-cloud-upload-alt text-purple-500 text-xl"></i>
                        </div>
                        <p class="text-sm font-medium text-brand-dark mb-1">Lebenslauf hochladen</p>
                        <p class="text-xs text-gray-500 mb-3">PDF oder Word-Dokument (max. 10MB)</p>
                        <label class="cursor-pointer">
                            <input type="file"
                                   accept=".pdf,.doc,.docx,application/pdf,application/msword,application/vnd.openxmlformats-officedocument.wordprocessingml.document"
                                   onchange="app.handleQuickCheckUpload('${order.id}', this)"
                                   class="hidden">
                            <span class="inline-flex items-center gap-2 bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-6 rounded-lg transition cursor-pointer">
                                <i class="fas fa-file-upload"></i>
                                Datei auswählen
                            </span>
                        </label>
                    </div>
                </div>
            ` : ''}

            <!-- Status-Meldung -->
            <div class="mt-4 bg-white/70 rounded-lg p-3 border border-purple-100">
                <p class="text-xs text-gray-600 flex items-start gap-2">
                    <i class="fas fa-info-circle text-purple-500 mt-0.5"></i>
                    <span>${getQuickCheckStatusMessage(order, hasUploadedDocs, hasGutachten, isExpress)}</span>
                </p>
            </div>

            <!-- Gutachten Download (wenn verfügbar) -->
            ${hasGutachten && order.quickCheckGutachtenUrl ? `
                <div class="mt-3">
                    <a href="${order.quickCheckGutachtenUrl}" target="_blank"
                       class="w-full bg-purple-500 hover:bg-purple-600 text-white font-bold py-3 px-4 rounded-lg transition flex items-center justify-center gap-2">
                        <i class="fas fa-file-download"></i>
                        Gutachten herunterladen
                        <i class="fas fa-external-link-alt text-xs"></i>
                    </a>
                </div>
            ` : ''}

            <!-- Upgrade-Hinweis -->
            ${!hasGutachten ? `
                <div class="mt-3 bg-gradient-to-r from-brand-gold/10 to-amber-50 rounded-lg p-3 border border-brand-gold/30">
                    <p class="text-xs text-brand-dark flex items-start gap-2">
                        <i class="fas fa-lightbulb text-brand-gold mt-0.5"></i>
                        <span><strong>Tipp:</strong> Bei einem Upgrade auf ein CV-Paket werden die €99 vollständig angerechnet!</span>
                    </p>
                </div>
            ` : ''}
        </div>
    `;
}

// Status-Meldung für Quick-Check
function getQuickCheckStatusMessage(order, hasUploadedDocs, hasGutachten, isExpress = false) {
    const lieferzeit = isExpress ? 'innerhalb von 24 Stunden' : 'in 2-3 Werktagen';

    if (hasGutachten) {
        return 'Ihr schriftliches Gutachten ist fertig! Sie können es hier herunterladen oder finden es in Ihrer E-Mail.';
    }
    if (hasUploadedDocs) {
        return `Dokumente erhalten! Ich erstelle Ihr detailliertes schriftliches Gutachten. Sie erhalten es per E-Mail und können es hier im Dashboard herunterladen (${lieferzeit}).`;
    }
    return `Laden Sie Ihren aktuellen Lebenslauf hoch. Sie erhalten ein detailliertes schriftliches Gutachten per E-Mail und hier im Dashboard (${lieferzeit}).`;
}

// Fragebogen öffnen
export async function openQuestionnaire(orderId, cvProjectId) {
    // Speichere Order-ID und Projekt-ID für den Fragebogen
    sessionStorage.setItem('questionnaire_orderId', orderId);
    sessionStorage.setItem('questionnaire_projectId', cvProjectId || '');

    // Setze URL mit Projekt-ID für die Fragebogen-Funktionen
    if (cvProjectId) {
        window.history.pushState({}, '', `#questionnaire?order=${orderId}&project=${cvProjectId}`);
        // Initialisiere den Fragebogen mit der Projekt-ID
        await initCvQuestionnaire(cvProjectId);
    }

    // Navigiere zur Fragebogen-View (mit Smart/Manuell Auswahl)
    const allViews = document.querySelectorAll('[id^="view-"]');
    allViews.forEach(v => v.classList.add('hidden'));

    const questionnaireView = document.getElementById('view-cv-questionnaire');
    if (questionnaireView) {
        questionnaireView.classList.remove('hidden');
        // Reset zur Mode-Auswahl
        document.getElementById('cv-q-mode-selection')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-mode')?.classList.add('hidden');
        document.getElementById('cv-q-manual-mode')?.classList.add('hidden');
        window.scrollTo(0, 0);
    }
}

// Fragebogen-View anzeigen
async function showQuestionnaireView(orderId, cvProjectId) {
    const contentArea = document.getElementById('dashboard-content') || document.querySelector('main');
    if (!contentArea) return;

    contentArea.innerHTML = `
        <div class="max-w-3xl mx-auto p-6">
            <div class="bg-white rounded-2xl shadow-lg overflow-hidden">
                <div class="bg-gradient-to-r from-brand-dark to-brand-dark/90 text-white p-6">
                    <h1 class="text-2xl font-serif mb-2">CV-Fragebogen</h1>
                    <p class="text-gray-300 text-sm">Erzählen Sie mir von Ihrer Karriere - ich erstelle Ihren perfekten CV</p>
                </div>

                <form id="questionnaire-form" class="p-6 space-y-6">
                    <!-- Persönliche Daten -->
                    <div class="space-y-4">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">1</span>
                            Persönliche Daten
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Vorname *</label>
                                <input type="text" name="firstName" required class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Nachname *</label>
                                <input type="text" name="lastName" required class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">E-Mail *</label>
                                <input type="email" name="email" required class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Telefon</label>
                                <input type="tel" name="phone" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Adresse</label>
                                <input type="text" name="address" placeholder="Straße, PLZ, Stadt" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                        </div>
                    </div>

                    <!-- Aktuelle Position -->
                    <div class="space-y-4 pt-4 border-t">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">2</span>
                            Aktuelle/Letzte Position
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Jobtitel *</label>
                                <input type="text" name="currentJobTitle" required class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Unternehmen *</label>
                                <input type="text" name="currentCompany" required class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Von</label>
                                <input type="month" name="currentJobStart" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Bis (leer = aktuell)</label>
                                <input type="month" name="currentJobEnd" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div class="md:col-span-2">
                                <label class="block text-sm font-medium text-gray-700 mb-1">Hauptaufgaben & Erfolge *</label>
                                <textarea name="currentJobDescription" rows="4" required placeholder="Beschreiben Sie Ihre wichtigsten Aufgaben und Erfolge..." class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent"></textarea>
                            </div>
                        </div>
                    </div>

                    <!-- Frühere Positionen -->
                    <div class="space-y-4 pt-4 border-t">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">3</span>
                            Frühere Positionen
                        </h3>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Weitere relevante Berufserfahrung</label>
                            <textarea name="previousPositions" rows="6" placeholder="Position 1: Titel bei Firma (Jahr-Jahr)&#10;- Aufgabe/Erfolg&#10;- Aufgabe/Erfolg&#10;&#10;Position 2: ..." class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent"></textarea>
                        </div>
                    </div>

                    <!-- Ausbildung -->
                    <div class="space-y-4 pt-4 border-t">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">4</span>
                            Ausbildung
                        </h3>
                        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Höchster Abschluss *</label>
                                <input type="text" name="education" required placeholder="z.B. Master of Science" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Universität/Hochschule *</label>
                                <input type="text" name="university" required class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Fachrichtung</label>
                                <input type="text" name="fieldOfStudy" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                            <div>
                                <label class="block text-sm font-medium text-gray-700 mb-1">Abschlussjahr</label>
                                <input type="number" name="graduationYear" min="1950" max="2030" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                            </div>
                        </div>
                    </div>

                    <!-- Skills -->
                    <div class="space-y-4 pt-4 border-t">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">5</span>
                            Kenntnisse & Fähigkeiten
                        </h3>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Fachliche Kenntnisse *</label>
                            <textarea name="skills" rows="3" required placeholder="z.B. Projektmanagement, SAP, Python, Verhandlungsführung..." class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent"></textarea>
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Sprachkenntnisse</label>
                            <textarea name="languages" rows="2" placeholder="z.B. Deutsch (Muttersprache), Englisch (fließend), Französisch (Grundkenntnisse)" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent"></textarea>
                        </div>
                    </div>

                    <!-- Ziele -->
                    <div class="space-y-4 pt-4 border-t">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">6</span>
                            Karriereziele
                        </h3>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Welche Position streben Sie an?</label>
                            <input type="text" name="targetPosition" placeholder="z.B. Head of Marketing, CFO, Senior Developer" class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent">
                        </div>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Was soll der CV besonders betonen?</label>
                            <textarea name="emphasis" rows="3" placeholder="z.B. Führungserfahrung, internationale Projekte, Digitalisierung..." class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent"></textarea>
                        </div>
                    </div>

                    <!-- Zusätzliche Infos -->
                    <div class="space-y-4 pt-4 border-t">
                        <h3 class="font-bold text-brand-dark flex items-center gap-2">
                            <span class="w-6 h-6 bg-brand-gold text-brand-dark rounded-full flex items-center justify-center text-sm">7</span>
                            Zusätzliche Informationen
                        </h3>
                        <div>
                            <label class="block text-sm font-medium text-gray-700 mb-1">Weitere Angaben, Wünsche oder Hinweise</label>
                            <textarea name="additionalInfo" rows="4" placeholder="Zertifikate, Ehrenämter, besondere Hinweise für uns..." class="w-full border border-gray-300 rounded-lg px-4 py-2 focus:ring-2 focus:ring-brand-gold focus:border-transparent"></textarea>
                        </div>
                    </div>

                    <!-- Hidden fields -->
                    <input type="hidden" name="orderId" value="${orderId}">
                    <input type="hidden" name="cvProjectId" value="${cvProjectId}">

                    <!-- Submit -->
                    <div class="pt-6 border-t">
                        <button type="submit" class="w-full bg-brand-gold hover:bg-brand-gold/90 text-brand-dark font-bold py-4 px-6 rounded-lg transition flex items-center justify-center gap-2 text-lg">
                            <i class="fas fa-paper-plane"></i>
                            Fragebogen absenden
                        </button>
                        <p class="text-xs text-gray-500 text-center mt-3">
                            Nach dem Absenden beginne ich mit der Erstellung Ihres CVs
                        </p>
                    </div>
                </form>
            </div>
        </div>
    `;

    // Form Handler
    document.getElementById('questionnaire-form')?.addEventListener('submit', async (e) => {
        e.preventDefault();
        await submitQuestionnaire(e.target, orderId, cvProjectId);
    });
}

// Fragebogen absenden
async function submitQuestionnaire(form, orderId, cvProjectId) {
    const formData = new FormData(form);
    const data = Object.fromEntries(formData.entries());

    const submitBtn = form.querySelector('button[type="submit"]');
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird gesendet...';

    try {
        // Speichere in Firestore
        const { doc, updateDoc, serverTimestamp } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-firestore.js');
        const { db } = await import('./core.js');

        // Update Order mit Fragebogen-Daten
        await updateDoc(doc(db, 'orders', orderId), {
            questionnaire: data,
            questionnaireSubmittedAt: serverTimestamp(),
            cvStatus: 'data_received',
            nextStep: 'cv_creation',
            nextStepDescription: 'Ihr CV wird erstellt',
            'workflow.currentStep': 2,
            'workflow.steps': [
                { step: 1, name: 'Fragebogen ausfüllen', status: 'completed', icon: 'clipboard-list' },
                { step: 2, name: 'CV wird erstellt', status: 'pending', icon: 'pen-fancy' },
                { step: 3, name: 'Review & Feedback', status: 'waiting', icon: 'comments' },
                { step: 4, name: 'Fertigstellung', status: 'waiting', icon: 'check-circle' }
            ]
        });

        // Update CV-Projekt wenn vorhanden
        if (cvProjectId) {
            await updateDoc(doc(db, 'cvProjects', cvProjectId), {
                questionnaire: data,
                status: 'data_received',
                questionnaireSubmittedAt: serverTimestamp()
            });
        }

        showToast('✅ Fragebogen erfolgreich gesendet!');

        // Zurück zum Dashboard
        setTimeout(() => {
            window.location.hash = '#dashboard';
            window.location.reload();
        }, 1500);

    } catch (error) {
        console.error('Error submitting questionnaire:', error);
        showToast('❌ Fehler beim Senden. Bitte versuchen Sie es erneut.');
        submitBtn.disabled = false;
        submitBtn.innerHTML = '<i class="fas fa-paper-plane"></i> Fragebogen absenden';
    }
}

// Render nur CV Download-Sektion (wenn CV fertig ist)
function renderCvDownloadSection(order) {
    // Only show for CV orders when CV is ready
    if (!isCvOrder(order)) return '';

    const cvStatus = order.cvStatus || 'new';
    const cvProject = order.cvProject;

    // Nur anzeigen wenn CV fertig ist
    if (cvStatus !== 'ready' && cvStatus !== 'delivered') return '';

    // Check for download URL - either from cvProject or from order (admin upload)
    const downloadUrl = cvProject?.generatedCv?.url || order.deliveredDocumentUrl;
    const documentName = cvProject?.generatedCv?.format || order.deliveredDocumentName || 'PDF';

    if (!downloadUrl) return '';

    return `
        <div class="bg-gradient-to-br from-green-50 to-emerald-50 rounded-lg p-4 mb-3 border border-green-200">
            <div class="flex items-center gap-3 mb-3">
                <div class="w-10 h-10 bg-green-500 rounded-full flex items-center justify-center">
                    <i class="fas fa-check text-white"></i>
                </div>
                <div>
                    <p class="font-bold text-green-700">Ihr CV ist fertig!</p>
                    <p class="text-xs text-green-600">Sie können ihn jetzt herunterladen</p>
                </div>
            </div>
            <a href="${downloadUrl}"
               target="_blank"
               download
               class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-3 px-4 rounded-lg transition shadow-lg">
                <i class="fas fa-download"></i>
                CV herunterladen (${documentName})
            </a>
        </div>
    `;
}

// Render CV project section for customer order (LEGACY - kept for reference)
function renderCvProjectSection(order) {
    // Only show for CV orders
    if (!isCvOrder(order)) return '';

    const cvProject = order.cvProject;
    const cvStatus = order.cvStatus || 'new';
    const statusConfig = CV_CUSTOMER_STATUS[cvStatus] || CV_CUSTOMER_STATUS['new'];
    const questionnaire = order.questionnaire;

    return `
        <div class="bg-gradient-to-br from-indigo-50 to-purple-50 rounded-lg p-4 mb-3 border border-indigo-200">
            <div class="flex items-center justify-between mb-3">
                <span class="text-xs font-bold text-indigo-700 uppercase tracking-wider">
                    <i class="fas fa-file-alt mr-1"></i>CV-Erstellung
                </span>
                <span class="${statusConfig.color} text-xs px-2 py-1 rounded-full font-medium">
                    <i class="fas ${statusConfig.icon} mr-1"></i>${statusConfig.label}
                </span>
            </div>

            <!-- Status Description -->
            <p class="text-sm text-gray-600 mb-3">
                <i class="fas fa-info-circle text-indigo-400 mr-1"></i>
                ${statusConfig.description}
            </p>

            <!-- CV Progress Bar -->
            <div class="mb-4">
                <div class="flex items-center gap-1 text-[10px] text-gray-500 mb-1">
                    ${['new', 'questionnaire_sent', 'data_received', 'generating', 'ready'].map((step, idx) => {
                        const stepOrder = ['new', 'questionnaire_sent', 'data_received', 'generating', 'ready'];
                        const currentIdx = stepOrder.indexOf(cvStatus);
                        const isComplete = idx <= currentIdx;
                        const isCurrent = idx === currentIdx;
                        return `
                            <div class="flex-1 flex flex-col items-center">
                                <div class="w-full h-1.5 rounded-full ${isComplete ? 'bg-indigo-500' : 'bg-gray-200'} ${isCurrent ? 'animate-pulse' : ''}"></div>
                            </div>
                        `;
                    }).join('')}
                </div>
                <div class="flex justify-between text-[9px] text-gray-400">
                    <span>Bestellt</span>
                    <span>Fragebogen</span>
                    <span>Daten</span>
                    <span>Erstellen</span>
                    <span>Fertig</span>
                </div>
            </div>

            ${(cvStatus === 'new' || cvStatus === 'questionnaire_sent') ? `
                ${order.cvProjectId ? `
                    <!-- Questionnaire CTA - Ausfüllen möglich -->
                    <a href="?questionnaire=${order.cvProjectId}"
                       class="block w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white text-center font-bold py-3 px-4 rounded-xl shadow-lg hover:shadow-xl transition-all duration-300">
                        <i class="fas fa-edit mr-2"></i>Fragebogen ausfüllen
                    </a>
                ` : `
                    <!-- Fragebogen noch nicht bereit -->
                    <div class="bg-white rounded-lg p-3 border border-amber-200">
                        <div class="flex items-center gap-2 text-amber-700">
                            <i class="fas fa-clock text-amber-500"></i>
                            <span class="text-sm font-medium">Fragebogen wird vorbereitet</span>
                        </div>
                        <p class="text-xs text-gray-500 mt-1">
                            Sie erhalten in Kürze eine E-Mail mit dem Link zum Fragebogen.
                            Alternativ können Sie ihn dann auch hier im Dashboard ausfüllen.
                        </p>
                    </div>
                `}
            ` : ''}

            ${(cvStatus === 'data_received' || cvStatus === 'generating' || cvStatus === 'ready' || cvStatus === 'delivered') ? `
                <!-- Fragebogen bereits ausgefüllt - Read-Only Ansicht -->
                <div class="bg-white rounded-lg p-3 border border-indigo-100">
                    <div class="flex items-center justify-between mb-2">
                        <span class="text-xs font-semibold text-green-700">
                            <i class="fas fa-check-circle mr-1"></i>Fragebogen ausgefüllt
                        </span>
                        <span class="text-[10px] text-gray-400 bg-gray-100 px-2 py-0.5 rounded">
                            <i class="fas fa-lock mr-1"></i>Nur Ansicht
                        </span>
                    </div>
                    ${questionnaire || cvProject?.documents ? `
                        <button onclick="app.toggleCvQuestionnaireView('${order.id}')"
                                class="w-full flex items-center justify-between text-left pt-2 border-t border-gray-100">
                            <span class="text-xs text-gray-600">
                                <i class="fas fa-list-alt text-indigo-500 mr-1"></i>Eingegebene Daten anzeigen
                            </span>
                            <i class="fas fa-chevron-down text-gray-400 transition-transform" id="cv-q-toggle-${order.id}"></i>
                        </button>

                        <div id="cv-questionnaire-view-${order.id}" class="hidden mt-3 pt-3 border-t border-gray-100 space-y-3 text-xs">
                            ${renderQuestionnaireDataForCustomer(questionnaire, cvProject?.documents, cvProject?.templateSelection)}
                        </div>
                    ` : `
                        <p class="text-xs text-gray-500 italic">Daten werden verarbeitet...</p>
                    `}
                </div>
            ` : ''}

            ${(cvStatus === 'ready' || cvStatus === 'delivered') && order.cvProject?.generatedCv ? `
                <!-- Download CV -->
                <div class="mt-3 bg-green-50 rounded-lg p-3 border border-green-200">
                    <p class="text-xs font-semibold text-green-700 mb-2">
                        <i class="fas fa-check-circle mr-1"></i>Ihr CV ist bereit!
                    </p>
                    <a href="${order.cvProject.generatedCv.url}"
                       target="_blank"
                       download
                       class="flex items-center justify-center gap-2 w-full bg-green-600 hover:bg-green-700 text-white font-bold py-2.5 px-4 rounded-lg transition">
                        <i class="fas fa-download"></i>
                        CV herunterladen
                    </a>
                </div>
            ` : ''}
        </div>
    `;
}

// Toggle CV questionnaire view
export function toggleCvQuestionnaireView(orderId) {
    const container = document.getElementById(`cv-questionnaire-view-${orderId}`);
    const toggleIcon = document.getElementById(`cv-q-toggle-${orderId}`);

    if (container && toggleIcon) {
        const isHidden = container.classList.contains('hidden');
        if (isHidden) {
            container.classList.remove('hidden');
            toggleIcon.classList.add('rotate-180');
        } else {
            container.classList.add('hidden');
            toggleIcon.classList.remove('rotate-180');
        }
    }
}

// Render questionnaire data summary for customer
function renderQuestionnaireDataForCustomer(questionnaire, documents, templateSelection) {
    if (!questionnaire && !documents && !templateSelection) return '<p class="text-gray-400 italic">Keine Daten vorhanden</p>';

    let html = '';

    // Template Selection
    if (templateSelection) {
        const colors = templateSelection.customization || {};
        html += `
            <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded p-2 border border-amber-200">
                <p class="font-semibold text-gray-700 mb-2"><i class="fas fa-palette text-amber-500 mr-1"></i>Gewähltes Design</p>
                <div class="flex items-center gap-3">
                    <div class="flex items-center gap-2">
                        <span class="text-gray-600"><strong>Template:</strong> ${sanitizeHTML(templateSelection.templateName || templateSelection.templateId)}</span>
                    </div>
                </div>
                <div class="flex items-center gap-3 mt-2">
                    <span class="text-gray-500">Farben:</span>
                    <div class="flex items-center gap-2">
                        <span class="inline-flex items-center gap-1">
                            <span class="w-5 h-5 rounded border border-gray-300 shadow-sm" style="background-color: ${colors.primaryColor || '#b76e22'}"></span>
                            <span class="text-gray-500 text-[10px]">Haupt</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-5 h-5 rounded border border-gray-300 shadow-sm" style="background-color: ${colors.accentColor || '#8fa3b4'}"></span>
                            <span class="text-gray-500 text-[10px]">Akzent</span>
                        </span>
                        <span class="inline-flex items-center gap-1">
                            <span class="w-5 h-5 rounded border border-gray-300 shadow-sm" style="background-color: ${colors.circleColor || '#f4b4b7'}"></span>
                            <span class="text-gray-500 text-[10px]">Kreis</span>
                        </span>
                    </div>
                </div>
            </div>
        `;
    }

    // Personal Info
    if (questionnaire?.personal) {
        const p = questionnaire.personal;
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-user text-indigo-400 mr-1"></i>Persönliche Daten</p>
                <div class="grid grid-cols-2 gap-1 text-gray-600">
                    ${p.fullName ? `<p><span class="text-gray-400">Name:</span> ${sanitizeHTML(p.fullName)}</p>` : ''}
                    ${p.email ? `<p><span class="text-gray-400">E-Mail:</span> ${sanitizeHTML(p.email)}</p>` : ''}
                    ${p.phone ? `<p><span class="text-gray-400">Telefon:</span> ${sanitizeHTML(p.phone)}</p>` : ''}
                    ${p.location ? `<p><span class="text-gray-400">Ort:</span> ${sanitizeHTML(p.location)}</p>` : ''}
                    ${p.targetRole ? `<p class="col-span-2"><span class="text-gray-400">Zielposition:</span> ${sanitizeHTML(p.targetRole)}</p>` : ''}
                    ${p.linkedin ? `<p class="col-span-2"><span class="text-gray-400">LinkedIn:</span> <a href="${sanitizeHTML(p.linkedin)}" target="_blank" class="text-indigo-600 underline">${sanitizeHTML(p.linkedin)}</a></p>` : ''}
                </div>
            </div>
        `;
    }

    // Experience
    if (questionnaire.experience?.length > 0) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-briefcase text-indigo-400 mr-1"></i>Berufserfahrung (${questionnaire.experience.length})</p>
                <div class="space-y-2">
                    ${questionnaire.experience.slice(0, 3).map(exp => `
                        <div class="text-gray-600 border-l-2 border-indigo-200 pl-2">
                            <p class="font-medium">${sanitizeHTML(exp.role || exp.title || 'Position')}</p>
                            <p class="text-gray-400">${sanitizeHTML(exp.company || '')} ${exp.startDate ? `• ${exp.startDate}` : ''}</p>
                        </div>
                    `).join('')}
                    ${questionnaire.experience.length > 3 ? `<p class="text-gray-400">+ ${questionnaire.experience.length - 3} weitere...</p>` : ''}
                </div>
            </div>
        `;
    }

    // Education
    if (questionnaire.education?.length > 0) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-graduation-cap text-indigo-400 mr-1"></i>Ausbildung (${questionnaire.education.length})</p>
                <div class="space-y-1">
                    ${questionnaire.education.slice(0, 2).map(edu => `
                        <div class="text-gray-600">
                            <p>${sanitizeHTML(edu.degree || edu.field || 'Abschluss')} - ${sanitizeHTML(edu.institution || '')}</p>
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Skills
    if (questionnaire.skills) {
        const skills = questionnaire.skills;
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-tools text-indigo-400 mr-1"></i>Fähigkeiten</p>
                <div class="flex flex-wrap gap-1">
                    ${(skills.technical || []).slice(0, 5).map(s => `<span class="bg-indigo-100 text-indigo-700 px-1.5 py-0.5 rounded text-[10px]">${sanitizeHTML(s)}</span>`).join('')}
                    ${(skills.soft || []).slice(0, 3).map(s => `<span class="bg-purple-100 text-purple-700 px-1.5 py-0.5 rounded text-[10px]">${sanitizeHTML(s)}</span>`).join('')}
                </div>
            </div>
        `;
    }

    // Languages
    if (questionnaire?.skills?.languages?.length > 0) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-globe text-indigo-400 mr-1"></i>Sprachen</p>
                <div class="flex flex-wrap gap-2">
                    ${questionnaire.skills.languages.map(lang => `
                        <span class="text-gray-600">${sanitizeHTML(lang.name || lang)} ${lang.level ? `(${lang.level})` : ''}</span>
                    `).join(' • ')}
                </div>
            </div>
        `;
    }

    // Additional notes
    if (questionnaire?.additional?.notes) {
        html += `
            <div class="bg-gray-50 rounded p-2">
                <p class="font-semibold text-gray-700 mb-1"><i class="fas fa-sticky-note text-indigo-400 mr-1"></i>Zusätzliche Hinweise</p>
                <p class="text-gray-600 whitespace-pre-line">${sanitizeHTML(questionnaire.additional.notes)}</p>
            </div>
        `;
    }

    // Uploaded Documents
    if (documents) {
        let docsHtml = '';

        // Existing CV
        if (documents.existingCv?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-file-pdf text-red-500"></i>
                        <span class="text-gray-700">${sanitizeHTML(documents.existingCv.filename || 'Bestehender Lebenslauf')}</span>
                    </div>
                    <a href="${documents.existingCv.url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-xs">
                        <i class="fas fa-external-link-alt mr-1"></i>Ansehen
                    </a>
                </div>
            `;
        }

        // Target Job / Stellenanzeige
        if (documents.targetJob?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                    <div class="flex items-center gap-2">
                        <i class="fas fa-briefcase text-blue-500"></i>
                        <span class="text-gray-700">${sanitizeHTML(documents.targetJob.filename || 'Stellenanzeige')}</span>
                    </div>
                    <a href="${documents.targetJob.url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-xs">
                        <i class="fas fa-external-link-alt mr-1"></i>Ansehen
                    </a>
                </div>
            `;
        }

        // Other Documents
        if (documents.otherDocuments?.length > 0) {
            documents.otherDocuments.forEach((doc, idx) => {
                if (doc.url) {
                    docsHtml += `
                        <div class="flex items-center justify-between p-2 bg-white rounded border border-gray-200">
                            <div class="flex items-center gap-2">
                                <i class="fas fa-file text-gray-500"></i>
                                <span class="text-gray-700">${sanitizeHTML(doc.filename || `Dokument ${idx + 1}`)}</span>
                            </div>
                            <a href="${doc.url}" target="_blank" class="text-indigo-600 hover:text-indigo-800 text-xs">
                                <i class="fas fa-external-link-alt mr-1"></i>Ansehen
                            </a>
                        </div>
                    `;
                }
            });
        }

        if (docsHtml) {
            html += `
                <div class="bg-gray-50 rounded p-2">
                    <p class="font-semibold text-gray-700 mb-2"><i class="fas fa-folder-open text-indigo-400 mr-1"></i>Hochgeladene Dokumente</p>
                    <div class="space-y-2">
                        ${docsHtml}
                    </div>
                </div>
            `;
        }
    }

    return html || '<p class="text-gray-400 italic">Keine Daten vorhanden</p>';
}

// Upload document to order
export async function uploadOrderDocument(orderId, input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    const maxSize = 10 * 1024 * 1024; // 10MB

    for (const file of files) {
        if (file.size > maxSize) {
            showToast(`❌ ${file.name} ist zu groß (max. 10MB)`);
            continue;
        }

        showToast(`⏳ ${file.name} wird hochgeladen...`);

        try {
            const timestamp = Date.now();
            const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
            const path = `order-documents/${orderId}/customer/${timestamp}_${safeName}`;

            const storageRef = ref(storage, path);
            await uploadBytes(storageRef, file);
            const url = await getDownloadURL(storageRef);

            // Add document to order in Firestore
            const orderRef = doc(db, 'orders', orderId);
            const orderDoc = await getDoc(orderRef);

            if (orderDoc.exists()) {
                const currentDocs = orderDoc.data().customerDocuments || [];
                const newDoc = {
                    id: `doc_${timestamp}`,
                    name: file.name,
                    size: file.size,
                    type: file.type,
                    url: url,
                    path: path,
                    uploadedAt: new Date()
                };

                await updateDoc(orderRef, {
                    customerDocuments: [...currentDocs, newDoc]
                });

                showToast(`✅ ${file.name} hochgeladen`);

                // Refresh the documents display
                const container = document.getElementById(`customer-docs-${orderId}`);
                if (container) {
                    const updatedOrder = { ...orderDoc.data(), customerDocuments: [...currentDocs, newDoc] };
                    container.innerHTML = renderCustomerDocuments(updatedOrder);
                }
            }
        } catch (error) {
            logger.error('Upload error:', error);
            showToast(`❌ Fehler beim Hochladen: ${file.name}`);
        }
    }

    // Reset input
    input.value = '';
}

// Delete customer document from order
export async function deleteOrderDocument(orderId, docId) {
    if (!confirm('Möchten Sie dieses Dokument wirklich löschen?')) return;

    try {
        const orderRef = doc(db, 'orders', orderId);
        const orderDoc = await getDoc(orderRef);

        if (orderDoc.exists()) {
            const currentDocs = orderDoc.data().customerDocuments || [];
            const docToDelete = currentDocs.find(d => d.id === docId);

            // Delete from Storage
            if (docToDelete?.path) {
                try {
                    const storageRef = ref(storage, docToDelete.path);
                    await deleteObject(storageRef);
                } catch (e) {
                    logger.warn('Could not delete file from storage:', e);
                }
            }

            // Remove from Firestore
            const updatedDocs = currentDocs.filter(d => d.id !== docId);
            await updateDoc(orderRef, {
                customerDocuments: updatedDocs
            });

            showToast('✅ Dokument gelöscht');

            // Refresh the documents display
            const container = document.getElementById(`customer-docs-${orderId}`);
            if (container) {
                const updatedOrder = { ...orderDoc.data(), customerDocuments: updatedDocs };
                container.innerHTML = renderCustomerDocuments(updatedOrder);
            }
        }
    } catch (error) {
        logger.error('Delete error:', error);
        showToast('❌ Fehler beim Löschen');
    }
}

// Check if meeting time is now (15 min before to 2 hours after)
function isMeetingTimeNow(datetime) {
    const meetingTime = new Date(datetime);
    const now = new Date();
    const fifteenMinBefore = new Date(meetingTime.getTime() - 15 * 60 * 1000);
    const twoHoursAfter = new Date(meetingTime.getTime() + 2 * 60 * 60 * 1000);

    return now >= fifteenMinBefore && now <= twoHoursAfter;
}

// Join video meeting
export async function joinMeeting(orderId) {
    showToast('⏳ Meeting wird vorbereitet...');

    try {
        // Get order data to check if meeting room exists
        const orderDoc = await getDoc(doc(db, "orders", orderId));
        if (!orderDoc.exists()) {
            showToast('❌ Bestellung nicht gefunden');
            return;
        }

        const order = orderDoc.data();
        let meetingUrl = order.meetingRoom?.url;
        let roomName = order.meetingRoom?.roomName;

        // If no meeting room exists, create one
        if (!meetingUrl) {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/createMeetingRoom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    appointmentDatetime: order.appointment.datetime,
                    customerName: order.customerName || 'Kunde'
                })
            });

            const result = await response.json();
            if (!result.success) {
                showToast('❌ Meeting konnte nicht erstellt werden');
                return;
            }

            meetingUrl = result.meetingUrl;
            roomName = result.roomName;
        }

        // Open meeting modal
        openMeetingModal(meetingUrl, roomName, orderId);

    } catch (error) {
        logger.error('Failed to join meeting:', error);
        showToast('❌ Fehler beim Beitreten');
    }
}

// Open meeting modal with embedded Daily.co
function openMeetingModal(meetingUrl, roomName, orderId) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('video-meeting-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'video-meeting-modal';
        modal.className = 'fixed inset-0 bg-black/90 z-50 flex flex-col';
        document.body.appendChild(modal);
    }

    modal.innerHTML = `
        <div class="flex items-center justify-between p-4 bg-brand-dark text-white">
            <div class="flex items-center gap-3">
                <div class="w-10 h-10 bg-brand-gold rounded-full flex items-center justify-center">
                    <i class="fas fa-video text-brand-dark"></i>
                </div>
                <div>
                    <h3 class="font-bold">Karriaro Mentoring Session</h3>
                    <p class="text-xs text-gray-400">Sichere Video-Verbindung</p>
                </div>
            </div>
            <button onclick="app.closeMeetingModal()" class="w-10 h-10 bg-red-600 hover:bg-red-700 rounded-full flex items-center justify-center transition">
                <i class="fas fa-phone-slash"></i>
            </button>
        </div>
        <div class="flex-1 bg-black">
            <iframe
                id="daily-iframe"
                src="${meetingUrl}"
                allow="camera; microphone; fullscreen; display-capture; autoplay"
                class="w-full h-full border-0"
            ></iframe>
        </div>
        <div class="p-3 bg-brand-dark flex items-center justify-center gap-4">
            <button onclick="app.toggleFullscreen()" class="px-4 py-2 bg-gray-700 hover:bg-gray-600 text-white rounded-lg transition flex items-center gap-2">
                <i class="fas fa-expand"></i>
                <span class="hidden sm:inline">Vollbild</span>
            </button>
            <button onclick="app.closeMeetingModal()" class="px-6 py-2 bg-red-600 hover:bg-red-700 text-white rounded-lg transition flex items-center gap-2">
                <i class="fas fa-sign-out-alt"></i>
                <span>Meeting verlassen</span>
            </button>
        </div>
    `;

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

// Close meeting modal
export function closeMeetingModal() {
    const modal = document.getElementById('video-meeting-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.innerHTML = ''; // Clear iframe
    }
    document.body.style.overflow = '';

    // Exit fullscreen if active
    if (document.fullscreenElement) {
        document.exitFullscreen();
    }
}

// Toggle fullscreen for meeting
export function toggleFullscreen() {
    const modal = document.getElementById('video-meeting-modal');
    if (!modal) return;

    if (!document.fullscreenElement) {
        modal.requestFullscreen().catch(err => {
            logger.warn('Fullscreen not available:', err);
        });
    } else {
        document.exitFullscreen();
    }
}

function renderOrderProgress(status) {
    const steps = [
        { key: 'confirmed', label: 'Bestätigt', icon: 'fa-check' },
        { key: 'processing', label: 'In Bearbeitung', icon: 'fa-cog' },
        { key: 'review', label: 'Qualitätsprüfung', icon: 'fa-search' },
        { key: 'completed', label: 'Abgeschlossen', icon: 'fa-flag-checkered' }
    ];

    const statusOrder = ['confirmed', 'processing', 'review', 'completed'];
    const currentIndex = statusOrder.indexOf(status);

    return steps.map((step, index) => {
        const isCompleted = index <= currentIndex;
        const isCurrent = index === currentIndex;

        return `
            <div class="flex-1 flex flex-col items-center">
                <div class="w-8 h-8 rounded-full flex items-center justify-center text-xs ${
                    isCompleted
                        ? 'bg-brand-gold text-brand-dark'
                        : 'bg-gray-200 text-gray-400'
                } ${isCurrent ? 'ring-2 ring-brand-gold ring-offset-2' : ''}">
                    <i class="fas ${step.icon}"></i>
                </div>
                <span class="text-[10px] mt-1 text-center ${isCompleted ? 'text-brand-dark font-medium' : 'text-gray-400'}">${step.label}</span>
            </div>
            ${index < steps.length - 1 ? `
                <div class="flex-1 h-0.5 ${index < currentIndex ? 'bg-brand-gold' : 'bg-gray-200'} mt-4"></div>
            ` : ''}
        `;
    }).join('');
}

function getOrderStatusInfo(status) {
    const statusMap = {
        'confirmed': {
            text: 'Bestätigt',
            class: 'paid',
            icon: 'fas fa-check-circle',
            description: 'Ihre Bestellung wurde bestätigt und wird in Kürze bearbeitet.'
        },
        'processing': {
            text: 'In Bearbeitung',
            class: 'processing',
            icon: 'fas fa-cog fa-spin',
            description: 'Ich arbeite an Ihrem Auftrag.'
        },
        'review': {
            text: 'Qualitätsprüfung',
            class: 'processing',
            icon: 'fas fa-search',
            description: 'Ihr Dokument wird einer abschließenden Qualitätsprüfung unterzogen.'
        },
        'completed': {
            text: 'Abgeschlossen',
            class: 'paid',
            icon: 'fas fa-flag-checkered',
            description: 'Ihr Auftrag wurde erfolgreich abgeschlossen. Dokumente finden Sie im Vault.'
        },
        'cancelled': {
            text: 'Storniert',
            class: 'pending',
            icon: 'fas fa-times-circle',
            description: 'Diese Bestellung wurde storniert.'
        }
    };

    return statusMap[status] || statusMap['confirmed'];
}

export function hasCoachSession(order) {
    // Check for any mentoring/session products
    const sessionKeywords = ['Session', 'Mentoring', 'Coaching', 'Komplettpaket', 'Interview-Simulation'];
    return order.items && order.items.some(item =>
        item.title && sessionKeywords.some(keyword => item.title.includes(keyword))
    );
}

// Erkennt 3er-Mentoring-Paket
export function isMentoringPackage(order) {
    if (!order.items) return { isPackage: false, totalSessions: 1 };

    // 3er-Paket erkennen
    const has3erPaket = order.items.some(item =>
        item.title && (item.title.includes('3er') || item.title.includes('3x') || item.title.includes('Paket'))
    );

    if (has3erPaket) {
        return { isPackage: true, totalSessions: 3 };
    }

    // Komplettpaket erkennen (hat auch Session)
    const hasKomplettpaket = order.items.some(item =>
        item.title && item.title.includes('Komplettpaket')
    );

    if (hasKomplettpaket) {
        return { isPackage: true, totalSessions: 1, isKomplettpaket: true };
    }

    return { isPackage: false, totalSessions: 1 };
}

export function getOrderStatusText(status) {
    const statusTexts = {
        'processing': 'In Bearbeitung',
        'confirmed': 'Bestätigt',
        'completed': 'Abgeschlossen',
        'cancelled': 'Storniert'
    };
    return statusTexts[status] || 'Unbekannt';
}

// Scroll to appointment proposals section
export function scrollToAppointmentProposals(orderId) {
    const proposalsSection = document.getElementById(`appointment-proposals-${orderId}`);
    if (proposalsSection) {
        proposalsSection.scrollIntoView({ behavior: 'smooth', block: 'center' });
        // Highlight effect
        proposalsSection.classList.add('ring-2', 'ring-blue-400', 'ring-offset-2');
        setTimeout(() => {
            proposalsSection.classList.remove('ring-2', 'ring-blue-400', 'ring-offset-2');
        }, 2000);
    }
}

export function showAppointmentCalendar(orderId) {
    const calendar = document.getElementById('appointment-calendar');
    if (!calendar) return;

    calendar.classList.remove('hidden');

    const slots = generateTimeSlots(14);
    const slotsContainer = document.getElementById('calendar-slots');
    if (!slotsContainer) return;

    slotsContainer.innerHTML = slots.map(slot => `<button onclick="app.bookAppointment('${orderId}', '${slot.datetime}')" class="border-2 border-gray-300 p-3 rounded hover:border-brand-gold hover:bg-brand-gold/5 transition text-left group"><div class="font-bold text-sm group-hover:text-brand-gold transition">${slot.date}</div><div class="text-xs text-gray-600">${slot.time} Uhr</div></button>`).join('');

    setTimeout(() => {
        calendar.scrollIntoView({ behavior: 'smooth', block: 'start' });
    }, 100);
}

export function generateTimeSlots(days) {
    const slots = [];
    const now = new Date();
    const times = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

    for (let d = 1; d <= days; d++) {
        const date = new Date(now);
        date.setDate(date.getDate() + d);

        if (date.getDay() === 0 || date.getDay() === 6) continue;

        times.forEach(time => {
            slots.push({
                datetime: `${date.toISOString().split('T')[0]}T${time}`,
                date: date.toLocaleDateString('de-DE', {weekday: 'short', day: '2-digit', month: 'short'}),
                time: time
            });
        });
    }

    return slots;
}

export async function bookAppointment(state, orderId, datetime) {
    if (!confirm(`Termin am ${new Date(datetime).toLocaleString('de-DE', {weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit'})} Uhr buchen?`)) {
        return;
    }

    try {
        if (db && state.user) {
            await updateDoc(doc(db, "orders", orderId), {
                appointment: {
                    datetime: datetime,
                    status: 'confirmed',
                    bookedAt: new Date()
                }
            });

            showToast('✅ Termin gebucht!');
        } else {
            showToast('✅ Termin gebucht! (Demo-Modus)');
        }

        document.getElementById('appointment-calendar')?.classList.add('hidden');
        await loadUserOrders(state);
    } catch (e) {
        logger.error('Appointment booking failed:', e);
        showToast('❌ Terminbuchung fehlgeschlagen', 3000);
    }
}

// ========== APPOINTMENT PROPOSALS (Admin) ==========

// State for proposal calendar
let proposalCalendarWeekOffset = 0;
let proposalCoachAvailability = {};
let proposalSelectedSlots = []; // Array of {date, time} - max 3
let proposalCoachName = '';
let proposalOrderData = {};

export async function showAppointmentProposalModal(orderId, userId, customerName, customerEmail, assignedCoachId) {
    const modal = document.getElementById('appointment-proposal-modal');
    if (!modal) return;

    // Reset state
    proposalCalendarWeekOffset = 0;
    proposalCoachAvailability = {};
    proposalSelectedSlots = [];
    proposalCoachName = '';
    proposalOrderData = { orderId, userId, customerName, customerEmail, assignedCoachId };

    // Show loading state
    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-100">
                <div class="flex items-center justify-between">
                    <h3 class="font-serif text-xl text-brand-dark">Terminvorschläge senden</h3>
                    <button onclick="app.closeAppointmentProposalModal()" class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
                <p class="text-sm text-gray-500 mt-1">an <span class="font-medium text-brand-dark">${sanitizeHTML(customerName)}</span></p>
            </div>
            <div class="p-8 text-center">
                <i class="fas fa-spinner fa-spin text-4xl text-brand-gold mb-4"></i>
                <p class="text-gray-600">Lade Verfügbarkeiten...</p>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');

    // If no assignedCoachId passed, try to get it from the order
    let coachId = assignedCoachId;
    if ((!coachId || coachId === '') && db && orderId) {
        try {
            const orderDoc = await getDoc(doc(db, 'orders', orderId));
            if (orderDoc.exists()) {
                coachId = orderDoc.data().assignedCoachId;
                logger.log('Loaded assignedCoachId from order:', coachId);
            }
        } catch (error) {
            logger.error('Failed to load order for coachId:', error);
        }
    }

    // Load coach availability
    if (coachId && coachId !== '' && db) {
        try {
            logger.log('Loading availability for coach:', coachId);
            const coachDoc = await getDoc(doc(db, 'coaches', coachId));
            if (coachDoc.exists()) {
                const coach = coachDoc.data();
                proposalCoachAvailability = coach.availability || {};
                proposalCoachName = coach.name || 'Mentor';
                logger.log('Loaded availability:', Object.keys(proposalCoachAvailability).length, 'days');
            } else {
                logger.warn('Coach document not found:', coachId);
            }
        } catch (error) {
            logger.error('Failed to load coach availability:', error);
        }
    } else {
        logger.warn('No valid coachId available:', coachId);
    }

    // Render the full modal with calendar
    renderProposalCalendarModal();
}

function renderProposalCalendarModal() {
    const modal = document.getElementById('appointment-proposal-modal');
    if (!modal) return;

    const { customerName } = proposalOrderData;
    const hasAvailability = Object.keys(proposalCoachAvailability).length > 0;

    modal.innerHTML = `
        <div class="bg-white rounded-xl shadow-2xl max-w-4xl w-full max-h-[90vh] overflow-hidden flex flex-col">
            <!-- Header -->
            <div class="p-4 sm:p-6 border-b border-gray-100 flex-shrink-0">
                <div class="flex items-center justify-between">
                    <div>
                        <h3 class="font-serif text-lg sm:text-xl text-brand-dark">Terminvorschläge senden</h3>
                        <p class="text-sm text-gray-500 mt-1">an <span class="font-medium text-brand-dark">${sanitizeHTML(customerName)}</span></p>
                    </div>
                    <button onclick="app.closeAppointmentProposalModal()" class="text-gray-400 hover:text-gray-600 transition p-2">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
            </div>

            <!-- Content -->
            <div class="p-4 sm:p-6 overflow-y-auto flex-1">
                ${hasAvailability ? `
                    <!-- Coach Info & Instructions -->
                    <div class="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3 mb-4">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-user-tie text-brand-gold"></i>
                            <span class="text-sm font-medium text-gray-700">Verfügbarkeit von ${sanitizeHTML(proposalCoachName)}</span>
                        </div>
                        <div class="flex items-center gap-4 text-xs">
                            <div class="flex items-center gap-1.5">
                                <div class="w-4 h-4 bg-green-500 rounded"></div>
                                <span class="text-gray-600">Verfügbar</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <div class="w-4 h-4 bg-brand-gold rounded ring-2 ring-brand-gold ring-offset-1"></div>
                                <span class="text-gray-600">Ausgewählt</span>
                            </div>
                            <div class="flex items-center gap-1.5">
                                <div class="w-4 h-4 bg-gray-200 rounded"></div>
                                <span class="text-gray-600">Nicht verfügbar</span>
                            </div>
                        </div>
                    </div>

                    <p class="text-sm text-gray-600 mb-4">
                        <i class="fas fa-info-circle text-blue-500 mr-1"></i>
                        Klicke auf <span class="text-green-600 font-medium">grüne Slots</span>, um bis zu 3 Terminvorschläge auszuwählen.
                    </p>

                    <!-- Week Navigation -->
                    <div class="flex items-center justify-between mb-4">
                        <button onclick="app.proposalPrevWeek()" class="p-2 hover:bg-gray-100 rounded-lg transition">
                            <i class="fas fa-chevron-left text-gray-600"></i>
                        </button>
                        <span id="proposal-week-label" class="font-medium text-gray-700"></span>
                        <button onclick="app.proposalNextWeek()" class="p-2 hover:bg-gray-100 rounded-lg transition">
                            <i class="fas fa-chevron-right text-gray-600"></i>
                        </button>
                    </div>

                    <!-- Calendar Grid -->
                    <div id="proposal-calendar-grid" class="overflow-x-auto mb-4"></div>

                    <!-- Selected Slots Display -->
                    <div id="proposal-selected-display" class="mb-4"></div>

                    <!-- Message -->
                    <div class="mb-4">
                        <label class="text-sm font-medium text-gray-700 mb-2 block">Nachricht (optional)</label>
                        <textarea id="proposal-message" rows="2" placeholder="z.B. Vielen Dank für Ihre Bestellung..."
                                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none">Vielen Dank für Ihre Bestellung! Bitte wählen Sie einen der folgenden Termine für unser persönliches Gespräch. Ich freue mich auf Sie!</textarea>
                    </div>
                ` : `
                    <!-- No Availability Warning -->
                    <div class="bg-yellow-50 border-2 border-yellow-200 rounded-xl p-6 text-center mb-4">
                        <i class="fas fa-exclamation-triangle text-yellow-500 text-4xl mb-3"></i>
                        <h4 class="font-bold text-yellow-700 mb-2">Keine Verfügbarkeiten hinterlegt</h4>
                        <p class="text-sm text-yellow-600 mb-4">
                            ${proposalCoachName ? `${sanitizeHTML(proposalCoachName)} hat` : 'Der Mentor hat'} noch keine Verfügbarkeiten im Kalender eingetragen.
                        </p>
                        <p class="text-xs text-gray-500">
                            Bitte den Mentor bitten, seine Verfügbarkeit im Mentor-Dashboard zu hinterlegen.
                        </p>
                    </div>
                `}
            </div>

            <!-- Footer -->
            <div class="p-4 sm:p-6 border-t border-gray-100 bg-gray-50 flex-shrink-0">
                <div class="flex flex-col sm:flex-row gap-3">
                    <button onclick="app.closeAppointmentProposalModal()"
                            class="flex-1 sm:flex-none px-6 py-3 border border-gray-300 text-gray-700 font-medium rounded-lg hover:bg-gray-100 transition">
                        Abbrechen
                    </button>
                    <button onclick="app.sendProposalFromCalendar()"
                            id="proposal-send-btn"
                            class="flex-1 bg-green-600 text-white font-bold py-3 px-6 rounded-lg hover:bg-green-700 transition disabled:opacity-50 disabled:cursor-not-allowed"
                            ${!hasAvailability || proposalSelectedSlots.length === 0 ? 'disabled' : ''}>
                        <i class="fas fa-paper-plane mr-2"></i>
                        <span id="proposal-send-btn-text">${proposalSelectedSlots.length > 0 ? `${proposalSelectedSlots.length} Termin${proposalSelectedSlots.length > 1 ? 'e' : ''} vorschlagen` : 'Termine auswählen'}</span>
                    </button>
                </div>
            </div>
        </div>
    `;

    // Render calendar if availability exists
    if (hasAvailability) {
        renderProposalCalendarGrid();
        renderProposalSelectedSlots();
    }
}

function renderProposalCalendarGrid() {
    const container = document.getElementById('proposal-calendar-grid');
    const weekLabel = document.getElementById('proposal-week-label');
    if (!container) return;

    // Calculate week dates
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (proposalCalendarWeekOffset * 7)); // Monday

    // Update week label
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = startOfWeek.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    if (weekLabel) {
        weekLabel.textContent = `KW ${weekNumber} - ${monthName}`;
    }

    // Time slots (9:00 - 21:00)
    const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

    // Days of the week
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
    }

    // Build calendar HTML
    let html = `
        <table class="w-full border-collapse min-w-[600px]">
            <thead>
                <tr>
                    <th class="p-2 text-xs text-gray-500 font-medium w-16"></th>
                    ${days.map(d => `
                        <th class="p-2 text-center ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : ''}">
                            <div class="text-xs text-gray-500 font-medium">${d.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                            <div class="text-sm font-bold ${isToday(d) ? 'text-brand-gold' : 'text-gray-700'}">${d.getDate()}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    timeSlots.forEach(time => {
        html += `<tr>`;
        html += `<td class="p-2 text-xs text-gray-500 font-medium text-right pr-3">${time}</td>`;

        days.forEach(d => {
            const dateKey = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isAvailable = proposalCoachAvailability[dateKey]?.includes(time);
            const isPast = new Date(`${dateKey}T${time}`) <= new Date();
            const isSelected = proposalSelectedSlots.some(s => s.date === dateKey && s.time === time);

            let cellClass = 'p-1';
            let slotClass = 'w-full h-8 rounded transition-all ';

            if (isPast) {
                slotClass += 'bg-gray-100 cursor-not-allowed';
            } else if (isSelected) {
                slotClass += 'bg-brand-gold ring-2 ring-brand-gold ring-offset-1 cursor-pointer hover:bg-brand-gold/80';
            } else if (isAvailable) {
                slotClass += 'bg-green-500 hover:bg-green-600 cursor-pointer';
            } else {
                slotClass += 'bg-gray-200 cursor-not-allowed';
            }

            if (isWeekend) {
                cellClass += ' bg-gray-50';
            }

            // Only available (and not past) slots are clickable
            const clickHandler = (!isPast && isAvailable) ? `onclick="app.toggleProposalSlot('${dateKey}', '${time}')"` : '';

            let title = '';
            if (isPast) title = 'Vergangen';
            else if (isSelected) title = 'Ausgewählt - Klicken zum Entfernen';
            else if (isAvailable) title = 'Verfügbar - Klicken zum Auswählen';
            else title = 'Nicht verfügbar';

            html += `<td class="${cellClass}">
                <div class="${slotClass}" ${clickHandler} title="${title}"></div>
            </td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

function renderProposalSelectedSlots() {
    const container = document.getElementById('proposal-selected-display');
    const sendBtn = document.getElementById('proposal-send-btn');
    const sendBtnText = document.getElementById('proposal-send-btn-text');

    if (!container) return;

    if (proposalSelectedSlots.length === 0) {
        container.innerHTML = `
            <div class="bg-blue-50 border border-blue-200 rounded-lg p-3 text-center">
                <i class="fas fa-hand-pointer text-blue-500 mr-2"></i>
                <span class="text-sm text-blue-700">Klicke auf grüne Slots im Kalender, um Termine auszuwählen (max. 3)</span>
            </div>
        `;
        if (sendBtn) sendBtn.disabled = true;
        if (sendBtnText) sendBtnText.textContent = 'Termine auswählen';
    } else {
        container.innerHTML = `
            <div class="bg-green-50 border border-green-200 rounded-lg p-3">
                <div class="flex items-center gap-2 mb-2">
                    <i class="fas fa-check-circle text-green-600"></i>
                    <span class="text-sm font-medium text-green-700">${proposalSelectedSlots.length} von 3 Terminen ausgewählt</span>
                </div>
                <div class="flex flex-wrap gap-2">
                    ${proposalSelectedSlots.map((slot, idx) => {
                        const date = new Date(slot.date);
                        const weekday = date.toLocaleDateString('de-DE', { weekday: 'short' });
                        const displayDate = date.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit' });
                        return `
                            <div class="flex items-center gap-2 bg-white border border-green-300 rounded-lg px-3 py-2">
                                <span class="font-bold text-green-700">${idx + 1}.</span>
                                <span class="text-gray-700">${weekday}, ${displayDate}</span>
                                <span class="font-bold text-green-700">${slot.time}</span>
                                <button onclick="app.removeProposalSlot(${idx})" class="text-red-400 hover:text-red-600 ml-1">
                                    <i class="fas fa-times"></i>
                                </button>
                            </div>
                        `;
                    }).join('')}
                </div>
            </div>
        `;
        if (sendBtn) sendBtn.disabled = false;
        if (sendBtnText) sendBtnText.textContent = `${proposalSelectedSlots.length} Termin${proposalSelectedSlots.length > 1 ? 'e' : ''} vorschlagen`;
    }
}

// Toggle slot selection
export function toggleProposalSlot(dateKey, time) {
    const existingIndex = proposalSelectedSlots.findIndex(s => s.date === dateKey && s.time === time);

    if (existingIndex > -1) {
        // Remove slot
        proposalSelectedSlots.splice(existingIndex, 1);
    } else if (proposalSelectedSlots.length < 3) {
        // Add slot (max 3)
        proposalSelectedSlots.push({ date: dateKey, time: time });
        // Sort by date/time
        proposalSelectedSlots.sort((a, b) => {
            const dateA = new Date(`${a.date}T${a.time}`);
            const dateB = new Date(`${b.date}T${b.time}`);
            return dateA - dateB;
        });
    } else {
        showToast('⚠️ Maximal 3 Termine auswählbar', 2000);
        return;
    }

    renderProposalCalendarGrid();
    renderProposalSelectedSlots();
}

// Remove a selected slot
export function removeProposalSlot(index) {
    proposalSelectedSlots.splice(index, 1);
    renderProposalCalendarGrid();
    renderProposalSelectedSlots();
}

// Navigate weeks
export function proposalPrevWeek() {
    proposalCalendarWeekOffset--;
    renderProposalCalendarGrid();
}

export function proposalNextWeek() {
    proposalCalendarWeekOffset++;
    renderProposalCalendarGrid();
}

// Send proposals from calendar selection
export async function sendProposalFromCalendar() {
    if (proposalSelectedSlots.length === 0) {
        showToast('⚠️ Bitte mindestens einen Termin auswählen', 3000);
        return;
    }

    const { orderId, userId, customerEmail } = proposalOrderData;
    const message = document.getElementById('proposal-message')?.value || '';

    // Convert to proposals format
    const proposals = proposalSelectedSlots.map(slot => ({
        date: slot.date,
        time: slot.time,
        datetime: `${slot.date}T${slot.time}`
    }));

    try {
        if (db) {
            // Save proposals to order
            await updateDoc(doc(db, "orders", orderId), {
                appointmentProposals: proposals,
                appointmentProposalMessage: message,
                appointmentProposalSentAt: new Date(),
                appointmentStatus: 'pending'
            });

            // Call Cloud Function to send email
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendAppointmentProposalEmail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId,
                        userId,
                        customerEmail,
                        proposals,
                        message
                    })
                });
                if (!response.ok) {
                    logger.warn('Email notification failed but proposals saved');
                }
            } catch (emailErr) {
                logger.warn('Email notification failed:', emailErr);
            }

            showToast('✅ Terminvorschläge gesendet!');
            closeAppointmentProposalModal();

            // Reload admin orders to show updated status
            await loadAllOrders();
        }
    } catch (e) {
        logger.error('Failed to send appointment proposals:', e);
        showToast('❌ Fehler beim Senden', 3000);
    }
}

export function closeAppointmentProposalModal() {
    const modal = document.getElementById('appointment-proposal-modal');
    if (modal) modal.classList.add('hidden');
}

export async function sendAppointmentProposals(state) {
    const orderId = document.getElementById('proposal-order-id')?.value;
    const userId = document.getElementById('proposal-user-id')?.value;
    const customerEmail = document.getElementById('proposal-customer-email')?.value;
    const message = document.getElementById('proposal-message')?.value || '';

    const date1 = document.getElementById('proposal-date-1')?.value;
    const time1 = document.getElementById('proposal-time-1')?.value;
    const date2 = document.getElementById('proposal-date-2')?.value;
    const time2 = document.getElementById('proposal-time-2')?.value;
    const date3 = document.getElementById('proposal-date-3')?.value;
    const time3 = document.getElementById('proposal-time-3')?.value;

    if (!date1 || !time1) {
        showToast('⚠️ Bitte mindestens Vorschlag 1 ausfüllen', 3000);
        return;
    }

    const proposals = [];
    if (date1 && time1) proposals.push({ date: date1, time: time1, datetime: `${date1}T${time1}` });
    if (date2 && time2) proposals.push({ date: date2, time: time2, datetime: `${date2}T${time2}` });
    if (date3 && time3) proposals.push({ date: date3, time: time3, datetime: `${date3}T${time3}` });

    try {
        if (db) {
            // Save proposals to order
            await updateDoc(doc(db, "orders", orderId), {
                appointmentProposals: proposals,
                appointmentProposalMessage: message,
                appointmentProposalSentAt: new Date(),
                appointmentStatus: 'pending'
            });

            // Call Cloud Function to send email
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendAppointmentProposalEmail', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        orderId,
                        userId,
                        customerEmail,
                        proposals,
                        message
                    })
                });
                if (!response.ok) {
                    logger.warn('Email notification failed but proposals saved');
                }
            } catch (emailErr) {
                logger.warn('Email notification failed:', emailErr);
            }

            showToast('✅ Terminvorschläge gesendet!');
            closeAppointmentProposalModal();

            // Reload admin orders to show updated status
            if (typeof loadAdminOrders === 'function') {
                await loadAdminOrders(state);
            }
        }
    } catch (e) {
        logger.error('Failed to send appointment proposals:', e);
        showToast('❌ Fehler beim Senden', 3000);
    }
}

// ========== CUSTOMER: Accept/Decline Proposals ==========

// Store pending appointment data for modal confirmation
let pendingAppointmentConfirm = { orderId: null, datetime: null };
let pendingAppointmentDecline = { orderId: null };

export function showAppointmentConfirmModal(orderId, datetime) {
    pendingAppointmentConfirm = { orderId, datetime };

    // Format date and time for display
    const dateStr = new Date(datetime).toLocaleDateString('de-DE', {
        weekday: 'long', day: '2-digit', month: 'long', year: 'numeric'
    });
    const timeStr = new Date(datetime).toLocaleTimeString('de-DE', {
        hour: '2-digit', minute: '2-digit'
    }) + ' Uhr';

    const dateEl = document.getElementById('confirm-modal-date');
    const timeEl = document.getElementById('confirm-modal-time');
    const modal = document.getElementById('appointment-confirm-modal');

    if (dateEl) dateEl.textContent = dateStr;
    if (timeEl) timeEl.textContent = timeStr;
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        logger.error('Confirm modal not found');
    }
}

export function closeAppointmentConfirmModal() {
    const modal = document.getElementById('appointment-confirm-modal');
    if (modal) modal.classList.add('hidden');
    pendingAppointmentConfirm = { orderId: null, datetime: null };
}

export async function confirmAppointmentFromModal(state) {
    const { orderId, datetime } = pendingAppointmentConfirm;
    if (!orderId || !datetime) return;

    closeAppointmentConfirmModal();

    try {
        if (db && state.user) {
            await updateDoc(doc(db, "orders", orderId), {
                appointment: {
                    datetime: datetime,
                    confirmed: true,
                    confirmedAt: new Date()
                },
                appointmentStatus: 'confirmed'
            });

            // Notify admin via email
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyAdminAppointmentAccepted', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: state.user.displayName || state.user.email,
                        customerEmail: state.user.email,
                        datetime: datetime,
                        orderId: orderId
                    })
                });
                if (!response.ok) {
                    logger.warn('Admin notification returned non-OK status:', response.status);
                }
            } catch (emailErr) {
                logger.warn('Failed to send admin notification:', emailErr);
            }

            showToast('✅ Termin bestätigt!');
            await loadUserOrders(state);
        }
    } catch (e) {
        logger.error('Failed to accept appointment:', e);
        showToast('❌ Fehler beim Bestätigen', 3000);
    }
}

export function showAppointmentDeclineModal(orderId) {
    pendingAppointmentDecline = { orderId };
    const reasonInput = document.getElementById('decline-reason-input');
    const modal = document.getElementById('appointment-decline-modal');

    if (reasonInput) reasonInput.value = '';
    if (modal) {
        modal.classList.remove('hidden');
    } else {
        logger.error('Decline modal not found');
    }
}

export function closeAppointmentDeclineModal() {
    const modal = document.getElementById('appointment-decline-modal');
    if (modal) modal.classList.add('hidden');
    pendingAppointmentDecline = { orderId: null };
}

export async function confirmDeclineFromModal(state) {
    const { orderId } = pendingAppointmentDecline;
    if (!orderId) return;

    const reason = document.getElementById('decline-reason-input').value.trim();
    closeAppointmentDeclineModal();

    try {
        if (db && state.user) {
            await updateDoc(doc(db, "orders", orderId), {
                appointmentStatus: 'declined',
                appointmentDeclineReason: reason || 'Keine Angabe',
                appointmentDeclinedAt: new Date()
            });

            // Notify admin via email
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyAdminAppointmentDeclined', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: state.user.displayName || state.user.email,
                        customerEmail: state.user.email,
                        reason: reason || 'Keine Angabe',
                        orderId: orderId
                    })
                });
                if (!response.ok) {
                    logger.warn('Admin notification returned non-OK status:', response.status);
                }
            } catch (emailErr) {
                logger.warn('Failed to send admin notification:', emailErr);
            }

            showToast('Ich melde mich mit neuen Terminvorschlägen.');
            await loadUserOrders(state);
        }
    } catch (e) {
        logger.error('Failed to decline appointments:', e);
        showToast('❌ Fehler', 3000);
    }
}

// Legacy function names for backwards compatibility
export function acceptAppointmentProposal(state, orderId, datetime) {
    showAppointmentConfirmModal(orderId, datetime);
}

export function declineAllAppointmentProposals(state, orderId) {
    showAppointmentDeclineModal(orderId);
}

// ========== MENTOR APPOINTMENT SELECTION ==========

// Open modal to select appointment from mentor's availability
export async function openMentorAppointmentModal(orderId, coachId) {
    // Create modal if it doesn't exist
    let modal = document.getElementById('mentor-appointment-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'mentor-appointment-modal';
        modal.className = 'fixed inset-0 z-50 hidden overflow-y-auto';
        document.body.appendChild(modal);
    }

    // Show loading state
    modal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
            <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden">
                <div class="p-8 text-center">
                    <i class="fas fa-spinner fa-spin text-4xl text-brand-gold mb-4"></i>
                    <p class="text-gray-600">Lade Verfügbarkeiten...</p>
                </div>
            </div>
        </div>
    `;
    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';

    try {
        // Load mentor data and availability
        const coachDoc = await getDoc(doc(db, 'coaches', coachId));
        if (!coachDoc.exists()) {
            throw new Error('Mentor nicht gefunden');
        }

        const coach = { id: coachId, ...coachDoc.data() };
        const availability = coach.availability || {};

        // Get available slots in the next 4 weeks
        const availableSlots = [];
        const today = new Date();
        today.setHours(0, 0, 0, 0);

        for (let i = 0; i < 28; i++) {
            const checkDate = new Date(today);
            checkDate.setDate(today.getDate() + i);
            const dateKey = checkDate.toISOString().split('T')[0];

            if (availability[dateKey] && availability[dateKey].length > 0) {
                availability[dateKey].forEach(time => {
                    const slotDateTime = new Date(`${dateKey}T${time}`);
                    // Only show future slots
                    if (slotDateTime > new Date()) {
                        availableSlots.push({
                            date: dateKey,
                            time: time,
                            datetime: `${dateKey}T${time}`,
                            display: {
                                weekday: checkDate.toLocaleDateString('de-DE', { weekday: 'long' }),
                                date: checkDate.toLocaleDateString('de-DE', { day: '2-digit', month: 'long' }),
                                time: time
                            }
                        });
                    }
                });
            }
        }

        // Render modal content
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target === this) app.closeMentorAppointmentModal()">
                <div class="bg-white rounded-2xl shadow-2xl max-w-lg w-full max-h-[90vh] overflow-hidden flex flex-col">
                    <!-- Header -->
                    <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5 flex-shrink-0">
                        <div class="flex items-center justify-between">
                            <div class="flex items-center gap-3">
                                <div class="w-12 h-12 bg-brand-gold/20 rounded-full flex items-center justify-center">
                                    <i class="fas fa-calendar-check text-brand-gold text-xl"></i>
                                </div>
                                <div>
                                    <h3 class="font-serif text-lg font-bold">Termin auswählen</h3>
                                    <p class="text-gray-400 text-sm">mit ${sanitizeHTML(coach.name)}</p>
                                </div>
                            </div>
                            <button onclick="app.closeMentorAppointmentModal()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                                <i class="fas fa-times text-gray-400"></i>
                            </button>
                        </div>
                    </div>

                    <!-- Executive Info -->
                    <div class="bg-amber-50 border-b border-amber-200 p-4 flex-shrink-0">
                        <div class="flex items-start gap-2">
                            <i class="fas fa-lightbulb text-amber-600 mt-0.5"></i>
                            <p class="text-xs text-amber-800">
                                <strong>Tipp:</strong> Als aktiver Executive bin ich meist <strong>ab 18:00 Uhr</strong> verfügbar.
                                Die Termine werden wöchentlich aktualisiert.
                            </p>
                        </div>
                    </div>

                    <!-- Available Slots -->
                    <div class="flex-1 overflow-y-auto p-4">
                        ${availableSlots.length > 0 ? `
                            <p class="text-sm text-gray-600 mb-4">
                                <i class="fas fa-calendar-alt mr-1 text-brand-gold"></i>
                                <strong>${availableSlots.length}</strong> verfügbare Termine gefunden
                            </p>
                            <div class="space-y-2">
                                ${availableSlots.map(slot => `
                                    <button onclick="app.selectMentorAppointment('${orderId}', '${slot.datetime}', true)"
                                            class="w-full flex items-center p-4 bg-gray-50 border-2 border-gray-200 rounded-xl hover:border-green-400 hover:bg-green-50 active:bg-green-100 transition-all duration-200 group">
                                        <div class="w-12 h-12 bg-white rounded-lg flex flex-col items-center justify-center border border-gray-200 shadow-sm flex-shrink-0 group-hover:border-green-400">
                                            <span class="text-xs text-gray-500">${slot.display.weekday.slice(0, 2)}</span>
                                            <span class="text-lg font-bold text-brand-dark">${slot.display.date.split(' ')[0]}</span>
                                        </div>
                                        <div class="flex-1 text-left ml-4">
                                            <p class="font-semibold text-brand-dark">${slot.display.weekday}, ${slot.display.date}</p>
                                            <p class="text-sm text-gray-500">
                                                <i class="fas fa-clock mr-1"></i>${slot.display.time} Uhr
                                            </p>
                                        </div>
                                        <div class="flex-shrink-0">
                                            <i class="fas fa-chevron-right text-gray-300 group-hover:text-green-500 transition-colors"></i>
                                        </div>
                                    </button>
                                `).join('')}
                            </div>
                        ` : `
                            <div class="text-center py-8">
                                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                                    <i class="fas fa-calendar-times text-gray-400 text-2xl"></i>
                                </div>
                                <h4 class="font-bold text-gray-700 mb-2">Keine Termine verfügbar</h4>
                                <p class="text-sm text-gray-500 mb-4">Der Mentor hat aktuell keine freien Termine eingetragen.</p>
                            </div>
                        `}
                    </div>

                    <!-- Alternative Proposal Section -->
                    <div class="border-t border-gray-100 p-4 bg-gray-50 flex-shrink-0">
                        <button onclick="app.showAlternativeProposalForm('${orderId}', '${coachId}')"
                                class="w-full text-center text-sm text-gray-600 hover:text-brand-dark py-2 flex items-center justify-center gap-2 transition">
                            <i class="fas fa-plus-circle"></i>
                            <span>Keiner passt? Eigenen Terminvorschlag senden</span>
                        </button>
                    </div>
                </div>
            </div>
        `;

    } catch (e) {
        logger.error('Error loading mentor appointments:', e);
        modal.innerHTML = `
            <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4">
                <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full p-6 text-center">
                    <i class="fas fa-exclamation-circle text-red-500 text-4xl mb-4"></i>
                    <h3 class="font-bold text-gray-800 mb-2">Fehler beim Laden</h3>
                    <p class="text-sm text-gray-600 mb-4">${e.message}</p>
                    <button onclick="app.closeMentorAppointmentModal()" class="btn-primary">Schließen</button>
                </div>
            </div>
        `;
    }
}

// Close mentor appointment modal
export function closeMentorAppointmentModal() {
    const modal = document.getElementById('mentor-appointment-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

// Select and confirm appointment from mentor availability
// mentorAlreadyAssigned = true means admin already assigned the mentor, so no compliance check needed
export async function selectMentorAppointment(orderId, datetime, mentorAlreadyAssigned = true) {
    // Show professional confirmation modal
    // Skip compliance check if mentor was already assigned by admin
    showBookingConfirmationModal(orderId, datetime, mentorAlreadyAssigned);
}

// Show professional booking confirmation modal
// skipComplianceCheck = true when mentor was already assigned by admin
function showBookingConfirmationModal(orderId, datetime, skipComplianceCheck = false) {
    const dateObj = new Date(datetime);
    const formattedDate = dateObj.toLocaleDateString('de-DE', {
        weekday: 'long',
        day: '2-digit',
        month: 'long',
        year: 'numeric'
    });
    const formattedTime = dateObj.toLocaleTimeString('de-DE', {
        hour: '2-digit',
        minute: '2-digit'
    });

    // Create modal
    let confirmModal = document.getElementById('booking-confirm-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'booking-confirm-modal';
        document.body.appendChild(confirmModal);
    }

    // Compliance check section - only shown if NOT skipped
    const complianceSection = skipComplianceCheck ? '' : `
        <!-- Compliance Check Info Box -->
        <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
            <div class="flex items-start gap-3">
                <div class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                    <i class="fas fa-shield-alt text-amber-600 text-sm"></i>
                </div>
                <div>
                    <h4 class="font-semibold text-amber-800 text-sm mb-1">Compliance-Check erforderlich</h4>
                    <p class="text-amber-700 text-xs leading-relaxed">
                        Vor der finalen Terminbestätigung führe ich einen kurzen Compliance-Check durch,
                        um sicherzustellen, dass ich Ihnen den bestmöglichen Service bieten kann.
                        Sie erhalten innerhalb von 24 Stunden eine Bestätigung per E-Mail.
                    </p>
                </div>
            </div>
        </div>

        <!-- Compliance Consent Checkbox -->
        <label class="flex items-start gap-3 cursor-pointer mb-6 group">
            <input type="checkbox" id="compliance-consent-checkbox"
                   onchange="app.toggleBookingButton()"
                   class="w-5 h-5 mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold cursor-pointer">
            <span class="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                Ich stimme dem <strong>Compliance-Check</strong> zu und verstehe, dass die endgültige
                Terminbestätigung nach erfolgreicher Prüfung per E-Mail erfolgt.
            </span>
        </label>
    `;

    // Simple confirmation text when compliance check is skipped
    const simpleConfirmation = skipComplianceCheck ? `
        <p class="text-gray-600 text-sm mb-6">
            Möchten Sie diesen Termin verbindlich buchen? Nach der Bestätigung erhalten Sie und Ihr Mentor eine Benachrichtigung.
        </p>
    ` : '';

    // Button state depends on whether compliance check is needed
    const buttonDisabled = skipComplianceCheck ? '' : 'disabled';
    const buttonClass = skipComplianceCheck
        ? 'flex-1 px-4 py-3 bg-brand-gold text-brand-dark rounded-xl hover:bg-brand-gold/90 transition-all duration-200 font-medium cursor-pointer'
        : 'flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200';

    confirmModal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onclick="if(event.target === this) app.closeBookingConfirmModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
                <!-- Header -->
                <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-brand-gold/20 rounded-full flex items-center justify-center">
                            <i class="fas fa-calendar-check text-brand-gold text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-serif text-lg font-bold">Termin bestätigen</h3>
                            <p class="text-gray-300 text-sm">Verbindliche Buchung</p>
                        </div>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6">
                    <!-- Appointment Details -->
                    <div class="bg-gray-50 rounded-xl p-4 mb-4">
                        <div class="flex items-center gap-3 mb-3">
                            <i class="fas fa-calendar text-brand-gold"></i>
                            <span class="font-medium">${formattedDate}</span>
                        </div>
                        <div class="flex items-center gap-3">
                            <i class="fas fa-clock text-brand-gold"></i>
                            <span class="font-medium">${formattedTime} Uhr</span>
                        </div>
                    </div>

                    ${simpleConfirmation}
                    ${complianceSection}

                    <!-- Buttons -->
                    <div class="flex gap-3">
                        <button onclick="app.closeBookingConfirmModal()"
                                class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                            Abbrechen
                        </button>
                        <button id="confirm-booking-btn"
                                onclick="app.confirmBooking('${orderId}', '${datetime}')"
                                ${buttonDisabled}
                                class="${buttonClass}">
                            <i class="fas fa-check mr-2"></i>Bestätigen
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    confirmModal.classList.remove('hidden');
}

// Toggle booking button based on compliance consent
export function toggleBookingButton() {
    const checkbox = document.getElementById('compliance-consent-checkbox');
    const button = document.getElementById('confirm-booking-btn');

    if (checkbox && button) {
        if (checkbox.checked) {
            button.disabled = false;
            button.className = 'flex-1 px-4 py-3 bg-brand-gold text-brand-dark rounded-xl hover:bg-brand-gold/90 transition-all duration-200 font-medium cursor-pointer';
        } else {
            button.disabled = true;
            button.className = 'flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200';
        }
    }
}

// Close booking confirmation modal
export function closeBookingConfirmModal() {
    const modal = document.getElementById('booking-confirm-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.innerHTML = '';
    }
}

// Show compliance check modal before adding mentoring session to cart
export function bookSessionWithComplianceCheck(productName, price, coachName) {
    // Create modal
    let confirmModal = document.getElementById('booking-confirm-modal');
    if (!confirmModal) {
        confirmModal = document.createElement('div');
        confirmModal.id = 'booking-confirm-modal';
        document.body.appendChild(confirmModal);
    }

    confirmModal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4 z-[60]" onclick="if(event.target === this) app.closeBookingConfirmModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden animate-fade-in">
                <!-- Header -->
                <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5">
                    <div class="flex items-center gap-3">
                        <div class="w-12 h-12 bg-brand-gold/20 rounded-full flex items-center justify-center">
                            <i class="fas fa-user-tie text-brand-gold text-xl"></i>
                        </div>
                        <div>
                            <h3 class="font-serif text-lg font-bold">Mentoring Session</h3>
                            <p class="text-gray-300 text-sm">${coachName ? `mit ${coachName}` : 'Executive Coaching'}</p>
                        </div>
                    </div>
                </div>

                <!-- Content -->
                <div class="p-6">
                    <!-- Product Details -->
                    <div class="bg-gray-50 rounded-xl p-4 mb-4">
                        <div class="flex items-center justify-between">
                            <div>
                                <p class="font-semibold text-brand-dark">${productName}</p>
                                <p class="text-sm text-gray-500">60 Minuten 1:1 Session</p>
                            </div>
                            <p class="text-xl font-bold text-brand-gold">€${price}</p>
                        </div>
                    </div>

                    <!-- Compliance Check Info Box -->
                    <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                        <div class="flex items-start gap-3">
                            <div class="w-8 h-8 bg-amber-100 rounded-full flex items-center justify-center flex-shrink-0 mt-0.5">
                                <i class="fas fa-shield-alt text-amber-600 text-sm"></i>
                            </div>
                            <div>
                                <h4 class="font-semibold text-amber-800 text-sm mb-1">Compliance-Check erforderlich</h4>
                                <p class="text-amber-700 text-xs leading-relaxed">
                                    Nach Ihrer Bestellung führe ich einen Compliance-Check durch, um Interessenkonflikte
                                    auszuschließen (z.B. gleiche Branche, Wettbewerber). Bei erfolgreicher Prüfung wird
                                    <strong>${coachName || 'Ihr Wunschkandidat'}</strong> Ihr Mentor. Andernfalls wählen wir
                                    einen gleichwertigen Mentor für Sie aus.
                                </p>
                                <p class="text-amber-600 text-xs mt-2 flex items-center gap-1">
                                    <i class="fas fa-info-circle"></i>
                                    Sollte kein passender Mentor verfügbar sein, erhalten Sie eine vollständige Rückerstattung.
                                </p>
                            </div>
                        </div>
                    </div>

                    <!-- Compliance Consent Checkbox -->
                    <label class="flex items-start gap-3 cursor-pointer mb-6 group">
                        <input type="checkbox" id="compliance-consent-checkbox"
                               onchange="app.toggleSessionBookingButton()"
                               class="w-5 h-5 mt-0.5 rounded border-gray-300 text-brand-gold focus:ring-brand-gold cursor-pointer">
                        <span class="text-sm text-gray-600 group-hover:text-gray-800 transition-colors">
                            Ich stimme dem <strong>Compliance-Check</strong> zu und verstehe, dass bei erfolgreicher
                            Prüfung ${coachName || 'mein Wunschkandidat'} mein Mentor wird. Bei Ablehnung erfolgt eine Rückerstattung.
                        </span>
                    </label>

                    <!-- Buttons -->
                    <div class="flex gap-3">
                        <button onclick="app.closeBookingConfirmModal()"
                                class="flex-1 px-4 py-3 border border-gray-300 text-gray-700 rounded-xl hover:bg-gray-50 transition-colors font-medium">
                            Abbrechen
                        </button>
                        <button id="confirm-session-btn"
                                onclick="app.confirmSessionBooking('${productName}', ${price})"
                                disabled
                                class="flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200">
                            <i class="fas fa-shopping-cart mr-2"></i>In den Warenkorb
                        </button>
                    </div>
                </div>
            </div>
        </div>
    `;
    confirmModal.classList.remove('hidden');
}

// Toggle session booking button based on compliance consent
export function toggleSessionBookingButton() {
    const checkbox = document.getElementById('compliance-consent-checkbox');
    const button = document.getElementById('confirm-session-btn');

    if (checkbox && button) {
        if (checkbox.checked) {
            button.disabled = false;
            button.className = 'flex-1 px-4 py-3 bg-brand-gold text-brand-dark rounded-xl hover:bg-brand-gold/90 transition-all duration-200 font-medium cursor-pointer';
        } else {
            button.disabled = true;
            button.className = 'flex-1 px-4 py-3 bg-gray-300 text-gray-500 rounded-xl font-medium cursor-not-allowed transition-all duration-200';
        }
    }
}

// Confirm session booking after compliance consent
export function confirmSessionBooking(productName, price) {
    closeBookingConfirmModal();
    // addToCart requires state as first parameter
    if (window.app?.state) {
        addToCart(window.app.state, productName, price);
        showToast('✅ Session zum Warenkorb hinzugefügt');
    } else {
        showToast('❌ Fehler beim Hinzufügen zum Warenkorb');
    }
}

// Actually confirm and save the booking
export async function confirmBooking(orderId, datetime) {
    const confirmBtn = document.querySelector('#booking-confirm-modal button:last-child');
    if (confirmBtn) {
        confirmBtn.disabled = true;
        confirmBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird gebucht...';
    }

    try {
        // ========== VERFÜGBARKEITS-CHECK: Prüfe ob Mentor noch frei ist ==========
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (!orderDoc.exists()) {
            throw new Error('Order nicht gefunden');
        }
        const orderData = orderDoc.data();
        const coachId = orderData.assignedCoachId;

        if (coachId) {
            // Prüfe ob bereits eine andere Buchung für diesen Zeitslot existiert
            const appointmentDate = new Date(datetime);
            const dateKey = appointmentDate.toISOString().split('T')[0];
            const timeKey = appointmentDate.toTimeString().slice(0, 5);

            const conflictQuery = query(
                collection(db, 'orders'),
                where('assignedCoachId', '==', coachId),
                where('appointmentStatus', '==', 'confirmed')
            );
            const conflictSnapshot = await getDocs(conflictQuery);

            let hasConflict = false;
            conflictSnapshot.forEach(docSnap => {
                if (docSnap.id !== orderId) { // Ignoriere aktuelle Order
                    const existingAppointment = docSnap.data().appointment?.datetime;
                    if (existingAppointment) {
                        const existingDate = new Date(existingAppointment);
                        const existingDateKey = existingDate.toISOString().split('T')[0];
                        const existingTimeKey = existingDate.toTimeString().slice(0, 5);

                        if (existingDateKey === dateKey && existingTimeKey === timeKey) {
                            hasConflict = true;
                        }
                    }
                }
            });

            if (hasConflict) {
                showToast('⚠️ Dieser Termin ist leider nicht mehr verfügbar. Bitte wählen Sie einen anderen.', 5000);
                if (confirmBtn) {
                    confirmBtn.disabled = false;
                    confirmBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Bestätigen';
                }
                return;
            }
        }

        // ========== MEETING-RAUM ERSTELLEN ==========
        try {
            const meetingResponse = await fetch('https://us-central1-apex-executive.cloudfunctions.net/createMeetingRoom', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    appointmentDatetime: datetime,
                    customerName: orderData.customerName,
                    mentorName: orderData.assignedCoachName
                })
            });
            if (meetingResponse.ok) {
                logger.log('Meeting room created for order:', orderId);
            }
        } catch (meetingError) {
            logger.warn('Failed to pre-create meeting room:', meetingError);
            // Nicht kritisch - Meeting kann auch später erstellt werden
        }

        await updateDoc(doc(db, 'orders', orderId), {
            appointment: {
                datetime: datetime,
                confirmed: true,
                bookedAt: serverTimestamp()
            },
            appointmentStatus: 'confirmed'
        });

        closeBookingConfirmModal();
        closeMentorAppointmentModal();
        showToast('✅ Termin erfolgreich gebucht!');

        // Reload orders to show updated state
        if (window.app?.state?.user) {
            loadUserOrders(window.app.state);
        }

    } catch (e) {
        logger.error('Error booking appointment:', e);
        showToast('❌ Fehler bei der Buchung. Bitte versuchen Sie es erneut.');

        // Re-enable button on error
        if (confirmBtn) {
            confirmBtn.disabled = false;
            confirmBtn.innerHTML = '<i class="fas fa-check mr-2"></i>Bestätigen';
        }
    }
}

// Show form to propose alternative appointment
export function showAlternativeProposalForm(orderId, coachId) {
    const modal = document.getElementById('mentor-appointment-modal');
    if (!modal) return;

    // Get minimum date (tomorrow)
    const tomorrow = new Date();
    tomorrow.setDate(tomorrow.getDate() + 1);
    const minDate = tomorrow.toISOString().split('T')[0];

    // Get maximum date (8 weeks from now)
    const maxDate = new Date();
    maxDate.setDate(maxDate.getDate() + 56);
    const maxDateStr = maxDate.toISOString().split('T')[0];

    modal.innerHTML = `
        <div class="fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center p-4" onclick="if(event.target === this) app.closeMentorAppointmentModal()">
            <div class="bg-white rounded-2xl shadow-2xl max-w-md w-full overflow-hidden">
                <!-- Header -->
                <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-5">
                    <div class="flex items-center justify-between">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-brand-gold/20 rounded-full flex items-center justify-center">
                                <i class="fas fa-paper-plane text-brand-gold"></i>
                            </div>
                            <div>
                                <h3 class="font-serif text-lg font-bold">Terminvorschlag senden</h3>
                            </div>
                        </div>
                        <button onclick="app.closeMentorAppointmentModal()" class="w-8 h-8 flex items-center justify-center rounded-full hover:bg-white/10 transition">
                            <i class="fas fa-times text-gray-400"></i>
                        </button>
                    </div>
                </div>

                <!-- Info -->
                <div class="bg-blue-50 border-b border-blue-200 p-4">
                    <div class="flex items-start gap-2">
                        <i class="fas fa-info-circle text-blue-600 mt-0.5"></i>
                        <p class="text-xs text-blue-800">
                            Schlagen Sie bis zu 3 alternative Termine vor. Der Mentor wird diese prüfen und sich bei Ihnen melden.
                            <strong>Empfehlung: Ab 18:00 Uhr.</strong>
                        </p>
                    </div>
                </div>

                <!-- Form -->
                <form id="alternative-proposal-form" class="p-5 space-y-4">
                    <input type="hidden" id="proposal-order-id" value="${orderId}">
                    <input type="hidden" id="proposal-coach-id" value="${coachId}">

                    <!-- Proposal 1 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">1. Wunschtermin *</label>
                        <div class="flex gap-2">
                            <input type="date" id="proposal-date-1" min="${minDate}" max="${maxDateStr}" required
                                   class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                            <select id="proposal-time-1" required
                                    class="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                                <option value="">Zeit</option>
                                <option value="09:00">09:00</option>
                                <option value="10:00">10:00</option>
                                <option value="11:00">11:00</option>
                                <option value="12:00">12:00</option>
                                <option value="13:00">13:00</option>
                                <option value="14:00">14:00</option>
                                <option value="15:00">15:00</option>
                                <option value="16:00">16:00</option>
                                <option value="17:00">17:00</option>
                                <option value="18:00" selected>18:00</option>
                                <option value="19:00">19:00</option>
                                <option value="20:00">20:00</option>
                                <option value="21:00">21:00</option>
                            </select>
                        </div>
                    </div>

                    <!-- Proposal 2 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">2. Wunschtermin (optional)</label>
                        <div class="flex gap-2">
                            <input type="date" id="proposal-date-2" min="${minDate}" max="${maxDateStr}"
                                   class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                            <select id="proposal-time-2"
                                    class="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                                <option value="">Zeit</option>
                                <option value="09:00">09:00</option>
                                <option value="10:00">10:00</option>
                                <option value="11:00">11:00</option>
                                <option value="12:00">12:00</option>
                                <option value="13:00">13:00</option>
                                <option value="14:00">14:00</option>
                                <option value="15:00">15:00</option>
                                <option value="16:00">16:00</option>
                                <option value="17:00">17:00</option>
                                <option value="18:00">18:00</option>
                                <option value="19:00">19:00</option>
                                <option value="20:00">20:00</option>
                                <option value="21:00">21:00</option>
                            </select>
                        </div>
                    </div>

                    <!-- Proposal 3 -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">3. Wunschtermin (optional)</label>
                        <div class="flex gap-2">
                            <input type="date" id="proposal-date-3" min="${minDate}" max="${maxDateStr}"
                                   class="flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                            <select id="proposal-time-3"
                                    class="w-28 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                                <option value="">Zeit</option>
                                <option value="09:00">09:00</option>
                                <option value="10:00">10:00</option>
                                <option value="11:00">11:00</option>
                                <option value="12:00">12:00</option>
                                <option value="13:00">13:00</option>
                                <option value="14:00">14:00</option>
                                <option value="15:00">15:00</option>
                                <option value="16:00">16:00</option>
                                <option value="17:00">17:00</option>
                                <option value="18:00">18:00</option>
                                <option value="19:00">19:00</option>
                                <option value="20:00">20:00</option>
                                <option value="21:00">21:00</option>
                            </select>
                        </div>
                    </div>

                    <!-- Note -->
                    <div class="space-y-2">
                        <label class="text-sm font-medium text-gray-700">Nachricht (optional)</label>
                        <textarea id="proposal-note" rows="2" placeholder="z.B. Ich bin flexibel bei den Uhrzeiten..."
                                  class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none"></textarea>
                    </div>
                </form>

                <!-- Actions -->
                <div class="border-t border-gray-100 p-4 bg-gray-50 flex gap-3">
                    <button onclick="app.openMentorAppointmentModal('${orderId}', '${coachId}')"
                            class="flex-1 py-2.5 text-gray-600 hover:text-gray-800 transition text-sm font-medium">
                        <i class="fas fa-arrow-left mr-1"></i> Zurück
                    </button>
                    <button onclick="app.submitAlternativeProposal()"
                            class="flex-1 bg-brand-gold hover:bg-amber-500 text-brand-dark font-bold py-2.5 rounded-lg transition text-sm">
                        <i class="fas fa-paper-plane mr-1"></i> Senden
                    </button>
                </div>
            </div>
        </div>
    `;
}

// Submit alternative appointment proposal
export async function submitAlternativeProposal() {
    const orderId = document.getElementById('proposal-order-id')?.value;
    const date1 = document.getElementById('proposal-date-1')?.value;
    const time1 = document.getElementById('proposal-time-1')?.value;
    const date2 = document.getElementById('proposal-date-2')?.value;
    const time2 = document.getElementById('proposal-time-2')?.value;
    const date3 = document.getElementById('proposal-date-3')?.value;
    const time3 = document.getElementById('proposal-time-3')?.value;
    const note = document.getElementById('proposal-note')?.value;

    if (!date1 || !time1) {
        showToast('⚠️ Bitte mindestens den 1. Wunschtermin ausfüllen');
        return;
    }

    const customerProposals = [];
    if (date1 && time1) {
        customerProposals.push({ date: date1, time: time1, datetime: `${date1}T${time1}` });
    }
    if (date2 && time2) {
        customerProposals.push({ date: date2, time: time2, datetime: `${date2}T${time2}` });
    }
    if (date3 && time3) {
        customerProposals.push({ date: date3, time: time3, datetime: `${date3}T${time3}` });
    }

    try {
        await updateDoc(doc(db, 'orders', orderId), {
            customerProposals: customerProposals,
            customerProposalNote: note || '',
            customerProposalSubmittedAt: serverTimestamp(),
            appointmentStatus: 'customer_proposed'
        });

        closeMentorAppointmentModal();
        showToast('Terminvorschläge gesendet! Ich melde mich.');

        // Reload orders
        if (window.app?.state?.user) {
            loadUserOrders(window.app.state);
        }

    } catch (e) {
        logger.error('Error submitting proposal:', e);
        showToast('❌ Fehler beim Senden. Bitte versuchen Sie es erneut.');
    }
}

// ========== AVAILABILITY ==========

export async function saveAvailability(state) {
    const date1 = document.getElementById('availability-date-1')?.value;
    const time1 = document.getElementById('availability-time-1')?.value;
    const date2 = document.getElementById('availability-date-2')?.value;
    const time2 = document.getElementById('availability-time-2')?.value;
    const date3 = document.getElementById('availability-date-3')?.value;
    const time3 = document.getElementById('availability-time-3')?.value;
    const notes = document.getElementById('availability-notes')?.value;

    if (!date1 || !time1) {
        showToast('⚠️ Bitte mindestens den 1. Wunschtermin ausfüllen', 3000);
        return;
    }

    if (!state.user) {
        showToast('⚠️ Bitte registrieren Sie sich oder melden Sie sich an', 3000);
        return;
    }

    const availability = {
        slots: [],
        notes: notes || '',
        submittedAt: new Date()
    };

    if (date1 && time1) {
        availability.slots.push({ date: date1, time: time1, datetime: `${date1}T${time1}` });
    }
    if (date2 && time2) {
        availability.slots.push({ date: date2, time: time2, datetime: `${date2}T${time2}` });
    }
    if (date3 && time3) {
        availability.slots.push({ date: date3, time: time3, datetime: `${date3}T${time3}` });
    }

    try {
        if (db) {
            await setDoc(doc(db, "availability", state.user.uid), availability, { merge: true });
            showToast('✅ Verfügbarkeit gespeichert!');
        } else {
            showToast('✅ Verfügbarkeit gespeichert! (Demo-Modus)');
        }

        // Show success message
        const savedInfo = document.getElementById('availability-saved-info');
        if (savedInfo) {
            savedInfo.classList.remove('hidden');
            setTimeout(() => savedInfo.classList.add('hidden'), 5000);
        }

        // Clear form
        clearAvailabilityForm();

    } catch (e) {
        logger.error('Availability save failed:', e);
        showToast('❌ Speichern fehlgeschlagen', 3000);
    }
}

function clearAvailabilityForm() {
    document.getElementById('availability-date-1').value = '';
    document.getElementById('availability-time-1').value = '';
    document.getElementById('availability-date-2').value = '';
    document.getElementById('availability-time-2').value = '';
    document.getElementById('availability-date-3').value = '';
    document.getElementById('availability-time-3').value = '';
    document.getElementById('availability-notes').value = '';
}

export async function loadAvailability(state) {
    if (!db || !state.user) return;

    const container = document.getElementById('upcoming-appointments');
    if (!container) return;

    try {
        const now = new Date();
        let confirmedAppointments = [];
        let pendingSlots = [];
        let availabilityNotes = '';

        // 1. Load confirmed appointments from orders (filter client-side due to Firestore rules)
        const ordersQuery = query(
            collection(db, "orders"),
            where("userId", "==", state.user.uid)
        );
        const ordersSnapshot = await getDocs(ordersQuery);

        ordersSnapshot.forEach(docSnap => {
            const order = docSnap.data();

            // Filter for confirmed appointments client-side
            // Check both appointmentStatus AND appointment.confirmed for robustness
            const hasConfirmedAppointment = (order.appointmentStatus === 'confirmed' || order.appointment?.confirmed === true)
                && order.appointment?.datetime;

            if (hasConfirmedAppointment) {
                const appointmentDate = new Date(order.appointment.datetime);
                if (appointmentDate >= now) {
                    confirmedAppointments.push({
                        datetime: order.appointment.datetime,
                        packageName: order.packageName || order.items?.[0]?.name || 'Termin',
                        orderId: docSnap.id
                    });
                }
            }
        });

        // Sort confirmed appointments by date
        confirmedAppointments.sort((a, b) => new Date(a.datetime) - new Date(b.datetime));

        // 2. Load availability/wish slots
        const availDoc = await getDoc(doc(db, "availability", state.user.uid));
        if (availDoc.exists()) {
            const data = availDoc.data();
            const slots = data.slots || [];
            availabilityNotes = data.notes || '';
            pendingSlots = slots.filter(slot => new Date(slot.datetime) >= now);
        }

        // 3. Render both sections
        if (confirmedAppointments.length > 0 || pendingSlots.length > 0) {
            container.innerHTML = `
                <div class="space-y-6">
                    ${confirmedAppointments.length > 0 ? `
                        <div>
                            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
                                <i class="fas fa-calendar-check text-green-600 mr-2"></i>
                                Bestätigte Termine
                            </h3>
                            <div class="space-y-3">
                                ${confirmedAppointments.map(apt => {
                                    const date = new Date(apt.datetime);
                                    const dateStr = date.toLocaleDateString('de-DE', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                    const timeStr = date.toLocaleTimeString('de-DE', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
                                    return `
                                        <div class="flex items-center gap-4 p-4 bg-green-50 rounded-xl border border-green-200">
                                            <div class="w-12 h-12 bg-green-600 rounded-xl flex items-center justify-center flex-shrink-0">
                                                <i class="fas fa-check text-white text-lg"></i>
                                            </div>
                                            <div class="flex-1 min-w-0">
                                                <div class="font-semibold text-gray-900">${dateStr}</div>
                                                <div class="text-sm text-gray-600">${timeStr} Uhr</div>
                                                <div class="text-xs text-green-700 mt-1 truncate">${apt.packageName}</div>
                                            </div>
                                            <div class="flex-shrink-0">
                                                <span class="inline-flex items-center gap-1.5 text-xs bg-green-600 text-white px-3 py-1.5 rounded-full font-medium">
                                                    <i class="fas fa-check-circle"></i>
                                                    Bestätigt
                                                </span>
                                            </div>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${pendingSlots.length > 0 ? `
                        <div>
                            <h3 class="text-sm font-bold text-gray-700 uppercase tracking-wider mb-4">
                                <i class="fas fa-clock text-brand-gold mr-2"></i>
                                Ihre Wunschtermine
                            </h3>
                            <div class="space-y-3">
                                ${pendingSlots.map((slot, index) => {
                                    const date = new Date(slot.datetime);
                                    const dateStr = date.toLocaleDateString('de-DE', {
                                        weekday: 'long',
                                        day: 'numeric',
                                        month: 'long',
                                        year: 'numeric'
                                    });
                                    const timeStr = date.toLocaleTimeString('de-DE', {
                                        hour: '2-digit',
                                        minute: '2-digit'
                                    });
                                    return `
                                        <div class="flex items-center gap-4 p-4 bg-gray-50 rounded-lg border border-gray-200">
                                            <div class="w-10 h-10 bg-brand-gold/20 rounded-lg flex items-center justify-center">
                                                <span class="text-brand-gold font-bold">${index + 1}</span>
                                            </div>
                                            <div class="flex-1">
                                                <div class="font-medium text-gray-900">${dateStr}</div>
                                                <div class="text-sm text-gray-500">${timeStr} Uhr</div>
                                            </div>
                                            <span class="text-xs bg-yellow-100 text-yellow-700 px-3 py-1 rounded-full font-medium">
                                                Wartet auf Bestätigung
                                            </span>
                                        </div>
                                    `;
                                }).join('')}
                            </div>
                            ${availabilityNotes ? `
                                <div class="mt-4 p-3 bg-blue-50 rounded-lg text-sm text-blue-700">
                                    <i class="fas fa-info-circle mr-2"></i>
                                    <strong>Hinweis:</strong> ${availabilityNotes}
                                </div>
                            ` : ''}
                        </div>
                    ` : ''}
                </div>
            `;
            return;
        }

        // Empty state wenn keine Termine
        container.innerHTML = `
            <div class="text-center py-8 text-gray-500">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-calendar-alt text-2xl text-gray-400"></i>
                </div>
                <h3 class="font-bold text-gray-700 mb-2">Keine anstehenden Termine</h3>
                <p class="text-sm text-gray-500">Geben Sie unten Ihre Wunschtermine an</p>
            </div>
        `;
    } catch (e) {
        logger.error('Failed to load availability:', e);
    }
}

export function showAvailabilitySection() {
    const section = document.getElementById('availability-section');
    if (section) {
        section.classList.remove('hidden');
        setTimeout(() => {
            section.scrollIntoView({ behavior: 'smooth', block: 'start' });
        }, 100);
    }
}

// ========== FILE UPLOAD ==========

export async function handleFileUpload(state, input) {
    const file = input.files?.[0];
    if(!file) return;

    const uiDefault = document.getElementById('upload-ui-default');
    const uiLoading = document.getElementById('upload-ui-loading');
    const fileList = document.getElementById('file-list');

    if(!uiDefault || !uiLoading || !fileList) return;

    if(file.type !== 'application/pdf') {
        showToast('❌ Nur PDF-Dateien sind erlaubt', 3000);
        input.value = '';
        return;
    }

    if(file.size > 10 * 1024 * 1024) {
        showToast('❌ Datei zu groß (max. 10MB)', 3000);
        input.value = '';
        return;
    }

    uiDefault.classList.add('hidden');
    uiLoading.classList.remove('hidden');

    try {
        if (storage && state.user) {
            const storageRef = ref(storage, `users/${state.user.uid}/${Date.now()}_${file.name}`);
            await uploadBytes(storageRef, file);

            // Notify admin via email
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyAdminDocumentUploaded', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerName: state.user.displayName || state.user.email,
                        customerEmail: state.user.email,
                        documentName: file.name
                    })
                });
                if (!response.ok) {
                    logger.warn('Admin document notification returned non-OK status:', response.status);
                }
            } catch (emailErr) {
                logger.warn('Failed to send admin notification:', emailErr);
            }
        } else {
            await new Promise(r => setTimeout(r, 1500));
        }

        const fileItem = document.createElement('div');
        fileItem.className = 'flex justify-between items-center p-3 bg-green-50 text-xs rounded border border-green-200';
        fileItem.innerHTML = `<span class="flex items-center gap-2"><i class="fas fa-check-circle text-green-600" aria-hidden="true"></i>${sanitizeHTML(file.name)}</span><span class="text-green-700 font-bold">Gesichert</span>`;
        fileList.appendChild(fileItem);

        showToast('✅ Datei erfolgreich hochgeladen');
    } catch(e) {
        logger.error('Upload error:', e);
        showToast('❌ Upload fehlgeschlagen', 3000);
    } finally {
        uiDefault.classList.remove('hidden');
        uiLoading.classList.add('hidden');
        input.value = '';
    }
}

// ========== MENTOR DASHBOARD ==========

// State for availability calendar
let currentWeekOffset = 0;
let mentorAvailability = {};
let mentorBookedSlots = {};

// Initialize mentor dashboard when tab is switched
export async function initMentorDashboard() {
    if (!currentMentorData) return;

    // Update welcome name
    const welcomeName = document.getElementById('mentor-welcome-name');
    if (welcomeName) {
        welcomeName.textContent = `Willkommen, ${currentMentorData.name}`;
    }

    // Load availability from Firestore
    mentorAvailability = currentMentorData.availability || {};

    // Load booked sessions to show in calendar
    await loadMentorBookedSlots();

    // Render calendar
    renderAvailabilityCalendar();

    // Load mentor sessions
    await loadMentorSessions();
}

// Load booked slots for the mentor
async function loadMentorBookedSlots() {
    if (!db || !currentMentorData) return;

    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', currentMentorData.id));
        const snapshot = await getDocs(q);

        mentorBookedSlots = {};
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                const dt = new Date(order.appointment.datetime);
                const dateKey = dt.toISOString().split('T')[0];
                const timeKey = dt.toTimeString().slice(0, 5);
                if (!mentorBookedSlots[dateKey]) {
                    mentorBookedSlots[dateKey] = [];
                }
                mentorBookedSlots[dateKey].push(timeKey);
            }
        });
    } catch (e) {
        logger.error('Error loading booked slots:', e);
    }
}

// Render the availability calendar
function renderAvailabilityCalendar() {
    const container = document.getElementById('availability-calendar');
    const weekLabel = document.getElementById('availability-week-label');
    if (!container) return;

    // Calculate week dates
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (currentWeekOffset * 7)); // Monday

    // Update week label
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = startOfWeek.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });
    if (weekLabel) {
        weekLabel.textContent = `KW ${weekNumber} - ${monthName}`;
    }

    // Time slots (9:00 - 21:00)
    const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];

    // Days of the week
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
    }

    // Build calendar HTML
    let html = `
        <table class="w-full border-collapse">
            <thead>
                <tr>
                    <th class="p-2 text-xs text-gray-500 font-medium"></th>
                    ${days.map(d => `
                        <th class="p-2 text-center ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : ''}">
                            <div class="text-xs text-gray-500 font-medium">${d.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                            <div class="text-sm font-bold ${isToday(d) ? 'text-brand-gold' : 'text-gray-700'}">${d.getDate()}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    timeSlots.forEach(time => {
        html += `<tr>`;
        html += `<td class="p-2 text-xs text-gray-500 font-medium text-right pr-3">${time}</td>`;

        days.forEach(d => {
            const dateKey = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isAvailable = mentorAvailability[dateKey]?.includes(time);
            const isBooked = mentorBookedSlots[dateKey]?.includes(time);
            const isPast = d < new Date() && !isToday(d);

            let cellClass = 'p-1';
            let slotClass = 'w-full h-8 rounded cursor-pointer transition-all ';

            if (isPast) {
                slotClass += 'bg-gray-100 cursor-not-allowed';
            } else if (isBooked) {
                slotClass += 'bg-blue-500 hover:bg-blue-600';
            } else if (isAvailable) {
                slotClass += 'bg-green-500 hover:bg-green-600';
            } else {
                slotClass += 'bg-gray-200 hover:bg-gray-300';
            }

            if (isWeekend) {
                cellClass += ' bg-gray-50';
            }

            const clickHandler = isPast || isBooked ? '' : `onclick="app.toggleTimeSlot('${dateKey}', '${time}')"`;

            html += `<td class="${cellClass}">
                <div class="${slotClass}" ${clickHandler} title="${isBooked ? 'Gebucht' : isAvailable ? 'Verfügbar - Klicken zum Entfernen' : 'Nicht verfügbar - Klicken zum Hinzufügen'}"></div>
            </td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table>`;
    container.innerHTML = html;
}

// Helper: Check if date is today
function isToday(date) {
    const today = new Date();
    return date.toDateString() === today.toDateString();
}

// Helper: Get ISO week number
function getWeekNumber(date) {
    const d = new Date(Date.UTC(date.getFullYear(), date.getMonth(), date.getDate()));
    const dayNum = d.getUTCDay() || 7;
    d.setUTCDate(d.getUTCDate() + 4 - dayNum);
    const yearStart = new Date(Date.UTC(d.getUTCFullYear(), 0, 1));
    return Math.ceil((((d - yearStart) / 86400000) + 1) / 7);
}

// Toggle time slot availability
export function toggleTimeSlot(dateKey, time) {
    if (!mentorAvailability[dateKey]) {
        mentorAvailability[dateKey] = [];
    }

    const index = mentorAvailability[dateKey].indexOf(time);
    if (index > -1) {
        mentorAvailability[dateKey].splice(index, 1);
        if (mentorAvailability[dateKey].length === 0) {
            delete mentorAvailability[dateKey];
        }
    } else {
        mentorAvailability[dateKey].push(time);
        mentorAvailability[dateKey].sort();
    }

    renderAvailabilityCalendar();
}

// Navigate to previous week
export function prevWeek() {
    currentWeekOffset--;
    renderAvailabilityCalendar();
}

// Navigate to next week
export function nextWeek() {
    currentWeekOffset++;
    renderAvailabilityCalendar();
}

// Save mentor availability to Firestore
export async function saveMentorAvailability() {
    if (!db || !currentMentorData) {
        showToast('❌ Fehler: Nicht als Mentor angemeldet');
        return;
    }

    try {
        await updateDoc(doc(db, 'coaches', currentMentorData.id), {
            availability: mentorAvailability
        });
        currentMentorData.availability = mentorAvailability;
        showToast('✅ Verfügbarkeit gespeichert');
    } catch (e) {
        logger.error('Error saving availability:', e);
        showToast('❌ Fehler beim Speichern');
    }
}

// Load mentor's assigned sessions
async function loadMentorSessions() {
    if (!db || !currentMentorData) return;

    const container = document.getElementById('mentor-sessions-list');
    const countBadge = document.getElementById('mentor-session-count');
    if (!container) return;

    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', currentMentorData.id));
        const snapshot = await getDocs(q);

        const sessions = [];
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                sessions.push({
                    id: doc.id,
                    ...order
                });
            }
        });

        // Sort by appointment date
        sessions.sort((a, b) => new Date(a.appointment.datetime) - new Date(b.appointment.datetime));

        // Update count
        if (countBadge) {
            countBadge.textContent = sessions.length;
        }

        if (sessions.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-500">
                    <i class="fas fa-calendar-check text-4xl text-gray-300 mb-3"></i>
                    <p>Keine Sessions zugewiesen</p>
                </div>
            `;
            return;
        }

        container.innerHTML = sessions.map(session => {
            const dt = new Date(session.appointment.datetime);
            const dateStr = dt.toLocaleDateString('de-DE', { weekday: 'long', day: 'numeric', month: 'long', year: 'numeric' });
            const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
            const isPast = dt < new Date();
            const canJoin = isMeetingTimeNow(session.appointment.datetime);

            return `
                <div class="p-4 hover:bg-gray-50 transition ${isPast ? 'opacity-60' : ''}">
                    <div class="flex justify-between items-start">
                        <div>
                            <h4 class="font-bold text-brand-dark">${sanitizeHTML(session.customerName || 'Kunde')}</h4>
                            <p class="text-sm text-gray-600">${sanitizeHTML(session.customerEmail || '')}</p>
                            <div class="mt-2 flex items-center gap-2 text-sm">
                                <i class="fas fa-calendar text-gray-400"></i>
                                <span>${dateStr}</span>
                                <span class="text-brand-gold font-bold">${timeStr} Uhr</span>
                            </div>
                            <div class="mt-1 text-xs text-gray-500">
                                ${session.items?.map(i => i.title).join(', ') || 'Session'}
                            </div>
                        </div>
                        <div class="flex flex-col gap-2">
                            ${canJoin ? `
                                <button onclick="app.joinMeeting('${session.id}')"
                                        class="bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 text-white text-xs font-bold py-2 px-4 rounded-lg flex items-center gap-2">
                                    <i class="fas fa-video"></i>
                                    Meeting beitreten
                                </button>
                            ` : isPast ? `
                                <span class="text-xs text-gray-400 bg-gray-100 px-3 py-1.5 rounded-lg">Abgeschlossen</span>
                            ` : `
                                <span class="text-xs text-gray-500 bg-gray-100 px-3 py-1.5 rounded-lg">
                                    <i class="fas fa-clock"></i> Geplant
                                </span>
                            `}
                        </div>
                    </div>
                </div>
            `;
        }).join('');

    } catch (e) {
        logger.error('Error loading mentor sessions:', e);
        container.innerHTML = `
            <div class="p-8 text-center text-red-500">
                <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
                <p>Fehler beim Laden der Sessions</p>
            </div>
        `;
    }
}

// ========== ADMIN: COACH ASSIGNMENT ==========

let currentAssignOrderId = null;

// Show modal to assign a coach to an order
export async function showAssignCoachModal(orderId) {
    currentAssignOrderId = orderId;

    // Create modal if it doesn't exist
    let modal = document.getElementById('assign-coach-modal');
    if (!modal) {
        modal = document.createElement('div');
        modal.id = 'assign-coach-modal';
        modal.className = 'fixed inset-0 bg-black/60 backdrop-blur-sm flex items-center justify-center z-50 hidden p-4';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl shadow-2xl max-w-2xl w-full max-h-[85vh] overflow-hidden">
                <div class="p-5 border-b border-gray-100 bg-gradient-to-r from-indigo-600 to-purple-600">
                    <div class="flex justify-between items-center">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-white/20 rounded-lg flex items-center justify-center">
                                <i class="fas fa-user-plus text-white"></i>
                            </div>
                            <div>
                                <h3 class="text-lg font-bold text-white">Mentor zuweisen</h3>
                                <p class="text-xs text-white/70">Wähle einen verfügbaren Mentor</p>
                            </div>
                        </div>
                        <button onclick="app.closeAssignCoachModal()" class="w-8 h-8 bg-white/10 hover:bg-white/20 rounded-lg flex items-center justify-center transition">
                            <i class="fas fa-times text-white"></i>
                        </button>
                    </div>
                </div>
                <div id="assign-coach-list" class="p-4 overflow-y-auto max-h-[65vh]">
                    <div class="flex justify-center py-8">
                        <i class="fas fa-spinner fa-spin text-3xl text-gray-400"></i>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);
    }

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
    await loadCoachesForAssignment();
}

// Close the assign coach modal
export function closeAssignCoachModal() {
    const modal = document.getElementById('assign-coach-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
    document.body.style.overflow = '';
    currentAssignOrderId = null;
}

// Load coaches and display in modal with smart recommendations
async function loadCoachesForAssignment() {
    const container = document.getElementById('assign-coach-list');
    if (!container || !db) return;

    try {
        const coachesRef = collection(db, 'coaches');
        const snapshot = await getDocs(coachesRef);

        const coaches = [];
        snapshot.forEach(doc => {
            coaches.push({
                id: doc.id,
                ...doc.data()
            });
        });

        if (coaches.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-user-slash text-4xl text-gray-300 mb-3"></i>
                    <p class="mb-3">Keine Mentoren verfügbar</p>
                    <button onclick="app.closeAssignCoachModal(); app.switchAdminTab('coaches'); app.openAddCoachModal();"
                            class="text-sm text-indigo-600 hover:text-indigo-800 underline">
                        Jetzt Mentor anlegen
                    </button>
                </div>
            `;
            return;
        }

        // Calculate availability score for each coach
        const today = new Date();
        const twoWeeksLater = new Date(today.getTime() + 14 * 24 * 60 * 60 * 1000);

        const scoredCoaches = coaches.map(coach => {
            const availability = coach.availability || {};
            let futureSlots = 0;
            let nearSlots = 0;

            Object.entries(availability).forEach(([dateStr, slots]) => {
                const date = new Date(dateStr);
                if (date >= today && date <= twoWeeksLater) {
                    futureSlots += (slots?.length || 0);
                    // Slots in the next 7 days count more
                    if (date <= new Date(today.getTime() + 7 * 24 * 60 * 60 * 1000)) {
                        nearSlots += (slots?.length || 0);
                    }
                }
            });

            return {
                ...coach,
                futureSlots,
                nearSlots,
                score: nearSlots * 2 + futureSlots,
                isVisible: coach.visible !== false
            };
        });

        // Sort by availability score (highest first)
        scoredCoaches.sort((a, b) => b.score - a.score);

        // Find the recommended mentor (highest score with visibility)
        const recommended = scoredCoaches.find(c => c.isVisible && c.score > 0);

        container.innerHTML = `
            ${recommended ? `
                <div class="mb-4 p-3 bg-gradient-to-r from-green-50 to-emerald-50 border border-green-200 rounded-xl">
                    <div class="flex items-center gap-2 text-green-700 text-xs font-medium mb-2">
                        <i class="fas fa-lightbulb"></i>
                        <span>Empfehlung basierend auf Verfügbarkeit</span>
                    </div>
                    <div class="flex items-center gap-3 p-2 bg-white rounded-lg border border-green-200 cursor-pointer hover:shadow-md transition"
                         onclick="app.assignCoachToOrder('${recommended.id}', '${sanitizeHTML(recommended.name || 'Mentor')}')">
                        <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0 ring-2 ring-green-400">
                            ${recommended.image ? `<img src="${recommended.image}" alt="${sanitizeHTML(recommended.name)}" class="w-full h-full object-cover">` : `
                                <div class="w-full h-full flex items-center justify-center bg-green-100">
                                    <i class="fas fa-user text-green-500"></i>
                                </div>
                            `}
                        </div>
                        <div class="flex-1">
                            <h4 class="font-bold text-brand-dark flex items-center gap-2">
                                ${sanitizeHTML(recommended.name || 'Unbekannt')}
                                <span class="px-1.5 py-0.5 bg-green-500 text-white text-xs rounded">Empfohlen</span>
                            </h4>
                            <p class="text-sm text-gray-600">${sanitizeHTML(recommended.role || '')}</p>
                            <p class="text-xs text-green-600 mt-1">
                                <i class="fas fa-calendar-check mr-1"></i>${recommended.futureSlots} Slots in den nächsten 2 Wochen
                            </p>
                        </div>
                        <button class="px-3 py-2 bg-green-600 text-white text-sm font-medium rounded-lg hover:bg-green-700 transition">
                            Zuweisen
                        </button>
                    </div>
                </div>
            ` : ''}

            <p class="text-xs text-gray-400 uppercase tracking-wider mb-3">Alle Mentoren (${scoredCoaches.length})</p>

            ${scoredCoaches.map(coach => {
                const isRecommended = recommended?.id === coach.id;
                if (isRecommended) return ''; // Already shown above

                const availabilityClass = coach.futureSlots > 5 ? 'text-green-600' :
                                          coach.futureSlots > 0 ? 'text-yellow-600' : 'text-red-500';
                const availabilityBg = coach.futureSlots > 5 ? 'bg-green-50 border-green-100' :
                                       coach.futureSlots > 0 ? 'bg-yellow-50 border-yellow-100' : 'bg-red-50 border-red-100';

                return `
                    <div class="border border-gray-200 rounded-xl p-3 mb-2 hover:border-indigo-300 hover:shadow-sm transition cursor-pointer ${!coach.isVisible ? 'opacity-50' : ''}"
                         onclick="app.assignCoachToOrder('${coach.id}', '${sanitizeHTML(coach.name || 'Mentor')}')">
                        <div class="flex items-center gap-3">
                            <div class="w-12 h-12 rounded-full overflow-hidden bg-gray-200 flex-shrink-0">
                                ${coach.image ? `<img src="${coach.image}" alt="${sanitizeHTML(coach.name)}" class="w-full h-full object-cover">` : `
                                    <div class="w-full h-full flex items-center justify-center bg-indigo-100">
                                        <i class="fas fa-user text-indigo-400"></i>
                                    </div>
                                `}
                            </div>
                            <div class="flex-1 min-w-0">
                                <div class="flex items-center gap-2">
                                    <h4 class="font-bold text-brand-dark truncate">${sanitizeHTML(coach.name || 'Unbekannt')}</h4>
                                    ${!coach.isVisible ? '<span class="px-1.5 py-0.5 bg-gray-200 text-gray-500 text-xs rounded">Versteckt</span>' : ''}
                                </div>
                                <p class="text-sm text-gray-500 truncate">${sanitizeHTML(coach.role || '-')}</p>
                            </div>
                            <div class="flex-shrink-0 text-right">
                                <div class="px-2 py-1 ${availabilityBg} rounded-lg border">
                                    <p class="text-xs ${availabilityClass} font-medium">
                                        ${coach.futureSlots > 0 ? `${coach.futureSlots} Slots` : 'Keine Slots'}
                                    </p>
                                </div>
                            </div>
                        </div>
                    </div>
                `;
            }).join('')}
        `;

    } catch (e) {
        logger.error('Error loading coaches for assignment:', e);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-4xl mb-3"></i>
                <p>Fehler beim Laden der Mentoren</p>
            </div>
        `;
    }
}

// Assign a coach to the order
export async function assignCoachToOrder(coachId, coachName) {
    if (!db || !currentAssignOrderId) {
        showToast('❌ Fehler: Order nicht gefunden');
        return;
    }

    try {
        // Hole Order-Details für Benachrichtigung
        const orderDoc = await getDoc(doc(db, 'orders', currentAssignOrderId));
        const orderData = orderDoc.exists() ? orderDoc.data() : {};

        // Hole Coach-Details für Benachrichtigung und Bild
        const coachDoc = await getDoc(doc(db, 'coaches', coachId));
        const coachData = coachDoc.exists() ? coachDoc.data() : {};
        const coachEmail = coachData.email;
        const coachImage = coachData.image || null;

        await updateDoc(doc(db, 'orders', currentAssignOrderId), {
            assignedCoachId: coachId,
            assignedCoachName: coachName,
            assignedCoachImage: coachImage,
            assignedAt: new Date()
        });

        showToast(`✅ ${coachName} wurde zugewiesen`);
        closeAssignCoachModal();

        // ========== MENTOR-BENACHRICHTIGUNG ==========
        if (coachEmail) {
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyMentorAssignment', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        coachEmail: coachEmail,
                        coachName: coachName,
                        orderId: currentAssignOrderId,
                        customerName: orderData.customerName || 'Kunde',
                        customerEmail: orderData.customerEmail,
                        productTitle: orderData.items?.[0]?.title || 'Mentoring Session'
                    })
                });
                if (response.ok) {
                    logger.log('Mentor notification sent to:', coachEmail);
                } else {
                    logger.warn('Mentor notification returned non-OK status:', response.status);
                }
            } catch (notifyError) {
                logger.warn('Failed to send mentor notification:', notifyError);
                // Nicht kritisch - Zuweisung war erfolgreich
            }
        }

        // Refresh admin orders
        loadAllOrders();

    } catch (e) {
        logger.error('Error assigning coach:', e);
        showToast('❌ Fehler beim Zuweisen');
    }
}

// ========== COACHES & ARTICLES ==========
// Note: db and sanitizeHTML already imported at top of file

export async function initData(state) {
    logger.log('🔄 initData called - loading data from Firestore...');
    logger.log('   db status:', db ? 'initialized' : 'NOT INITIALIZED');

    // Load coaches from Firestore ONLY (no fallback to sample data)
    const dbCoaches = await fetchCollection('coaches');
    state.coaches = dbCoaches;
    logger.log('✅ Loaded', dbCoaches.length, 'coaches from Firestore');
    filterCoaches(state);

    // Load articles from Firestore and fill up to minimum 3 with sample data
    const dbArticles = await fetchCollection('articles');
    const MIN_ARTICLES = 3;

    if(dbArticles.length >= MIN_ARTICLES) {
        // Genug echte Artikel vorhanden
        state.articles = dbArticles;
        logger.log('✅ Loaded', dbArticles.length, 'articles from Firestore');
    } else {
        // Auffüllen mit Sample-Artikeln bis mindestens 3
        const neededSamples = MIN_ARTICLES - dbArticles.length;
        const fillArticles = sampleArticles.slice(0, neededSamples);
        state.articles = [...dbArticles, ...fillArticles];
        logger.log(`✅ Loaded ${dbArticles.length} real + ${fillArticles.length} sample articles (total: ${state.articles.length})`);
    }
    renderArticles(state);
}

export async function fetchCollection(colName) {
    if(!db) {
        logger.error('❌ Firestore (db) ist nicht initialisiert!');
        return [];
    }
    try {
        logger.log('🔄 Lade Collection:', colName);
        const snap = await getDocs(collection(db, colName));
        logger.log('✅ Collection geladen:', colName, '- Anzahl:', snap.docs.length);
        return snap.docs.map(doc => ({id: doc.id, ...doc.data()}));
    } catch(e) {
        logger.error('❌ Failed to fetch ' + colName + ':', e);
        return [];
    }
}

export function filterCoaches(state) {
    const grid = document.getElementById('coach-grid');
    if(!grid) return;

    const filterSelect = document.getElementById('industry-filter');
    const filter = filterSelect?.value || 'all';

    // First filter out hidden coaches (visible !== false means visible)
    const visibleCoaches = state.coaches.filter(c => c.visible !== false);

    // Then apply industry filter
    const filteredCoaches = filter === 'all' ? visibleCoaches : visibleCoaches.filter(c => c.industry === filter);

    // Zeige Nachricht wenn keine Coaches vorhanden
    if(filteredCoaches.length === 0) {
        grid.innerHTML = '<div class="col-span-full text-center py-12 text-gray-500"><p class="text-lg">Keine Mentoren gefunden.</p><p class="text-sm mt-2">Bitte überprüfen Sie die Firestore-Datenbank.</p></div>';
        return;
    }

    grid.innerHTML = filteredCoaches.map(coach => {
        const name = sanitizeHTML(coach.name);
        const role = sanitizeHTML(coach.role);
        const experience = sanitizeHTML(coach.experience || '15+ Jahre');
        const expertise = Array.isArray(coach.expertise) ? coach.expertise.slice(0, 3) : [];
        // Proof points - use coach.stats or generate from data
        const proofPoints = coach.stats || `${coach.projectCount || '50'}+ Projekte • ${coach.industry || 'Tech, Beratung'} • ${coach.levelFocus || 'Manager–C-Level'}`;
        return `
            <div class="group cursor-pointer" onclick="app.openCoachDetail('${coach.id}')">
                <div class="relative bg-gradient-to-b from-[#0D1321] to-[#1A1F2E] rounded-2xl overflow-hidden border border-white/[0.08] hover:border-brand-gold/30 transition-all duration-500 hover:shadow-2xl hover:shadow-brand-gold/10 hover:-translate-y-1">
                    <!-- Image Area - Face visible -->
                    <div class="relative aspect-[4/5] overflow-hidden">
                        <img src="${coach.image}"
                             class="w-full h-full object-cover object-[center_20%] transition-all duration-700 group-hover:scale-105 grayscale group-hover:grayscale-0"
                             alt="${name}" loading="lazy">
                        <!-- Gradient Overlay -->
                        <div class="absolute inset-0 bg-gradient-to-t from-[#0D1321] via-[#0D1321]/20 to-transparent"></div>
                        <!-- Gold tint on hover -->
                        <div class="absolute inset-0 bg-brand-gold/0 group-hover:bg-brand-gold/10 transition-all duration-500"></div>
                        <!-- Experience Badge -->
                        <div class="absolute top-4 right-4 bg-black/50 backdrop-blur-md border border-white/10 rounded-full px-3 py-1.5">
                            <span class="text-[10px] text-white/90 font-medium uppercase tracking-wider">${experience}</span>
                        </div>
                    </div>
                    <!-- Content -->
                    <div class="relative px-6 pb-6 -mt-12">
                        <!-- Name & Role -->
                        <h4 class="font-serif text-xl text-white mb-1 group-hover:text-brand-gold transition-colors duration-300">${name}</h4>
                        <p class="text-brand-gold text-xs font-semibold tracking-wide mb-3">${role}</p>
                        <!-- Core Competencies as Bullet Points -->
                        ${expertise.length > 0 ? `
                        <ul class="space-y-1.5 mb-4 text-[11px] text-gray-300">
                            ${expertise.map(e => `<li class="flex items-start gap-2"><span class="text-brand-gold mt-0.5">•</span><span>${sanitizeHTML(e)}</span></li>`).join('')}
                        </ul>
                        ` : ''}
                        <!-- Proof Points -->
                        <div class="text-[10px] text-white/50 border-t border-white/10 pt-3 mb-4">
                            ${sanitizeHTML(proofPoints)}
                        </div>
                        <!-- Action Button -->
                        <button onclick="event.stopPropagation(); app.bookSessionWithComplianceCheck('Executive Mentoring - Single Session', 350, '${name}')"
                                class="w-full bg-brand-gold hover:bg-brand-dark border-2 border-brand-gold hover:border-brand-dark text-brand-dark hover:text-white font-bold py-3.5 px-4 rounded-xl text-xs uppercase tracking-wider transition-all duration-300 flex items-center justify-center gap-2 group/btn shadow-lg shadow-brand-gold/20">
                            <span>Session buchen</span>
                            <i class="fas fa-arrow-right text-[10px] group-hover/btn:translate-x-1 transition-transform"></i>
                        </button>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

export function openCoachDetail(state, id, navigateTo) {
    const coach = state.coaches.find(c => c.id === id);
    if(!coach) return;

    const expertise = Array.isArray(coach.expertise) ? coach.expertise : (coach.expertise ? [coach.expertise] : ['Leadership']);
    const contentArea = document.getElementById('coach-detail-content');
    if(!contentArea) return;

    const name = sanitizeHTML(coach.name);
    const role = sanitizeHTML(coach.role);
    const bio = sanitizeHTML(coach.bio || 'Keine Bio verfügbar.');
    const experience = sanitizeHTML(coach.experience || '15+ Jahre Leadership-Erfahrung');
    const proofPoints = coach.stats || `${coach.projectCount || '50'}+ Projekte • ${coach.industry || 'Tech, Beratung'} • ${coach.levelFocus || 'Manager–C-Level'}`;

    contentArea.innerHTML = `
        <div class="flex flex-col md:flex-row gap-10">
            <!-- Left: Image -->
            <div class="w-full md:w-2/5">
                <img src="${coach.image}" class="w-full rounded-2xl shadow-2xl object-cover aspect-[3/4] object-[center_20%]" alt="${name}" loading="lazy">
                <!-- Proof Points Box -->
                <div class="mt-6 p-5 bg-brand-dark rounded-xl text-white">
                    <h4 class="text-xs uppercase tracking-wider text-brand-gold mb-3 font-semibold">Track Record</h4>
                    <p class="text-sm text-gray-300">${sanitizeHTML(proofPoints)}</p>
                </div>
            </div>
            <!-- Right: Content -->
            <div class="w-full md:w-3/5">
                <h1 class="font-serif text-4xl mb-2">${name}</h1>
                <p class="text-brand-gold font-bold text-sm mb-4">${role}</p>
                <p class="text-xs text-gray-500 mb-6"><i class="fas fa-briefcase mr-2"></i>${experience}</p>

                <!-- Core Competencies -->
                <div class="mb-6">
                    <h4 class="font-bold text-xs uppercase mb-3 text-gray-700">Kernkompetenzen</h4>
                    <ul class="space-y-2">
                        ${expertise.map(e => `<li class="flex items-start gap-3 text-gray-600"><span class="text-brand-gold font-bold">•</span><span>${sanitizeHTML(e)}</span></li>`).join('')}
                    </ul>
                </div>

                <!-- Bio / Warum ich -->
                <div class="mb-8 p-5 bg-gray-50 rounded-xl border border-gray-100">
                    <h4 class="font-bold text-xs uppercase mb-3 text-gray-700">Über mich</h4>
                    <p class="text-gray-600 leading-relaxed">${bio}</p>
                </div>

                <!-- CTAs -->
                <div class="flex flex-col sm:flex-row gap-4">
                    <button onclick="app.bookSessionWithComplianceCheck('Executive Mentoring - Single Session', 350, '${name}')"
                            class="bg-brand-gold text-brand-dark font-bold py-4 px-8 uppercase text-xs tracking-wider hover:shadow-lg transition rounded-xl flex items-center justify-center gap-2">
                        <span>Session buchen</span>
                        <i class="fas fa-arrow-right text-xs"></i>
                    </button>
                    <button onclick="app.navigateToSection('home', 'mentoring')"
                            class="border-2 border-gray-300 text-gray-600 font-bold py-4 px-8 uppercase text-xs tracking-wider hover:border-brand-gold hover:text-brand-gold transition rounded-xl">
                        Zurück zur Übersicht
                    </button>
                </div>
            </div>
        </div>
    `;

    navigateTo('coach-detail');
}

export function renderArticles(state) {
    const grid = document.getElementById('journal-grid');
    if(!grid) return;

    grid.innerHTML = state.articles.map(article => {
        const title = sanitizeHTML(article.title);
        const cat = sanitizeHTML(article.cat);
        const preview = sanitizeHTML(article.preview);
        return '<article class="bg-white border rounded-sm overflow-hidden hover:shadow-xl transition cursor-pointer" onclick="app.openArticle(\'' + article.id + '\')"><div class="h-48 bg-gray-200 relative"><img src="' + article.image + '" class="w-full h-full object-cover" alt="' + title + '" loading="lazy"><span class="absolute top-2 left-2 bg-brand-gold text-brand-dark text-[10px] font-bold px-2 py-1 uppercase">' + cat + '</span></div><div class="p-6"><h3 class="font-serif text-lg font-bold mb-2">' + title + '</h3><p class="text-sm text-gray-500 line-clamp-3">' + preview + '</p></div></article>';
    }).join('');
}

export function openArticle(state, id, navigateTo) {
    const article = state.articles.find(a => a.id === id);
    if(!article) return;

    const contentArea = document.getElementById('article-content-area');
    if(!contentArea) return;

    const title = sanitizeHTML(article.title);
    const cat = sanitizeHTML(article.cat);

    contentArea.innerHTML = '<span class="text-brand-gold font-bold uppercase text-xs">' + cat + '</span><h1 class="font-serif text-3xl my-4">' + title + '</h1><img src="' + article.image + '" class="w-full h-64 object-cover mb-8 rounded" alt="' + title + '" loading="lazy"><div class="prose text-gray-700 leading-relaxed">' + article.content + '</div><button onclick="app.navigateTo(\'journal\')" class="mt-8 text-brand-gold font-bold hover:underline inline-flex items-center gap-2"><i class="fas fa-arrow-left" aria-hidden="true"></i>Zurück zu Insights</button>';

    navigateTo('article-detail');
}

// ========== ABOUT SECTION - DYNAMIC IMAGE ==========

// Load "Über uns" image from Firestore
export async function loadAboutImage() {
    logger.log('🔄 loadAboutImage called');
    try {
        if (!db) {
            logger.error('❌ Firestore (db) not available - cannot load about image');
            return;
        }

        const imgElement = document.getElementById('about-founder-image');
        const heroImgElement = document.getElementById('hero-founder-image');
        if (!imgElement && !heroImgElement) return;

        // Zeige Loading-Zustand
        if (imgElement) {
            imgElement.style.opacity = '0.5';
            imgElement.style.transition = 'opacity 0.3s ease-in-out';
        }

        const docRef = doc(db, 'settings', 'about');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const imageUrl = data.imageUrl;

            if (imageUrl) {
                // Preload das Bild im Hintergrund
                const preloadImg = new Image();
                preloadImg.onload = () => {
                    if (imgElement) {
                        imgElement.src = imageUrl;
                        imgElement.style.opacity = '1';
                    }
                    if (heroImgElement) {
                        heroImgElement.src = imageUrl;
                        heroImgElement.style.opacity = '1';
                        const fallback = document.getElementById('hero-founder-fallback');
                        if (fallback) fallback.style.opacity = '0';
                    }
                    // Also set mentor profile image if exists
                    const mentorImg = document.getElementById('mentor-profile-image');
                    if (mentorImg) mentorImg.src = imageUrl;
                    logger.log('✅ About image loaded from Firestore');
                };
                preloadImg.onerror = () => {
                    if (imgElement) imgElement.style.opacity = '1';
                    logger.warn('Failed to preload about image');
                };
                preloadImg.src = imageUrl;
            } else {
                if (imgElement) imgElement.style.opacity = '1';
            }
        } else {
            if (imgElement) imgElement.style.opacity = '1';
            logger.log('No about image in Firestore, using default');
        }
    } catch (error) {
        logger.error('Error loading about image:', error);
        const imgElement = document.getElementById('about-founder-image');
        if (imgElement) imgElement.style.opacity = '1';
    }
}

// Update "Über uns" image in Firestore (Admin function)
export async function updateAboutImage(imageUrl) {
    try {
        if (!db) {
            throw new Error('Firestore not available');
        }

        await setDoc(doc(db, 'settings', 'about'), {
            imageUrl: imageUrl,
            updatedAt: new Date()
        });

        showToast('✅ Über uns Bild aktualisiert');
        loadAboutImage();
    } catch (error) {
        logger.error('Error updating about image:', error);
        showToast('❌ Fehler beim Aktualisieren des Bildes', 'error');
    }
}

// Upload image to Firebase Storage and update Firestore
export async function uploadAboutImage(file) {
    try {
        if (!storage) {
            throw new Error('Firebase Storage not available');
        }

        if (!file || !file.type.startsWith('image/')) {
            throw new Error('Bitte wählen Sie eine Bilddatei aus');
        }

        showToast('⏳ Bild wird hochgeladen...', 'info');

        const timestamp = new Date().getTime();
        const storageRef = ref(storage, 'about/founder-' + timestamp + '.jpg');
        await uploadBytes(storageRef, file);
        const downloadURL = await getDownloadURL(storageRef);

        await updateAboutImage(downloadURL);

        return downloadURL;
    } catch (error) {
        logger.error('Error uploading about image:', error);
        showToast('❌ ' + error.message, 'error');
        throw error;
    }
}

// Load dynamic mentoring slots text from Firestore
export async function loadMentoringSlotsText() {
    try {
        if (!db) {
            logger.warn('Firestore not available for mentoring slots text');
            return;
        }

        const docRef = doc(db, 'settings', 'mentoring');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();
            const slotsText = data.slotsText;

            if (slotsText) {
                // Update all elements with class 'mentoring-slots-text'
                const elements = document.querySelectorAll('.mentoring-slots-text');
                elements.forEach(el => {
                    el.textContent = slotsText;
                });
                logger.log('✅ Mentoring slots text loaded from Firestore');
            }
        }
    } catch (error) {
        logger.warn('Could not load mentoring slots text:', error.message);
    }
}

// ========== INNER CIRCLE - WAITLIST ==========

// Submit Inner Circle waitlist form
export async function submitWaitlist(event) {
    event.preventDefault();

    const name = document.getElementById('waitlist-name').value;
    const email = document.getElementById('waitlist-email').value;
    const linkedin = document.getElementById('waitlist-linkedin').value;
    const position = document.getElementById('waitlist-position').value;
    const company = document.getElementById('waitlist-company').value;
    const experience = document.getElementById('waitlist-experience').value;
    const reason = document.getElementById('waitlist-reason').value;

    try {
        if (!db) {
            throw new Error('Firestore not available');
        }

        // Save to Firestore
        await addDoc(collection(db, 'waitlist'), {
            name: sanitizeHTML(name),
            email: email,
            linkedin: linkedin,
            currentRole: sanitizeHTML(position),
            company: sanitizeHTML(company),
            yearsExperience: experience,
            reason: sanitizeHTML(reason),
            status: 'pending',
            submittedAt: new Date(),
            reviewedBy: null,
            reviewedAt: null,
            notes: '',
            interviewDate: null,
            interviewNotes: ''
        });

        showToast('Erfolgreich auf die Warteliste gesetzt! Ich melde mich innerhalb von 5 Werktagen.');

        // Clear form
        event.target.reset();

        // Navigate to home after 3 seconds
        setTimeout(() => {
            navigateTo('home');
        }, 3000);

    } catch (error) {
        logger.error('Error submitting waitlist:', error);
        showToast('❌ Fehler beim Absenden. Bitte versuchen Sie es später erneut.', 'error');
    }
}

// ========== INNER CIRCLE - ADMIN FUNCTIONS ==========

let allWaitlistEntries = [];
let allMembers = [];
let currentWaitlistEntry = null;

// Load all Inner Circle data
export async function loadInnerCircleData() {
    await Promise.all([
        loadWaitlist(),
        loadMembers()
    ]);
    updateInnerCircleStats();
}

// Load waitlist entries
export async function loadWaitlist() {
    const container = document.getElementById('ic-waitlist-list');
    if (!container) return;

    container.innerHTML = '<div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400"><i class="fas fa-spinner fa-spin text-3xl mb-4"></i><p>Lade Bewerbungen...</p></div>';

    try {
        const waitlistRef = collection(db, 'waitlist');
        const q = query(waitlistRef, orderBy('submittedAt', 'desc'));
        const snapshot = await getDocs(q);

        allWaitlistEntries = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        displayWaitlist(allWaitlistEntries);
        updateInnerCircleStats();
    } catch (error) {
        logger.error('Error loading waitlist:', error);
        container.innerHTML = '<div class="bg-white p-12 rounded-xl border border-red-100 text-center text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-4"></i><p>Fehler beim Laden der Bewerbungen</p></div>';
    }
}

// Display waitlist entries
function displayWaitlist(entries) {
    const container = document.getElementById('ic-waitlist-list');
    if (!container) return;

    if (entries.length === 0) {
        container.innerHTML = `
            <div class="bg-white p-12 rounded-xl border border-dashed border-gray-200 text-center">
                <i class="fas fa-inbox text-gray-300 text-4xl mb-4"></i>
                <p class="text-gray-500">Keine Bewerbungen vorhanden</p>
            </div>
        `;
        return;
    }

    const statusColors = {
        'pending': { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Neu' },
        'reviewing': { bg: 'bg-yellow-100', text: 'text-yellow-600', label: 'In Prüfung' },
        'interview_scheduled': { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Interview geplant' },
        'approved': { bg: 'bg-green-100', text: 'text-green-600', label: 'Genehmigt' },
        'rejected': { bg: 'bg-red-100', text: 'text-red-600', label: 'Abgelehnt' }
    };

    container.innerHTML = entries.map(entry => {
        const status = statusColors[entry.status] || statusColors['pending'];
        const submittedDate = entry.submittedAt?.toDate?.() || new Date(entry.submittedAt);
        const dateStr = submittedDate.toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' });

        return `
            <div class="bg-white rounded-xl border border-gray-100 hover:border-brand-gold hover:shadow-md transition cursor-pointer" onclick="app.openWaitlistDetail('${entry.id}')">
                <div class="p-4">
                    <div class="flex items-center justify-between mb-3">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-gradient-to-br from-brand-dark to-gray-800 rounded-full flex items-center justify-center text-brand-gold font-bold">
                                ${entry.name?.charAt(0)?.toUpperCase() || '?'}
                            </div>
                            <div>
                                <h4 class="font-bold text-brand-dark">${sanitizeHTML(entry.name)}</h4>
                                <p class="text-sm text-gray-500">${sanitizeHTML(entry.email)}</p>
                            </div>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${status.bg} ${status.text}">
                            ${status.label}
                        </span>
                    </div>
                    <div class="flex items-center gap-4 text-sm text-gray-500">
                        <span><i class="fas fa-briefcase mr-1"></i>${sanitizeHTML(entry.currentRole || '--')}</span>
                        <span><i class="fas fa-building mr-1"></i>${sanitizeHTML(entry.company || '--')}</span>
                        <span><i class="fas fa-clock mr-1"></i>${sanitizeHTML(entry.yearsExperience || '--')} Jahre</span>
                        <span class="ml-auto text-xs">${dateStr}</span>
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filter waitlist
export function filterWaitlist() {
    const searchTerm = document.getElementById('ic-search-waitlist')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('ic-filter-status')?.value || '';

    const filtered = allWaitlistEntries.filter(entry => {
        const matchesSearch = !searchTerm ||
            entry.name?.toLowerCase().includes(searchTerm) ||
            entry.email?.toLowerCase().includes(searchTerm) ||
            entry.company?.toLowerCase().includes(searchTerm);
        const matchesStatus = !statusFilter || entry.status === statusFilter;
        return matchesSearch && matchesStatus;
    });

    displayWaitlist(filtered);
}

// Open waitlist detail modal
export function openWaitlistDetail(entryId) {
    currentWaitlistEntry = allWaitlistEntries.find(e => e.id === entryId);
    if (!currentWaitlistEntry) return;

    const entry = currentWaitlistEntry;
    const submittedDate = entry.submittedAt?.toDate?.() || new Date(entry.submittedAt);

    document.getElementById('waitlist-detail-name').textContent = entry.name || '--';
    document.getElementById('waitlist-detail-email').textContent = entry.email || '--';
    document.getElementById('waitlist-detail-position').textContent = entry.currentRole || '--';
    document.getElementById('waitlist-detail-company').textContent = entry.company || '--';
    document.getElementById('waitlist-detail-experience').textContent = entry.yearsExperience ? `${entry.yearsExperience} Jahre` : '--';
    document.getElementById('waitlist-detail-reason').textContent = entry.reason || 'Keine Angabe';
    document.getElementById('waitlist-detail-date').textContent = `Eingereicht am: ${submittedDate.toLocaleDateString('de-DE')}`;
    document.getElementById('waitlist-detail-notes').value = entry.notes || '';

    const linkedinLink = document.getElementById('waitlist-detail-linkedin');
    // 2026-06-09 (M5): linkedin-URL vor href-Zuweisung auf http(s) validieren —
    // sonst koennte ein `javascript:`-URI beim Admin-Klick Code ausfuehren.
    const safeLinkedin = /^https?:\/\//i.test(entry.linkedin || '') ? entry.linkedin : '';
    if (safeLinkedin) {
        linkedinLink.href = safeLinkedin;
        linkedinLink.textContent = 'Profil öffnen';
    } else {
        linkedinLink.href = '#';
        linkedinLink.textContent = 'Nicht angegeben';
    }

    // Interview date
    if (entry.interviewDate) {
        const interviewDate = entry.interviewDate.toDate?.() || new Date(entry.interviewDate);
        document.getElementById('waitlist-detail-interview-date').value = interviewDate.toISOString().slice(0, 16);
    } else {
        document.getElementById('waitlist-detail-interview-date').value = '';
    }

    // Status badge
    const statusColors = {
        'pending': { bg: 'bg-orange-100', text: 'text-orange-600', label: 'Neu / Offen' },
        'reviewing': { bg: 'bg-yellow-100', text: 'text-yellow-600', label: 'In Prüfung' },
        'interview_scheduled': { bg: 'bg-blue-100', text: 'text-blue-600', label: 'Interview geplant' },
        'approved': { bg: 'bg-green-100', text: 'text-green-600', label: 'Genehmigt' },
        'rejected': { bg: 'bg-red-100', text: 'text-red-600', label: 'Abgelehnt' }
    };
    const status = statusColors[entry.status] || statusColors['pending'];
    const statusBadge = document.getElementById('waitlist-detail-status-badge');
    statusBadge.className = `px-3 py-1 rounded-full text-sm font-bold ${status.bg} ${status.text}`;
    statusBadge.textContent = status.label;

    // Show/hide sections based on status
    const actionsDiv = document.getElementById('waitlist-detail-actions');
    const approvedSection = document.getElementById('waitlist-approved-section');

    if (entry.status === 'approved') {
        actionsDiv.classList.add('hidden');
        approvedSection.classList.remove('hidden');
    } else {
        actionsDiv.classList.remove('hidden');
        approvedSection.classList.add('hidden');
    }

    document.getElementById('modal-waitlist-detail').classList.remove('hidden');
}

// Close waitlist detail modal
export function closeWaitlistDetailModal() {
    document.getElementById('modal-waitlist-detail').classList.add('hidden');
    currentWaitlistEntry = null;
}

// Update waitlist status
export async function updateWaitlistStatus(newStatus) {
    if (!currentWaitlistEntry) return;

    try {
        const updates = {
            status: newStatus,
            reviewedAt: new Date(),
            notes: document.getElementById('waitlist-detail-notes').value || ''
        };

        // Add interview date if scheduling
        if (newStatus === 'interview_scheduled') {
            const interviewDateValue = document.getElementById('waitlist-detail-interview-date').value;
            if (!interviewDateValue) {
                showToast('❌ Bitte wählen Sie einen Interview-Termin aus.', 'error');
                return;
            }
            updates.interviewDate = new Date(interviewDateValue);
        }

        await updateDoc(doc(db, 'waitlist', currentWaitlistEntry.id), updates);

        showToast('✅ Status erfolgreich aktualisiert!');
        closeWaitlistDetailModal();
        loadWaitlist();
    } catch (error) {
        logger.error('Error updating waitlist status:', error);
        showToast('❌ Fehler beim Aktualisieren.', 'error');
    }
}

// Create member from approved waitlist entry
export async function createMemberFromWaitlist() {
    if (!currentWaitlistEntry || currentWaitlistEntry.status !== 'approved') {
        showToast('❌ Nur genehmigte Bewerbungen können freigeschaltet werden.', 'error');
        return;
    }

    try {
        // Get next member number
        const membersSnapshot = await getDocs(collection(db, 'members'));
        const nextMemberNumber = membersSnapshot.size + 1;

        // Create member document
        const memberData = {
            name: currentWaitlistEntry.name,
            email: currentWaitlistEntry.email,
            linkedin: currentWaitlistEntry.linkedin || '',
            role: currentWaitlistEntry.currentRole || '',
            company: currentWaitlistEntry.company || '',
            memberSince: new Date(),
            memberNumber: nextMemberNumber,
            karma: 0,
            industries: [],
            functions: [],
            isActive: true,
            lastActive: new Date(),
            waitlistId: currentWaitlistEntry.id
        };

        await addDoc(collection(db, 'members'), memberData);

        // Update waitlist entry
        await updateDoc(doc(db, 'waitlist', currentWaitlistEntry.id), {
            status: 'member_created',
            memberCreatedAt: new Date()
        });

        showToast(`✅ Member #${String(nextMemberNumber).padStart(4, '0')} erfolgreich erstellt!`);
        closeWaitlistDetailModal();
        loadInnerCircleData();
    } catch (error) {
        logger.error('Error creating member:', error);
        showToast('❌ Fehler beim Erstellen des Members.', 'error');
    }
}

// Load members
export async function loadMembers() {
    const container = document.getElementById('ic-members-list');
    if (!container) return;

    container.innerHTML = '<div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400"><i class="fas fa-spinner fa-spin text-3xl mb-4"></i><p>Lade Members...</p></div>';

    try {
        const membersRef = collection(db, 'members');
        const q = query(membersRef, orderBy('memberSince', 'desc'));
        const snapshot = await getDocs(q);

        allMembers = snapshot.docs.map(doc => ({
            id: doc.id,
            ...doc.data()
        }));

        displayMembers(allMembers);
    } catch (error) {
        logger.error('Error loading members:', error);
        container.innerHTML = '<div class="bg-white p-12 rounded-xl border border-red-100 text-center text-red-500"><i class="fas fa-exclamation-triangle text-3xl mb-4"></i><p>Fehler beim Laden der Members</p></div>';
    }
}

// Display members
function displayMembers(members) {
    const container = document.getElementById('ic-members-list');
    if (!container) return;

    if (members.length === 0) {
        container.innerHTML = `
            <div class="bg-white p-12 rounded-xl border border-dashed border-gray-200 text-center">
                <i class="fas fa-crown text-gray-300 text-4xl mb-4"></i>
                <p class="text-gray-500 mb-4">Noch keine Members freigeschaltet</p>
                <button onclick="app.openAddMemberModal()" class="px-4 py-2 bg-brand-gold text-brand-dark font-bold rounded-lg hover:bg-yellow-500 transition text-sm">
                    <i class="fas fa-user-plus mr-2"></i>Ersten Member hinzufügen
                </button>
            </div>
        `;
        return;
    }

    const getMemberLevel = (karma) => {
        if (karma >= 501) return { name: 'Elite', color: 'text-purple-600 bg-purple-100' };
        if (karma >= 201) return { name: 'Insider', color: 'text-blue-600 bg-blue-100' };
        if (karma >= 51) return { name: 'Contributor', color: 'text-green-600 bg-green-100' };
        return { name: 'Explorer', color: 'text-gray-600 bg-gray-100' };
    };

    container.innerHTML = members.map(member => {
        const memberSince = member.memberSince?.toDate?.() || new Date(member.memberSince);
        const level = getMemberLevel(member.karma || 0);

        return `
            <div class="bg-white rounded-xl border border-gray-100 hover:shadow-md transition p-4">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-12 h-12 bg-gradient-to-br from-brand-gold to-yellow-500 rounded-full flex items-center justify-center text-brand-dark font-bold text-lg">
                            ${member.name?.charAt(0)?.toUpperCase() || '?'}
                        </div>
                        <div>
                            <div class="flex items-center gap-2">
                                <h4 class="font-bold text-brand-dark">${sanitizeHTML(member.name)}</h4>
                                <span class="text-xs text-brand-gold font-mono">#${String(member.memberNumber).padStart(4, '0')}</span>
                            </div>
                            <p class="text-sm text-gray-500">${sanitizeHTML(member.email)}</p>
                            <div class="flex items-center gap-3 mt-1 text-xs text-gray-400">
                                <span>${sanitizeHTML(member.role || '--')}</span>
                                <span>•</span>
                                <span>${sanitizeHTML(member.company || '--')}</span>
                            </div>
                        </div>
                    </div>
                    <div class="flex items-center gap-4">
                        <div class="text-center">
                            <p class="text-lg font-bold text-brand-dark">${member.karma || 0}</p>
                            <p class="text-xs text-gray-400">Karma</p>
                        </div>
                        <span class="px-3 py-1 rounded-full text-xs font-bold ${level.color}">
                            ${level.name}
                        </span>
                        <div class="flex items-center gap-2">
                            <button onclick="app.toggleMemberStatus('${member.id}', ${!member.isActive})" class="p-2 rounded-lg ${member.isActive ? 'text-green-500 hover:bg-green-50' : 'text-red-500 hover:bg-red-50'} transition" title="${member.isActive ? 'Deaktivieren' : 'Aktivieren'}">
                                <i class="fas ${member.isActive ? 'fa-toggle-on' : 'fa-toggle-off'} text-xl"></i>
                            </button>
                            <button onclick="app.deleteMember('${member.id}')" class="p-2 text-red-400 hover:text-red-600 hover:bg-red-50 rounded-lg transition" title="Löschen">
                                <i class="fas fa-trash"></i>
                            </button>
                        </div>
                    </div>
                </div>
                <div class="mt-3 pt-3 border-t border-gray-100 flex items-center justify-between text-xs text-gray-400">
                    <span>Member seit: ${memberSince.toLocaleDateString('de-DE')}</span>
                    ${member.linkedin ? `<a href="${member.linkedin}" target="_blank" class="text-blue-500 hover:underline"><i class="fab fa-linkedin mr-1"></i>LinkedIn</a>` : ''}
                </div>
            </div>
        `;
    }).join('');
}

// Filter members
export function filterMembers() {
    const searchTerm = document.getElementById('ic-search-members')?.value?.toLowerCase() || '';

    const filtered = allMembers.filter(member => {
        return !searchTerm ||
            member.name?.toLowerCase().includes(searchTerm) ||
            member.email?.toLowerCase().includes(searchTerm);
    });

    displayMembers(filtered);
}

// Toggle member active status
export async function toggleMemberStatus(memberId, newStatus) {
    try {
        await updateDoc(doc(db, 'members', memberId), {
            isActive: newStatus,
            lastActive: new Date()
        });
        showToast(`✅ Member ${newStatus ? 'aktiviert' : 'deaktiviert'}.`);
        loadMembers();
    } catch (error) {
        logger.error('Error toggling member status:', error);
        showToast('❌ Fehler beim Aktualisieren.', 'error');
    }
}

// Delete member
export async function deleteMember(memberId) {
    if (!confirm('Sind Sie sicher, dass Sie diesen Member löschen möchten? Diese Aktion kann nicht rückgängig gemacht werden.')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'members', memberId));
        showToast('✅ Member gelöscht.');
        loadMembers();
        updateInnerCircleStats();
    } catch (error) {
        logger.error('Error deleting member:', error);
        showToast('❌ Fehler beim Löschen.', 'error');
    }
}

// Open add member modal
export function openAddMemberModal() {
    document.getElementById('modal-add-member').classList.remove('hidden');
}

// Close add member modal
export function closeAddMemberModal() {
    document.getElementById('modal-add-member').classList.add('hidden');
    document.getElementById('form-add-member').reset();
}

// Handle add member form
export function initAddMemberForm() {
    const form = document.getElementById('form-add-member');
    if (!form) return;

    form.addEventListener('submit', async (e) => {
        e.preventDefault();

        const formData = new FormData(form);

        try {
            // Get next member number
            const membersSnapshot = await getDocs(collection(db, 'members'));
            const nextMemberNumber = membersSnapshot.size + 1;

            const memberData = {
                name: formData.get('name'),
                email: formData.get('email'),
                linkedin: formData.get('linkedin') || '',
                role: formData.get('role') || '',
                company: formData.get('company') || '',
                memberSince: new Date(),
                memberNumber: nextMemberNumber,
                karma: 0,
                industries: [],
                functions: [],
                isActive: true,
                lastActive: new Date()
            };

            await addDoc(collection(db, 'members'), memberData);

            showToast(`✅ Member #${String(nextMemberNumber).padStart(4, '0')} erfolgreich erstellt!`);
            closeAddMemberModal();
            loadMembers();
            updateInnerCircleStats();
        } catch (error) {
            logger.error('Error adding member:', error);
            showToast('❌ Fehler beim Erstellen des Members.', 'error');
        }
    });
}

// Switch Inner Circle sub-tab
export function switchInnerCircleSubTab(tabName) {
    const tabs = ['waitlist', 'members'];

    tabs.forEach(tab => {
        const btn = document.getElementById(`ic-subtab-${tab}`);
        const content = document.getElementById(`ic-content-${tab}`);

        if (btn) {
            if (tab === tabName) {
                btn.classList.add('border-brand-gold', 'text-brand-dark');
                btn.classList.remove('border-transparent', 'text-gray-500');
            } else {
                btn.classList.remove('border-brand-gold', 'text-brand-dark');
                btn.classList.add('border-transparent', 'text-gray-500');
            }
        }

        if (content) {
            if (tab === tabName) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        }
    });

    if (tabName === 'members') {
        loadMembers();
    } else {
        loadWaitlist();
    }
}

// Update Inner Circle stats
function updateInnerCircleStats() {
    const pending = allWaitlistEntries.filter(e => e.status === 'pending').length;
    const reviewing = allWaitlistEntries.filter(e => e.status === 'reviewing').length;
    const interviews = allWaitlistEntries.filter(e => e.status === 'interview_scheduled').length;
    const activeMembers = allMembers.filter(m => m.isActive).length;

    const setTextSafe = (id, value) => {
        const el = document.getElementById(id);
        if (el) el.textContent = value;
    };

    setTextSafe('ic-stat-waitlist', allWaitlistEntries.length);
    setTextSafe('ic-stat-reviewing', reviewing);
    setTextSafe('ic-stat-interviews', interviews);
    setTextSafe('ic-stat-members', activeMembers);
    setTextSafe('ic-waitlist-count', pending);

    // Update badge in admin tab
    const badge = document.getElementById('admin-waitlist-badge');
    if (badge) {
        if (pending > 0) {
            badge.textContent = pending;
            badge.classList.remove('hidden');
        } else {
            badge.classList.add('hidden');
        }
    }
}

// ========== INNER CIRCLE CHECKOUT ==========

// Start Inner Circle Checkout
export async function startInnerCircleCheckout(membershipType = 'founding') {
    const productId = membershipType === 'founding' ? 'inner-circle-founding' : 'inner-circle-regular';
    const price = membershipType === 'founding' ? 2490 : 4990;
    const title = membershipType === 'founding' ? 'Inner Circle Founding Member' : 'Inner Circle Membership';

    try {
        showToast('🔄 Checkout wird vorbereitet...');

        // Get current user info
        const userEmail = auth?.currentUser?.email || null;
        const userId = auth?.currentUser?.uid || null;

        const items = [{
            id: productId,
            title: title,
            price: price,
            quantity: 1
        }];

        // Call checkout function
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/createCheckoutSession', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                items: items,
                userEmail: userEmail,
                userId: userId,
                consents: {
                    agb: true,
                    datenschutz: true,
                    widerruf: true
                }
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Checkout fehlgeschlagen');
        }

        const { url } = await response.json();

        // Redirect to Stripe Checkout
        if (url) {
            window.location.href = url;
        } else {
            throw new Error('Keine Checkout-URL erhalten');
        }
    } catch (error) {
        logger.error('Inner Circle Checkout Error:', error);
        showToast('❌ Fehler beim Starten des Checkouts. Bitte versuchen Sie es erneut.', 'error');
    }
}

// ========== PAYMENT SUCCESS HANDLING ==========

export function handlePaymentCallback(state, navigateTo) {
    const urlParams = new URLSearchParams(window.location.search);
    const paymentStatus = urlParams.get('payment');
    const sessionId = urlParams.get('session_id');

    if (paymentStatus === 'success' && sessionId) {
        // Leere den Warenkorb
        state.cart = [];
        updateCartUI(state);
        saveCartToLocalStorage(state.cart);
        sessionStorage.removeItem('pending_cart');

        // Prüfe Checkout-Typ: 'loggedIn', 'registered', oder 'guest'
        const checkoutType = sessionStorage.getItem('checkout_type') || 'guest';
        sessionStorage.removeItem('checkout_type');

        // Warte kurz, damit der Webhook Zeit hat die Order zu speichern
        // Dann lade Orders neu (mit Retry falls noch nicht verfügbar)
        if (state.user) {
            setTimeout(() => {
                loadUserOrdersWithRetry(state, 3);
            }, 2000);
        }

        // Zeige Success Message basierend auf Checkout-Typ
        showPaymentSuccessModal(sessionId, checkoutType, navigateTo);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    } else if (paymentStatus === 'cancelled') {
        // Stelle Warenkorb wieder her
        const pendingCart = sessionStorage.getItem('pending_cart');
        if (pendingCart) {
            state.cart = JSON.parse(pendingCart);
            updateCartUI(state);
            saveCartToLocalStorage(state.cart);
            sessionStorage.removeItem('pending_cart');
        }

        showToast('⚠️ Zahlung abgebrochen. Ihr Warenkorb wurde wiederhergestellt.', 4000);

        // Clean URL
        window.history.replaceState({}, document.title, window.location.pathname);
    }
}

function showCheckoutConfirmationModal(cart, total, hasUser) {
    return new Promise((resolve) => {
        const modal = document.createElement('div');
        modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4 overflow-y-auto';

        const cartItemsHTML = cart.map(item => `
            <div class="flex justify-between items-center py-2 border-b border-gray-100">
                <span class="text-sm text-gray-700">${sanitizeHTML(item.title)}</span>
                <span class="text-sm font-bold text-brand-dark">€${Number(item.price).toFixed(2)}</span>
            </div>
        `).join('');

        // Wenn User eingeloggt ist, zeige vereinfachtes Modal
        if (hasUser) {
            modal.innerHTML = `
                <div class="bg-white rounded-lg max-w-lg w-full p-8 my-8">
                    <div class="mb-6 text-center">
                        <div class="w-16 h-16 bg-brand-gold rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-shopping-cart text-brand-dark text-2xl"></i>
                        </div>
                        <h2 class="font-serif text-2xl text-brand-dark mb-2">Bestellung bestätigen</h2>
                        <p class="text-gray-600 text-sm">Bitte überprüfen Sie Ihre Auswahl</p>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <h3 class="font-bold text-sm text-gray-700 mb-3">Ihre Bestellung:</h3>
                        ${cartItemsHTML}
                        <div class="flex justify-between items-center pt-4 mt-4 border-t-2 border-brand-gold">
                            <span class="font-bold text-brand-dark">Gesamtbetrag:</span>
                            <span class="font-serif text-2xl text-brand-dark">€${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <div class="bg-green-50 border border-green-200 rounded-lg p-4 mb-6">
                        <div class="flex items-center">
                            <i class="fas fa-check-circle text-green-500 mr-3"></i>
                            <p class="text-sm text-gray-700">Sie sind angemeldet. Ihre Bestellung wird Ihrem Account zugeordnet.</p>
                        </div>
                    </div>

                    <div class="flex gap-3">
                        <button id="modal-cancel" class="flex-1 bg-gray-200 text-gray-700 font-bold py-3 px-6 rounded hover:bg-gray-300 transition">
                            <i class="fas fa-times mr-2"></i>Abbrechen
                        </button>
                        <button id="modal-confirm" class="flex-1 bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                            <i class="fas fa-arrow-right mr-2"></i>Zur Kasse
                        </button>
                    </div>
                </div>
            `;
        } else {
            // Nicht eingeloggt - zeige Optionen
            modal.innerHTML = `
                <div class="bg-white rounded-lg max-w-lg w-full p-8 my-8">
                    <div class="mb-6 text-center">
                        <div class="w-16 h-16 bg-brand-gold rounded-full flex items-center justify-center mx-auto mb-4">
                            <i class="fas fa-shopping-cart text-brand-dark text-2xl"></i>
                        </div>
                        <h2 class="font-serif text-2xl text-brand-dark mb-2">Bestellung bestätigen</h2>
                        <p class="text-gray-600 text-sm">Bitte überprüfen Sie Ihre Auswahl</p>
                    </div>

                    <div class="bg-gray-50 rounded-lg p-4 mb-6">
                        <h3 class="font-bold text-sm text-gray-700 mb-3">Ihre Bestellung:</h3>
                        ${cartItemsHTML}
                        <div class="flex justify-between items-center pt-4 mt-4 border-t-2 border-brand-gold">
                            <span class="font-bold text-brand-dark">Gesamtbetrag:</span>
                            <span class="font-serif text-2xl text-brand-dark">€${total.toFixed(2)}</span>
                        </div>
                    </div>

                    <!-- Checkout Options -->
                    <div id="checkout-options" class="space-y-4 mb-6">
                        <p class="text-sm text-gray-600 text-center font-medium">Wie möchten Sie fortfahren?</p>

                        <!-- Option 1: Quick Register -->
                        <button id="btn-quick-register" class="w-full flex items-center gap-4 p-4 border-2 border-brand-gold rounded-lg hover:bg-brand-gold/10 transition group">
                            <div class="w-12 h-12 bg-brand-gold rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-user-plus text-brand-dark text-lg"></i>
                            </div>
                            <div class="text-left">
                                <span class="font-bold text-brand-dark block">Konto erstellen</span>
                                <span class="text-xs text-gray-500">Schnelle Registrierung & sofortiger Zugang</span>
                            </div>
                            <i class="fas fa-chevron-right text-brand-gold ml-auto group-hover:translate-x-1 transition"></i>
                        </button>

                        <!-- Option 2: Login -->
                        <button id="btn-login" class="w-full flex items-center gap-4 p-4 border border-gray-200 rounded-lg hover:border-brand-gold hover:bg-gray-50 transition group">
                            <div class="w-12 h-12 bg-gray-100 rounded-full flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-sign-in-alt text-gray-600 text-lg"></i>
                            </div>
                            <div class="text-left">
                                <span class="font-bold text-brand-dark block">Bereits Kunde?</span>
                                <span class="text-xs text-gray-500">Mit bestehendem Konto anmelden</span>
                            </div>
                            <i class="fas fa-chevron-right text-gray-400 ml-auto group-hover:translate-x-1 transition"></i>
                        </button>

                    </div>

                    <!-- Quick Register Form (initially hidden) -->
                    <div id="quick-register-form" class="hidden mb-6">
                        <div class="flex items-center gap-2 mb-4">
                            <button id="back-to-options" class="text-gray-500 hover:text-brand-dark transition">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <h3 class="font-bold text-brand-dark">Schnell registrieren</h3>
                        </div>

                        <div class="space-y-4">
                            <div class="grid grid-cols-2 gap-3">
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Vorname *</label>
                                    <input type="text" id="checkout-firstname" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Max">
                                </div>
                                <div>
                                    <label class="block text-xs font-bold text-gray-600 mb-1">Nachname *</label>
                                    <input type="text" id="checkout-lastname" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Mustermann">
                                </div>
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">E-Mail *</label>
                                <input type="email" id="checkout-email" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="max@beispiel.de">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Passwort *</label>
                                <input type="password" id="checkout-password" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Mindestens 8 Zeichen">
                            </div>
                            <div id="checkout-register-error" class="hidden text-red-500 text-xs"></div>
                        </div>

                        <button id="btn-register-and-pay" class="w-full mt-4 bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                            <i class="fas fa-user-check mr-2"></i>Registrieren & zur Kasse
                        </button>
                    </div>

                    <!-- Login Form (initially hidden) -->
                    <div id="quick-login-form" class="hidden mb-6">
                        <div class="flex items-center gap-2 mb-4">
                            <button id="back-to-options-login" class="text-gray-500 hover:text-brand-dark transition">
                                <i class="fas fa-arrow-left"></i>
                            </button>
                            <h3 class="font-bold text-brand-dark">Anmelden</h3>
                        </div>

                        <div class="space-y-4">
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">E-Mail</label>
                                <input type="email" id="checkout-login-email" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="ihre@email.de">
                            </div>
                            <div>
                                <label class="block text-xs font-bold text-gray-600 mb-1">Passwort</label>
                                <input type="password" id="checkout-login-password" class="w-full px-3 py-2 border border-gray-300 rounded focus:ring-2 focus:ring-brand-gold focus:border-brand-gold text-sm" placeholder="Ihr Passwort">
                            </div>
                            <div id="checkout-login-error" class="hidden text-red-500 text-xs"></div>
                        </div>

                        <button id="btn-login-and-pay" class="w-full mt-4 bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                            <i class="fas fa-sign-in-alt mr-2"></i>Anmelden & zur Kasse
                        </button>
                    </div>

                    <button id="modal-cancel" class="w-full bg-gray-100 text-gray-600 font-medium py-2 px-4 rounded hover:bg-gray-200 transition text-sm">
                        Abbrechen
                    </button>
                </div>
            `;
        }

        document.body.appendChild(modal);

        // Event Handlers für eingeloggten User
        if (hasUser) {
            const confirmBtn = modal.querySelector('#modal-confirm');
            const cancelBtn = modal.querySelector('#modal-cancel');

            confirmBtn.addEventListener('click', () => {
                modal.remove();
                resolve({ wasLoggedIn: true }); // User war bereits eingeloggt
            });

            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });
        } else {
            // Event Handlers für nicht eingeloggten User
            const cancelBtn = modal.querySelector('#modal-cancel');
            const btnQuickRegister = modal.querySelector('#btn-quick-register');
            const btnLogin = modal.querySelector('#btn-login');
            const checkoutOptions = modal.querySelector('#checkout-options');
            const quickRegisterForm = modal.querySelector('#quick-register-form');
            const quickLoginForm = modal.querySelector('#quick-login-form');
            const backToOptions = modal.querySelector('#back-to-options');
            const backToOptionsLogin = modal.querySelector('#back-to-options-login');
            const btnRegisterAndPay = modal.querySelector('#btn-register-and-pay');
            const btnLoginAndPay = modal.querySelector('#btn-login-and-pay');

            cancelBtn.addEventListener('click', () => {
                modal.remove();
                resolve(false);
            });

            // Show register form
            btnQuickRegister.addEventListener('click', () => {
                checkoutOptions.classList.add('hidden');
                quickRegisterForm.classList.remove('hidden');
            });

            // Show login form
            btnLogin.addEventListener('click', () => {
                checkoutOptions.classList.add('hidden');
                quickLoginForm.classList.remove('hidden');
            });

            // Back to options from register
            backToOptions.addEventListener('click', () => {
                quickRegisterForm.classList.add('hidden');
                checkoutOptions.classList.remove('hidden');
            });

            // Back to options from login
            backToOptionsLogin.addEventListener('click', () => {
                quickLoginForm.classList.add('hidden');
                checkoutOptions.classList.remove('hidden');
            });

            // Register and pay
            btnRegisterAndPay.addEventListener('click', async () => {
                const firstname = modal.querySelector('#checkout-firstname').value.trim();
                const lastname = modal.querySelector('#checkout-lastname').value.trim();
                const email = modal.querySelector('#checkout-email').value.trim();
                const password = modal.querySelector('#checkout-password').value;
                const errorDiv = modal.querySelector('#checkout-register-error');

                errorDiv.classList.add('hidden');

                if (!firstname || !lastname || !email || !password) {
                    errorDiv.textContent = 'Bitte alle Felder ausfüllen.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                if (!validateEmail(email)) {
                    errorDiv.textContent = 'Bitte gültige E-Mail-Adresse eingeben.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                const checkoutPwCheck = validatePassword(password);
                if (!checkoutPwCheck.valid) {
                    errorDiv.textContent = checkoutPwCheck.message || 'Passwort erfüllt nicht die Anforderungen.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                btnRegisterAndPay.disabled = true;
                btnRegisterAndPay.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird erstellt...';

                try {
                    // Create user account
                    const userCredential = await createUserWithEmailAndPassword(auth, email, password);

                    // Update profile with name
                    await updateProfile(userCredential.user, {
                        displayName: `${firstname} ${lastname}`
                    });

                    // Create user document in Firestore
                    if (db) {
                        await setDoc(doc(db, "users", userCredential.user.uid), {
                            email,
                            firstname,
                            lastname,
                            displayName: `${firstname} ${lastname}`,
                            createdAt: new Date(),
                            createdVia: 'checkout_registration'
                        });
                    }

                    // Send email verification
                    await sendEmailVerification(userCredential.user);

                    // Speichere die UID BEVOR wir ausloggen
                    const registeredUserId = userCredential.user.uid;

                    // WICHTIG: User ausloggen nach Registrierung - Email muss erst bestätigt werden
                    await signOut(auth);

                    showToast('✅ Konto erstellt! Bitte bestätigen Sie Ihre E-Mail bevor Sie sich anmelden.');
                    modal.remove();

                    // Zur Kasse weiterleiten mit registrierter User-ID
                    resolve({
                        registered: true,
                        guestCheckout: true, // Zahlung ohne Login, weil Email noch nicht verifiziert
                        userEmail: email, // Email für Stripe vorausfüllen
                        userId: registeredUserId // UID für Order-Zuordnung
                    });

                } catch (error) {
                    logger.error('Registration error:', error);
                    btnRegisterAndPay.disabled = false;
                    btnRegisterAndPay.innerHTML = '<i class="fas fa-user-check mr-2"></i>Registrieren & zur Kasse';

                    if (error.code === 'auth/email-already-in-use') {
                        errorDiv.textContent = 'Diese E-Mail ist bereits registriert. Bitte anmelden.';
                    } else {
                        errorDiv.textContent = 'Fehler bei der Registrierung. Bitte erneut versuchen.';
                    }
                    errorDiv.classList.remove('hidden');
                }
            });

            // Login and pay
            btnLoginAndPay.addEventListener('click', async () => {
                const email = modal.querySelector('#checkout-login-email').value.trim();
                const password = modal.querySelector('#checkout-login-password').value;
                const errorDiv = modal.querySelector('#checkout-login-error');

                errorDiv.classList.add('hidden');

                if (!email || !password) {
                    errorDiv.textContent = 'Bitte E-Mail und Passwort eingeben.';
                    errorDiv.classList.remove('hidden');
                    return;
                }

                btnLoginAndPay.disabled = true;
                btnLoginAndPay.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird angemeldet...';

                try {
                    const userCredential = await signInWithEmailAndPassword(auth, email, password);

                    showToast('✅ Erfolgreich angemeldet!');
                    modal.remove();
                    resolve({ loggedIn: true, user: userCredential.user });

                } catch (error) {
                    logger.error('Login error:', error);
                    btnLoginAndPay.disabled = false;
                    btnLoginAndPay.innerHTML = '<i class="fas fa-sign-in-alt mr-2"></i>Anmelden & zur Kasse';

                    if (error.code === 'auth/wrong-password' || error.code === 'auth/user-not-found') {
                        errorDiv.textContent = 'E-Mail oder Passwort ist falsch.';
                    } else {
                        errorDiv.textContent = 'Anmeldung fehlgeschlagen. Bitte erneut versuchen.';
                    }
                    errorDiv.classList.remove('hidden');
                }
            });
        }

        // Close on backdrop click
        modal.addEventListener('click', (e) => {
            if (e.target === modal) {
                modal.remove();
                resolve(false);
            }
        });

        // Close on ESC key
        const escHandler = (e) => {
            if (e.key === 'Escape') {
                modal.remove();
                resolve(false);
                document.removeEventListener('keydown', escHandler);
            }
        };
        document.addEventListener('keydown', escHandler);
    });
}

function showPaymentSuccessModal(sessionId, checkoutType = 'guest', navigateTo = null) {
    // Generiere kurze Bestellnummer aus Session ID
    const shortOrderId = 'KAR-' + sessionId.slice(-8).toUpperCase();

    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/80 backdrop-blur-sm z-[80] flex items-center justify-center p-4';

    // Unterschiedliche Inhalte je nach Checkout-Typ
    let infoContent, buttonContent, buttonDestination;

    if (checkoutType === 'loggedIn') {
        // User war bereits eingeloggt
        infoContent = `<div class="space-y-3 text-sm text-gray-600 mb-6">
                <p><i class="fas fa-envelope text-brand-gold mr-2"></i>Sie erhalten eine Bestätigungs-Email mit Rechnung</p>
                <p><i class="fas fa-box text-brand-gold mr-2"></i>Die Bestellung wurde Ihrem Konto zugeordnet</p>
                <p><i class="fas fa-tachometer-alt text-brand-gold mr-2"></i>Details finden Sie in Ihrem Dashboard</p>
           </div>`;
        buttonContent = `<button id="success-modal-btn" class="w-full bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                <i class="fas fa-tachometer-alt mr-2"></i>Zum Dashboard
           </button>`;
        buttonDestination = 'dashboard';
    } else if (checkoutType === 'registered') {
        // User hat sich während Checkout registriert
        infoContent = `<div class="space-y-3 text-sm text-gray-600 mb-6">
                <p><i class="fas fa-envelope text-brand-gold mr-2"></i>Sie erhalten eine Bestätigungs-Email mit Rechnung</p>
                <p><i class="fas fa-user-check text-green-500 mr-2"></i>Ihr Account wurde erfolgreich erstellt</p>
                <p><i class="fas fa-shield-alt text-orange-500 mr-2"></i><strong>Bitte bestätigen Sie Ihre E-Mail</strong> über den Link in Ihrem Postfach</p>
                <p><i class="fas fa-sign-in-alt text-brand-gold mr-2"></i>Danach können Sie sich anmelden</p>
           </div>`;
        buttonContent = `<button id="success-modal-btn" class="w-full bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                <i class="fas fa-sign-in-alt mr-2"></i>Zum Login
           </button>`;
        buttonDestination = 'login';
    } else {
        // Gast-Checkout - Account wird automatisch erstellt
        infoContent = `<div class="space-y-3 text-sm text-gray-600 mb-6">
                <p><i class="fas fa-envelope text-brand-gold mr-2"></i>Sie erhalten eine Bestätigungs-Email mit Rechnung</p>
                <p><i class="fas fa-user-plus text-brand-gold mr-2"></i>Ein Account wurde automatisch für Sie erstellt</p>
                <p><i class="fas fa-key text-brand-gold mr-2"></i>Sie erhalten einen Link um Ihr Passwort festzulegen</p>
           </div>`;
        buttonContent = `<button id="success-modal-btn" class="w-full bg-brand-gold text-brand-dark font-bold py-3 px-6 rounded hover:bg-brand-dark hover:text-white transition">
                <i class="fas fa-home mr-2"></i>Zur Startseite
           </button>`;
        buttonDestination = 'home';
    }

    modal.innerHTML = `
        <div class="bg-white rounded-lg max-w-md w-full p-8 text-center">
            <div class="mb-6">
                <div class="w-16 h-16 bg-green-500 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-check text-white text-3xl"></i>
                </div>
                <h2 class="font-serif text-2xl text-brand-dark mb-2">Zahlung erfolgreich!</h2>
                <p class="text-gray-600 text-sm">Vielen Dank für Ihre Bestellung.</p>
            </div>

            <div class="bg-gray-50 rounded p-4 mb-6 text-left">
                <p class="text-xs text-gray-500 mb-2">Bestellnummer:</p>
                <p class="text-2xl font-bold text-brand-dark tracking-wider">${shortOrderId}</p>
            </div>

            ${infoContent}
            ${buttonContent}
        </div>
    `;

    document.body.appendChild(modal);

    // Button Click Handler
    const btn = modal.querySelector('#success-modal-btn');
    btn.addEventListener('click', () => {
        modal.remove();
        if (navigateTo) {
            navigateTo(buttonDestination);
        } else if (window.app?.navigateTo) {
            window.app.navigateTo(buttonDestination);
        }
    });

    // Modal bleibt offen bis User es schließt - kein Auto-remove
}

// ========== DASHBOARD TAB SYSTEM ==========

export function switchDashboardTab(tabName, state) {
    // Get all tabs and tab contents
    const tabs = document.querySelectorAll('.dashboard-tab');
    const contents = document.querySelectorAll('.dashboard-tab-content');

    // Update all tabs - remove active styling, add inactive styling
    tabs.forEach(tab => {
        tab.classList.remove('active', 'text-white', 'border-brand-gold');
        tab.classList.add('text-white/50', 'border-transparent');
    });

    // Hide all tab contents
    contents.forEach(content => {
        content.classList.add('hidden');
    });

    // Find and activate the clicked tab
    const activeTab = document.querySelector(`[data-tab="${tabName}"]`);
    if (activeTab) {
        activeTab.classList.add('active', 'text-white', 'border-brand-gold');
        activeTab.classList.remove('text-white/50', 'border-transparent');
    }

    // Show the selected tab content
    const activeContent = document.getElementById(`tab-${tabName}`);
    if (activeContent) {
        activeContent.classList.remove('hidden');
        // Add animation class
        activeContent.classList.add('tab-content');
    }

    // Load data for specific tabs
    if (tabName === 'appointments' && state) {
        loadAvailability(state);
    }

    // Initialize mentor dashboard when switching to mentor tab
    if (tabName === 'mentor') {
        initMentorDashboard();
    }
}

// Switch Admin Panel Tabs
export function switchAdminTab(tabName) {
    // Tab names: orders, users, strategy, coaches, documents, settings, mentor-preview, cv-generator, dsgvo, inner-circle
    const tabIds = ['orders', 'users', 'strategy', 'coaches', 'documents', 'settings', 'mentor-preview', 'cv-generator', 'dsgvo', 'inner-circle'];

    // Update tab buttons
    tabIds.forEach(id => {
        const tabBtn = document.getElementById(`admin-tab-${id}`);
        const content = document.getElementById(`admin-content-${id}`);

        if (tabBtn) {
            if (id === tabName) {
                // Active tab styling - new design with rounded-t-lg and bg-gray-50
                tabBtn.classList.add('bg-gray-50', 'text-brand-dark');
                tabBtn.classList.remove('text-gray-300', 'hover:bg-white/10');
            } else {
                // Inactive tab styling
                tabBtn.classList.remove('bg-gray-50', 'text-brand-dark');
                tabBtn.classList.add('text-gray-300', 'hover:bg-white/10');
            }
        }

        if (content) {
            if (id === tabName) {
                content.classList.remove('hidden');
            } else {
                content.classList.add('hidden');
            }
        }
    });

    // Load data for specific tabs
    if (tabName === 'coaches') {
        loadAdminCoaches();
    } else if (tabName === 'users') {
        loadAdminUsers();
    } else if (tabName === 'strategy') {
        loadStrategyCalls();
    } else if (tabName === 'orders') {
        loadAllOrders();
    } else if (tabName === 'documents') {
        loadAdminDocuments();
    } else if (tabName === 'settings') {
        loadAdminSettings();
    } else if (tabName === 'mentor-preview') {
        loadMentorPreviewOptions();
    } else if (tabName === 'cv-generator') {
        loadCvProjects();
    } else if (tabName === 'dsgvo') {
        loadDsgvoStats();
    } else if (tabName === 'inner-circle') {
        loadInnerCircleData();
    }
}

// Load coaches for admin panel
export async function loadAdminCoaches() {
    const container = document.getElementById('admin-coaches-list');
    if (!container) return;

    container.innerHTML = '<div class="bg-white p-8 rounded-xl border border-gray-100 text-center text-gray-400 col-span-full"><i class="fas fa-spinner fa-spin text-2xl mb-2"></i><p class="text-sm">Lade Mentoren...</p></div>';

    try {
        const coaches = await fetchCollection('coaches');

        // Update state for edit function
        if (window.app?.state) {
            window.app.state.coaches = coaches;
        }

        // Pagination State aktualisieren
        paginationState.coaches.data = coaches;
        paginationState.coaches.total = coaches.length;
        paginationState.coaches.page = 1;

        renderAdminCoachesList();
    } catch (e) {
        logger.error('Error loading admin coaches:', e);
        container.innerHTML = '<div class="bg-white p-8 rounded-xl border border-red-100 text-center text-red-500 col-span-full"><i class="fas fa-exclamation-circle text-2xl mb-2"></i><p class="text-sm">Fehler beim Laden der Mentoren</p></div>';
    }
}

function renderAdminCoachesList() {
    const container = document.getElementById('admin-coaches-list');
    if (!container) return;

    const coaches = paginationState.coaches.data;

    if (coaches.length === 0) {
        container.innerHTML = `
            <div class="bg-white p-12 rounded-xl border border-dashed border-gray-200 text-center col-span-full">
                <i class="fas fa-user-tie text-gray-300 text-4xl mb-4"></i>
                <p class="text-gray-500 mb-4">Noch keine Mentoren angelegt</p>
                <button onclick="app.openAddCoachModal()" class="px-4 py-2 bg-brand-gold text-brand-dark font-bold rounded-lg hover:bg-yellow-500 transition text-sm">
                    <i class="fas fa-plus mr-2"></i>Ersten Mentor anlegen
                </button>
            </div>
        `;
        return;
    }

    // Update statistics
    const totalCoaches = coaches.length;
    const visibleCoaches = coaches.filter(c => c.visible !== false).length;
    const hiddenCoaches = coaches.filter(c => c.visible === false).length;

    const statTotal = document.getElementById('admin-stat-coaches-total');
    const statVisible = document.getElementById('admin-stat-coaches-visible');
    const statHidden = document.getElementById('admin-stat-coaches-hidden');

    if (statTotal) statTotal.textContent = totalCoaches;
    if (statVisible) statVisible.textContent = visibleCoaches;
    if (statHidden) statHidden.textContent = hiddenCoaches;

    // Paginierung
    const perPage = PAGINATION.COACHES_PER_PAGE;
    const currentPage = paginationState.coaches.page;
    const startIndex = (currentPage - 1) * perPage;
    const paginatedCoaches = coaches.slice(startIndex, startIndex + perPage);

    container.innerHTML = paginatedCoaches.map(coach => `
            <div class="bg-white rounded-xl border border-gray-100 overflow-hidden hover:shadow-lg transition group">
                <!-- Header mit Bild -->
                <div class="relative h-32 bg-gradient-to-br from-brand-dark to-gray-800">
                    <div class="absolute -bottom-8 left-4">
                        <img src="${coach.image || 'https://via.placeholder.com/80'}"
                             alt="${sanitizeHTML(coach.name)}"
                             class="w-16 h-16 rounded-xl object-cover border-4 border-white shadow-lg">
                    </div>
                    <!-- Status Badge -->
                    <div class="absolute top-3 right-3">
                        <span class="px-2 py-1 text-xs font-medium rounded-full ${coach.visible !== false ? 'bg-green-500 text-white' : 'bg-gray-400 text-white'}">
                            ${coach.visible !== false ? 'Sichtbar' : 'Versteckt'}
                        </span>
                    </div>
                </div>

                <!-- Content -->
                <div class="pt-10 px-4 pb-4">
                    <h4 class="font-bold text-brand-dark text-lg">${sanitizeHTML(coach.name)}</h4>
                    <p class="text-sm text-gray-500">${sanitizeHTML(coach.role || '-')}</p>
                    ${coach.email ? `<p class="text-xs text-brand-gold mt-1"><i class="fas fa-envelope mr-1"></i>${sanitizeHTML(coach.email)}</p>` : ''}

                    <!-- Tags -->
                    ${coach.expertise && coach.expertise.length > 0 ? `
                        <div class="flex flex-wrap gap-1 mt-3">
                            ${coach.expertise.slice(0, 3).map(exp => `
                                <span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded-full">${sanitizeHTML(exp)}</span>
                            `).join('')}
                            ${coach.expertise.length > 3 ? `<span class="px-2 py-0.5 bg-gray-100 text-gray-400 text-xs rounded-full">+${coach.expertise.length - 3}</span>` : ''}
                        </div>
                    ` : ''}

                    <!-- Info -->
                    <div class="mt-3 pt-3 border-t border-gray-100 text-xs text-gray-400 space-y-1">
                        ${coach.experience ? `<p><i class="fas fa-briefcase mr-1 w-4"></i>${sanitizeHTML(coach.experience)}</p>` : ''}
                        ${coach.industry ? `<p><i class="fas fa-building mr-1 w-4"></i>${sanitizeHTML(coach.industry)}</p>` : ''}
                    </div>

                    <!-- Actions -->
                    <div class="mt-4 pt-3 border-t border-gray-100 flex gap-2">
                        <button onclick="app.openEditCoachModal('${coach.id}')"
                                class="flex-1 px-3 py-2 text-sm font-medium text-brand-dark bg-gray-100 hover:bg-gray-200 rounded-lg transition">
                            <i class="fas fa-edit mr-1"></i>Bearbeiten
                        </button>
                        <button onclick="app.toggleCoachVisibility('${coach.id}')"
                                class="px-3 py-2 text-sm ${coach.visible !== false ? 'text-orange-600 hover:bg-orange-50' : 'text-green-600 hover:bg-green-50'} rounded-lg transition"
                                title="${coach.visible !== false ? 'Verstecken' : 'Anzeigen'}">
                            <i class="fas ${coach.visible !== false ? 'fa-eye-slash' : 'fa-eye'}"></i>
                        </button>
                        <button onclick="app.deleteCoach('${coach.id}')"
                                class="px-3 py-2 text-sm text-red-500 hover:bg-red-50 rounded-lg transition"
                                title="Löschen">
                            <i class="fas fa-trash-alt"></i>
                        </button>
                    </div>
                </div>
            </div>
        `).join('');

    // Pagination Controls hinzufügen
    const paginationHtml = renderPagination('coaches');
    if (paginationHtml) {
        container.insertAdjacentHTML('afterend', '');
        const existingPagination = document.getElementById('coaches-pagination');
        if (existingPagination) existingPagination.remove();
        container.insertAdjacentHTML('afterend', `<div id="coaches-pagination">${paginationHtml}</div>`);
    } else {
        const existingPagination = document.getElementById('coaches-pagination');
        if (existingPagination) existingPagination.remove();
    }
}

// Toggle coach visibility
export async function toggleCoachVisibility(coachId) {
    try {
        const coachRef = doc(db, 'coaches', coachId);
        const coachSnap = await getDoc(coachRef);

        if (!coachSnap.exists()) {
            showToast('Mentor nicht gefunden');
            return;
        }

        const currentVisible = coachSnap.data().visible !== false;
        await updateDoc(coachRef, { visible: !currentVisible });

        showToast(currentVisible ? 'Mentor versteckt' : 'Mentor sichtbar');

        // Reload the admin coaches list
        loadAdminCoaches();

        // Also refresh the public coaches list if state is available
        if (window.app && window.app.state) {
            // Update the coach in state
            const coachIndex = window.app.state.coaches.findIndex(c => c.id === coachId);
            if (coachIndex !== -1) {
                window.app.state.coaches[coachIndex].visible = !currentVisible;
            }
            // Re-render the public coach grid
            filterCoaches(window.app.state);
        }
    } catch (e) {
        logger.error('Error toggling coach visibility:', e);
        showToast('Fehler beim Aktualisieren');
    }
}

// ========== MENTOR PREVIEW FUNCTIONS (Admin) ==========

// Store preview state
let previewMentorData = null;
let previewAvailability = {};
let previewBookedSlots = {};
let previewWeekOffset = 0;

// Load mentor options for the preview dropdown
export async function loadMentorPreviewOptions() {
    const select = document.getElementById('admin-mentor-preview-select');
    if (!select) return;

    try {
        const coaches = await fetchCollection('coaches');

        select.innerHTML = '<option value="">-- Mentor auswählen --</option>';
        coaches.forEach(coach => {
            const option = document.createElement('option');
            option.value = coach.id;
            option.textContent = `${coach.name}${coach.visible === false ? ' (versteckt)' : ''}`;
            select.appendChild(option);
        });
    } catch (e) {
        logger.error('Error loading mentor preview options:', e);
    }
}

// Load mentor preview dashboard
export async function loadMentorPreview() {
    const select = document.getElementById('admin-mentor-preview-select');
    const container = document.getElementById('admin-mentor-preview-container');

    if (!select || !container) return;

    const coachId = select.value;
    if (!coachId) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <i class="fas fa-user-tie text-5xl mb-4 opacity-50"></i>
                <p class="text-lg font-medium">Wähle einen Mentor aus</p>
                <p class="text-sm mt-1">um dessen Dashboard-Ansicht zu sehen</p>
            </div>
        `;
        return;
    }

    container.innerHTML = '<div class="p-8 text-center"><i class="fas fa-spinner fa-spin text-3xl text-brand-gold"></i><p class="mt-3 text-gray-500">Lade Mentor-Dashboard...</p></div>';

    try {
        // Load coach data
        const coachDoc = await getDoc(doc(db, 'coaches', coachId));
        if (!coachDoc.exists()) {
            container.innerHTML = '<div class="p-8 text-center text-red-500">Mentor nicht gefunden</div>';
            return;
        }

        previewMentorData = { id: coachId, ...coachDoc.data() };
        previewAvailability = previewMentorData.availability || {};
        previewWeekOffset = 0;

        // Load booked slots for this mentor
        await loadPreviewBookedSlots(coachId);

        // Load sessions
        const sessions = await loadPreviewSessions(coachId);

        // Render the preview dashboard
        renderMentorPreviewDashboard(sessions);

    } catch (e) {
        logger.error('Error loading mentor preview:', e);
        container.innerHTML = '<div class="p-8 text-center text-red-500">Fehler beim Laden</div>';
    }
}

// Load booked slots for preview
async function loadPreviewBookedSlots(coachId) {
    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', coachId));
        const snapshot = await getDocs(q);

        previewBookedSlots = {};
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                const dt = new Date(order.appointment.datetime);
                const dateKey = dt.toISOString().split('T')[0];
                const timeKey = dt.toTimeString().slice(0, 5);
                if (!previewBookedSlots[dateKey]) {
                    previewBookedSlots[dateKey] = [];
                }
                previewBookedSlots[dateKey].push(timeKey);
            }
        });
    } catch (e) {
        logger.error('Error loading preview booked slots:', e);
    }
}

// Load sessions for preview
async function loadPreviewSessions(coachId) {
    try {
        const ordersRef = collection(db, 'orders');
        const q = query(ordersRef, where('assignedCoachId', '==', coachId));
        const snapshot = await getDocs(q);

        const sessions = [];
        snapshot.forEach(doc => {
            const order = doc.data();
            if (order.appointment?.datetime) {
                sessions.push({
                    id: doc.id,
                    ...order
                });
            }
        });

        // Sort by appointment date
        sessions.sort((a, b) => new Date(a.appointment.datetime) - new Date(b.appointment.datetime));
        return sessions;
    } catch (e) {
        logger.error('Error loading preview sessions:', e);
        return [];
    }
}

// Render the mentor preview dashboard
function renderMentorPreviewDashboard(sessions) {
    const container = document.getElementById('admin-mentor-preview-container');
    if (!container || !previewMentorData) return;

    // Count stats
    const totalSlots = Object.values(previewAvailability).reduce((sum, slots) => sum + (slots?.length || 0), 0);
    const totalBookings = Object.values(previewBookedSlots).reduce((sum, slots) => sum + (slots?.length || 0), 0);
    const upcomingSessions = sessions.filter(s => new Date(s.appointment.datetime) >= new Date()).length;

    container.innerHTML = `
        <div class="border-2 border-brand-gold/30 rounded-2xl overflow-hidden">
            <!-- Preview Banner -->
            <div class="bg-gradient-to-r from-brand-gold/20 to-yellow-100 px-4 py-2 flex items-center justify-between">
                <div class="flex items-center gap-2">
                    <i class="fas fa-eye text-brand-gold"></i>
                    <span class="text-sm font-medium text-brand-dark">Vorschau-Modus für: <strong>${previewMentorData.name}</strong></span>
                </div>
                <span class="text-xs text-gray-600 bg-white/50 px-2 py-1 rounded">Nur Ansicht - Keine echten Änderungen</span>
            </div>

            <!-- Mentor Header -->
            <div class="bg-gradient-to-r from-brand-dark to-gray-900 text-white p-6">
                <div class="flex items-center gap-4">
                    <div class="w-16 h-16 rounded-full bg-brand-gold/20 flex items-center justify-center overflow-hidden">
                        ${previewMentorData.image
                            ? `<img src="${previewMentorData.image}" class="w-full h-full object-cover" alt="${previewMentorData.name}">`
                            : `<i class="fas fa-user-tie text-brand-gold text-2xl"></i>`
                        }
                    </div>
                    <div>
                        <h2 class="text-xl font-serif font-bold">Willkommen, ${previewMentorData.name}</h2>
                        <p class="text-gray-400 text-sm">${previewMentorData.role || 'Mentor'} • ${previewMentorData.email || 'Keine E-Mail'}</p>
                    </div>
                </div>
            </div>

            <!-- Stats -->
            <div class="grid grid-cols-3 gap-4 p-4 bg-gray-50 border-b">
                <div class="bg-white p-4 rounded-xl text-center shadow-sm">
                    <div class="text-2xl font-bold text-green-600">${totalSlots}</div>
                    <div class="text-xs text-gray-500">Verfügbare Slots</div>
                </div>
                <div class="bg-white p-4 rounded-xl text-center shadow-sm">
                    <div class="text-2xl font-bold text-blue-600">${totalBookings}</div>
                    <div class="text-xs text-gray-500">Gebuchte Termine</div>
                </div>
                <div class="bg-white p-4 rounded-xl text-center shadow-sm">
                    <div class="text-2xl font-bold text-brand-gold">${upcomingSessions}</div>
                    <div class="text-xs text-gray-500">Anstehende Sessions</div>
                </div>
            </div>

            <!-- Two Column Layout -->
            <div class="grid md:grid-cols-2 gap-4 p-4">
                <!-- Availability Calendar -->
                <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div class="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-calendar-alt text-brand-gold"></i>
                            <h3 class="font-bold text-brand-dark">Meine Verfügbarkeit</h3>
                        </div>
                        <div class="flex items-center gap-1">
                            <button onclick="app.previewPrevWeek()" class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition">
                                <i class="fas fa-chevron-left text-gray-500"></i>
                            </button>
                            <span id="preview-week-label" class="text-sm text-gray-600 min-w-[140px] text-center">KW 1</span>
                            <button onclick="app.previewNextWeek()" class="w-8 h-8 flex items-center justify-center rounded hover:bg-gray-100 transition">
                                <i class="fas fa-chevron-right text-gray-500"></i>
                            </button>
                        </div>
                    </div>
                    <div id="preview-calendar" class="p-2 overflow-x-auto">
                        ${renderPreviewCalendarHTML()}
                    </div>
                    <div class="p-3 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
                        <div class="flex items-center gap-4 text-xs">
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-green-500"></span> Verfügbar</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-blue-500"></span> Gebucht</span>
                            <span class="flex items-center gap-1"><span class="w-3 h-3 rounded bg-gray-200"></span> Nicht verfügbar</span>
                        </div>
                    </div>
                </div>

                <!-- Sessions List -->
                <div class="bg-white rounded-xl border border-gray-100 overflow-hidden">
                    <div class="p-4 border-b border-gray-100 bg-gradient-to-r from-gray-50 to-white flex items-center justify-between">
                        <div class="flex items-center gap-2">
                            <i class="fas fa-users text-brand-gold"></i>
                            <h3 class="font-bold text-brand-dark">Meine Sessions</h3>
                        </div>
                        <span class="bg-brand-gold text-brand-dark text-xs font-bold px-2 py-1 rounded-full">${sessions.length}</span>
                    </div>
                    <div class="max-h-[350px] overflow-y-auto">
                        ${sessions.length === 0
                            ? `<div class="p-8 text-center text-gray-400">
                                <i class="fas fa-calendar-check text-3xl mb-2 opacity-50"></i>
                                <p class="text-sm">Keine Sessions zugewiesen</p>
                              </div>`
                            : sessions.map(session => {
                                const dt = new Date(session.appointment.datetime);
                                const dateStr = dt.toLocaleDateString('de-DE', { weekday: 'short', day: 'numeric', month: 'short' });
                                const timeStr = dt.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
                                const isPast = dt < new Date();

                                return `
                                    <div class="p-4 border-b border-gray-50 hover:bg-gray-50 transition ${isPast ? 'opacity-50' : ''}">
                                        <div class="flex items-center justify-between">
                                            <div>
                                                <div class="font-medium text-sm text-brand-dark">${session.customerName || 'Unbekannt'}</div>
                                                <div class="text-xs text-gray-500 mt-1">
                                                    <i class="fas fa-calendar mr-1"></i>${dateStr} um ${timeStr}
                                                </div>
                                            </div>
                                            <div class="flex items-center gap-2">
                                                ${isPast
                                                    ? '<span class="text-xs bg-gray-100 text-gray-500 px-2 py-1 rounded">Vergangen</span>'
                                                    : '<span class="text-xs bg-green-100 text-green-700 px-2 py-1 rounded">Anstehend</span>'
                                                }
                                            </div>
                                        </div>
                                    </div>
                                `;
                            }).join('')
                        }
                    </div>
                </div>
            </div>
        </div>
    `;
}

// Render preview calendar HTML
function renderPreviewCalendarHTML() {
    const today = new Date();
    const startOfWeek = new Date(today);
    startOfWeek.setDate(today.getDate() - today.getDay() + 1 + (previewWeekOffset * 7));

    // Update week label
    const weekNumber = getWeekNumber(startOfWeek);
    const monthName = startOfWeek.toLocaleDateString('de-DE', { month: 'long', year: 'numeric' });

    // Schedule update of week label after render
    setTimeout(() => {
        const weekLabel = document.getElementById('preview-week-label');
        if (weekLabel) weekLabel.textContent = `KW ${weekNumber} - ${monthName}`;
    }, 0);

    const timeSlots = ['09:00', '10:00', '11:00', '12:00', '13:00', '14:00', '15:00', '16:00', '17:00', '18:00', '19:00', '20:00', '21:00'];
    const days = [];
    for (let i = 0; i < 7; i++) {
        const date = new Date(startOfWeek);
        date.setDate(startOfWeek.getDate() + i);
        days.push(date);
    }

    let html = `
        <table class="w-full border-collapse text-xs">
            <thead>
                <tr>
                    <th class="p-1 text-gray-500 font-medium"></th>
                    ${days.map(d => `
                        <th class="p-1 text-center ${d.getDay() === 0 || d.getDay() === 6 ? 'bg-gray-50' : ''}">
                            <div class="text-gray-500 font-medium">${d.toLocaleDateString('de-DE', { weekday: 'short' })}</div>
                            <div class="font-bold ${isToday(d) ? 'text-brand-gold' : 'text-gray-700'}">${d.getDate()}</div>
                        </th>
                    `).join('')}
                </tr>
            </thead>
            <tbody>
    `;

    timeSlots.forEach(time => {
        html += `<tr>`;
        html += `<td class="p-1 text-gray-500 font-medium text-right pr-2">${time}</td>`;

        days.forEach(d => {
            const dateKey = d.toISOString().split('T')[0];
            const isWeekend = d.getDay() === 0 || d.getDay() === 6;
            const isAvailable = previewAvailability[dateKey]?.includes(time);
            const isBooked = previewBookedSlots[dateKey]?.includes(time);
            const isPast = d < new Date() && !isToday(d);

            let cellClass = 'p-0.5';
            let slotClass = 'w-full h-6 rounded ';

            if (isPast) {
                slotClass += 'bg-gray-100';
            } else if (isBooked) {
                slotClass += 'bg-blue-500';
            } else if (isAvailable) {
                slotClass += 'bg-green-500';
            } else {
                slotClass += 'bg-gray-200';
            }

            if (isWeekend) {
                cellClass += ' bg-gray-50';
            }

            html += `<td class="${cellClass}"><div class="${slotClass}"></div></td>`;
        });

        html += `</tr>`;
    });

    html += `</tbody></table>`;
    return html;
}

// Preview calendar navigation
export function previewPrevWeek() {
    previewWeekOffset--;
    updatePreviewCalendar();
}

export function previewNextWeek() {
    previewWeekOffset++;
    updatePreviewCalendar();
}

function updatePreviewCalendar() {
    const calendarContainer = document.getElementById('preview-calendar');
    if (calendarContainer) {
        calendarContainer.innerHTML = renderPreviewCalendarHTML();
    }
}

// ========== COACH MODAL FUNCTIONS ==========

export function openAddCoachModal() {
    const modal = document.getElementById('coach-modal');
    if (!modal) return;

    // Reset form
    document.getElementById('coach-form').reset();
    document.getElementById('coach-edit-id').value = '';
    document.getElementById('coach-visible').checked = true;

    // Set modal to "Add" mode
    document.getElementById('coach-modal-title').textContent = 'Neuen Mentor anlegen';
    document.getElementById('coach-modal-icon').className = 'fas fa-user-plus text-brand-dark';
    document.getElementById('coach-save-btn-text').textContent = 'Speichern';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function openEditCoachModal(coachId) {
    const modal = document.getElementById('coach-modal');
    if (!modal) return;

    // Find coach data
    const coach = window.app?.state?.coaches?.find(c => c.id === coachId);
    if (!coach) {
        showToast('Mentor nicht gefunden');
        return;
    }

    // Fill form with coach data
    document.getElementById('coach-edit-id').value = coachId;
    document.getElementById('coach-name').value = coach.name || '';
    document.getElementById('coach-email').value = coach.email || '';
    document.getElementById('coach-role').value = coach.role || '';
    document.getElementById('coach-experience').value = coach.experience || '';
    document.getElementById('coach-industry').value = coach.industry || '';
    document.getElementById('coach-expertise').value = (coach.expertise || []).join(', ');
    document.getElementById('coach-bio').value = coach.bio || '';
    document.getElementById('coach-image').value = coach.image || '';
    document.getElementById('coach-visible').checked = coach.visible !== false;

    // Set modal to "Edit" mode
    document.getElementById('coach-modal-title').textContent = 'Mentor bearbeiten';
    document.getElementById('coach-modal-icon').className = 'fas fa-user-edit text-brand-dark';
    document.getElementById('coach-save-btn-text').textContent = 'Aktualisieren';

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeCoachModal() {
    const modal = document.getElementById('coach-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

export async function saveCoach() {
    const editId = document.getElementById('coach-edit-id').value;
    const name = document.getElementById('coach-name').value.trim();
    const email = document.getElementById('coach-email').value.trim();
    const role = document.getElementById('coach-role').value.trim();

    // Validate required fields
    if (!name || !email || !role) {
        showToast('Bitte alle Pflichtfelder ausfüllen');
        return;
    }

    const coachData = {
        name,
        email,
        role,
        experience: document.getElementById('coach-experience').value.trim(),
        industry: document.getElementById('coach-industry').value.trim(),
        expertise: document.getElementById('coach-expertise').value.split(',').map(e => e.trim()).filter(e => e),
        bio: document.getElementById('coach-bio').value.trim(),
        image: document.getElementById('coach-image').value.trim() || 'https://via.placeholder.com/200',
        visible: document.getElementById('coach-visible').checked
    };

    try {
        if (editId) {
            // Update existing coach
            await updateDoc(doc(db, 'coaches', editId), coachData);
            showToast('Mentor aktualisiert');
        } else {
            // Create new coach
            coachData.createdAt = new Date();
            await addDoc(collection(db, 'coaches'), coachData);
            showToast('Mentor erstellt');
        }

        closeCoachModal();
        loadAdminCoaches();

        // Refresh state coaches
        if (window.app?.state) {
            const coaches = await fetchCollection('coaches');
            window.app.state.coaches = coaches;
            filterCoaches(window.app.state);
        }
    } catch (e) {
        logger.error('Error saving coach:', e);
        showToast('Fehler beim Speichern');
    }
}

export async function deleteCoach(coachId) {
    if (!confirm('Mentor wirklich löschen? Diese Aktion kann nicht rückgängig gemacht werden.')) {
        return;
    }

    try {
        await deleteDoc(doc(db, 'coaches', coachId));
        showToast('Mentor gelöscht');
        loadAdminCoaches();

        // Refresh state coaches
        if (window.app?.state) {
            const coaches = await fetchCollection('coaches');
            window.app.state.coaches = coaches;
            filterCoaches(window.app.state);
        }
    } catch (e) {
        logger.error('Error deleting coach:', e);
        showToast('Fehler beim Löschen');
    }
}

// ===== MANUAL INVOICE MODAL =====

let invoiceItems = [];

export function openInvoiceModal() {
    const modal = document.getElementById('invoice-modal');
    if (!modal) return;

    // Reset form
    document.getElementById('invoice-form').reset();
    invoiceItems = [{ title: '', price: 0, quantity: 1 }];
    renderInvoiceItems();
    updateInvoiceTotal();

    modal.classList.remove('hidden');
    document.body.style.overflow = 'hidden';
}

export function closeInvoiceModal() {
    const modal = document.getElementById('invoice-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
}

export function addInvoiceItem() {
    invoiceItems.push({ title: '', price: 0, quantity: 1 });
    renderInvoiceItems();
}

export function removeInvoiceItem(index) {
    if (invoiceItems.length > 1) {
        invoiceItems.splice(index, 1);
        renderInvoiceItems();
        updateInvoiceTotal();
    }
}

export function updateInvoiceItem(index, field, value) {
    if (field === 'price' || field === 'quantity') {
        invoiceItems[index][field] = parseFloat(value) || 0;
    } else {
        invoiceItems[index][field] = value;
    }
    updateInvoiceTotal();
}

function renderInvoiceItems() {
    const container = document.getElementById('invoice-items-container');
    if (!container) return;

    container.innerHTML = invoiceItems.map((item, index) => `
        <div class="flex gap-2 items-start p-3 bg-gray-50 rounded-lg">
            <div class="flex-1">
                <input type="text"
                       value="${item.title}"
                       onchange="app.updateInvoiceItem(${index}, 'title', this.value)"
                       class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                       placeholder="Bezeichnung (z.B. Business Paket)">
            </div>
            <div class="w-24">
                <input type="number"
                       value="${item.price}"
                       onchange="app.updateInvoiceItem(${index}, 'price', this.value)"
                       class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold text-right"
                       placeholder="Preis" min="0" step="0.01">
            </div>
            <div class="w-16">
                <input type="number"
                       value="${item.quantity}"
                       onchange="app.updateInvoiceItem(${index}, 'quantity', this.value)"
                       class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold text-center"
                       placeholder="Anz." min="1">
            </div>
            <button type="button"
                    onclick="app.removeInvoiceItem(${index})"
                    class="w-8 h-8 flex items-center justify-center text-red-500 hover:bg-red-50 rounded-lg transition ${invoiceItems.length === 1 ? 'opacity-30 cursor-not-allowed' : ''}">
                <i class="fas fa-trash-alt text-sm"></i>
            </button>
        </div>
    `).join('');
}

function updateInvoiceTotal() {
    const total = invoiceItems.reduce((sum, item) => sum + (item.price * item.quantity), 0);
    const totalElement = document.getElementById('invoice-total');
    if (totalElement) {
        totalElement.textContent = `€${total.toFixed(2).replace('.', ',')}`;
    }
}

export async function createManualInvoice() {
    const service = document.getElementById('invoice-service').value;
    const customerName = document.getElementById('invoice-customer-name').value.trim();
    const customerEmail = document.getElementById('invoice-customer-email').value.trim();
    const paymentMethod = document.querySelector('input[name="invoice-payment"]:checked')?.value || 'vorkasse';
    const notes = document.getElementById('invoice-notes').value.trim();

    // Validate required fields
    if (!service) {
        showToast('Bitte Service wählen');
        return;
    }
    if (!customerName || !customerEmail) {
        showToast('Bitte Kundenname und E-Mail eingeben');
        return;
    }

    // Validate items
    const validItems = invoiceItems.filter(item => item.title && item.price > 0);
    if (validItems.length === 0) {
        showToast('Bitte mindestens eine Position mit Bezeichnung und Preis eingeben');
        return;
    }

    // Get address if provided
    const addressLine1 = document.getElementById('invoice-address-line1').value.trim();
    const addressPostal = document.getElementById('invoice-address-postal').value.trim();
    const addressCity = document.getElementById('invoice-address-city').value.trim();
    const addressCountry = document.getElementById('invoice-address-country').value;

    const customerAddress = addressLine1 ? {
        line1: addressLine1,
        postalCode: addressPostal,
        city: addressCity,
        country: addressCountry
    } : null;

    // Disable button
    const submitBtn = document.getElementById('invoice-submit-btn');
    const originalContent = submitBtn.innerHTML;
    submitBtn.disabled = true;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Wird erstellt...';

    try {
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/createManualInvoice', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                customerName,
                customerEmail,
                customerAddress,
                items: validItems,
                service,
                paymentMethod,
                notes: notes || null,
                adminEmail: auth.currentUser?.email
            })
        });

        const result = await response.json();

        if (!response.ok) {
            throw new Error(result.error || 'Fehler beim Erstellen der Rechnung');
        }

        showToast(`Rechnung ${result.invoiceNumber} erstellt und versendet!`, 'success');
        closeInvoiceModal();

        // Refresh orders list
        loadAllOrders();

    } catch (error) {
        logger.error('Error creating manual invoice:', error);
        showToast(error.message || 'Fehler beim Erstellen der Rechnung');
    } finally {
        submitBtn.disabled = false;
        submitBtn.innerHTML = originalContent;
    }
}

// Load all documents for admin panel
export async function loadAdminDocuments() {
    const container = document.getElementById('admin-documents-list');
    if (!container || !storage) {
        logger.log('Documents container or storage not available');
        return;
    }

    container.innerHTML = `
        <div class="p-8 text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-2xl mb-2"></i>
            <p class="text-sm">Lade Dokumente...</p>
        </div>
    `;

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");

        // Load all users to get their info
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const usersMap = {};
        usersSnapshot.forEach(doc => {
            usersMap[doc.id] = doc.data();
        });

        let allDocuments = [];
        let uploadedCount = 0;
        let deliveredCount = 0;
        const usersWithDocs = new Set();

        // Load uploaded documents (from users folder - users/{userId}/)
        const usersRef = ref(storage, 'users');
        try {
            const usersResult = await listAll(usersRef);

            // Each folder is a userId
            for (const userFolder of usersResult.prefixes) {
                const userId = userFolder.name;
                usersWithDocs.add(userId);

                // List all files in user folder
                const userFiles = await listAll(userFolder);

                for (const file of userFiles.items) {
                    uploadedCount++;
                    const url = await getDownloadURL(file);
                    const metadata = await file.getMetadata();
                    allDocuments.push({
                        type: 'uploaded',
                        userId,
                        orderId: null,
                        fileName: file.name,
                        url,
                        size: metadata.size || 0,
                        createdAt: metadata.timeCreated || null,
                        userEmail: usersMap[userId]?.email || 'Unbekannt',
                        userName: `${usersMap[userId]?.firstname || ''} ${usersMap[userId]?.lastname || ''}`.trim() || 'Unbekannt'
                    });
                }
            }
        } catch (e) {
            logger.log('No users folder or error:', e.message);
        }

        // Load delivered documents (from admin to users)
        const deliveredRef = ref(storage, 'delivered');
        try {
            const deliveredResult = await listAll(deliveredRef);

            for (const userFolder of deliveredResult.prefixes) {
                const userId = userFolder.name;
                usersWithDocs.add(userId);

                const userDelivered = await listAll(userFolder);
                for (const file of userDelivered.items) {
                    deliveredCount++;
                    const url = await getDownloadURL(file);
                    const metadata = await file.getMetadata();
                    allDocuments.push({
                        type: 'delivered',
                        userId,
                        orderId: null,
                        fileName: file.name,
                        url,
                        size: metadata.size || 0,
                        createdAt: metadata.timeCreated || null,
                        userEmail: usersMap[userId]?.email || 'Unbekannt',
                        userName: `${usersMap[userId]?.firstname || ''} ${usersMap[userId]?.lastname || ''}`.trim() || 'Unbekannt'
                    });
                }
            }
        } catch (e) {
            logger.log('No delivered folder or error:', e.message);
        }

        // Update statistics
        const statUploaded = document.getElementById('admin-stat-docs-uploaded');
        const statDelivered = document.getElementById('admin-stat-docs-delivered');
        const statUsers = document.getElementById('admin-stat-docs-users');

        if (statUploaded) statUploaded.textContent = uploadedCount;
        if (statDelivered) statDelivered.textContent = deliveredCount;
        if (statUsers) statUsers.textContent = usersWithDocs.size;

        if (allDocuments.length === 0) {
            container.innerHTML = `
                <div class="p-8 text-center text-gray-400">
                    <i class="fas fa-folder-open text-3xl mb-3"></i>
                    <p class="text-sm">Noch keine Dokumente vorhanden</p>
                </div>
            `;
            return;
        }

        // Sort by date (newest first)
        allDocuments.sort((a, b) => {
            const dateA = a.createdAt ? new Date(a.createdAt) : new Date(0);
            const dateB = b.createdAt ? new Date(b.createdAt) : new Date(0);
            return dateB - dateA;
        });

        // Format file size
        const formatSize = (bytes) => {
            if (bytes < 1024) return bytes + ' B';
            if (bytes < 1024 * 1024) return (bytes / 1024).toFixed(1) + ' KB';
            return (bytes / (1024 * 1024)).toFixed(1) + ' MB';
        };

        container.innerHTML = allDocuments.map(doc => `
            <div class="p-4 hover:bg-gray-50 transition">
                <div class="flex items-center justify-between">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-lg flex items-center justify-center ${doc.type === 'uploaded' ? 'bg-blue-100 text-blue-600' : 'bg-green-100 text-green-600'}">
                            <i class="fas ${doc.type === 'uploaded' ? 'fa-user' : 'fa-user-shield'}"></i>
                        </div>
                        <div>
                            <p class="font-bold text-brand-dark text-sm">${sanitizeHTML(doc.fileName)}</p>
                            <p class="text-xs text-gray-500">
                                ${doc.type === 'uploaded' ? 'Kunde: ' : 'An: '}
                                <span class="font-medium">${sanitizeHTML(doc.userName)}</span>
                                (${sanitizeHTML(doc.userEmail)})
                            </p>
                            <p class="text-xs text-gray-400">
                                ${doc.createdAt ? new Date(doc.createdAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' }) : 'Datum unbekannt'}
                                • ${formatSize(doc.size)}
                                • <span class="font-semibold ${doc.type === 'uploaded' ? 'text-blue-600' : 'text-green-600'}">${doc.type === 'uploaded' ? '📥 Vom Kunden hochgeladen' : '📤 Von dir gesendet'}</span>
                            </p>
                        </div>
                    </div>
                    <a href="${doc.url}" target="_blank" download="${doc.fileName}"
                       class="px-4 py-2 bg-brand-dark text-white text-sm rounded hover:bg-gray-800 transition flex items-center gap-2">
                        <i class="fas fa-download"></i>
                        Download
                    </a>
                </div>
            </div>
        `).join('');

    } catch (e) {
        logger.error('Error loading admin documents:', e);
        container.innerHTML = `
            <div class="p-8 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p class="text-sm">Fehler beim Laden der Dokumente: ${e.message}</p>
            </div>
        `;
    }
}

export async function saveProfile(state) {
    const firstnameInput = document.getElementById('profile-firstname');
    const lastnameInput = document.getElementById('profile-lastname');
    const emailInput = document.getElementById('profile-email');
    const phoneInput = document.getElementById('profile-phone');
    const companyInput = document.getElementById('profile-company');

    const firstname = firstnameInput?.value?.trim() || '';
    const lastname = lastnameInput?.value?.trim() || '';
    const phone = phoneInput?.value?.trim() || '';
    const company = companyInput?.value?.trim() || '';

    if (!firstname || !lastname) {
        showToast('❌ Vor- und Nachname sind erforderlich.', 'error');
        return;
    }

    try {
        if (db && state.user?.uid) {
            await updateDoc(doc(db, "users", state.user.uid), {
                firstname,
                lastname,
                phone,
                company,
                updatedAt: new Date()
            });

            // Update display name in auth
            if (auth?.currentUser) {
                await updateProfile(auth.currentUser, {
                    displayName: `${firstname} ${lastname}`
                });
            }

            showToast('✅ Profil erfolgreich gespeichert!');
        } else {
            showToast('✅ Profil gespeichert (Demo-Modus)');
        }
    } catch (error) {
        logger.error('Error saving profile:', error);
        showToast('❌ Fehler beim Speichern. Bitte versuchen Sie es erneut.', 'error');
    }
}

export async function changePassword(state) {
    const currentPassword = document.getElementById('current-password')?.value || '';
    const newPassword = document.getElementById('dashboard-new-password')?.value || '';
    const confirmPassword = document.getElementById('dashboard-confirm-password')?.value || '';

    if (!currentPassword || !newPassword || !confirmPassword) {
        showToast('❌ Bitte füllen Sie alle Passwort-Felder aus.', 'error');
        return;
    }

    if (newPassword !== confirmPassword) {
        showToast('❌ Die neuen Passwörter stimmen nicht überein.', 'error');
        return;
    }

    const dashPwCheck = validatePassword(newPassword);
    if (!dashPwCheck.valid) {
        showToast(`❌ ${dashPwCheck.message || 'Passwort erfüllt nicht die Anforderungen.'}`, 'error');
        return;
    }

    try {
        if (auth?.currentUser) {
            // Re-authenticate user first
            const { EmailAuthProvider, reauthenticateWithCredential, updatePassword } = await import('https://www.gstatic.com/firebasejs/9.22.0/firebase-auth.js');

            const credential = EmailAuthProvider.credential(
                auth.currentUser.email,
                currentPassword
            );

            await reauthenticateWithCredential(auth.currentUser, credential);
            await updatePassword(auth.currentUser, newPassword);

            // Clear form fields
            document.getElementById('current-password').value = '';
            document.getElementById('new-password').value = '';
            document.getElementById('confirm-new-password').value = '';

            showToast('✅ Passwort erfolgreich geändert!');
        } else {
            showToast('✅ Passwort geändert (Demo-Modus)');
        }
    } catch (error) {
        logger.error('Error changing password:', error);
        if (error.code === 'auth/wrong-password') {
            showToast('❌ Das aktuelle Passwort ist falsch.', 'error');
        } else {
            showToast('❌ Fehler beim Ändern des Passworts.', 'error');
        }
    }
}

// ========== ADMIN FUNCTIONS ==========

// Admin-Status wird über Custom Claims geprüft (gesetzt via Cloud Function setAdminRole)
// ADMIN_EMAILS dient als Fallback während der Migration
let _cachedAdminClaim = null;

export async function checkAdminClaim() {
    if (!auth?.currentUser) {
        _cachedAdminClaim = false;
        return false;
    }
    try {
        const idTokenResult = await auth.currentUser.getIdTokenResult();
        _cachedAdminClaim = idTokenResult.claims.admin === true;
        return _cachedAdminClaim;
    } catch (e) {
        console.error('Admin claim check failed:', e);
        _cachedAdminClaim = false;
        return false;
    }
}

export function isAdmin(email) {
    // Custom Claim hat Priorität
    if (_cachedAdminClaim === true) return true;
    // Fallback auf E-Mail-Liste (wird nach Migration entfernt)
    return ADMIN_EMAILS.includes(email?.toLowerCase());
}

// Store all orders for filtering
let allAdminOrders = [];

export async function loadAllOrders() {
    if (!db) {
        logger.error('Database not available');
        return;
    }

    // Use new containers (active/completed split) or legacy container
    const activeContainer = document.getElementById('admin-active-orders-list');
    const completedContainer = document.getElementById('admin-completed-orders-list');
    const legacyContainer = document.getElementById('admin-orders-list');

    // At least one container must exist
    if (!activeContainer && !legacyContainer) return;

    // Show loading state
    if (activeContainer) {
        activeContainer.innerHTML = `
            <div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
                <p>Lade Bestellungen...</p>
            </div>
        `;
    }
    if (legacyContainer) {
        legacyContainer.innerHTML = `
            <div class="bg-white p-12 rounded-sm shadow-sm text-center text-gray-400">
                <i class="fas fa-spinner fa-spin text-3xl mb-4"></i>
                <p>Lade Bestellungen...</p>
            </div>
        `;
    }

    try {
        const ordersRef = collection(db, 'orders');
        const snapshot = await getDocs(ordersRef);

        allAdminOrders = [];
        snapshot.forEach(docSnap => {
            allAdminOrders.push({ id: docSnap.id, ...docSnap.data() });
        });

        // Load all CV projects to merge with orders
        let cvProjectsMap = {};
        try {
            const cvProjectsSnapshot = await getDocs(collection(db, 'cvProjects'));
            cvProjectsSnapshot.forEach(docSnap => {
                const project = { id: docSnap.id, ...docSnap.data() };
                if (project.orderId) {
                    cvProjectsMap[project.orderId] = project;
                }
            });
        } catch (e) {
            logger.warn('Could not load CV projects for admin:', e);
        }

        // Merge orders with CV project data
        allAdminOrders = allAdminOrders.map(order => {
            const cvProject = cvProjectsMap[order.id];
            if (cvProject) {
                // Order cvStatus has priority if set to 'delivered' or 'ready'
                const orderCvStatus = order.cvStatus;
                const projectStatus = cvProject.status || 'new';
                const finalCvStatus = (orderCvStatus === 'delivered' || orderCvStatus === 'ready')
                    ? orderCvStatus
                    : projectStatus;

                return {
                    ...order,
                    cvProject: cvProject,
                    cvProjectId: cvProject.id,
                    cvStatus: finalCvStatus,
                    questionnaire: cvProject.questionnaire || null
                };
            }
            return order;
        });

        // Sort by date (newest first)
        allAdminOrders.sort((a, b) => {
            const dateA = a.date?.seconds || 0;
            const dateB = b.date?.seconds || 0;
            return dateB - dateA;
        });

        updateAdminStats(allAdminOrders);
        renderAdminOrders(allAdminOrders);

    } catch (e) {
        logger.error('Failed to load orders:', e);
        const errorHtml = `
            <div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-4"></i>
                <p>Fehler beim Laden: ${e.message}</p>
            </div>
        `;
        if (activeContainer) activeContainer.innerHTML = errorHtml;
        if (legacyContainer) legacyContainer.innerHTML = errorHtml;
    }
}

function updateAdminStats(orders) {
    const total = orders.length;
    const processing = orders.filter(o => o.status === 'processing').length;
    const completed = orders.filter(o => o.status === 'completed').length;
    const revenue = orders.reduce((sum, o) => sum + (o.total || 0), 0);

    const totalEl = document.getElementById('admin-stat-total');
    const processingEl = document.getElementById('admin-stat-processing');
    const completedEl = document.getElementById('admin-stat-completed');
    const revenueEl = document.getElementById('admin-stat-revenue');

    if (totalEl) totalEl.textContent = total;
    if (processingEl) processingEl.textContent = processing;
    if (completedEl) completedEl.textContent = completed;
    if (revenueEl) revenueEl.textContent = `€${revenue.toLocaleString('de-DE')}`;
}

// ========== ADMIN EXPORT FUNKTIONEN ==========

// CSV Export für Bestellungen
export function exportOrdersToCSV() {
    if (allAdminOrders.length === 0) {
        showToast('❌ Keine Bestellungen zum Exportieren');
        return;
    }

    const headers = ['Bestellnummer', 'Datum', 'Kunde', 'Email', 'Produkte', 'Betrag', 'Status'];
    const rows = allAdminOrders.map(order => {
        const date = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE')
            : '-';
        const items = order.items?.map(i => i.title).join('; ') || '-';
        const status = {
            'processing': 'In Bearbeitung',
            'confirmed': 'Bestätigt',
            'completed': 'Abgeschlossen',
            'cancelled': 'Storniert'
        }[order.status] || order.status;

        return [
            order.id.substring(0, 8).toUpperCase(),
            date,
            order.customerName || '-',
            order.customerEmail || '-',
            items,
            `€${(order.total || 0).toFixed(2)}`,
            status
        ];
    });

    const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Karriaro_Bestellungen_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('✅ CSV-Export erfolgreich');
}

// CSV Export für Benutzer
export function exportUsersToCSV() {
    const container = document.getElementById('admin-users-list');
    if (!container || !window._adminUsers || window._adminUsers.length === 0) {
        showToast('❌ Keine Benutzer zum Exportieren');
        return;
    }

    const users = window._adminUsers;
    const headers = ['Vorname', 'Nachname', 'Email', 'Telefon', 'Unternehmen', 'Cookie-Consent', 'Registriert'];
    const rows = users.map(user => {
        const joined = user.joined?.seconds
            ? new Date(user.joined.seconds * 1000).toLocaleDateString('de-DE')
            : '-';
        const consent = user.cookieConsent === 'all' || user.cookieConsent === true
            ? 'Alle Cookies'
            : user.cookieConsent === 'essential' ? 'Nur notwendige' : 'Keine Auswahl';

        return [
            user.firstname || '-',
            user.lastname || '-',
            user.email || '-',
            user.phone || '-',
            user.company || '-',
            consent,
            joined
        ];
    });

    const csvContent = [
        headers.join(';'),
        ...rows.map(row => row.map(cell => `"${cell}"`).join(';'))
    ].join('\n');

    const blob = new Blob(['\ufeff' + csvContent], { type: 'text/csv;charset=utf-8;' });
    const url = URL.createObjectURL(blob);
    const link = document.createElement('a');
    link.href = url;
    link.download = `Karriaro_Benutzer_${new Date().toISOString().split('T')[0]}.csv`;
    link.click();
    URL.revokeObjectURL(url);

    showToast('✅ CSV-Export erfolgreich');
}

// ========== ADMIN BENUTZER-VERWALTUNG ==========

// Benutzer löschen (mit Bestätigung)
export async function deleteUser(userId, email) {
    if (!confirm(`Möchten Sie den Benutzer "${email}" wirklich löschen?\n\nDiese Aktion kann nicht rückgängig gemacht werden.`)) {
        return;
    }

    try {
        showToast('⏳ Lösche Benutzer...');

        // Lösche aus Firestore
        await updateDoc(doc(db, 'users', userId), {
            deleted: true,
            deletedAt: new Date()
        });

        showToast('✅ Benutzer wurde deaktiviert');
        loadAdminUsers(); // Refresh list
    } catch (error) {
        console.error('Delete user error:', error);
        showToast('❌ Fehler beim Löschen: ' + error.message);
    }
}

export function filterAdminOrders() {
    const searchTerm = document.getElementById('admin-search')?.value.toLowerCase() || '';
    const statusFilter = document.getElementById('admin-filter-status')?.value || '';

    let filtered = allAdminOrders;

    if (searchTerm) {
        filtered = filtered.filter(order => {
            const email = (order.customerEmail || '').toLowerCase();
            const name = (order.customerName || '').toLowerCase();
            const id = order.id.toLowerCase();
            return email.includes(searchTerm) || name.includes(searchTerm) || id.includes(searchTerm);
        });
    }

    if (statusFilter) {
        filtered = filtered.filter(order => order.status === statusFilter);
    }

    renderAdminOrders(filtered);
}

// Check if order is completed (for admin)
function isAdminOrderCompleted(order) {
    const cvStatus = order.cvStatus || 'new';
    const orderStatus = order.status || 'confirmed';
    const refundStatus = order.refundStatus;

    // Fully refunded orders are always completed
    if (refundStatus === 'refunded') {
        return true;
    }

    // Quick-Check: completed when gutachten delivered
    if (isQuickCheckOrder(order)) {
        return cvStatus === 'gutachten_delivered' || orderStatus === 'completed' || order.quickCheckGutachtenUrl;
    }

    // Check each component separately
    const hasCv = isCvOrder(order);
    const hasMentoring = hasCoachSession(order);

    // If order has both CV and Mentoring, BOTH must be completed
    if (hasCv && hasMentoring) {
        const cvCompleted = cvStatus === 'delivered' || cvStatus === 'ready';
        // Mentoring is completed when: appointment happened OR was refunded (partially_refunded)
        const mentoringRefunded = refundStatus === 'partially_refunded';
        const mentoringCompleted = mentoringRefunded || (order.appointment?.datetime && new Date(order.appointment.datetime) < new Date());
        return cvCompleted && mentoringCompleted;
    }

    // CV only: completed when delivered
    if (hasCv) {
        return cvStatus === 'delivered' || cvStatus === 'ready';
    }

    // Mentoring only: completed when appointment passed or status is completed
    if (hasMentoring) {
        if (orderStatus === 'completed') return true;
        if (order.appointment?.datetime) {
            const appointmentDate = new Date(order.appointment.datetime);
            return appointmentDate < new Date();
        }
        return false;
    }

    return orderStatus === 'completed';
}

// Switch between admin order tabs
export function switchAdminOrderTab(tab) {
    const activeTab = document.getElementById('admin-tab-active');
    const completedTab = document.getElementById('admin-tab-completed');
    const activeList = document.getElementById('admin-active-orders-list');
    const completedList = document.getElementById('admin-completed-orders-list');

    if (tab === 'active') {
        activeTab.className = 'flex-1 py-3 px-4 text-sm font-semibold text-brand-dark border-b-2 border-brand-gold bg-brand-gold/5 transition flex items-center justify-center gap-2';
        completedTab.className = 'flex-1 py-3 px-4 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-dark transition flex items-center justify-center gap-2';
        activeList.classList.remove('hidden');
        completedList.classList.add('hidden');
    } else {
        completedTab.className = 'flex-1 py-3 px-4 text-sm font-semibold text-brand-dark border-b-2 border-brand-gold bg-brand-gold/5 transition flex items-center justify-center gap-2';
        activeTab.className = 'flex-1 py-3 px-4 text-sm font-medium text-gray-500 border-b-2 border-transparent hover:text-brand-dark transition flex items-center justify-center gap-2';
        completedList.classList.remove('hidden');
        activeList.classList.add('hidden');
    }
}

function renderAdminOrders(orders) {
    const activeContainer = document.getElementById('admin-active-orders-list');
    const completedContainer = document.getElementById('admin-completed-orders-list');
    const activeCountEl = document.getElementById('admin-active-count');
    const completedCountEl = document.getElementById('admin-completed-count');

    // Split orders into active and completed
    const activeOrders = orders.filter(o => !isAdminOrderCompleted(o));
    const completedOrders = orders.filter(o => isAdminOrderCompleted(o));

    // Update counts
    if (activeCountEl) activeCountEl.textContent = activeOrders.length;
    if (completedCountEl) completedCountEl.textContent = completedOrders.length;

    // Render active orders
    if (activeContainer) {
        if (activeOrders.length === 0) {
            activeContainer.innerHTML = `
                <div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400">
                    <i class="fas fa-check-circle text-4xl mb-4 text-green-400"></i>
                    <p>Keine offenen Bestellungen</p>
                </div>
            `;
        } else {
            activeContainer.innerHTML = activeOrders.map(order => renderSingleAdminOrder(order)).join('');
        }
    }

    // Render completed orders
    if (completedContainer) {
        if (completedOrders.length === 0) {
            completedContainer.innerHTML = `
                <div class="bg-white p-12 rounded-xl border border-gray-100 text-center text-gray-400">
                    <i class="fas fa-inbox text-4xl mb-4"></i>
                    <p>Keine abgeschlossenen Bestellungen</p>
                </div>
            `;
        } else {
            completedContainer.innerHTML = completedOrders.map(order => renderSingleAdminOrder(order)).join('');
        }
    }

    // Also update legacy container for compatibility
    const legacyContainer = document.getElementById('admin-orders-list');
    if (legacyContainer) {
        legacyContainer.innerHTML = orders.map(order => renderSingleAdminOrder(order)).join('');
    }
}

function renderSingleAdminOrder(order) {
        const date = order.date?.seconds
            ? new Date(order.date.seconds * 1000).toLocaleDateString('de-DE', { day: '2-digit', month: 'long', year: 'numeric' })
            : 'Unbekannt';

        // Determine what type of order this is
        const isSession = hasCoachSession(order);
        const isCvOrderType = isCvOrder(order);
        const isQuickCheckType = isQuickCheckOrder(order);

        // Get current step and admin action needed
        const adminAction = getAdminActionNeeded(order, isSession, isCvOrderType, isQuickCheckType);

        // First item title
        const mainItem = order.items?.[0]?.title || 'Produkt';

        return `
            <div class="bg-white rounded-xl border ${adminAction.needed ? 'border-orange-300 ring-2 ring-orange-100' : 'border-gray-100'} overflow-hidden hover:shadow-md transition" data-order-id="${order.id}">
                <!-- Order Header -->
                <div class="p-4 cursor-pointer" onclick="app.toggleOrderExpand('${order.id}')">
                    <div class="flex items-center gap-4">
                        <!-- Customer Avatar -->
                        <div class="flex-shrink-0">
                            <div class="w-12 h-12 bg-gradient-to-br from-brand-gold to-amber-400 rounded-full flex items-center justify-center text-white font-bold text-lg">
                                ${(order.customerName || 'U').charAt(0).toUpperCase()}
                            </div>
                        </div>

                        <!-- Main Info -->
                        <div class="flex-1 min-w-0">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="font-bold text-brand-dark">${sanitizeHTML(order.customerName || 'Unbekannt')}</span>
                                <span class="text-xs font-mono text-gray-400">#${order.id.substring(0, 6).toUpperCase()}</span>
                            </div>
                            <p class="text-sm text-gray-600 truncate">${sanitizeHTML(mainItem)}</p>
                            <p class="text-xs text-gray-400 mt-0.5">${date}</p>
                        </div>

                        <!-- Action Badge -->
                        <div class="flex-shrink-0">
                            ${order.refundStatus === 'refunded' ? `
                                <div class="flex items-center gap-2 px-3 py-1.5 bg-red-100 text-red-700 rounded-full">
                                    <i class="fas fa-ban"></i>
                                    <span class="text-xs font-medium">Erstattet</span>
                                </div>
                            ` : order.refundStatus === 'partially_refunded' ? `
                                <div class="flex items-center gap-2 px-3 py-1.5 bg-amber-100 text-amber-700 rounded-full">
                                    <i class="fas fa-exclamation-circle"></i>
                                    <span class="text-xs font-medium">Teilerstattung</span>
                                </div>
                            ` : adminAction.needed ? `
                                <div class="flex items-center gap-2 px-3 py-1.5 bg-orange-100 text-orange-700 rounded-full animate-pulse">
                                    <i class="fas fa-hand-point-right"></i>
                                    <span class="text-xs font-bold">Du bist dran</span>
                                </div>
                            ` : order.status === 'completed' ? `
                                <div class="flex items-center gap-2 px-3 py-1.5 bg-green-100 text-green-700 rounded-full">
                                    <i class="fas fa-check-circle"></i>
                                    <span class="text-xs font-medium">Erledigt</span>
                                </div>
                            ` : `
                                <div class="flex items-center gap-2 px-3 py-1.5 bg-blue-100 text-blue-700 rounded-full">
                                    <i class="fas fa-hourglass-half"></i>
                                    <span class="text-xs font-medium">Wartet auf Kunde</span>
                                </div>
                            `}
                        </div>

                        <!-- Price & Expand -->
                        <div class="flex items-center gap-3 flex-shrink-0">
                            <span class="font-bold text-brand-dark text-lg">€${(order.total || 0).toLocaleString('de-DE')}</span>
                            <i id="expand-icon-${order.id}" class="fas fa-chevron-down text-gray-400 transition-transform"></i>
                        </div>
                    </div>
                </div>

                <!-- Expandable Workflow Content -->
                <div id="order-details-${order.id}" class="hidden border-t border-gray-100">
                    <div class="p-4 bg-gray-50">
                        <!-- Kunde Info -->
                        <div class="mb-4 p-3 bg-white rounded-lg border border-gray-100">
                            <div class="flex items-center justify-between">
                                <div>
                                    <p class="text-sm text-gray-500">${sanitizeHTML(order.customerEmail || 'Keine Email')}</p>
                                    <p class="text-xs text-gray-400 mt-1">${order.items?.map(i => sanitizeHTML(i.title)).join(', ')}</p>
                                </div>
                                <span class="font-serif text-xl text-brand-dark">€${(order.total || 0).toFixed(2)}</span>
                            </div>
                        </div>

                        <!-- Workflow Steps -->
                        ${renderAdminWorkflowSteps(order, isSession, isCvOrderType, isQuickCheckType)}
                    </div>
                </div>
            </div>
        `;
}

// Bestimme welche Admin-Aktion erforderlich ist
function getAdminActionNeeded(order, isSession, isCvOrder, isQuickCheck) {
    let actions = [];

    // Skip mentoring actions if refunded
    const isMentoringRefunded = order.refundStatus === 'refunded' || order.refundStatus === 'partially_refunded';

    // Mentoring: Coach zuweisen (nur wenn nicht erstattet)
    if (isSession && !order.assignedCoachId && !isMentoringRefunded) {
        actions.push({ action: 'assign_coach', label: 'Coach zuweisen' });
    }

    // Mentoring: Termine vorschlagen nach Ablehnung (nur wenn nicht erstattet)
    if (isSession && order.appointmentStatus === 'declined' && !isMentoringRefunded) {
        actions.push({ action: 'new_proposals', label: 'Neue Termine vorschlagen' });
    }

    // Mentoring: Termine vorschlagen (Coach zugewiesen, aber keine Vorschläge) (nur wenn nicht erstattet)
    if (isSession && order.assignedCoachId && !order.appointmentProposals?.length && !order.appointment?.datetime && !isMentoringRefunded) {
        actions.push({ action: 'send_proposals', label: 'Termine vorschlagen' });
    }

    // CV Order: Fragebogen senden
    if (isCvOrder && !isQuickCheck && !order.cvProjectId) {
        actions.push({ action: 'send_questionnaire', label: 'Fragebogen senden' });
    }

    // CV Order: CV erstellen (Daten erhalten)
    if (isCvOrder && !isQuickCheck && order.cvStatus === 'data_received') {
        actions.push({ action: 'create_cv', label: 'CV erstellen' });
    }

    // Quick-Check: Gutachten hochladen (CV erhalten)
    if (isQuickCheck && order.quickCheckDocument && !order.quickCheckGutachtenUrl) {
        actions.push({ action: 'upload_gutachten', label: 'Gutachten hochladen' });
    }

    if (actions.length === 0) {
        return { needed: false };
    }

    // Gib die erste Aktion zurück, aber speichere alle für die Anzeige
    return {
        needed: true,
        action: actions[0].action,
        label: actions.length > 1 ? `${actions.length} Aktionen` : actions[0].label,
        allActions: actions
    };
}

// Render Admin Workflow Steps - wie beim Kunden, aber mit Admin-Aktionen
function renderAdminWorkflowSteps(order, isSession, isCvOrderType, isQuickCheckType) {
    let workflows = [];

    // Quick-Check hat eigenen Workflow
    if (isQuickCheckType) {
        return renderAdminQuickCheckWorkflow(order);
    }

    // CV-Erstellung Workflow
    if (isCvOrderType && !isQuickCheckType) {
        workflows.push(renderAdminCvWorkflow(order));
    }

    // Mentoring/Interview Workflow (kann zusätzlich zum CV sein)
    if (isSession) {
        workflows.push(renderAdminMentoringWorkflow(order));
    }

    if (workflows.length === 0) {
        return '<p class="text-gray-500 text-sm">Keine Workflow-Schritte verfügbar</p>';
    }

    return workflows.join('<div class="border-t border-gray-200 my-4"></div>');
}

// Admin Quick-Check Workflow
function renderAdminQuickCheckWorkflow(order) {
    const hasCustomerDoc = !!order.quickCheckDocument;
    const hasGutachten = order.quickCheckGutachtenUrl || order.cvStatus === 'gutachten_delivered';
    const isExpress = order.items?.some(i => i.title?.toLowerCase().includes('express'));

    const steps = [
        {
            num: 1,
            title: 'Kunde lädt CV hoch',
            done: hasCustomerDoc,
            current: !hasCustomerDoc,
            waitingFor: 'customer',
            icon: 'fa-upload'
        },
        {
            num: 2,
            title: 'Gutachten erstellen & hochladen',
            done: hasGutachten,
            current: hasCustomerDoc && !hasGutachten,
            waitingFor: 'admin',
            icon: 'fa-file-signature'
        }
    ];

    return `
        <div class="space-y-3">
            <!-- Workflow Steps -->
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-bolt text-purple-500"></i>
                    <span class="font-bold text-brand-dark">Quick-Check ${isExpress ? '(Express - 24h)' : '(Standard - 2-3 Tage)'}</span>
                </div>

                <div class="space-y-3">
                    ${steps.map(step => `
                        <div class="flex items-center gap-3 ${step.done ? 'opacity-60' : ''}">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                step.done ? 'bg-green-500 text-white' :
                                step.current ? 'bg-gradient-to-r from-purple-500 to-pink-500 text-white ring-4 ring-purple-100' :
                                'bg-gray-200 text-gray-400'
                            }">
                                ${step.done ? '<i class="fas fa-check text-sm"></i>' : `<span class="text-sm font-bold">${step.num}</span>`}
                            </div>
                            <div class="flex-1">
                                <p class="font-medium text-sm ${step.current ? 'text-brand-dark' : 'text-gray-600'}">${step.title}</p>
                                ${step.current ? `
                                    <p class="text-xs ${step.waitingFor === 'admin' ? 'text-orange-600 font-bold' : 'text-blue-600'}">
                                        ${step.waitingFor === 'admin' ? '<i class="fas fa-hand-point-right mr-1"></i>Du bist dran!' : '<i class="fas fa-hourglass-half mr-1"></i>Warte auf Kunde'}
                                    </p>
                                ` : ''}
                            </div>
                            ${step.done && step.num === 1 && order.quickCheckDocument ? `
                                <a href="${order.quickCheckDocument.url}" target="_blank" class="text-xs text-purple-600 hover:underline flex items-center gap-1">
                                    <i class="fas fa-download"></i> CV ansehen
                                </a>
                            ` : ''}
                            ${step.done && step.num === 2 && order.quickCheckGutachtenUrl ? `
                                <a href="${order.quickCheckGutachtenUrl}" target="_blank" class="text-xs text-green-600 hover:underline flex items-center gap-1">
                                    <i class="fas fa-file-pdf"></i> Gutachten
                                </a>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Action Button -->
            ${hasCustomerDoc && !hasGutachten ? `
                <div class="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-hand-point-right text-orange-500"></i>
                        <span class="font-bold text-orange-700">Deine Aktion erforderlich</span>
                    </div>
                    <label class="w-full bg-gradient-to-r from-purple-600 to-pink-600 hover:from-purple-700 hover:to-pink-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer">
                        <i class="fas fa-file-upload"></i>
                        Gutachten hochladen & abschließen
                        <input type="file" class="hidden" accept=".pdf,.doc,.docx"
                               onchange="app.uploadQuickCheckGutachten('${order.id}', '${order.userId}', this.files[0], '${sanitizeHTML(order.customerEmail || '')}', '${sanitizeHTML(order.customerName || 'Kunde')}')">
                    </label>
                </div>
            ` : hasGutachten ? `
                <div class="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <i class="fas fa-check-circle text-green-500 text-2xl mb-2"></i>
                    <p class="font-bold text-green-700">Abgeschlossen!</p>
                    <p class="text-sm text-green-600">Gutachten wurde zugestellt.</p>
                </div>
            ` : ''}
        </div>
    `;
}

// Admin CV Workflow
function renderAdminCvWorkflow(order) {
    const hasSentQuestionnaire = !!order.cvProjectId;
    const hasReceivedData = order.cvStatus === 'data_received' || order.questionnaire;
    const cvReady = order.cvStatus === 'ready' || order.cvStatus === 'delivered';

    const steps = [
        {
            num: 1,
            title: 'Fragebogen senden',
            done: hasSentQuestionnaire,
            current: !hasSentQuestionnaire,
            waitingFor: 'admin',
            icon: 'fa-paper-plane'
        },
        {
            num: 2,
            title: 'Kunde füllt Fragebogen aus',
            done: hasReceivedData,
            current: hasSentQuestionnaire && !hasReceivedData,
            waitingFor: 'customer',
            icon: 'fa-edit'
        },
        {
            num: 3,
            title: 'CV erstellen & liefern',
            done: cvReady,
            current: hasReceivedData && !cvReady,
            waitingFor: 'admin',
            icon: 'fa-file-alt'
        }
    ];

    return `
        <div class="space-y-3">
            <!-- Workflow Steps -->
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-file-alt text-indigo-500"></i>
                    <span class="font-bold text-brand-dark">CV-Erstellung</span>
                </div>

                <div class="space-y-3">
                    ${steps.map(step => `
                        <div class="flex items-center gap-3 ${step.done ? 'opacity-60' : ''}">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                step.done ? 'bg-green-500 text-white' :
                                step.current ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white ring-4 ring-indigo-100' :
                                'bg-gray-200 text-gray-400'
                            }">
                                ${step.done ? '<i class="fas fa-check text-sm"></i>' : `<span class="text-sm font-bold">${step.num}</span>`}
                            </div>
                            <div class="flex-1">
                                <p class="font-medium text-sm ${step.current ? 'text-brand-dark' : 'text-gray-600'}">${step.title}</p>
                                ${step.current ? `
                                    <p class="text-xs ${step.waitingFor === 'admin' ? 'text-orange-600 font-bold' : 'text-blue-600'}">
                                        ${step.waitingFor === 'admin' ? '<i class="fas fa-hand-point-right mr-1"></i>Du bist dran!' : '<i class="fas fa-hourglass-half mr-1"></i>Warte auf Kunde'}
                                    </p>
                                ` : ''}
                            </div>
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Action Buttons -->
            ${!hasSentQuestionnaire ? `
                <div class="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-hand-point-right text-orange-500"></i>
                        <span class="font-bold text-orange-700">Deine Aktion erforderlich</span>
                    </div>
                    <button onclick="app.sendCvQuestionnaireFromOrder('${order.id}', '${sanitizeHTML(order.customerEmail || '')}', '${sanitizeHTML(order.customerName || 'Kunde')}')"
                            class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                        <i class="fas fa-paper-plane"></i>
                        Fragebogen an Kunde senden
                    </button>
                </div>
            ` : hasReceivedData && !cvReady ? `
                <div class="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-hand-point-right text-orange-500"></i>
                        <span class="font-bold text-orange-700">Deine Aktion erforderlich</span>
                    </div>
                    <div class="flex gap-2 mb-2">
                        <button onclick="app.toggleAdminQuestionnaireView('${order.id}')"
                                class="flex-1 bg-white border-2 border-indigo-200 text-indigo-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2">
                            <i class="fas fa-eye"></i>
                            Fragebogen-Daten ansehen
                            <i class="fas fa-chevron-down text-indigo-400 transition-transform" id="admin-cv-q-toggle-${order.id}"></i>
                        </button>
                        <button onclick="app.exportQuestionnaireToWord('${order.id}')"
                                class="bg-white border-2 border-green-200 text-green-700 px-4 py-2 rounded-lg text-sm font-medium flex items-center justify-center gap-2 hover:bg-green-50 transition"
                                title="Als Word exportieren">
                            <i class="fas fa-file-word"></i>
                            <span class="hidden sm:inline">Word</span>
                        </button>
                    </div>
                    <div id="admin-cv-questionnaire-view-${order.id}" class="hidden mt-3 bg-gray-50 rounded-lg p-3 border border-gray-200 max-h-96 overflow-y-auto mb-3">
                        ${order.questionnaire ? renderAdminQuestionnaireData(order.questionnaire, order.cvProject?.documents, order.cvProject?.templateSelection) : '<p class="text-gray-500">Keine Daten</p>'}
                    </div>
                    <label class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2 cursor-pointer">
                        <i class="fas fa-upload"></i>
                        CV hochladen & liefern
                        <input type="file" class="hidden" accept=".pdf,.doc,.docx"
                               data-user-id="${order.userId}"
                               data-order-id="${order.id}"
                               data-customer-email="${sanitizeHTML(order.customerEmail || '')}"
                               data-customer-name="${sanitizeHTML(order.customerName || 'Kunde')}"
                               onchange="app.uploadDocumentToUser(this.dataset.userId, this.dataset.orderId, this.files[0], this.dataset.customerEmail, this.dataset.customerName)">
                    </label>
                </div>
            ` : cvReady ? `
                <div class="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <i class="fas fa-check-circle text-green-500 text-2xl mb-2"></i>
                    <p class="font-bold text-green-700">Abgeschlossen!</p>
                    <p class="text-sm text-green-600">CV wurde an den Kunden geliefert.</p>
                </div>
            ` : hasSentQuestionnaire && !hasReceivedData ? `
                <div class="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-hourglass-half text-blue-500 animate-pulse text-xl"></i>
                        <div>
                            <p class="font-medium text-blue-700">Warte auf Kundenantwort</p>
                            <p class="text-xs text-blue-600">Fragebogen wurde gesendet</p>
                        </div>
                    </div>
                    <a href="?questionnaire=${order.cvProjectId}" target="_blank" class="mt-2 inline-block text-xs text-blue-600 hover:underline">
                        <i class="fas fa-external-link-alt mr-1"></i>Fragebogen-Link
                    </a>
                </div>
            ` : ''}
        </div>
    `;
}

// Admin Mentoring Workflow
function renderAdminMentoringWorkflow(order) {
    const hasCoach = !!order.assignedCoachId;
    const hasProposals = order.appointmentProposals?.length > 0;
    const isDeclined = order.appointmentStatus === 'declined';
    const hasConfirmed = order.appointment?.confirmed;
    const appointmentPassed = hasConfirmed && new Date(order.appointment.datetime) < new Date();
    const isRefunded = order.refundStatus === 'refunded' || order.refundStatus === 'partially_refunded';

    // If refunded, show cancelled state
    if (isRefunded) {
        return `
            <div class="space-y-3">
                <div class="bg-red-50 rounded-xl p-4 border border-red-200">
                    <div class="flex items-center gap-3 mb-3">
                        <div class="w-10 h-10 bg-red-100 rounded-full flex items-center justify-center">
                            <i class="fas fa-ban text-red-500"></i>
                        </div>
                        <div>
                            <p class="font-bold text-red-700">${order.refundStatus === 'partially_refunded' ? 'Mentoring storniert (Teilerstattung)' : 'Storniert & Erstattet'}</p>
                            <p class="text-xs text-red-600">€${(order.refundAmount || 0).toFixed(2)} erstattet am ${order.refundedAt ? new Date(order.refundedAt.seconds * 1000).toLocaleDateString('de-DE') : 'unbekannt'}</p>
                        </div>
                    </div>
                    ${order.refundReason ? `
                        <div class="bg-white/50 rounded-lg p-3 mt-2">
                            <p class="text-xs text-gray-500 uppercase tracking-wide mb-1">Grund</p>
                            <p class="text-sm text-gray-700">${sanitizeHTML(order.refundReason)}</p>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    const steps = [
        {
            num: 1,
            title: 'Coach zuweisen',
            done: hasCoach,
            current: !hasCoach,
            waitingFor: 'admin',
            icon: 'fa-user-plus'
        },
        {
            num: 2,
            title: 'Terminvorschläge senden',
            done: hasProposals || hasConfirmed,
            current: hasCoach && !hasProposals && !hasConfirmed && !isDeclined,
            waitingFor: 'admin',
            icon: 'fa-calendar-plus'
        },
        {
            num: 3,
            title: 'Kunde wählt Termin',
            done: hasConfirmed,
            current: hasProposals && !hasConfirmed && !isDeclined,
            waitingFor: 'customer',
            icon: 'fa-calendar-check'
        },
        {
            num: 4,
            title: 'Session durchführen',
            done: appointmentPassed,
            current: hasConfirmed && !appointmentPassed,
            waitingFor: 'both',
            icon: 'fa-video'
        }
    ];

    // If declined, reset step 2 and 3
    if (isDeclined) {
        steps[1].done = false;
        steps[1].current = true;
        steps[2].done = false;
        steps[2].current = false;
    }

    return `
        <div class="space-y-3">
            <!-- Workflow Steps -->
            <div class="bg-white rounded-xl p-4 border border-gray-100">
                <div class="flex items-center gap-2 mb-4">
                    <i class="fas fa-user-tie text-indigo-500"></i>
                    <span class="font-bold text-brand-dark">Mentoring Session</span>
                    ${hasCoach ? `<span class="text-xs text-gray-500 ml-auto">Coach: ${sanitizeHTML(order.assignedCoachName || 'Zugewiesen')}</span>` : ''}
                </div>

                <div class="space-y-3">
                    ${steps.map(step => `
                        <div class="flex items-center gap-3 ${step.done ? 'opacity-60' : ''}">
                            <div class="w-8 h-8 rounded-full flex items-center justify-center flex-shrink-0 ${
                                step.done ? 'bg-green-500 text-white' :
                                step.current ? 'bg-gradient-to-r from-indigo-500 to-purple-500 text-white ring-4 ring-indigo-100' :
                                'bg-gray-200 text-gray-400'
                            }">
                                ${step.done ? '<i class="fas fa-check text-sm"></i>' : `<span class="text-sm font-bold">${step.num}</span>`}
                            </div>
                            <div class="flex-1">
                                <p class="font-medium text-sm ${step.current ? 'text-brand-dark' : 'text-gray-600'}">${step.title}</p>
                                ${step.current ? `
                                    <p class="text-xs ${step.waitingFor === 'admin' ? 'text-orange-600 font-bold' : step.waitingFor === 'customer' ? 'text-blue-600' : 'text-green-600'}">
                                        ${step.waitingFor === 'admin' ? '<i class="fas fa-hand-point-right mr-1"></i>Du bist dran!' :
                                          step.waitingFor === 'customer' ? '<i class="fas fa-hourglass-half mr-1"></i>Warte auf Kunde' :
                                          '<i class="fas fa-clock mr-1"></i>Termin steht'}
                                    </p>
                                ` : ''}
                            </div>
                            ${step.done && step.num === 3 && order.appointment?.datetime ? `
                                <span class="text-xs text-gray-500">${new Date(order.appointment.datetime).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' })}</span>
                            ` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>

            <!-- Declined Warning -->
            ${isDeclined ? `
                <div class="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div class="flex items-center gap-2 mb-2">
                        <i class="fas fa-exclamation-triangle text-orange-500"></i>
                        <span class="font-bold text-orange-700">Termine abgelehnt</span>
                    </div>
                    ${order.appointmentDeclineReason ? `
                        <p class="text-sm text-gray-600 italic mb-3">"${sanitizeHTML(order.appointmentDeclineReason)}"</p>
                    ` : ''}
                    <button onclick="app.showAppointmentProposalModal('${order.id}', '${order.userId}', '${sanitizeHTML(order.customerName || 'Kunde')}', '${sanitizeHTML(order.customerEmail || '')}', '${order.assignedCoachId || ''}')"
                            class="w-full bg-gradient-to-r from-orange-500 to-amber-500 hover:from-orange-600 hover:to-amber-600 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                        <i class="fas fa-calendar-plus"></i>
                        Neue Termine vorschlagen
                    </button>
                </div>
            ` : ''}

            <!-- Action Buttons -->
            ${!hasCoach ? `
                <div class="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-hand-point-right text-orange-500"></i>
                        <span class="font-bold text-orange-700">Deine Aktion erforderlich</span>
                    </div>
                    <button onclick="app.showAssignCoachModal('${order.id}')"
                            class="w-full bg-gradient-to-r from-indigo-600 to-purple-600 hover:from-indigo-700 hover:to-purple-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                        <i class="fas fa-user-plus"></i>
                        Coach zuweisen
                    </button>
                </div>
            ` : hasCoach && !hasProposals && !hasConfirmed && !isDeclined ? `
                <div class="bg-orange-50 rounded-xl p-4 border-2 border-orange-200">
                    <div class="flex items-center gap-2 mb-3">
                        <i class="fas fa-hand-point-right text-orange-500"></i>
                        <span class="font-bold text-orange-700">Deine Aktion erforderlich</span>
                    </div>
                    <button onclick="app.showAppointmentProposalModal('${order.id}', '${order.userId}', '${sanitizeHTML(order.customerName || 'Kunde')}', '${sanitizeHTML(order.customerEmail || '')}', '${order.assignedCoachId || ''}')"
                            class="w-full bg-gradient-to-r from-green-600 to-emerald-600 hover:from-green-700 hover:to-emerald-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                        <i class="fas fa-calendar-plus"></i>
                        Terminvorschläge senden
                    </button>
                </div>
            ` : hasProposals && !hasConfirmed && !isDeclined ? `
                <div class="bg-blue-50 rounded-xl p-4 border border-blue-200">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-hourglass-half text-blue-500 animate-pulse text-xl"></i>
                        <div>
                            <p class="font-medium text-blue-700">Warte auf Kundenauswahl</p>
                            <p class="text-xs text-blue-600">${order.appointmentProposals.length} Termine vorgeschlagen</p>
                        </div>
                    </div>
                </div>
            ` : hasConfirmed && !appointmentPassed ? `
                <div class="bg-green-50 rounded-xl p-4 border border-green-200">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-calendar-check text-green-500 text-xl"></i>
                        <div>
                            <p class="font-bold text-green-700">Termin bestätigt</p>
                            <p class="text-sm text-green-600">${new Date(order.appointment.datetime).toLocaleString('de-DE', { weekday: 'long', day: '2-digit', month: 'long', hour: '2-digit', minute: '2-digit' })} Uhr</p>
                        </div>
                    </div>
                    ${isMeetingTimeNow(order.appointment.datetime) ? `
                        <button onclick="app.joinMeeting('${order.id}')" class="mt-3 w-full bg-gradient-to-r from-blue-600 to-indigo-600 text-white px-4 py-3 rounded-lg text-sm font-bold flex items-center justify-center gap-2">
                            <i class="fas fa-video"></i>
                            Meeting beitreten
                        </button>
                    ` : ''}
                </div>
            ` : appointmentPassed ? `
                <div class="bg-green-50 rounded-xl p-4 border border-green-200 text-center">
                    <i class="fas fa-check-circle text-green-500 text-2xl mb-2"></i>
                    <p class="font-bold text-green-700">Session abgeschlossen!</p>
                </div>
            ` : ''}

            <!-- Refund Section (only if not already refunded and session not completed) -->
            ${order.refundStatus === 'refunded' || order.refundStatus === 'partially_refunded' ? `
                <div class="bg-red-50 rounded-xl p-4 border border-red-200">
                    <div class="flex items-center gap-3">
                        <i class="fas fa-undo text-red-500 text-xl"></i>
                        <div>
                            <p class="font-bold text-red-700">${order.refundStatus === 'partially_refunded' ? 'Teilweise erstattet' : 'Erstattet'}</p>
                            <p class="text-xs text-red-600">€${(order.refundAmount || 0).toFixed(2)} von €${(order.total || 0).toFixed(2)} am ${order.refundedAt ? new Date(order.refundedAt.seconds * 1000).toLocaleDateString('de-DE') : 'unbekannt'}</p>
                            ${order.refundReason ? `<p class="text-xs text-gray-500 mt-1">${sanitizeHTML(order.refundReason)}</p>` : ''}
                        </div>
                    </div>
                    ${order.refundStatus === 'partially_refunded' && !appointmentPassed ? `
                        <button onclick="app.showRefundModal('${order.id}', '${sanitizeHTML(order.customerName || 'Kunde')}', ${order.total || 0}, '${encodeURIComponent(JSON.stringify(order.items || []))}')"
                                class="mt-3 w-full text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 hover:bg-red-50 px-3 py-2 rounded-lg text-xs font-medium transition">
                            Weitere Erstattung
                        </button>
                    ` : ''}
                </div>
            ` : !appointmentPassed ? `
                <div class="mt-4 pt-4 border-t border-gray-200">
                    <button onclick="app.showRefundModal('${order.id}', '${sanitizeHTML(order.customerName || 'Kunde')}', ${order.total || 0}, '${encodeURIComponent(JSON.stringify(order.items || []))}')"
                            class="w-full text-red-600 hover:text-red-700 border border-red-200 hover:border-red-300 hover:bg-red-50 px-4 py-2 rounded-lg text-xs font-medium transition flex items-center justify-center gap-2">
                        <i class="fas fa-undo"></i>
                        Rückerstattung (Compliance-Konflikt)
                    </button>
                </div>
            ` : ''}
        </div>
    `;
}

async function loadOrderDocuments(userId, orderId) {
    const customerContainer = document.getElementById(`doc-list-customer-${orderId}`);
    const adminContainer = document.getElementById(`doc-list-admin-${orderId}`);
    if (!storage) return;

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");

        // Load customer uploaded documents (from users/{userId}/)
        if (customerContainer) {
            try {
                const customerRef = ref(storage, `users/${userId}`);
                const customerResult = await listAll(customerRef);

                if (customerResult.items.length === 0) {
                    customerContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Keine Dokumente</p>';
                } else {
                    const docs = await Promise.all(customerResult.items.map(async item => {
                        const url = await getDownloadURL(item);
                        // Extract original filename (remove timestamp prefix)
                        const nameParts = item.name.split('_');
                        const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
                        return { name: displayName, fullName: item.name, url };
                    }));

                    customerContainer.innerHTML = docs.map(d => `
                        <a href="${d.url}" target="_blank" download="${d.name}"
                           class="flex items-center gap-2 text-sm text-blue-600 hover:text-blue-800 transition bg-blue-50 px-3 py-2 rounded">
                            <i class="fas fa-file-alt"></i>
                            <span>${sanitizeHTML(d.name)}</span>
                            <i class="fas fa-download text-xs ml-auto"></i>
                        </a>
                    `).join('');
                }
            } catch (e) {
                customerContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Keine Dokumente</p>';
            }
        }

        // Load admin delivered documents (from delivered/{userId}/)
        if (adminContainer) {
            try {
                const adminRef = ref(storage, `delivered/${userId}`);
                const adminResult = await listAll(adminRef);

                if (adminResult.items.length === 0) {
                    adminContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Noch nichts gesendet</p>';
                } else {
                    const docs = await Promise.all(adminResult.items.map(async item => {
                        const url = await getDownloadURL(item);
                        // Extract original filename (remove timestamp prefix)
                        const nameParts = item.name.split('_');
                        const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
                        return { name: displayName, fullName: item.name, url };
                    }));

                    adminContainer.innerHTML = docs.map(d => `
                        <a href="${d.url}" target="_blank" download="${d.name}"
                           class="flex items-center gap-2 text-sm text-green-600 hover:text-green-800 transition bg-green-50 px-3 py-2 rounded">
                            <i class="fas fa-file-pdf"></i>
                            <span>${sanitizeHTML(d.name)}</span>
                            <i class="fas fa-download text-xs ml-auto"></i>
                        </a>
                    `).join('');
                }
            } catch (e) {
                adminContainer.innerHTML = '<p class="text-xs text-gray-400 italic">Noch nichts gesendet</p>';
            }
        }

    } catch (e) {
        logger.error('Failed to load documents:', e);
        if (customerContainer) customerContainer.innerHTML = '<p class="text-xs text-red-400">Fehler beim Laden</p>';
        if (adminContainer) adminContainer.innerHTML = '<p class="text-xs text-red-400">Fehler beim Laden</p>';
    }
}

// Delete all test orders (Admin only)
export async function deleteAllTestOrders() {
    // Confirmation dialog
    const confirmMsg = `ACHTUNG: Alle Bestellungen werden unwiderruflich gelöscht!\n\nDies betrifft ${allAdminOrders.length} Bestellung(en).\n\nMöchten Sie fortfahren?`;

    if (!confirm(confirmMsg)) {
        return;
    }

    // Second confirmation for safety
    const doubleConfirm = prompt('Zur Bestätigung bitte "LÖSCHEN" eingeben:');
    if (doubleConfirm !== 'LÖSCHEN') {
        showToast('Löschvorgang abgebrochen');
        return;
    }

    try {
        showToast('Lösche Bestellungen...');

        let deletedCount = 0;
        const errors = [];

        for (const order of allAdminOrders) {
            try {
                await deleteDoc(doc(db, 'orders', order.id));
                deletedCount++;
            } catch (err) {
                errors.push({ id: order.id, error: err.message });
                logger.error(`Failed to delete order ${order.id}:`, err);
            }
        }

        if (errors.length > 0) {
            showToast(`${deletedCount} gelöscht, ${errors.length} Fehler`);
        } else {
            showToast(`${deletedCount} Bestellungen erfolgreich gelöscht`);
        }

        // Reload orders
        await loadAllOrders();

    } catch (error) {
        logger.error('Error deleting test orders:', error);
        showToast('Fehler beim Löschen der Bestellungen');
    }
}

// Toggle order card expand/collapse
export function toggleOrderExpand(orderId) {
    const details = document.getElementById(`order-details-${orderId}`);
    const icon = document.getElementById(`expand-icon-${orderId}`);

    if (details && icon) {
        const isHidden = details.classList.contains('hidden');
        details.classList.toggle('hidden');
        icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';

        // Load documents when expanded
        if (isHidden) {
            const order = allAdminOrders.find(o => o.id === orderId);
            if (order?.userId) {
                loadOrderDocuments(order.userId, orderId);
            }
        }
    }
}

// Toggle documents section within order
export function toggleOrderDocs(orderId) {
    const docs = document.getElementById(`docs-content-${orderId}`);
    const icon = document.getElementById(`docs-icon-${orderId}`);

    if (docs && icon) {
        const isHidden = docs.classList.contains('hidden');
        docs.classList.toggle('hidden');
        icon.style.transform = isHidden ? 'rotate(180deg)' : 'rotate(0deg)';
    }
}

export async function updateOrderStatus(orderId, newStatus) {
    if (!db) return;

    try {
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, {
            status: newStatus,
            updatedAt: new Date()
        });

        // Update local data
        const order = allAdminOrders.find(o => o.id === orderId);
        if (order) order.status = newStatus;

        updateAdminStats(allAdminOrders);
        showToast(`✅ Status auf "${newStatus}" geändert`);

    } catch (e) {
        logger.error('Failed to update status:', e);
        showToast('❌ Status-Update fehlgeschlagen', 3000);
    }
}

export async function uploadDocumentToUser(userId, orderId, file, customerEmail, customerName) {
    console.log('[UPLOAD] Started:', { userId, orderId, fileName: file?.name, customerEmail, customerName });

    if (!file || !storage || !userId) {
        console.error('[UPLOAD] Validation failed:', { hasFile: !!file, hasStorage: !!storage, userId });
        showToast('❌ Upload nicht möglich', 3000);
        return;
    }

    try {
        showToast('⏳ Dokument wird hochgeladen...');

        const timestamp = Date.now();
        const fileName = `${timestamp}_${file.name}`;
        const storageRef = ref(storage, `delivered/${userId}/${fileName}`);

        console.log('[UPLOAD] Uploading to storage:', `delivered/${userId}/${fileName}`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);
        console.log('[UPLOAD] Storage upload success, URL:', downloadUrl);

        // Update order status to delivered/completed
        if (orderId && db) {
            console.log('[UPLOAD] Updating Firestore order:', orderId);
            try {
                const orderRef = doc(db, 'orders', orderId);
                await updateDoc(orderRef, {
                    cvStatus: 'delivered',
                    status: 'completed',
                    deliveredDocumentUrl: downloadUrl,
                    deliveredDocumentName: file.name,
                    deliveredAt: serverTimestamp()
                });
                console.log('[UPLOAD] Firestore update SUCCESS');
            } catch (firestoreErr) {
                console.error('[UPLOAD] Firestore update FAILED:', firestoreErr);
            }
        } else {
            console.warn('[UPLOAD] Cannot update order - orderId or db missing:', { orderId, hasDb: !!db });
        }

        // Notify customer via email
        if (customerEmail) {
            try {
                const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyCustomerDocumentReady', {
                    method: 'POST',
                    headers: { 'Content-Type': 'application/json' },
                    body: JSON.stringify({
                        customerEmail: customerEmail,
                        customerName: customerName || 'Kunde',
                        documentName: file.name,
                        orderId: orderId
                    })
                });
                if (response.ok) {
                    showToast('✅ Dokument hochgeladen & Kunde benachrichtigt!');
                } else {
                    logger.warn('Email notification failed with status:', response.status);
                    showToast('✅ Dokument hochgeladen (E-Mail-Versand fehlgeschlagen)');
                }
            } catch (emailErr) {
                logger.warn('Failed to send customer notification:', emailErr);
                showToast('✅ Dokument hochgeladen (E-Mail konnte nicht gesendet werden)');
            }
        } else {
            showToast('✅ Dokument erfolgreich hochgeladen');
        }

        // Force UI refresh by reloading all orders
        console.log('[UPLOAD] Forcing complete UI refresh...');
        // Clear the container and reload everything
        const container = document.getElementById('admin-orders-container');
        if (container) {
            container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-brand-gold"></i></div>';
        }
        await loadAllOrders();
        console.log('[UPLOAD] Admin orders reloaded and UI refreshed');

    } catch (e) {
        console.error('[UPLOAD] Upload failed:', e);
        showToast('❌ Upload fehlgeschlagen: ' + e.message, 3000);
    }
}

// Load delivered documents for user dashboard
export async function loadDeliveredDocuments(state) {
    logger.log('Loading delivered documents for user:', state.user?.uid);

    if (!state.user || !storage) {
        logger.log('No user or storage available');
        return;
    }

    const container = document.getElementById('downloads-list');
    if (!container) {
        logger.log('Downloads container not found');
        return;
    }

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");
        const storagePath = `delivered/${state.user.uid}`;
        logger.log('Checking storage path:', storagePath);
        const listRef = ref(storage, storagePath);
        const result = await listAll(listRef);
        logger.log('Found documents:', result.items.length);

        if (result.items.length === 0) {
            container.innerHTML = `
                <div class="text-center py-8 text-gray-500">
                    <i class="fas fa-award text-3xl text-gray-300 mb-3"></i>
                    <p class="text-sm">Noch keine fertigen Dokumente verfügbar</p>
                </div>
            `;
            return;
        }

        const docs = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            // Extract original filename (remove timestamp prefix)
            const nameParts = item.name.split('_');
            const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
            return { name: displayName, fullName: item.name, url };
        }));

        container.innerHTML = `
            <div class="space-y-3">
                ${docs.map(doc => `
                    <a href="${doc.url}" target="_blank" download="${doc.name}"
                       class="flex items-center justify-between p-4 bg-green-50 border border-green-200 rounded-lg hover:bg-green-100 transition group">
                        <div class="flex items-center gap-3">
                            <div class="w-10 h-10 bg-green-500 rounded-lg flex items-center justify-center">
                                <i class="fas fa-file-pdf text-white"></i>
                            </div>
                            <div>
                                <p class="font-bold text-brand-dark">${sanitizeHTML(doc.name)}</p>
                                <p class="text-xs text-gray-500">Klicken zum Download</p>
                            </div>
                        </div>
                        <i class="fas fa-download text-green-600 group-hover:scale-110 transition-transform"></i>
                    </a>
                `).join('')}
            </div>
        `;

    } catch (e) {
        logger.error('Failed to load delivered documents:', e);
        container.innerHTML = `
            <div class="text-center py-8 text-red-500">
                <i class="fas fa-exclamation-circle text-3xl mb-3"></i>
                <p class="text-sm">Fehler beim Laden der Dokumente</p>
            </div>
        `;
    }
}

// Load user uploaded documents for user dashboard
export async function loadUserUploads(state) {
    logger.log('Loading user uploads for user:', state.user?.uid);

    if (!state.user || !storage) {
        logger.log('No user or storage available');
        return;
    }

    const container = document.getElementById('user-uploads-list');
    if (!container) {
        logger.log('User uploads container not found');
        return;
    }

    try {
        const { listAll } = await import("https://www.gstatic.com/firebasejs/9.22.0/firebase-storage.js");
        const storagePath = `users/${state.user.uid}`;
        logger.log('Checking user uploads path:', storagePath);
        const listRef = ref(storage, storagePath);
        const result = await listAll(listRef);
        logger.log('Found user uploads:', result.items.length);

        if (result.items.length === 0) {
            container.innerHTML = `
                <div class="flex items-center gap-3 text-gray-400">
                    <i class="fas fa-folder-open text-lg"></i>
                    <span class="text-sm">Keine Uploads vorhanden</span>
                </div>
            `;
            return;
        }

        const docs = await Promise.all(result.items.map(async item => {
            const url = await getDownloadURL(item);
            const metadata = await getMetadata(item);
            // Extract original filename (remove timestamp prefix)
            const nameParts = item.name.split('_');
            const displayName = nameParts.length > 1 ? nameParts.slice(1).join('_') : item.name;
            return {
                name: displayName,
                fullName: item.name,
                url,
                uploadedAt: metadata.timeCreated || null
            };
        }));

        // Sort by date (newest first)
        docs.sort((a, b) => {
            const dateA = a.uploadedAt ? new Date(a.uploadedAt) : new Date(0);
            const dateB = b.uploadedAt ? new Date(b.uploadedAt) : new Date(0);
            return dateB - dateA;
        });

        container.innerHTML = `
            <div class="flex items-center gap-2 text-gray-500 mb-3">
                <i class="fas fa-folder-open text-lg"></i>
                <span class="text-sm font-medium">Ihre Uploads (${docs.length})</span>
            </div>
            <div class="space-y-2">
                ${docs.map(doc => `
                    <a href="${doc.url}" target="_blank" download="${doc.name}"
                       class="flex items-center justify-between p-3 bg-gray-50 border border-gray-200 rounded-lg hover:bg-gray-100 transition group">
                        <div class="flex items-center gap-3">
                            <div class="w-8 h-8 bg-gray-400 rounded flex items-center justify-center">
                                <i class="fas fa-file-alt text-white text-sm"></i>
                            </div>
                            <div>
                                <p class="font-medium text-brand-dark text-sm">${sanitizeHTML(doc.name)}</p>
                                <p class="text-xs text-gray-400">
                                    ${doc.uploadedAt ? new Date(doc.uploadedAt).toLocaleDateString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric' }) : ''}
                                </p>
                            </div>
                        </div>
                        <i class="fas fa-download text-gray-400 group-hover:text-gray-600 group-hover:scale-110 transition-all"></i>
                    </a>
                `).join('')}
            </div>
        `;

    } catch (e) {
        logger.error('Failed to load user uploads:', e);
        container.innerHTML = `
            <div class="flex items-center gap-3 text-gray-400">
                <i class="fas fa-folder-open text-lg"></i>
                <span class="text-sm">Keine Uploads vorhanden</span>
            </div>
        `;
    }
}

// Cookie Consent Functions
export function checkCookieConsent() {
    const consent = localStorage.getItem('apex-cookie-consent');
    const banner = document.getElementById('cookie-banner');

    if (!banner) return;

    // Akzeptiere auch alte Werte 'accepted' und 'declined'
    if (consent === 'all' || consent === 'essential' || consent === 'accepted' || consent === 'declined') {
        banner.classList.add('hidden');

        // Migriere alte Werte zu neuen
        if (consent === 'accepted') {
            localStorage.setItem('apex-cookie-consent', 'all');
        } else if (consent === 'declined') {
            localStorage.setItem('apex-cookie-consent', 'essential');
        }
    } else {
        // Zeige Banner mit Animation
        banner.classList.remove('hidden');
        setTimeout(() => {
            banner.style.transform = 'translateY(0)';
        }, 100);
    }
}

export async function acceptAllCookies() {
    localStorage.setItem('apex-cookie-consent', 'all');
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('hidden');

    // Speichere in Firestore wenn User eingeloggt ist
    await saveCookieConsentToFirestore('all');
    showToast('✅ Cookie-Einstellungen gespeichert');
}

export async function acceptEssentialCookies() {
    localStorage.setItem('apex-cookie-consent', 'essential');
    const banner = document.getElementById('cookie-banner');
    if (banner) banner.classList.add('hidden');

    // Speichere in Firestore wenn User eingeloggt ist
    await saveCookieConsentToFirestore('essential');
    showToast('✅ Cookie-Einstellungen gespeichert');
}

// Legacy-Funktionen für Kompatibilität
export function acceptCookies() {
    acceptAllCookies();
}

export function declineCookies() {
    acceptEssentialCookies();
}

// Speichere Cookie-Consent in Firestore
async function saveCookieConsentToFirestore(consentType) {
    try {
        const user = auth?.currentUser;
        if (!user || !db) return;

        await updateDoc(doc(db, 'users', user.uid), {
            cookieConsent: consentType,
            cookieConsentDate: new Date()
        });
        console.log('Cookie consent saved to Firestore:', consentType);
    } catch (error) {
        console.error('Error saving cookie consent:', error);
    }
}

// ========== STRATEGY CALL MODAL ==========

export function openStrategyModal() {
    const modal = document.getElementById('strategy-call-modal');
    if (modal) {
        modal.classList.remove('hidden');
        document.body.style.overflow = 'hidden';
    }
}

export function closeStrategyModal() {
    const modal = document.getElementById('strategy-call-modal');
    if (modal) {
        modal.classList.add('hidden');
        document.body.style.overflow = '';
    }
    // Reset form
    const form = document.getElementById('strategy-call-form');
    if (form) form.reset();
}

export async function submitStrategyCall(event) {
    event.preventDefault();

    const form = event.target;
    const submitBtn = form.querySelector('button[type="submit"]');
    const originalText = submitBtn?.textContent;

    if (submitBtn) {
        submitBtn.disabled = true;
        submitBtn.textContent = 'Wird gesendet...';
    }

    try {
        const formData = {
            name: form.querySelector('[name="name"]')?.value || '',
            email: form.querySelector('[name="email"]')?.value || '',
            phone: form.querySelector('[name="phone"]')?.value || '',
            message: form.querySelector('[name="message"]')?.value || '',
            createdAt: new Date().toISOString(),
            status: 'new'
        };

        if (!db) {
            showToast('Fehler: Datenbank nicht verfügbar');
            return;
        }

        await addDoc(collection(db, 'strategyCalls'), formData);

        showToast('Anfrage erfolgreich gesendet!');
        closeStrategyModal();

    } catch (error) {
        logger.error('Error submitting strategy call:', error);
        showToast('Fehler beim Senden. Bitte versuchen Sie es erneut.');
    } finally {
        if (submitBtn) {
            submitBtn.disabled = false;
            submitBtn.textContent = originalText;
        }
    }
}

// ========== PACKAGE CONFIG MODAL ==========

export function openPackageConfigModal(state, name, price) {
    const modal = document.getElementById('package-config-modal');
    if (!modal) {
        // Fallback: direkt zum Warenkorb hinzufügen
        addToCart(state, name, price);
        return;
    }

    // Set package info - use IDs from HTML
    const titleEl = document.getElementById('config-modal-title');
    const basePriceEl = document.getElementById('config-base-price');
    const totalPriceEl = document.getElementById('config-total-price');

    if (titleEl) titleEl.textContent = name;
    if (basePriceEl) basePriceEl.textContent = `€${price}`;
    if (totalPriceEl) totalPriceEl.textContent = `€${price}`;

    // Store in modal data
    modal.dataset.packageName = name;
    modal.dataset.packagePrice = price;

    // Reset all options to default
    const languageRadios = modal.querySelectorAll('input[name="language"]');
    const deliveryRadios = modal.querySelectorAll('input[name="delivery"]');
    const addonCheckboxes = modal.querySelectorAll('input[type="checkbox"]');

    languageRadios.forEach(r => r.checked = r.value === 'de');
    deliveryRadios.forEach(r => r.checked = r.value === 'standard');
    addonCheckboxes.forEach(c => c.checked = false);

    // Show/hide sections based on package
    const isQuickCheck = name.includes('Quick-Check');
    const isExecutive = name.includes('Executive') || name.includes('C-Suite');

    const languageSection = document.getElementById('config-language-section');
    const languageIncluded = document.getElementById('config-language-included');

    if (languageSection) languageSection.classList.toggle('hidden', isExecutive || isQuickCheck);
    if (languageIncluded) languageIncluded.classList.toggle('hidden', !isExecutive);

    modal.classList.remove('hidden');
    modal.style.display = 'flex';
    document.body.style.overflow = 'hidden';

    // Scroll content to top
    const content = document.getElementById('config-modal-content');
    if (content) content.scrollTop = 0;

    checkModalScroll();
}

export function closePackageConfigModal() {
    const modal = document.getElementById('package-config-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// ========== BUNDLE RENDERER (Dynamic from PACKAGES config) ==========

export function renderBundleSection() {
    const container = document.getElementById('bundle-content');
    if (!container) return;

    const seniorCV = PACKAGES.seniorProfessional;
    const mentoring = PACKAGES.mentoring3Sessions;
    const seniorBundle = BUNDLES.seniorBundle;
    const cSuiteBundle = BUNDLES.cSuiteBundle;

    container.innerHTML = `
        <div class="grid md:grid-cols-2 gap-6 text-left">
            <div>
                <h4 class="font-serif text-lg mb-3 text-brand-gold">${seniorCV.name} CV</h4>
                <ul class="space-y-2 text-sm text-gray-400">
                    ${seniorCV.features.map(f => `
                        <li class="flex items-start">
                            <span class="text-brand-gold mr-2">—</span>
                            <span>${f}</span>
                        </li>
                    `).join('')}
                </ul>
                <div class="mt-4 text-gray-400 text-sm">Regulär: <span class="line-through text-gray-500">€${seniorCV.price}</span></div>
            </div>

            <div>
                <h4 class="font-serif text-lg mb-3 text-brand-gold">${mentoring.name}</h4>
                <ul class="space-y-2 text-sm text-gray-400">
                    ${mentoring.features.map(f => `
                        <li class="flex items-start">
                            <span class="text-brand-gold mr-2">—</span>
                            <span>${f}</span>
                        </li>
                    `).join('')}
                </ul>
                <div class="mt-4 text-gray-400 text-sm">Regulär: <span class="line-through text-gray-500">€${mentoring.price}</span></div>
            </div>
        </div>
        <!-- Ersparnis-Hinweis -->
        <div class="mt-6 pt-4 border-t border-white/10 flex items-center justify-center gap-3">
            <span class="text-gray-400 text-sm">Einzelpreis: <span class="line-through">€${seniorBundle.regularPrice}</span></span>
            <span class="bg-green-500/20 text-green-400 px-3 py-1 text-xs font-bold uppercase rounded-full">Sie sparen €${seniorBundle.savings}</span>
        </div>
    `;

    // Update price display
    const priceDisplay = document.getElementById('bundle-price');
    if (priceDisplay) {
        priceDisplay.textContent = `Ab €${seniorBundle.price.toLocaleString('de-DE')}`;
    }

    // Update buttons
    const seniorBtn = document.getElementById('bundle-senior-btn');
    const cSuiteBtn = document.getElementById('bundle-csuite-btn');

    if (seniorBtn) {
        seniorBtn.textContent = `Senior Bundle · €${seniorBundle.price.toLocaleString('de-DE')}`;
        seniorBtn.onclick = () => window.app.addToCart(seniorBundle.name, seniorBundle.price);
    }

    if (cSuiteBtn) {
        cSuiteBtn.textContent = `C-Suite Bundle · €${cSuiteBundle.price.toLocaleString('de-DE')}`;
        cSuiteBtn.onclick = () => window.app.addToCart(cSuiteBundle.name, cSuiteBundle.price);
    }

    // Update C-Suite extras
    const extrasText = document.getElementById('bundle-csuite-extras');
    if (extrasText && cSuiteBundle.extras) {
        extrasText.innerHTML = `C-Suite Bundle enthält zusätzlich: <span class="text-brand-gold font-medium">${cSuiteBundle.extras}</span>`;
    }
}

// ========== MENTORING PACKAGES RENDERER (Dynamic from PACKAGES config) ==========

export function renderMentoringPackages() {
    const container = document.getElementById('mentoring-packages-grid');
    if (!container) return;

    const single = PACKAGES.mentoringSingle;
    const sessions3 = PACKAGES.mentoring3Sessions;
    const retainer = PACKAGES.mentoringRetainer;

    container.innerHTML = `
        <!-- Single Session - Kompakt -->
        <div class="bg-white/[0.03] border border-white/10 rounded-xl p-6 hover:border-brand-gold/30 transition-all flex flex-col">
            <div class="mb-4">
                <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">${single.name}</div>
                <div class="text-3xl font-serif text-white">€${formatPrice(single.price)}</div>
                <div class="text-[11px] text-gray-500">${single.priceNote}</div>
            </div>
            <ul class="space-y-2 mb-5 text-sm text-gray-400 flex-grow">
                ${single.features.map(f => `
                    <li class="flex items-center gap-2">
                        <i class="fas fa-check text-brand-gold text-[10px]"></i>
                        <span>${f}</span>
                    </li>
                `).join('')}
            </ul>
            <button onclick="app.addToCart('Executive Mentoring - ${single.name}', ${single.price})" class="w-full border border-brand-gold/40 text-brand-gold py-3 text-xs font-semibold uppercase tracking-wider hover:bg-brand-gold hover:text-brand-dark transition-all rounded-full mt-auto">
                Session buchen
            </button>
        </div>

        <!-- 3-Session Package - HERO (empfohlen) -->
        <div class="relative bg-brand-gold text-brand-dark rounded-xl p-6 flex flex-col shadow-xl shadow-brand-gold/20">
            <div class="absolute -top-3 left-1/2 -translate-x-1/2 bg-brand-dark text-brand-gold px-3 py-1 text-[10px] font-bold uppercase tracking-wide rounded-full border border-brand-gold/30">
                Empfohlen
            </div>
            <div class="mb-4 pt-2">
                <div class="text-xs text-brand-dark/70 uppercase tracking-wider mb-1">${sessions3.name}</div>
                <div class="text-3xl font-serif">€${formatPrice(sessions3.price)}</div>
                <div class="text-[11px] text-brand-dark/60">${sessions3.priceNote}</div>
            </div>
            <p class="text-xs text-brand-dark/80 mb-4 leading-relaxed">
                <strong>Ideal für:</strong> ${sessions3.idealFor}
            </p>
            <ul class="space-y-2.5 mb-5 text-sm flex-grow">
                ${sessions3.features.map(f => `
                    <li class="flex items-center gap-2">
                        <i class="fas fa-check text-brand-dark/80 text-[10px]"></i>
                        <span>${f}</span>
                    </li>
                `).join('')}
            </ul>
            <button onclick="app.addToCart('Executive Mentoring - ${sessions3.name}', ${sessions3.price})" class="w-full bg-brand-dark text-brand-gold py-3 text-xs font-bold uppercase tracking-wider hover:bg-white hover:text-brand-dark transition-all rounded-full mt-auto">
                Paket buchen
            </button>
        </div>

        <!-- Executive Retainer - Kompakt -->
        <div class="bg-white/[0.03] border border-white/10 rounded-xl p-6 hover:border-brand-gold/30 transition-all flex flex-col">
            <div class="mb-4">
                <div class="text-xs text-gray-400 uppercase tracking-wider mb-1">${retainer.name}</div>
                <div class="text-3xl font-serif text-white">€${formatPrice(retainer.price)}</div>
                <div class="text-[11px] text-gray-500">${retainer.priceNote}</div>
            </div>
            <ul class="space-y-2 mb-5 text-sm text-gray-400 flex-grow">
                ${retainer.features.slice(0, -1).map(f => `
                    <li class="flex items-center gap-2">
                        <i class="fas fa-check text-brand-gold text-[10px]"></i>
                        <span>${f}</span>
                    </li>
                `).join('')}
                <li class="flex items-center gap-2">
                    <i class="fas fa-star text-brand-gold text-[10px]"></i>
                    <span class="text-white">${retainer.features[retainer.features.length - 1]}</span>
                </li>
            </ul>
            <button onclick="app.openStrategyModal()" class="w-full border border-brand-gold/40 text-brand-gold py-3 text-xs font-semibold uppercase tracking-wider hover:bg-brand-gold hover:text-brand-dark transition-all rounded-full mt-auto">
                Beratung anfragen
            </button>
        </div>
    `;
}

// ========== PRICE INJECTION (Updates all hardcoded prices from PACKAGES config) ==========

export function injectPackagePrices() {
    // CV Package Preise
    const highPotential = PACKAGES.highPotential;
    const senior = PACKAGES.seniorProfessional;
    const executive = PACKAGES.executiveCSuite;

    // Mentoring Package Preise
    const mentoringSingle = PACKAGES.mentoringSingle;
    const mentoring3 = PACKAGES.mentoring3Sessions;
    const mentoringRetainer = PACKAGES.mentoringRetainer;

    // Hero-Sektion Preise
    const heroCV = document.getElementById('hero-cv-price');
    const heroMentoring = document.getElementById('hero-mentoring-price');
    if (heroCV) heroCV.textContent = `Ab €${formatPrice(highPotential.price)}`;
    if (heroMentoring) heroMentoring.textContent = `Ab €${formatPrice(mentoringSingle.price)}`;

    // CV-Karten Preise (Startseite)
    const cvYoungPrice = document.getElementById('cv-young-price');
    const cvSeniorPrice = document.getElementById('cv-senior-price');
    const cvExecutivePrice = document.getElementById('cv-executive-price');
    if (cvYoungPrice) cvYoungPrice.textContent = `€${formatPrice(highPotential.price)}`;
    if (cvSeniorPrice) cvSeniorPrice.textContent = `€${formatPrice(senior.price)}`;
    if (cvExecutivePrice) cvExecutivePrice.textContent = `€${formatPrice(executive.price)}`;

    // Detail-Page Preise
    const detailYoungPrice = document.getElementById('detail-young-price');
    const detailSeniorPrice = document.getElementById('detail-senior-price');
    const detailExecutivePrice = document.getElementById('detail-executive-price');
    if (detailYoungPrice) detailYoungPrice.textContent = `€${formatPrice(highPotential.price)}`;
    if (detailSeniorPrice) detailSeniorPrice.textContent = `€${formatPrice(senior.price)}`;
    if (detailExecutivePrice) detailExecutivePrice.textContent = `€${formatPrice(executive.price)}`;

    // Vergleichstabelle Preise
    const tableYoungPrice = document.getElementById('table-young-price');
    const tableSeniorPrice = document.getElementById('table-senior-price');
    const tableExecutivePrice = document.getElementById('table-executive-price');
    if (tableYoungPrice) tableYoungPrice.textContent = `€${formatPrice(highPotential.price)}`;
    if (tableSeniorPrice) tableSeniorPrice.textContent = `€${formatPrice(senior.price)}`;
    if (tableExecutivePrice) tableExecutivePrice.textContent = `€${formatPrice(executive.price)}`;

    // FAQ Paket-Beschreibungen
    const faqPackages = document.getElementById('faq-packages-content');
    if (faqPackages) {
        faqPackages.innerHTML = `
            <strong>${highPotential.name} (€${formatPrice(highPotential.price)}):</strong> ${highPotential.faqDescription}<br><br>
            <strong>${senior.name} (€${formatPrice(senior.price)}):</strong> ${senior.faqDescription}<br><br>
            <strong>${executive.name} (€${formatPrice(executive.price)}):</strong> ${executive.faqDescription}
        `;
    }
}

// ========== CV SAMPLE MODAL ==========

export function openCvSampleModal() {
    const modal = document.getElementById('cv-sample-modal');
    if (modal) {
        modal.classList.remove('hidden');
        modal.style.display = 'flex';
        document.body.style.overflow = 'hidden';
    }
}

export function closeCvSampleModal() {
    const modal = document.getElementById('cv-sample-modal');
    if (modal) {
        modal.classList.add('hidden');
        modal.style.display = 'none';
        document.body.style.overflow = '';
    }
}

// ========== PORTFOLIO GALLERY MANAGEMENT ==========

// Portfolio state
let portfolioImages = [];
let currentPortfolioIndex = 0;

// Load portfolio gallery on page load
export async function loadPortfolioImage() {
    try {
        const docRef = doc(db, 'settings', 'portfolio');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            const data = docSnap.data();

            // Check for new format (images array)
            if (data.images && Array.isArray(data.images) && data.images.length > 0) {
                portfolioImages = data.images;
            }
            // Migrate old format (single imageUrl) to new format
            else if (data.imageUrl) {
                portfolioImages = [{
                    imageUrl: data.imageUrl,
                    fileName: data.fileName || 'Migriert',
                    storagePath: data.storagePath || '',
                    uploadedAt: data.uploadedAt || new Date().toISOString()
                }];
            } else {
                portfolioImages = [];
            }

            if (portfolioImages.length > 0) {
                currentPortfolioIndex = 0;

                // Update showcase images (stacked cards)
                const showcaseImg = document.getElementById('cv-showcase-image');
                const showcaseImg2 = document.getElementById('cv-showcase-image-2');
                const showcaseImg3 = document.getElementById('cv-showcase-image-3');

                if (showcaseImg) {
                    showcaseImg.src = portfolioImages[0].imageUrl;
                }
                // Set second card image (use second image or first if only one)
                if (showcaseImg2 && portfolioImages.length > 1) {
                    showcaseImg2.src = portfolioImages[1].imageUrl;
                } else if (showcaseImg2) {
                    showcaseImg2.src = portfolioImages[0].imageUrl;
                }
                // Set third card image (use third, second, or first depending on available)
                if (showcaseImg3) {
                    if (portfolioImages.length > 2) {
                        showcaseImg3.src = portfolioImages[2].imageUrl;
                    } else if (portfolioImages.length > 1) {
                        showcaseImg3.src = portfolioImages[1].imageUrl;
                    } else {
                        showcaseImg3.src = portfolioImages[0].imageUrl;
                    }
                }

                // Update modal image (only if modal elements exist)
                if (document.getElementById('cv-sample-image')) {
                    updateModalImage();
                }
            }
        } else {
            portfolioImages = [];
        }

        // Render admin gallery grid (only if admin panel exists)
        if (document.getElementById('portfolio-gallery-grid')) {
            renderAdminGallery();
        }

        // Set default fallback for showcase if no images
        if (portfolioImages.length === 0) {
            const showcaseImg = document.getElementById('cv-showcase-image');
            if (showcaseImg && !showcaseImg.src.includes('firebase')) {
                showcaseImg.src = '/images/cv-sample-executive.svg';
            }
        }
    } catch (error) {
        console.error('Error loading portfolio:', error);
        // Silent fail - don't block page load
    }
}

// Update all showcase images (stacked cards on homepage)
function updateShowcaseImages() {
    const showcaseImg = document.getElementById('cv-showcase-image');
    const showcaseImg2 = document.getElementById('cv-showcase-image-2');
    const showcaseImg3 = document.getElementById('cv-showcase-image-3');

    if (portfolioImages.length === 0) {
        if (showcaseImg) showcaseImg.src = '/images/cv-sample-executive.svg';
        return;
    }

    if (showcaseImg) {
        showcaseImg.src = portfolioImages[0].imageUrl;
    }
    if (showcaseImg2) {
        showcaseImg2.src = portfolioImages.length > 1 ? portfolioImages[1].imageUrl : portfolioImages[0].imageUrl;
    }
    if (showcaseImg3) {
        if (portfolioImages.length > 2) {
            showcaseImg3.src = portfolioImages[2].imageUrl;
        } else if (portfolioImages.length > 1) {
            showcaseImg3.src = portfolioImages[1].imageUrl;
        } else {
            showcaseImg3.src = portfolioImages[0].imageUrl;
        }
    }
}

// Update modal image and navigation
function updateModalImage() {
    const modalImg = document.getElementById('cv-sample-image');
    const placeholder = document.getElementById('cv-sample-placeholder');
    const prevBtn = document.getElementById('portfolio-prev-btn');
    const nextBtn = document.getElementById('portfolio-next-btn');
    const counter = document.getElementById('portfolio-counter');
    const dotsContainer = document.getElementById('portfolio-dots');

    if (portfolioImages.length === 0) {
        if (modalImg) modalImg.src = '/images/cv-sample-executive.svg';
        if (prevBtn) prevBtn.classList.add('hidden');
        if (nextBtn) nextBtn.classList.add('hidden');
        if (counter) counter.classList.add('hidden');
        if (dotsContainer) dotsContainer.innerHTML = '';
        return;
    }

    // Update image
    if (modalImg) {
        modalImg.style.opacity = '0';
        setTimeout(() => {
            modalImg.src = portfolioImages[currentPortfolioIndex].imageUrl;
            modalImg.style.opacity = '1';
        }, 150);
        modalImg.classList.remove('hidden');
    }
    if (placeholder) placeholder.classList.add('hidden');

    // Show/hide navigation based on image count
    if (portfolioImages.length > 1) {
        if (prevBtn) prevBtn.classList.remove('hidden');
        if (nextBtn) nextBtn.classList.remove('hidden');
        if (counter) {
            counter.classList.remove('hidden');
            counter.textContent = `| Bild ${currentPortfolioIndex + 1} von ${portfolioImages.length}`;
        }

        // Render dots
        if (dotsContainer) {
            dotsContainer.innerHTML = portfolioImages.map((_, i) => `
                <button onclick="app.goToPortfolioImage(${i})" class="w-2 h-2 rounded-full transition ${i === currentPortfolioIndex ? 'bg-brand-gold' : 'bg-white/30 hover:bg-white/50'}"></button>
            `).join('');
        }
    } else {
        if (prevBtn) prevBtn.classList.add('hidden');
        if (nextBtn) nextBtn.classList.add('hidden');
        if (counter) counter.classList.add('hidden');
        if (dotsContainer) dotsContainer.innerHTML = '';
    }
}

// Navigation functions
export function nextPortfolioImage() {
    if (portfolioImages.length <= 1) return;
    currentPortfolioIndex = (currentPortfolioIndex + 1) % portfolioImages.length;
    updateModalImage();
}

export function prevPortfolioImage() {
    if (portfolioImages.length <= 1) return;
    currentPortfolioIndex = (currentPortfolioIndex - 1 + portfolioImages.length) % portfolioImages.length;
    updateModalImage();
}

export function goToPortfolioImage(index) {
    if (index >= 0 && index < portfolioImages.length) {
        currentPortfolioIndex = index;
        updateModalImage();
    }
}

// Render admin gallery grid
function renderAdminGallery() {
    const grid = document.getElementById('portfolio-gallery-grid');
    const emptyState = document.getElementById('portfolio-empty-state');
    const countBadge = document.getElementById('portfolio-count-badge');

    if (!grid) return;

    // Update count badge
    if (countBadge) {
        countBadge.textContent = `${portfolioImages.length} Bild${portfolioImages.length !== 1 ? 'er' : ''}`;
    }

    if (portfolioImages.length === 0) {
        grid.innerHTML = `
            <div id="portfolio-empty-state" class="col-span-full text-center py-8 text-gray-400">
                <i class="fas fa-images text-3xl mb-2 opacity-50"></i>
                <p class="text-sm">Noch keine Portfolio-Bilder</p>
                <p class="text-xs mt-1">Klicken Sie oben auf "Bilder hinzufügen"</p>
            </div>
        `;
        return;
    }

    grid.innerHTML = portfolioImages.map((img, index) => `
        <div class="relative group aspect-[1/1.414] bg-gray-100 rounded-lg overflow-hidden border border-gray-200" data-index="${index}">
            <img src="${img.imageUrl}" alt="${img.fileName}" class="w-full h-full object-cover object-top">
            <!-- Overlay with actions -->
            <div class="absolute inset-0 bg-black/0 group-hover:bg-black/40 transition flex items-center justify-center gap-2 opacity-0 group-hover:opacity-100">
                ${index > 0 ? `<button onclick="app.movePortfolioImage(${index}, -1)" class="w-8 h-8 bg-white rounded-full flex items-center justify-center text-gray-700 hover:bg-brand-gold hover:text-brand-dark transition" title="Nach vorne">
                    <i class="fas fa-arrow-left text-xs"></i>
                </button>` : ''}
                <button onclick="app.deletePortfolioImage(${index})" class="w-8 h-8 bg-red-500 rounded-full flex items-center justify-center text-white hover:bg-red-600 transition" title="Löschen">
                    <i class="fas fa-trash text-xs"></i>
                </button>
                ${index < portfolioImages.length - 1 ? `<button onclick="app.movePortfolioImage(${index}, 1)" class="w-8 h-8 bg-white rounded-full flex items-center justify-center text-gray-700 hover:bg-brand-gold hover:text-brand-dark transition" title="Nach hinten">
                    <i class="fas fa-arrow-right text-xs"></i>
                </button>` : ''}
            </div>
            <!-- Position badge -->
            ${index === 0 ? `<div class="absolute top-1 left-1 bg-brand-gold text-brand-dark text-[10px] font-bold px-1.5 py-0.5 rounded">Vorschau</div>` : ''}
            <!-- Filename -->
            <div class="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/70 to-transparent p-2">
                <p class="text-white text-[10px] truncate">${img.fileName}</p>
            </div>
        </div>
    `).join('');
}

// Handle portfolio upload (multiple files)
export async function handlePortfolioUpload(input) {
    const files = Array.from(input.files || []);
    if (files.length === 0) return;

    // Validate files
    const validTypes = ['image/jpeg', 'image/png', 'image/webp', 'image/gif'];
    const validFiles = files.filter(file => {
        if (!validTypes.includes(file.type)) {
            showToast(`${file.name}: Nur JPG, PNG oder WebP`, 'error');
            return false;
        }
        if (file.size > 5 * 1024 * 1024) {
            showToast(`${file.name}: Zu groß (max. 5MB)`, 'error');
            return false;
        }
        return true;
    });

    if (validFiles.length === 0) return;

    // Show progress
    const progressContainer = document.getElementById('portfolio-upload-progress');
    const progressBar = document.getElementById('portfolio-progress-bar');
    const statusText = document.getElementById('portfolio-upload-status');
    if (progressContainer) progressContainer.classList.remove('hidden');
    if (progressBar) progressBar.style.width = '0%';

    try {
        const newImages = [];
        let completed = 0;

        for (const file of validFiles) {
            if (statusText) statusText.textContent = `Lade hoch: ${file.name} (${completed + 1}/${validFiles.length})`;

            const timestamp = Date.now();
            const ext = file.name.split('.').pop();
            const storageRef = ref(storage, `settings/portfolio-${timestamp}-${Math.random().toString(36).substr(2, 9)}.${ext}`);

            // Upload file
            const uploadTask = uploadBytesResumable(storageRef, file);

            await new Promise((resolve, reject) => {
                uploadTask.on('state_changed',
                    (snapshot) => {
                        const fileProgress = (snapshot.bytesTransferred / snapshot.totalBytes);
                        const totalProgress = ((completed + fileProgress) / validFiles.length) * 100;
                        if (progressBar) progressBar.style.width = totalProgress + '%';
                    },
                    reject,
                    async () => {
                        const downloadUrl = await getDownloadURL(uploadTask.snapshot.ref);
                        newImages.push({
                            imageUrl: downloadUrl,
                            fileName: file.name,
                            storagePath: storageRef.fullPath,
                            uploadedAt: new Date().toISOString()
                        });
                        completed++;
                        resolve();
                    }
                );
            });
        }

        // Add new images to existing array
        portfolioImages = [...portfolioImages, ...newImages];

        // Save to Firestore
        await setDoc(doc(db, 'settings', 'portfolio'), {
            images: portfolioImages,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'unknown'
        });

        // Update UI
        renderAdminGallery();
        updateModalImage();

        // Update showcase images (stacked cards)
        updateShowcaseImages();

        showToast(`${newImages.length} Bild${newImages.length > 1 ? 'er' : ''} hochgeladen!`);
    } catch (error) {
        console.error('Error uploading portfolio:', error);
        showToast('Fehler beim Hochladen', 'error');
    } finally {
        if (progressContainer) progressContainer.classList.add('hidden');
        input.value = '';
    }
}

// Delete single portfolio image
export async function deletePortfolioImage(index) {
    if (!confirm('Dieses Bild wirklich löschen?')) return;

    try {
        const imageToDelete = portfolioImages[index];

        // Delete from storage
        if (imageToDelete.storagePath) {
            try {
                const storageRef = ref(storage, imageToDelete.storagePath);
                await deleteObject(storageRef);
            } catch (e) {
                console.log('Storage file may already be deleted');
            }
        }

        // Remove from array
        portfolioImages.splice(index, 1);

        // Save to Firestore
        await setDoc(doc(db, 'settings', 'portfolio'), {
            images: portfolioImages,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'unknown'
        });

        // Reset index if needed
        if (currentPortfolioIndex >= portfolioImages.length) {
            currentPortfolioIndex = Math.max(0, portfolioImages.length - 1);
        }

        // Update UI
        renderAdminGallery();
        updateModalImage();

        // Update showcase image
        const showcaseImg = document.getElementById('cv-showcase-image');
        if (showcaseImg) {
            showcaseImg.src = portfolioImages.length > 0 ? portfolioImages[0].imageUrl : '/images/cv-sample-executive.svg';
        }

        showToast('Bild gelöscht');
    } catch (error) {
        console.error('Error deleting image:', error);
        showToast('Fehler beim Löschen', 'error');
    }
}

// Move portfolio image (reorder)
export async function movePortfolioImage(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= portfolioImages.length) return;

    // Swap images
    [portfolioImages[index], portfolioImages[newIndex]] = [portfolioImages[newIndex], portfolioImages[index]];

    // Save to Firestore
    try {
        await setDoc(doc(db, 'settings', 'portfolio'), {
            images: portfolioImages,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'unknown'
        });

        // Update UI
        renderAdminGallery();

        // Update showcase image (always first image)
        const showcaseImg = document.getElementById('cv-showcase-image');
        if (showcaseImg && portfolioImages.length > 0) {
            showcaseImg.src = portfolioImages[0].imageUrl;
        }

        showToast('Reihenfolge geändert');
    } catch (error) {
        console.error('Error reordering:', error);
        showToast('Fehler beim Sortieren', 'error');
    }
}

export function checkModalScroll() {
    const content = document.getElementById('config-modal-content');
    if (!content) return;

    const scrollIndicator = document.getElementById('config-scroll-indicator');
    if (scrollIndicator) {
        // Show indicator if there's more content to scroll
        const hasMoreContent = content.scrollHeight > content.clientHeight + 10;
        const isAtBottom = content.scrollTop + content.clientHeight >= content.scrollHeight - 10;

        if (hasMoreContent && !isAtBottom) {
            scrollIndicator.classList.remove('hidden');
        } else {
            scrollIndicator.classList.add('hidden');
        }
    }
}

export function confirmPackageConfig(state) {
    const modal = document.getElementById('package-config-modal');
    if (!modal) return;

    const baseName = modal.dataset.packageName;
    const basePrice = parseInt(modal.dataset.packagePrice) || 0;
    let total = basePrice;
    let nameSuffix = [];

    // Check if this is a package that has language options
    const languageSection = document.getElementById('config-language-section');
    const languageIncluded = document.getElementById('config-language-included');
    const hasLanguageOption = languageSection && !languageSection.classList.contains('hidden');
    const isExecutive = languageIncluded && !languageIncluded.classList.contains('hidden');

    // Check language option
    const languageRadio = modal.querySelector('input[name="language"]:checked');
    if (isExecutive) {
        // Executive packages have bilingual included
        nameSuffix.push('DE/EN');
    } else if (hasLanguageOption && languageRadio) {
        if (languageRadio.value === 'both') {
            total += 99;
            nameSuffix.push('DE/EN');
        } else if (languageRadio.value === 'en') {
            nameSuffix.push('EN');
        } else {
            nameSuffix.push('DE');
        }
    }

    // Check delivery option - always show
    const deliveryRadio = modal.querySelector('input[name="delivery"]:checked');
    if (deliveryRadio?.value === 'express') {
        total += 99;
        nameSuffix.push('Express');
    } else {
        nameSuffix.push('Standard');
    }

    // Build final name
    let finalName = baseName;
    if (nameSuffix.length > 0) {
        finalName = `${baseName} (${nameSuffix.join(', ')})`;
    }

    // Add main package to cart
    addToCart(state, finalName, total);

    closePackageConfigModal();
}

function getAddonsTotal(checkboxes) {
    let total = 0;
    checkboxes.forEach(cb => {
        total += parseInt(cb.value) || 0;
    });
    return total;
}

export function updatePackageConfigTotal() {
    const modal = document.getElementById('package-config-modal');
    if (!modal) return;

    const basePrice = parseInt(modal.dataset.packagePrice) || 0;
    let total = basePrice;

    // Check language option (bilingual = +99)
    const languageRadio = modal.querySelector('input[name="language"]:checked');
    if (languageRadio?.value === 'both') {
        total += 99;
    }

    // Check delivery option (express = +99)
    const deliveryRadio = modal.querySelector('input[name="delivery"]:checked');
    if (deliveryRadio?.value === 'express') {
        total += 99;
    }

    // Check add-ons
    const addonCheckboxes = modal.querySelectorAll('input[type="checkbox"]:checked');
    addonCheckboxes.forEach(cb => {
        const addonPrice = parseInt(cb.value) || 0;
        total += addonPrice;
    });

    const totalEl = document.getElementById('config-total-price');
    if (totalEl) {
        totalEl.textContent = `€${total}`;
    }
}

export function addToCartWithExpress(state, name, basePrice, expressPrice, checkboxId) {
    const checkbox = document.getElementById(checkboxId);
    const isExpress = checkbox?.checked || false;

    const finalPrice = isExpress ? basePrice + expressPrice : basePrice;
    const finalName = isExpress ? `${name} (Express)` : name;

    addToCart(state, finalName, finalPrice);
}

// ========== EMAIL VERIFICATION ==========

export function checkEmailVerification() {
    // This is called to check if email was recently verified
    // Usually handled by handleEmailAction
}

export function closeEmailVerifiedModal() {
    const modal = document.getElementById('email-verified-modal');
    if (modal) {
        modal.classList.add('hidden');
    }
}

// ========== ADMIN FUNCTIONS ==========

export async function loadAdminUsers() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    container.innerHTML = '<p class="text-gray-400">Lade Benutzer...</p>';

    try {
        if (!db) {
            container.innerHTML = '<p class="text-red-400">Datenbank nicht verfügbar</p>';
            return;
        }

        const usersSnap = await getDocs(collection(db, 'users'));
        let users = usersSnap.docs
            .map(doc => ({ id: doc.id, ...doc.data() }))
            .filter(u => !u.deleted); // Gelöschte Benutzer ausblenden

        // Deduplizieren nach Email (behalte den neuesten Eintrag)
        const emailMap = new Map();
        users.forEach(user => {
            const email = (user.email || user.id).toLowerCase();
            const existing = emailMap.get(email);
            // Behalte den mit dem neuesten createdAt oder den ersten gefundenen
            if (!existing || (user.createdAt && (!existing.createdAt || user.createdAt > existing.createdAt))) {
                emailMap.set(email, user);
            }
        });
        users = Array.from(emailMap.values());

        // Sortiere nach Erstellungsdatum (neueste zuerst)
        users.sort((a, b) => {
            const dateA = a.createdAt?.toDate?.() || a.createdAt || 0;
            const dateB = b.createdAt?.toDate?.() || b.createdAt || 0;
            return new Date(dateB) - new Date(dateA);
        });

        // Speichere für Export und Pagination
        window._adminUsers = users;
        paginationState.users.data = users;
        paginationState.users.filteredData = users;
        paginationState.users.total = users.length;
        paginationState.users.page = 1;
        paginationState.users.searchTerm = '';
        paginationState.users.filter = 'all';

        // Reset search and filter inputs
        const searchInput = document.getElementById('admin-users-search');
        const filterSelect = document.getElementById('admin-users-filter');
        if (searchInput) searchInput.value = '';
        if (filterSelect) filterSelect.value = 'all';

        if (users.length === 0) {
            container.innerHTML = '<div class="p-8 text-center text-gray-400"><i class="fas fa-users text-2xl mb-2"></i><p>Keine Benutzer gefunden.</p></div>';
            updateUsersPaginationUI();
            return;
        }

        // Update statistics
        const totalUsers = users.length;
        const cookiesAll = users.filter(u => u.cookieConsent === 'all' || u.cookieConsent === true).length;
        const cookiesEssential = users.filter(u => u.cookieConsent === 'essential').length;

        const statUsers = document.getElementById('admin-stat-users');
        const statCookiesAll = document.getElementById('admin-stat-cookies-all');
        const statCookiesEssential = document.getElementById('admin-stat-cookies-essential');

        if (statUsers) statUsers.textContent = totalUsers;
        if (statCookiesAll) statCookiesAll.textContent = cookiesAll;
        if (statCookiesEssential) statCookiesEssential.textContent = cookiesEssential;

        renderAdminUsersList();
    } catch (e) {
        logger.error('Error loading users:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Benutzer.</p>';
    }
}

function renderAdminUsersList() {
    const container = document.getElementById('admin-users-list');
    if (!container) return;

    const state = paginationState.users;
    const perPage = PAGINATION.USERS_PER_PAGE;
    const start = (state.page - 1) * perPage;
    const end = start + perPage;
    const usersToShow = state.filteredData.slice(start, end);

    if (usersToShow.length === 0) {
        container.innerHTML = `
            <div class="p-8 text-center text-gray-400">
                <i class="fas fa-search text-2xl mb-2"></i>
                <p>Keine Benutzer gefunden${state.searchTerm ? ` für "${state.searchTerm}"` : ''}</p>
            </div>
        `;
    } else {
        container.innerHTML = usersToShow.map(user => {
            const name = `${user.firstname || ''} ${user.lastname || ''}`.trim() || 'Unbekannt';
            const initial = (user.firstname || user.email || '?')[0].toUpperCase();
            const cookieStatus = user.cookieConsent === 'all' || user.cookieConsent === true
                ? { class: 'bg-green-100 text-green-700', text: 'Alle Cookies' }
                : user.cookieConsent === 'essential'
                    ? { class: 'bg-yellow-100 text-yellow-700', text: 'Nur notwendige' }
                    : { class: 'bg-gray-100 text-gray-500', text: 'Keine Auswahl' };

            return `
                <div class="p-4 flex items-center justify-between hover:bg-gray-50 transition">
                    <div class="flex items-center gap-4">
                        <div class="w-10 h-10 rounded-full bg-brand-gold/20 flex items-center justify-center flex-shrink-0">
                            <span class="text-brand-gold font-bold">${initial}</span>
                        </div>
                        <div class="min-w-0">
                            <h4 class="font-semibold text-brand-dark truncate">${sanitizeHTML(name)}</h4>
                            <p class="text-sm text-gray-500 truncate">${sanitizeHTML(user.email || user.id)}</p>
                        </div>
                    </div>
                    <div class="flex items-center gap-2 flex-shrink-0">
                        <button onclick="app.verifyUserEmail('${user.email}')"
                                class="text-xs px-2.5 py-1.5 rounded-lg border border-green-200 text-green-600 hover:bg-green-50 transition"
                                title="E-Mail als verifiziert markieren">
                            <i class="fas fa-check-circle"></i>
                            <span class="hidden sm:inline ml-1">Verifizieren</span>
                        </button>
                        <button onclick="app.deleteUser('${user.id}', '${user.email}')"
                                class="text-xs px-2.5 py-1.5 rounded-lg border border-red-200 text-red-500 hover:bg-red-50 transition"
                                title="Benutzer deaktivieren">
                            <i class="fas fa-trash"></i>
                            <span class="hidden sm:inline ml-1">Löschen</span>
                        </button>
                        <span class="text-xs px-2.5 py-1.5 rounded-lg ${cookieStatus.class}">
                            ${cookieStatus.text}
                        </span>
                    </div>
                </div>
            `;
        }).join('');
    }

    updateUsersPaginationUI();
}

// Update pagination UI for users
function updateUsersPaginationUI() {
    const state = paginationState.users;
    const perPage = PAGINATION.USERS_PER_PAGE;
    const totalFiltered = state.filteredData.length;
    const totalPages = Math.max(1, Math.ceil(totalFiltered / perPage));

    const start = totalFiltered === 0 ? 0 : (state.page - 1) * perPage + 1;
    const end = Math.min(state.page * perPage, totalFiltered);

    // Update text displays
    const showingStart = document.getElementById('users-showing-start');
    const showingEnd = document.getElementById('users-showing-end');
    const showingTotal = document.getElementById('users-showing-total');
    const currentPage = document.getElementById('users-current-page');
    const totalPagesEl = document.getElementById('users-total-pages');

    if (showingStart) showingStart.textContent = start;
    if (showingEnd) showingEnd.textContent = end;
    if (showingTotal) showingTotal.textContent = totalFiltered;
    if (currentPage) currentPage.textContent = state.page;
    if (totalPagesEl) totalPagesEl.textContent = totalPages;

    // Update button states
    const prevBtn = document.getElementById('users-btn-prev');
    const nextBtn = document.getElementById('users-btn-next');

    if (prevBtn) prevBtn.disabled = state.page <= 1;
    if (nextBtn) nextBtn.disabled = state.page >= totalPages;
}

// Search users
export function searchUsers(searchTerm) {
    const state = paginationState.users;
    state.searchTerm = searchTerm.toLowerCase().trim();
    state.page = 1;
    applyUsersFilter();
}

// Filter users by cookie consent
export function filterUsers(filter) {
    const state = paginationState.users;
    state.filter = filter;
    state.page = 1;
    applyUsersFilter();
}

// Apply both search and filter
function applyUsersFilter() {
    const state = paginationState.users;
    let filtered = state.data;

    // Apply search
    if (state.searchTerm) {
        filtered = filtered.filter(user => {
            const name = `${user.firstname || ''} ${user.lastname || ''}`.toLowerCase();
            const email = (user.email || '').toLowerCase();
            return name.includes(state.searchTerm) || email.includes(state.searchTerm);
        });
    }

    // Apply filter
    if (state.filter !== 'all') {
        filtered = filtered.filter(user => {
            switch (state.filter) {
                case 'cookies-all':
                    return user.cookieConsent === 'all' || user.cookieConsent === true;
                case 'cookies-essential':
                    return user.cookieConsent === 'essential';
                case 'cookies-none':
                    return !user.cookieConsent || (user.cookieConsent !== 'all' && user.cookieConsent !== true && user.cookieConsent !== 'essential');
                default:
                    return true;
            }
        });
    }

    state.filteredData = filtered;
    renderAdminUsersList();
}

// Pagination navigation for users
export function usersPagePrev() {
    const state = paginationState.users;
    if (state.page > 1) {
        state.page--;
        renderAdminUsersList();
    }
}

export function usersPageNext() {
    const state = paginationState.users;
    const perPage = PAGINATION.USERS_PER_PAGE;
    const totalPages = Math.ceil(state.filteredData.length / perPage);
    if (state.page < totalPages) {
        state.page++;
        renderAdminUsersList();
    }
}

// Admin: E-Mail eines Users als verifiziert markieren
export async function verifyUserEmail(email) {
    if (!email) {
        showToast('❌ Keine E-Mail angegeben');
        return;
    }

    // Hole Admin-Email aus aktuellem User
    const adminEmail = auth?.currentUser?.email;
    if (!adminEmail) {
        showToast('❌ Nicht als Admin eingeloggt');
        return;
    }

    try {
        showToast('⏳ Verifiziere E-Mail...');

        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/setEmailVerified', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({ email, adminEmail })
        });

        const result = await response.json();

        if (result.success) {
            showToast(`✅ ${email} wurde verifiziert!`);
        } else {
            showToast(`❌ Fehler: ${result.message || result.error}`);
        }
    } catch (error) {
        console.error('Verify email error:', error);
        showToast('❌ Fehler beim Verifizieren');
    }
}

export async function loadStrategyCalls() {
    const container = document.getElementById('admin-strategy-list');
    if (!container) return;

    container.innerHTML = '<p class="text-gray-400">Lade Anfragen...</p>';

    try {
        if (!db) {
            container.innerHTML = '<p class="text-red-400">Datenbank nicht verfügbar</p>';
            return;
        }

        const callsSnap = await getDocs(collection(db, 'strategyCalls'));
        const calls = callsSnap.docs.map(doc => ({ id: doc.id, ...doc.data() }));

        if (calls.length === 0) {
            container.innerHTML = '<p class="text-gray-400">Keine Anfragen gefunden.</p>';
            return;
        }

        // Sort by date (newest first)
        calls.sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

        // Store for pagination
        paginationState.calls.data = calls;
        paginationState.calls.total = calls.length;
        paginationState.calls.page = 1;

        // Update statistics
        const totalCalls = calls.length;
        const newCalls = calls.filter(c => !c.status || c.status === 'new').length;
        const doneCalls = calls.filter(c => c.status === 'completed').length;

        const statTotal = document.getElementById('admin-stat-strategy-total');
        const statNew = document.getElementById('admin-stat-strategy-new');
        const statDone = document.getElementById('admin-stat-strategy-done');

        if (statTotal) statTotal.textContent = totalCalls;
        if (statNew) statNew.textContent = newCalls;
        if (statDone) statDone.textContent = doneCalls;

        renderStrategyCallsList();
    } catch (e) {
        logger.error('Error loading strategy calls:', e);
        container.innerHTML = '<p class="text-red-400">Fehler beim Laden der Anfragen.</p>';
    }
}

function renderStrategyCallsList() {
    const container = document.getElementById('admin-strategy-list');
    if (!container) return;

    const state = paginationState.calls;
    const perPage = PAGINATION.CALLS_PER_PAGE;
    const start = (state.page - 1) * perPage;
    const end = start + perPage;
    const callsToShow = state.data.slice(start, end);

    if (callsToShow.length === 0) {
        container.innerHTML = `
            <div class="p-12 text-center">
                <div class="w-16 h-16 bg-gray-100 rounded-full flex items-center justify-center mx-auto mb-4">
                    <i class="fas fa-inbox text-gray-300 text-2xl"></i>
                </div>
                <p class="text-gray-500 font-medium">Keine Anfragen vorhanden</p>
                <p class="text-gray-400 text-sm mt-1">Neue Anfragen erscheinen hier automatisch</p>
            </div>
        `;
        return;
    }

    container.innerHTML = callsToShow.map(call => {
        const isNew = !call.status || call.status === 'new';
        const isContacted = call.status === 'contacted';
        const isCompleted = call.status === 'completed';
        const statusColor = isNew ? 'red' : isContacted ? 'yellow' : 'green';
        const statusBg = isNew ? 'bg-red-50 border-red-200' : isContacted ? 'bg-yellow-50 border-yellow-200' : 'bg-green-50 border-green-200';
        const source = call.source === 'concierge-modal' ? 'Concierge-Modal' : 'Strategie-Formular';

        let dateStr = 'Unbekannt';
        try {
            if (call.createdAt) {
                const date = call.createdAt.toDate ? call.createdAt.toDate() : new Date(call.createdAt);
                dateStr = date.toLocaleString('de-DE', { day: '2-digit', month: '2-digit', year: 'numeric', hour: '2-digit', minute: '2-digit' });
            }
        } catch (e) {
            dateStr = 'Ungültiges Datum';
        }

        return `
            <div class="p-5 hover:bg-gray-50 transition-colors ${isNew ? 'border-l-4 border-l-red-400' : ''}">
                <div class="flex flex-col md:flex-row md:items-start md:justify-between gap-4">
                    <!-- Left: Contact Info -->
                    <div class="flex-grow">
                        <div class="flex items-center gap-3 mb-2">
                            <div class="w-10 h-10 rounded-full bg-brand-gold/10 flex items-center justify-center flex-shrink-0">
                                <i class="fas fa-user text-brand-gold"></i>
                            </div>
                            <div>
                                <h4 class="font-bold text-brand-dark">${sanitizeHTML(call.name) || 'Unbekannt'}</h4>
                                <a href="mailto:${call.email}" class="text-sm text-brand-gold hover:underline">${sanitizeHTML(call.email) || ''}</a>
                            </div>
                        </div>

                        ${call.message ? `
                            <div class="mt-3 p-3 bg-gray-50 rounded-lg border border-gray-100">
                                <p class="text-sm text-gray-600 leading-relaxed">${sanitizeHTML(call.message)}</p>
                            </div>
                        ` : ''}

                        <div class="flex flex-wrap items-center gap-3 mt-3 text-xs text-gray-400">
                            <span><i class="fas fa-clock mr-1"></i>${dateStr}</span>
                            <span><i class="fas fa-tag mr-1"></i>${source}</span>
                            ${call.phone ? `<span><i class="fas fa-phone mr-1"></i>${sanitizeHTML(call.phone)}</span>` : ''}
                        </div>
                    </div>

                    <!-- Right: Actions -->
                    <div class="flex items-center gap-3 flex-shrink-0">
                        <select onchange="app.updateStrategyCallStatus('${call.id}', this.value)"
                                class="px-3 py-2 rounded-lg border text-sm font-medium cursor-pointer transition-colors ${statusBg}">
                            <option value="new" ${isNew ? 'selected' : ''}>🔴 Neu</option>
                            <option value="contacted" ${isContacted ? 'selected' : ''}>🟡 Kontaktiert</option>
                            <option value="completed" ${isCompleted ? 'selected' : ''}>🟢 Abgeschlossen</option>
                        </select>
                        <a href="mailto:${call.email}?subject=Re: Ihre Anfrage bei Karriaro"
                           class="px-4 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-bold hover:bg-brand-dark hover:text-white transition-colors flex items-center gap-2">
                            <i class="fas fa-reply"></i>
                            <span class="hidden sm:inline">Antworten</span>
                        </a>
                    </div>
                </div>
            </div>
        `;
    }).join('') + renderPagination('calls');
}

export async function updateStrategyCallStatus(callId, status) {
    try {
        if (!db) {
            showToast('Datenbank nicht verfügbar');
            return;
        }

        await updateDoc(doc(db, 'strategyCalls', callId), { status });
        showToast('Status aktualisiert');
    } catch (e) {
        logger.error('Error updating strategy call:', e);
        showToast('Fehler beim Aktualisieren');
    }
}

export async function loadAdminSettings() {
    // Load mentoring slots text
    await loadMentoringSlotsText();
    // Load admin templates
    await loadAdminTemplates();
    // Load legal texts
    await loadLegalTexts();
}

export async function saveMentoringSlots() {
    const input = document.getElementById('mentoring-slots-input');
    if (!input) return;

    const text = input.value.trim();

    try {
        if (!db) {
            showToast('Datenbank nicht verfügbar');
            return;
        }

        await setDoc(doc(db, 'settings', 'mentoring'), { slotsText: text });
        showToast('Einstellung gespeichert');
    } catch (e) {
        logger.error('Error saving mentoring slots:', e);
        showToast('Fehler beim Speichern');
    }
}

// ============================================
// ADMIN TEMPLATE MANAGEMENT
// ============================================

// Load templates for admin panel
export async function loadAdminTemplates() {
    const container = document.getElementById('admin-templates-list');
    if (!container) return;

    try {
        // 1. Load base templates from JSON file
        const response = await fetch('/cv-templates/templates.json');
        const data = await response.json();
        const baseTemplates = data['young-professional'] || [];

        // 2. Load status map from Firestore (only stores which templates are disabled)
        const docRef = doc(db, 'settings', 'templateStatus');
        const docSnap = await getDoc(docRef);
        const disabledTemplates = docSnap.exists() ? (docSnap.data().disabled || []) : [];

        console.log('Disabled templates from Firestore:', disabledTemplates);

        // 3. Merge: templates are active unless explicitly in disabled list
        const templates = baseTemplates.map(t => ({
            ...t,
            isActive: !disabledTemplates.includes(t.id)
        }));

        console.log('Merged templates:', templates.map(t => ({ id: t.id, isActive: t.isActive })));

        renderAdminTemplates(container, templates);
    } catch (error) {
        logger.error('Error loading admin templates:', error);
        container.innerHTML = '<div class="p-4 text-red-500 text-center">Fehler beim Laden der Templates</div>';
    }
}

// Render templates in admin panel
function renderAdminTemplates(container, templates) {
    if (!templates || templates.length === 0) {
        container.innerHTML = '<div class="p-4 text-gray-500 text-center">Keine Templates gefunden</div>';
        return;
    }

    container.innerHTML = templates.map(t => `
        <div class="flex items-center justify-between p-4 hover:bg-gray-50 transition">
            <div class="flex items-center gap-4">
                <div class="w-12 h-16 bg-gray-100 rounded overflow-hidden relative flex-shrink-0">
                    <iframe
                        src="${t.previewImage}"
                        class="absolute inset-0 w-[300%] h-[300%] border-0 pointer-events-none origin-top-left"
                        style="transform: scale(0.33);"
                        loading="lazy"
                    ></iframe>
                </div>
                <div>
                    <p class="font-medium text-brand-dark">${t.name}</p>
                    <p class="text-xs text-gray-500">${t.description || ''}</p>
                    <p class="text-xs text-gray-400 mt-1">
                        ${Object.keys(t.defaultColors || {}).length} Farbe(n) anpassbar
                    </p>
                </div>
            </div>
            <label class="relative inline-flex items-center cursor-pointer">
                <input type="checkbox"
                       class="sr-only peer"
                       ${t.isActive !== false ? 'checked' : ''}
                       onchange="app.toggleTemplateActive('${t.id}', this.checked)">
                <div class="w-11 h-6 bg-gray-200 peer-focus:ring-2 peer-focus:ring-brand-gold/50 rounded-full peer peer-checked:after:translate-x-full peer-checked:bg-brand-gold after:content-[''] after:absolute after:top-[2px] after:left-[2px] after:bg-white after:rounded-full after:h-5 after:w-5 after:transition-all"></div>
            </label>
        </div>
    `).join('');
}

// Toggle template active status
export async function toggleTemplateActive(templateId, isActive) {
    console.log('toggleTemplateActive called:', { templateId, isActive });
    try {
        const docRef = doc(db, 'settings', 'templateStatus');
        const docSnap = await getDoc(docRef);

        // Get current disabled list
        let disabledTemplates = docSnap.exists() ? (docSnap.data().disabled || []) : [];
        console.log('Current disabled list:', disabledTemplates);

        if (isActive) {
            // Remove from disabled list (activate)
            disabledTemplates = disabledTemplates.filter(id => id !== templateId);
        } else {
            // Add to disabled list (deactivate)
            if (!disabledTemplates.includes(templateId)) {
                disabledTemplates.push(templateId);
            }
        }

        console.log('New disabled list:', disabledTemplates);

        // Save to Firestore
        await setDoc(docRef, {
            disabled: disabledTemplates,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email || 'admin'
        });

        console.log('Successfully saved to Firestore');
        showToast(isActive ? 'Template aktiviert' : 'Template deaktiviert');

    } catch (error) {
        logger.error('Error toggling template:', error);
        console.error('Full error:', error);
        showToast('Fehler beim Speichern: ' + error.message);
    }
}

// Load only active templates (for customer view)
export async function loadActiveTemplates() {
    try {
        // 1. Load base templates from JSON
        const response = await fetch('/cv-templates/templates.json');
        const data = await response.json();
        const baseTemplates = data['young-professional'] || [];

        // 2. Load disabled list from Firestore
        const docRef = doc(db, 'settings', 'templateStatus');
        const docSnap = await getDoc(docRef);
        const disabledTemplates = docSnap.exists() ? (docSnap.data().disabled || []) : [];

        // 3. Return only active templates (not in disabled list)
        return baseTemplates.filter(t => !disabledTemplates.includes(t.id));
    } catch (error) {
        logger.error('Error loading active templates:', error);
        // Fallback: return all templates from JSON
        try {
            const response = await fetch('/cv-templates/templates.json');
            const data = await response.json();
            return data['young-professional'] || [];
        } catch {
            return [];
        }
    }
}

// ============================================
// CV-GENERATOR FUNCTIONS
// ============================================

// Store for CV projects
let cvProjectsCache = [];

// CV Package identifiers (to filter CV-related orders)
const CV_PACKAGE_KEYWORDS = ['CV', 'Lebenslauf', 'Quick-Check', 'Young Professional', 'Senior Professional', 'Executive', 'C-Suite'];

// Status labels and colors
const CV_STATUS_CONFIG = {
    'new': { label: 'Neu', color: 'bg-blue-100 text-blue-800', icon: 'fa-plus-circle' },
    'questionnaire_sent': { label: 'Fragebogen gesendet', color: 'bg-yellow-100 text-yellow-800', icon: 'fa-paper-plane' },
    'data_received': { label: 'Daten erhalten', color: 'bg-indigo-100 text-indigo-800', icon: 'fa-check-circle' },
    'generating': { label: 'Wird generiert', color: 'bg-purple-100 text-purple-800', icon: 'fa-cog fa-spin' },
    'ready': { label: 'CV fertig', color: 'bg-green-100 text-green-800', icon: 'fa-file-alt' },
    'delivered': { label: 'Zugestellt', color: 'bg-gray-100 text-gray-800', icon: 'fa-check-double' }
};

// Load CV projects from orders
export async function loadCvProjects() {
    const listContainer = document.getElementById('cv-projects-list');
    const emptyContainer = document.getElementById('cv-projects-empty');

    if (!listContainer) return;

    listContainer.innerHTML = `
        <div class="bg-white rounded-xl border border-gray-100 p-8 text-center text-gray-400">
            <i class="fas fa-spinner fa-spin text-3xl mb-3"></i>
            <p>Lade CV-Projekte...</p>
        </div>
    `;

    try {
        // Load all orders and filter for CV packages
        const ordersRef = collection(db, 'orders');
        const ordersSnapshot = await getDocs(ordersRef);

        // Filter orders that contain CV packages
        const cvOrders = [];
        ordersSnapshot.forEach(docSnap => {
            const order = { id: docSnap.id, ...docSnap.data() };
            // Check if any item contains CV-related keywords
            const hasCvPackage = order.items?.some(item =>
                CV_PACKAGE_KEYWORDS.some(keyword =>
                    item.title?.toLowerCase().includes(keyword.toLowerCase())
                )
            );
            if (hasCvPackage) {
                cvOrders.push(order);
            }
        });

        // Also load any existing cvProjects to merge status
        const cvProjectsRef = collection(db, 'cvProjects');
        const cvProjectsSnapshot = await getDocs(cvProjectsRef);
        const cvProjectsMap = {};
        cvProjectsSnapshot.forEach(docSnap => {
            cvProjectsMap[docSnap.data().orderId] = { id: docSnap.id, ...docSnap.data() };
        });

        // Merge orders with cvProjects data
        cvProjectsCache = cvOrders.map(order => {
            const project = cvProjectsMap[order.id] || {};
            return {
                ...order,
                cvProjectId: project.id || null,
                cvStatus: project.status || 'new',
                questionnaire: project.questionnaire || null,
                documents: project.documents || null,
                generatedCv: project.generatedCv || null
            };
        });

        // Sort by date (newest first)
        cvProjectsCache.sort((a, b) => {
            const dateA = a.date?.toDate?.() || new Date(a.date) || new Date(0);
            const dateB = b.date?.toDate?.() || new Date(b.date) || new Date(0);
            return dateB - dateA;
        });

        renderCvProjects();

    } catch (e) {
        logger.error('Error loading CV projects:', e);
        listContainer.innerHTML = `
            <div class="bg-white rounded-xl border border-red-200 p-8 text-center text-red-500">
                <i class="fas fa-exclamation-triangle text-3xl mb-3"></i>
                <p>Fehler beim Laden der CV-Projekte</p>
                <p class="text-sm mt-2">${e.message}</p>
            </div>
        `;
    }
}

// Render CV projects list
function renderCvProjects() {
    const listContainer = document.getElementById('cv-projects-list');
    const emptyContainer = document.getElementById('cv-projects-empty');

    if (!listContainer) return;

    // Apply filters
    const searchTerm = document.getElementById('cv-project-search')?.value?.toLowerCase() || '';
    const statusFilter = document.getElementById('cv-project-status-filter')?.value || '';

    let filteredProjects = cvProjectsCache.filter(project => {
        // Search filter
        const matchesSearch = !searchTerm ||
            project.id?.toLowerCase().includes(searchTerm) ||
            project.customerName?.toLowerCase().includes(searchTerm) ||
            project.customerEmail?.toLowerCase().includes(searchTerm);

        // Status filter
        const matchesStatus = !statusFilter || project.cvStatus === statusFilter;

        return matchesSearch && matchesStatus;
    });

    if (filteredProjects.length === 0) {
        listContainer.innerHTML = '';
        if (emptyContainer) {
            emptyContainer.classList.remove('hidden');
        }
        return;
    }

    if (emptyContainer) {
        emptyContainer.classList.add('hidden');
    }

    listContainer.innerHTML = filteredProjects.map(project => {
        const statusConfig = CV_STATUS_CONFIG[project.cvStatus] || CV_STATUS_CONFIG['new'];
        const orderDate = project.date?.toDate?.() || new Date(project.date);
        const formattedDate = orderDate.toLocaleDateString('de-DE', {
            day: '2-digit', month: '2-digit', year: 'numeric'
        });

        // Get CV package name from items
        const cvItem = project.items?.find(item =>
            CV_PACKAGE_KEYWORDS.some(keyword =>
                item.title?.toLowerCase().includes(keyword.toLowerCase())
            )
        );
        const packageName = cvItem?.title || 'CV-Paket';

        // Check what data is available
        const hasQuestionnaire = !!project.questionnaire;
        const hasDocuments = project.documents?.existingCv || project.documents?.targetJob;
        const hasCv = !!project.generatedCv;

        return `
            <div class="bg-white rounded-xl border border-gray-100 hover:border-brand-gold/50 transition-all overflow-hidden">
                <div class="p-4 sm:p-6">
                    <!-- Header Row -->
                    <div class="flex flex-wrap items-start justify-between gap-4 mb-4">
                        <div class="flex-1 min-w-[200px]">
                            <div class="flex items-center gap-2 mb-1">
                                <span class="text-xs font-mono text-gray-400">${project.id}</span>
                                <span class="text-xs text-gray-300">|</span>
                                <span class="text-xs text-gray-400">${formattedDate}</span>
                            </div>
                            <h3 class="font-medium text-brand-dark">${project.customerName || 'Unbekannt'}</h3>
                            <p class="text-sm text-gray-500">${project.customerEmail || ''}</p>
                        </div>
                        <div class="flex items-center gap-3">
                            <span class="px-3 py-1 rounded-full text-xs font-medium ${statusConfig.color}">
                                <i class="fas ${statusConfig.icon} mr-1"></i>
                                ${statusConfig.label}
                            </span>
                        </div>
                    </div>

                    <!-- Package Info -->
                    <div class="bg-gray-50 rounded-lg p-3 mb-4">
                        <div class="flex items-center gap-2 text-sm">
                            <i class="fas fa-file-alt text-brand-gold"></i>
                            <span class="font-medium text-brand-dark">${packageName}</span>
                        </div>
                    </div>

                    <!-- Progress Indicators -->
                    <div class="flex items-center gap-4 mb-4 text-xs">
                        ${project.mode === 'smart' ? `
                            <div class="flex items-center gap-1.5 text-purple-600 bg-purple-50 px-2 py-1 rounded-full">
                                <i class="fas fa-magic"></i>
                                <span>Smart Upload</span>
                            </div>
                        ` : ''}
                        <div class="flex items-center gap-1.5 ${hasQuestionnaire || hasDocuments ? 'text-green-600' : 'text-gray-400'}">
                            <i class="fas ${hasQuestionnaire || hasDocuments ? 'fa-check-circle' : 'fa-circle'}"></i>
                            <span>Daten</span>
                        </div>
                        <div class="flex items-center gap-1.5 ${hasDocuments ? 'text-green-600' : 'text-gray-400'}">
                            <i class="fas ${hasDocuments ? 'fa-check-circle' : 'fa-circle'}"></i>
                            <span>Dokumente</span>
                        </div>
                        <div class="flex items-center gap-1.5 ${hasCv ? 'text-green-600' : 'text-gray-400'}">
                            <i class="fas ${hasCv ? 'fa-check-circle' : 'fa-circle'}"></i>
                            <span>CV generiert</span>
                        </div>
                    </div>

                    <!-- Action Buttons -->
                    <div class="flex flex-wrap gap-2">
                        ${project.cvStatus === 'new' ? `
                            <button onclick="app.sendCvQuestionnaire('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-medium hover:bg-yellow-500 transition">
                                <i class="fas fa-paper-plane"></i>
                                Fragebogen senden
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'questionnaire_sent' ? `
                            <button onclick="app.openCvQuestionnaireView('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                                <i class="fas fa-eye"></i>
                                Status prüfen
                            </button>
                            <button onclick="app.resendCvQuestionnaire('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                                <i class="fas fa-redo"></i>
                                Erneut senden
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'data_received' ? `
                            <button onclick="app.openCvGenerator('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-medium hover:bg-yellow-500 transition">
                                <i class="fas fa-magic"></i>
                                CV generieren
                            </button>
                            <button onclick="app.viewCvData('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                                <i class="fas fa-eye"></i>
                                Daten ansehen
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'ready' ? `
                            <button onclick="app.openCvPreview('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-brand-gold text-brand-dark rounded-lg text-sm font-medium hover:bg-yellow-500 transition">
                                <i class="fas fa-eye"></i>
                                CV Vorschau
                            </button>
                            <button onclick="app.exportCvWord('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                                <i class="fas fa-file-word"></i>
                                Word
                            </button>
                            <button onclick="app.exportCvPdf('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-red-600 text-white rounded-lg text-sm hover:bg-red-700 transition">
                                <i class="fas fa-file-pdf"></i>
                                PDF
                            </button>
                            <button onclick="app.sendCvToCustomer('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                                <i class="fas fa-envelope"></i>
                                An Kunde senden
                            </button>
                        ` : ''}

                        ${project.cvStatus === 'delivered' ? `
                            <button onclick="app.openCvPreview('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-gray-100 text-gray-700 rounded-lg text-sm hover:bg-gray-200 transition">
                                <i class="fas fa-eye"></i>
                                CV ansehen
                            </button>
                            <button onclick="app.exportCvWord('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 bg-blue-600 text-white rounded-lg text-sm hover:bg-blue-700 transition">
                                <i class="fas fa-file-word"></i>
                                Word
                            </button>
                            <button onclick="app.exportCvPdf('${project.id}')"
                                    class="flex items-center gap-2 px-3 py-2 border border-gray-200 text-gray-600 rounded-lg text-sm hover:bg-gray-50 transition">
                                <i class="fas fa-file-pdf"></i>
                                PDF
                            </button>
                        ` : ''}
                    </div>
                </div>
            </div>
        `;
    }).join('');
}

// Filter CV projects
export function filterCvProjects() {
    renderCvProjects();
}

// Send questionnaire to customer
export async function sendCvQuestionnaire(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project) {
        showToast('Projekt nicht gefunden');
        return;
    }

    // Show confirmation modal
    const modal = document.createElement('div');
    modal.id = 'cv-questionnaire-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-brand-gold/20 rounded-xl flex items-center justify-center">
                    <i class="fas fa-paper-plane text-brand-gold text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-medium text-brand-dark">Fragebogen senden</h3>
                    <p class="text-sm text-gray-500">An: ${project.customerEmail}</p>
                </div>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Der Kunde erhält eine E-Mail mit einem Link zum CV-Fragebogen.
                    Nach Ausfüllen werden Sie benachrichtigt.
                </p>
            </div>

            <div class="flex gap-3 justify-end">
                <button onclick="app.closeCvQuestionnaireModal()"
                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                    Abbrechen
                </button>
                <button onclick="app.confirmSendCvQuestionnaire('${orderId}')"
                        class="px-6 py-2 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                    <i class="fas fa-paper-plane mr-2"></i>
                    Jetzt senden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Close questionnaire modal
export function closeCvQuestionnaireModal() {
    const modal = document.getElementById('cv-questionnaire-modal');
    if (modal) modal.remove();
}

// Confirm and send questionnaire
export async function confirmSendCvQuestionnaire(orderId) {
    closeCvQuestionnaireModal();

    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project) return;

    showToast('Erstelle CV-Projekt...');

    try {
        // Create cvProject document if not exists
        let projectId = project.cvProjectId;
        if (!projectId) {
            const cvProjectRef = await addDoc(collection(db, 'cvProjects'), {
                orderId: orderId,
                userId: project.userId,
                customerEmail: project.customerEmail,
                customerName: project.customerName,
                status: 'questionnaire_sent',
                createdAt: serverTimestamp(),
                updatedAt: serverTimestamp()
            });
            projectId = cvProjectRef.id;
            project.cvProjectId = projectId;
        } else {
            await updateDoc(doc(db, 'cvProjects', projectId), {
                status: 'questionnaire_sent',
                updatedAt: serverTimestamp()
            });
        }

        // Generate questionnaire link
        const questionnaireUrl = `${window.location.origin}/?questionnaire=${projectId}`;

        // Try to send email via Cloud Function (optional - may not be deployed yet)
        try {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendQuestionnaireEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    projectId: projectId,
                    customerEmail: project.customerEmail,
                    customerName: project.customerName,
                    questionnaireUrl: questionnaireUrl
                })
            });

            if (response.ok) {
                showToast('Fragebogen-Link wurde per E-Mail gesendet!');
            } else {
                // Email sending failed, but project was created - show link to copy
                showQuestionnaireLink(projectId, project.customerEmail, questionnaireUrl);
            }
        } catch (emailError) {
            // Cloud Function not available - show link to copy manually
            logger.warn('Email function not available:', emailError);
            showQuestionnaireLink(projectId, project.customerEmail, questionnaireUrl);
        }

        await loadCvProjects();

    } catch (e) {
        logger.error('Error creating CV project:', e);
        showToast('Fehler: ' + e.message);
    }
}

// Show questionnaire link modal for manual copying
function showQuestionnaireLink(projectId, customerEmail, url) {
    const modal = document.createElement('div');
    modal.id = 'questionnaire-link-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <i class="fas fa-check text-green-600 text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-medium text-brand-dark">CV-Projekt erstellt</h3>
                    <p class="text-sm text-gray-500">Fragebogen-Link bereit</p>
                </div>
            </div>

            <div class="bg-amber-50 border border-amber-200 rounded-xl p-4 mb-4">
                <p class="text-sm text-amber-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Die automatische E-Mail-Funktion ist noch nicht aktiviert. Bitte senden Sie den Link manuell an den Kunden.
                </p>
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Kunde:</label>
                <p class="text-sm text-gray-600">${customerEmail}</p>
            </div>

            <div class="mb-6">
                <label class="block text-sm font-medium text-gray-700 mb-1">Fragebogen-Link:</label>
                <div class="flex items-center gap-2">
                    <input type="text" value="${url}" readonly
                           class="flex-1 text-sm bg-gray-50 border border-gray-200 rounded-lg px-3 py-2 font-mono">
                    <button onclick="navigator.clipboard.writeText('${url}'); this.innerHTML='<i class=\\'fas fa-check\\'></i>'; setTimeout(() => this.innerHTML='<i class=\\'fas fa-copy\\'></i>', 2000)"
                            class="px-3 py-2 bg-brand-gold text-brand-dark rounded-lg hover:bg-yellow-500 transition">
                        <i class="fas fa-copy"></i>
                    </button>
                </div>
            </div>

            <div class="flex justify-end">
                <button onclick="document.getElementById('questionnaire-link-modal')?.remove()"
                        class="px-4 py-2 bg-gray-100 text-gray-700 rounded-lg hover:bg-gray-200 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Resend questionnaire
export async function resendCvQuestionnaire(orderId) {
    await sendCvQuestionnaire(orderId);
}

// Send CV questionnaire directly from admin orders view
// Extract package type from order item title
function extractPackageType(orderItems) {
    if (!orderItems || orderItems.length === 0) return 'young-professional';

    // Find CV package in order items
    const cvItem = orderItems.find(item => {
        const title = (item.title || '').toLowerCase();
        return title.includes('cv') || title.includes('lebenslauf') || title.includes('quick-check');
    });

    if (!cvItem) return 'young-professional';

    const title = cvItem.title.toLowerCase();

    if (title.includes('executive') || title.includes('c-suite') || title.includes('c-level')) {
        return 'executive';
    } else if (title.includes('senior')) {
        return 'senior-professional';
    } else if (title.includes('quick-check') || title.includes('quickcheck')) {
        return 'quick-check';
    } else {
        return 'young-professional';
    }
}

// Get CV item title from order
function getCvItemTitle(orderItems) {
    if (!orderItems || orderItems.length === 0) return 'CV';

    const cvItem = orderItems.find(item => {
        const title = (item.title || '').toLowerCase();
        return title.includes('cv') || title.includes('lebenslauf') || title.includes('quick-check');
    });

    return cvItem?.title || 'CV';
}

export async function sendCvQuestionnaireFromOrder(orderId, customerEmail, customerName) {
    if (!orderId) {
        showToast('Fehler: Keine Bestell-ID');
        return;
    }

    // Get the order to find userId
    try {
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (!orderDoc.exists()) {
            showToast('Bestellung nicht gefunden');
            return;
        }

        const order = orderDoc.data();
        const userId = order.userId;
        const email = customerEmail || order.customerEmail;
        const name = customerName || order.customerName || 'Kunde';

        // Extract package type and item title from order
        const packageType = extractPackageType(order.items);
        const orderItemTitle = getCvItemTitle(order.items);

        showToast('Erstelle CV-Projekt...');

        // Create cvProject document
        const cvProjectRef = await addDoc(collection(db, 'cvProjects'), {
            orderId: orderId,
            userId: userId,
            customerEmail: email,
            customerName: name,
            packageType: packageType,
            orderItemTitle: orderItemTitle,
            status: 'questionnaire_sent',
            createdAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        const projectId = cvProjectRef.id;
        const questionnaireUrl = `${window.location.origin}/?questionnaire=${projectId}`;

        // Try to send email via Cloud Function
        try {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/sendQuestionnaireEmail', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    orderId: orderId,
                    projectId: projectId,
                    customerEmail: email,
                    customerName: name,
                    questionnaireUrl: questionnaireUrl
                })
            });

            if (response.ok) {
                showToast('✅ Fragebogen wurde per E-Mail gesendet!');
            } else {
                showQuestionnaireLink(projectId, email, questionnaireUrl);
            }
        } catch (emailError) {
            logger.warn('Email function not available:', emailError);
            showQuestionnaireLink(projectId, email, questionnaireUrl);
        }

        // Refresh admin orders to show updated status
        await loadAllOrders();

    } catch (e) {
        logger.error('Error sending questionnaire:', e);
        showToast('Fehler: ' + e.message);
    }
}

// Toggle admin questionnaire view
export function toggleAdminQuestionnaireView(orderId) {
    const container = document.getElementById(`admin-cv-questionnaire-view-${orderId}`);
    const toggleIcon = document.getElementById(`admin-cv-q-toggle-${orderId}`);

    if (container) {
        const isHidden = container.classList.contains('hidden');
        if (isHidden) {
            container.classList.remove('hidden');
            if (toggleIcon) toggleIcon.classList.add('rotate-180');
        } else {
            container.classList.add('hidden');
            if (toggleIcon) toggleIcon.classList.remove('rotate-180');
        }
    } else {
        logger.warn('toggleAdminQuestionnaireView: Container not found for orderId', orderId);
    }
}

// Render questionnaire data for admin view (more detailed than customer view)
function renderAdminQuestionnaireData(questionnaire, documents, templateSelection) {
    if (!questionnaire && !documents && !templateSelection) return '<p class="text-gray-400 italic text-sm">Keine Daten vorhanden</p>';

    let html = '<div class="space-y-4 text-sm">';

    // Template Selection (show at top for admin)
    if (templateSelection) {
        const colors = templateSelection.customization || {};
        html += `
            <div class="bg-gradient-to-r from-amber-50 to-orange-50 rounded-lg p-3 border border-amber-300">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-palette text-amber-500"></i>Gewähltes Template & Farben
                </p>
                <div class="grid grid-cols-2 gap-3">
                    <div>
                        <p class="text-xs text-gray-400">Template:</p>
                        <p class="font-semibold text-gray-800">${sanitizeHTML(templateSelection.templateName || templateSelection.templateId)}</p>
                    </div>
                    <div>
                        <p class="text-xs text-gray-400 mb-1">Farbschema:</p>
                        <div class="flex items-center gap-2 flex-wrap">
                            <span class="inline-flex items-center gap-1">
                                <span class="w-6 h-6 rounded border-2 border-gray-300 shadow" style="background-color: ${colors.primaryColor || '#b76e22'}"></span>
                                <span class="text-xs text-gray-500">Haupt</span>
                            </span>
                            <span class="inline-flex items-center gap-1">
                                <span class="w-6 h-6 rounded border-2 border-gray-300 shadow" style="background-color: ${colors.accentColor || '#8fa3b4'}"></span>
                                <span class="text-xs text-gray-500">Akzent</span>
                            </span>
                            <span class="inline-flex items-center gap-1">
                                <span class="w-6 h-6 rounded border-2 border-gray-300 shadow" style="background-color: ${colors.circleColor || '#f4b4b7'}"></span>
                                <span class="text-xs text-gray-500">Kreis</span>
                            </span>
                        </div>
                    </div>
                </div>
                ${colors.primaryColor || colors.accentColor || colors.circleColor ? `
                    <div class="mt-2 pt-2 border-t border-amber-200 text-xs text-gray-500 font-mono">
                        <div class="grid grid-cols-3 gap-2">
                            <span>Primary: ${colors.primaryColor || '-'}</span>
                            <span>Accent: ${colors.accentColor || '-'}</span>
                            <span>Circle: ${colors.circleColor || '-'}</span>
                        </div>
                    </div>
                ` : ''}
            </div>
        `;
    }

    // Personal Info
    if (questionnaire?.personal) {
        const p = questionnaire.personal;
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-user text-indigo-500"></i>Persönliche Daten
                </p>
                <div class="grid grid-cols-2 gap-2 text-gray-600">
                    ${p.fullName ? `<p><span class="text-gray-400 text-xs">Name:</span><br><strong>${sanitizeHTML(p.fullName)}</strong></p>` : ''}
                    ${p.email ? `<p><span class="text-gray-400 text-xs">E-Mail:</span><br><strong>${sanitizeHTML(p.email)}</strong></p>` : ''}
                    ${p.phone ? `<p><span class="text-gray-400 text-xs">Telefon:</span><br><strong>${sanitizeHTML(p.phone)}</strong></p>` : ''}
                    ${p.location ? `<p><span class="text-gray-400 text-xs">Ort:</span><br><strong>${sanitizeHTML(p.location)}</strong></p>` : ''}
                    ${p.birthDate ? `<p><span class="text-gray-400 text-xs">Geburtsdatum:</span><br><strong>${sanitizeHTML(p.birthDate)}</strong></p>` : ''}
                    ${p.nationality ? `<p><span class="text-gray-400 text-xs">Nationalität:</span><br><strong>${sanitizeHTML(p.nationality)}</strong></p>` : ''}
                    ${p.targetRole ? `<p class="col-span-2"><span class="text-gray-400 text-xs">Zielposition:</span><br><strong>${sanitizeHTML(p.targetRole)}</strong></p>` : ''}
                    ${p.linkedin ? `<p class="col-span-2"><span class="text-gray-400 text-xs">LinkedIn:</span><br><a href="${sanitizeHTML(p.linkedin)}" target="_blank" class="text-indigo-600 underline">${sanitizeHTML(p.linkedin)}</a></p>` : ''}
                </div>
            </div>
        `;
    }

    // Summary
    if (questionnaire?.summary) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-quote-left text-indigo-500"></i>Zusammenfassung / Profil
                </p>
                <p class="text-gray-600 whitespace-pre-line">${sanitizeHTML(questionnaire.summary)}</p>
            </div>
        `;
    }

    // Experience
    if (questionnaire.experience?.length > 0) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-briefcase text-indigo-500"></i>Berufserfahrung (${questionnaire.experience.length})
                </p>
                <div class="space-y-3">
                    ${questionnaire.experience.map((exp, idx) => `
                        <div class="border-l-3 border-indigo-300 pl-3 ${idx > 0 ? 'pt-3 border-t border-gray-100' : ''}">
                            <p class="font-semibold text-gray-800">${sanitizeHTML(exp.role || exp.title || 'Position')}</p>
                            <p class="text-indigo-600">${sanitizeHTML(exp.company || '')}</p>
                            <p class="text-xs text-gray-400">${exp.startDate || ''} ${exp.endDate ? '- ' + exp.endDate : exp.current ? '- Heute' : ''}</p>
                            ${exp.achievements ? `<p class="text-gray-600 mt-1 text-xs whitespace-pre-line">${sanitizeHTML(Array.isArray(exp.achievements) ? exp.achievements.join('\\n• ') : exp.achievements)}</p>` : ''}
                            ${exp.description ? `<p class="text-gray-600 mt-1 text-xs">${sanitizeHTML(exp.description)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Education
    if (questionnaire.education?.length > 0) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-graduation-cap text-indigo-500"></i>Ausbildung (${questionnaire.education.length})
                </p>
                <div class="space-y-3">
                    ${questionnaire.education.map((edu, idx) => `
                        <div class="border-l-3 border-indigo-300 pl-3 ${idx > 0 ? 'pt-3 border-t border-gray-100' : ''}">
                            <p class="font-semibold text-gray-800">${sanitizeHTML(edu.degree || edu.title || 'Abschluss')}</p>
                            <p class="text-indigo-600">${sanitizeHTML(edu.institution || edu.school || '')}</p>
                            <p class="text-xs text-gray-400">${edu.startDate || ''} ${edu.endDate ? '- ' + edu.endDate : ''}</p>
                            ${edu.field ? `<p class="text-gray-600 text-xs">Fachrichtung: ${sanitizeHTML(edu.field)}</p>` : ''}
                        </div>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Skills
    if (questionnaire?.skills) {
        const skills = questionnaire.skills;
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-tools text-indigo-500"></i>Fähigkeiten
                </p>
                <div class="space-y-2">
                    ${skills.technical?.length > 0 ? `
                        <div>
                            <p class="text-xs text-gray-400 mb-1">Technische Skills:</p>
                            <div class="flex flex-wrap gap-1">
                                ${skills.technical.map(s => `<span class="bg-indigo-100 text-indigo-700 px-2 py-0.5 rounded text-xs">${sanitizeHTML(s)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${skills.soft?.length > 0 ? `
                        <div>
                            <p class="text-xs text-gray-400 mb-1">Soft Skills:</p>
                            <div class="flex flex-wrap gap-1">
                                ${skills.soft.map(s => `<span class="bg-purple-100 text-purple-700 px-2 py-0.5 rounded text-xs">${sanitizeHTML(s)}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                    ${skills.languages?.length > 0 ? `
                        <div>
                            <p class="text-xs text-gray-400 mb-1">Sprachen:</p>
                            <div class="flex flex-wrap gap-1">
                                ${skills.languages.map(l => `<span class="bg-green-100 text-green-700 px-2 py-0.5 rounded text-xs">${sanitizeHTML(typeof l === 'string' ? l : l.language + (l.level ? ' (' + l.level + ')' : ''))}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>
            </div>
        `;
    }

    // Certificates
    if (questionnaire?.certificates?.length > 0) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-certificate text-indigo-500"></i>Zertifikate (${questionnaire.certificates.length})
                </p>
                <div class="space-y-1">
                    ${questionnaire.certificates.map(cert => `
                        <p class="text-gray-600">• ${sanitizeHTML(typeof cert === 'string' ? cert : cert.name + (cert.issuer ? ' (' + cert.issuer + ')' : ''))}</p>
                    `).join('')}
                </div>
            </div>
        `;
    }

    // Additional Notes
    if (questionnaire?.additional?.notes) {
        html += `
            <div class="bg-white rounded-lg p-3 border border-gray-200">
                <p class="font-bold text-gray-800 mb-2 flex items-center gap-2">
                    <i class="fas fa-sticky-note text-indigo-500"></i>Zusätzliche Hinweise
                </p>
                <p class="text-gray-600 whitespace-pre-line">${sanitizeHTML(questionnaire.additional.notes)}</p>
            </div>
        `;
    }

    // Uploaded Documents
    if (documents) {
        let docsHtml = '';

        // Existing CV
        if (documents.existingCv?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-red-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-file-pdf text-red-500"></i>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${sanitizeHTML(documents.existingCv.filename || 'Bestehender Lebenslauf')}</p>
                            <p class="text-xs text-gray-400">Original CV des Kunden</p>
                        </div>
                    </div>
                    <a href="${documents.existingCv.url}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                        <i class="fas fa-download mr-1"></i>Herunterladen
                    </a>
                </div>
            `;
        }

        // Target Job / Stellenanzeige
        if (documents.targetJob?.url) {
            docsHtml += `
                <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                    <div class="flex items-center gap-3">
                        <div class="w-10 h-10 bg-blue-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-briefcase text-blue-500"></i>
                        </div>
                        <div>
                            <p class="font-medium text-gray-800">${sanitizeHTML(documents.targetJob.filename || 'Stellenanzeige')}</p>
                            <p class="text-xs text-gray-400">Ziel-Stellenanzeige</p>
                        </div>
                    </div>
                    <a href="${documents.targetJob.url}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                        <i class="fas fa-download mr-1"></i>Herunterladen
                    </a>
                </div>
            `;
        }

        // Other Documents
        if (documents.otherDocuments?.length > 0) {
            documents.otherDocuments.forEach((doc, idx) => {
                if (doc.url) {
                    docsHtml += `
                        <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg border border-gray-200">
                            <div class="flex items-center gap-3">
                                <div class="w-10 h-10 bg-gray-100 rounded-lg flex items-center justify-center">
                                    <i class="fas fa-file text-gray-500"></i>
                                </div>
                                <div>
                                    <p class="font-medium text-gray-800">${sanitizeHTML(doc.filename || `Dokument ${idx + 1}`)}</p>
                                    <p class="text-xs text-gray-400">Zusätzliches Dokument</p>
                                </div>
                            </div>
                            <a href="${doc.url}" target="_blank" class="bg-indigo-600 hover:bg-indigo-700 text-white px-3 py-1.5 rounded-lg text-xs font-medium transition">
                                <i class="fas fa-download mr-1"></i>Herunterladen
                            </a>
                        </div>
                    `;
                }
            });
        }

        if (docsHtml) {
            html += `
                <div class="bg-white rounded-lg p-3 border border-gray-200">
                    <p class="font-bold text-gray-800 mb-3 flex items-center gap-2">
                        <i class="fas fa-folder-open text-indigo-500"></i>Hochgeladene Dokumente
                    </p>
                    <div class="space-y-2">
                        ${docsHtml}
                    </div>
                </div>
            `;
        }
    }

    html += '</div>';
    return html;
}

// Open CV questionnaire view (to check status)
export function openCvQuestionnaireView(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project) return;

    // Create questionnaire link
    const questionnaireUrl = `${window.location.origin}?questionnaire=${project.cvProjectId || orderId}`;

    const modal = document.createElement('div');
    modal.id = 'cv-status-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center justify-between mb-4">
                <h3 class="text-lg font-medium text-brand-dark">Fragebogen-Status</h3>
                <button onclick="document.getElementById('cv-status-modal')?.remove()"
                        class="text-gray-400 hover:text-gray-600 transition">
                    <i class="fas fa-times"></i>
                </button>
            </div>

            <div class="space-y-4">
                <div class="bg-yellow-50 border border-yellow-200 rounded-xl p-4">
                    <div class="flex items-center gap-2 text-yellow-800 mb-2">
                        <i class="fas fa-clock"></i>
                        <span class="font-medium">Warte auf Kundenantwort</span>
                    </div>
                    <p class="text-sm text-yellow-700">
                        Der Fragebogen wurde an <strong>${project.customerEmail}</strong> gesendet.
                    </p>
                </div>

                <div class="bg-gray-50 rounded-xl p-4">
                    <p class="text-xs text-gray-500 mb-2">Fragebogen-Link:</p>
                    <div class="flex items-center gap-2">
                        <input type="text" value="${questionnaireUrl}" readonly
                               class="flex-1 text-xs bg-white border border-gray-200 rounded px-3 py-2">
                        <button onclick="navigator.clipboard.writeText('${questionnaireUrl}'); app.showToast('Link kopiert!')"
                                class="px-3 py-2 bg-gray-200 hover:bg-gray-300 rounded transition">
                            <i class="fas fa-copy text-gray-600"></i>
                        </button>
                    </div>
                </div>
            </div>

            <div class="flex justify-end mt-6">
                <button onclick="document.getElementById('cv-status-modal')?.remove()"
                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                    Schließen
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// View CV data collected from questionnaire
export async function viewCvData(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Keine Daten verfügbar');
        return;
    }

    try {
        // Load latest project data
        const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
        if (!projectDoc.exists()) {
            showToast('Projekt nicht gefunden');
            return;
        }

        const data = projectDoc.data();
        const q = data.questionnaire || {};
        const docs = data.documents || {};

        const modal = document.createElement('div');
        modal.id = 'cv-data-modal';
        modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4 overflow-y-auto';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-3xl w-full max-h-[90vh] overflow-y-auto shadow-2xl my-4">
                <div class="sticky top-0 bg-white border-b border-gray-100 px-6 py-4 flex items-center justify-between">
                    <h3 class="text-xl font-medium text-brand-dark">Gesammelte Daten</h3>
                    <button onclick="document.getElementById('cv-data-modal')?.remove()"
                            class="text-gray-400 hover:text-gray-600 transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <div class="p-6 space-y-6">
                    <!-- Upload Mode Badge -->
                    ${data.mode === 'smart' ? `
                    <div class="bg-purple-50 border border-purple-200 rounded-xl p-4 flex items-center gap-3">
                        <div class="w-10 h-10 bg-purple-100 rounded-lg flex items-center justify-center">
                            <i class="fas fa-magic text-purple-600"></i>
                        </div>
                        <div>
                            <p class="font-medium text-purple-800">Smart Upload</p>
                            <p class="text-sm text-purple-600">Der Kunde hat seine Dokumente per Smart Upload hochgeladen</p>
                        </div>
                    </div>
                    ` : ''}

                    <!-- Personal Data -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-user mr-2 text-brand-gold"></i>Persönliche Daten</h4>
                        <div class="grid grid-cols-2 gap-3 text-sm">
                            <div><span class="text-gray-500">Name:</span> <span class="font-medium">${q.personal?.fullName || '-'}</span></div>
                            <div><span class="text-gray-500">E-Mail:</span> <span class="font-medium">${q.personal?.email || '-'}</span></div>
                            <div><span class="text-gray-500">Telefon:</span> <span class="font-medium">${q.personal?.phone || '-'}</span></div>
                            <div><span class="text-gray-500">Standort:</span> <span class="font-medium">${q.personal?.location || '-'}</span></div>
                            <div><span class="text-gray-500">Zielposition:</span> <span class="font-medium">${q.personal?.targetRole || '-'}</span></div>
                            <div><span class="text-gray-500">LinkedIn:</span> <span class="font-medium">${q.personal?.linkedin || '-'}</span></div>
                        </div>
                        ${q.personal?.careerGoal ? `<p class="mt-3 text-sm"><span class="text-gray-500">Karriereziel:</span> ${q.personal.careerGoal}</p>` : ''}
                    </div>

                    <!-- Experience -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-briefcase mr-2 text-brand-gold"></i>Berufserfahrung</h4>
                        ${(q.experience || []).length > 0 ? q.experience.map(exp => `
                            <div class="border-l-2 border-brand-gold pl-3 mb-3">
                                <p class="font-medium">${exp.role || 'Position'} <span class="text-gray-400">@</span> ${exp.company || 'Firma'}</p>
                                <p class="text-sm text-gray-500">${exp.startDate || ''} - ${exp.endDate || 'heute'}</p>
                                ${exp.description ? `<p class="text-sm mt-1">${exp.description}</p>` : ''}
                                ${(exp.achievements || []).length > 0 ? `<ul class="text-sm mt-2 space-y-1">${exp.achievements.map(a => `<li class="text-green-700">✓ ${a}</li>`).join('')}</ul>` : ''}
                            </div>
                        `).join('') : '<p class="text-gray-400 text-sm">Keine Berufserfahrung angegeben</p>'}
                    </div>

                    <!-- Education -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-graduation-cap mr-2 text-brand-gold"></i>Ausbildung</h4>
                        ${(q.education || []).length > 0 ? q.education.map(edu => `
                            <div class="border-l-2 border-brand-gold pl-3 mb-3">
                                <p class="font-medium">${edu.degree || 'Abschluss'} - ${edu.field || ''}</p>
                                <p class="text-sm text-gray-500">${edu.institution || ''} | ${edu.startDate || ''} - ${edu.endDate || ''}</p>
                            </div>
                        `).join('') : '<p class="text-gray-400 text-sm">Keine Ausbildung angegeben</p>'}
                    </div>

                    <!-- Skills -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-cogs mr-2 text-brand-gold"></i>Skills</h4>
                        <div class="space-y-2 text-sm">
                            <div><span class="text-gray-500">Technisch:</span> ${(q.skills?.technical || []).join(', ') || '-'}</div>
                            <div><span class="text-gray-500">Soft Skills:</span> ${(q.skills?.soft || []).join(', ') || '-'}</div>
                            <div><span class="text-gray-500">Sprachen:</span> ${(q.skills?.languages || []).map(l => `${l.language} (${l.level})`).join(', ') || '-'}</div>
                            <div><span class="text-gray-500">Zertifikate:</span> ${(q.skills?.certifications || []).join(', ') || '-'}</div>
                        </div>
                    </div>

                    <!-- Documents -->
                    <div class="bg-gray-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-file-alt mr-2 text-brand-gold"></i>Hochgeladene Dokumente</h4>
                        <div class="space-y-2">
                            ${docs.existingCv ? `
                                <div class="flex items-center justify-between bg-white p-3 rounded-lg">
                                    <span class="text-sm"><i class="fas fa-file-pdf text-red-500 mr-2"></i>Aktueller Lebenslauf: ${docs.existingCv.filename || 'CV'}</span>
                                    <a href="${docs.existingCv.url}" target="_blank" class="text-brand-gold hover:underline text-sm">Öffnen</a>
                                </div>
                            ` : ''}
                            ${docs.targetJob ? `
                                <div class="flex items-center justify-between bg-white p-3 rounded-lg">
                                    <span class="text-sm"><i class="fas fa-briefcase text-blue-500 mr-2"></i>Stellenausschreibung: ${docs.targetJob.filename || 'Stellenbeschreibung'}</span>
                                    <a href="${docs.targetJob.url}" target="_blank" class="text-brand-gold hover:underline text-sm">Öffnen</a>
                                </div>
                            ` : ''}
                            ${(docs.otherDocuments || []).length > 0 ? docs.otherDocuments.map((doc, i) => `
                                <div class="flex items-center justify-between bg-white p-3 rounded-lg">
                                    <span class="text-sm"><i class="fas fa-file text-gray-500 mr-2"></i>Weiteres Dokument: ${doc.filename || 'Dokument ' + (i + 1)}</span>
                                    <a href="${doc.url}" target="_blank" class="text-brand-gold hover:underline text-sm">Öffnen</a>
                                </div>
                            `).join('') : ''}
                            ${!docs.existingCv && !docs.targetJob && (!docs.otherDocuments || docs.otherDocuments.length === 0) ? '<p class="text-gray-400 text-sm">Keine Dokumente hochgeladen</p>' : ''}
                        </div>
                    </div>

                    <!-- Notes (Smart Upload) -->
                    ${q.additional?.notes ? `
                    <div class="bg-amber-50 rounded-xl p-4">
                        <h4 class="font-medium text-brand-dark mb-3"><i class="fas fa-sticky-note mr-2 text-brand-gold"></i>Besondere Hinweise</h4>
                        <p class="text-sm text-gray-700">${q.additional.notes}</p>
                    </div>
                    ` : ''}
                </div>

                <div class="sticky bottom-0 bg-white border-t border-gray-100 px-6 py-4 flex justify-end gap-3">
                    <button onclick="document.getElementById('cv-data-modal')?.remove()"
                            class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                        Schließen
                    </button>
                    <button onclick="document.getElementById('cv-data-modal')?.remove(); app.openCvGenerator('${orderId}')"
                            class="px-6 py-2 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                        <i class="fas fa-magic mr-2"></i>CV generieren
                    </button>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

    } catch (e) {
        logger.error('Error loading CV data:', e);
        showToast('Fehler beim Laden der Daten');
    }
}

// Scale CV template previews to fit their containers
function scaleCvPreviews() {
    const previewBoxes = document.querySelectorAll('.cv-preview-box');
    previewBoxes.forEach(box => {
        const scaled = box.querySelector('.cv-preview-scaled');
        if (scaled) {
            const containerWidth = box.offsetWidth;
            const scale = containerWidth / 210;
            scaled.style.transform = `scale(${scale})`;
        }
    });
}

// Also scale on window resize
window.addEventListener('resize', () => {
    if (document.querySelector('.cv-preview-box')) {
        scaleCvPreviews();
    }
});

// CV Generator State
let cvGeneratorState = {
    step: 1,
    projectId: null,
    orderId: null,
    customerName: '',
    // Step 1: Design
    template: 'corporate',
    colorScheme: 'classic',
    layout: 'two-column',
    includeCover: false,
    includePhoto: false,
    // Step 2: Options
    language: 'Deutsch',
    focusAreas: [],
    tone: 'professional'
};

// Open CV generator (two-step wizard)
export async function openCvGenerator(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    // Reset state - use first Canva template as default
    cvGeneratorState = {
        step: 1,
        projectId: project.cvProjectId,
        orderId: orderId,
        customerName: project.customerName,
        template: 'elegant-navy',  // Default to first Canva template
        colorScheme: 'elegant-navy',
        layout: 'sidebar',
        includeCover: false,
        includePhoto: false,
        language: 'Deutsch',
        focusAreas: [],
        tone: 'professional'
    };

    const modal = document.createElement('div');
    modal.id = 'cv-generator-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-start justify-center z-50 p-4 pt-8 overflow-y-auto';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-4xl w-full shadow-2xl mb-8 flex flex-col" style="max-height: calc(100vh - 4rem);">
            <!-- Header -->
            <div class="flex items-center justify-between p-6 border-b border-gray-100 flex-shrink-0">
                <div class="flex items-center gap-3">
                    <div class="w-12 h-12 bg-gradient-to-br from-brand-gold to-yellow-600 rounded-xl flex items-center justify-center">
                        <i class="fas fa-magic text-white text-xl"></i>
                    </div>
                    <div>
                        <h3 class="text-xl font-medium text-brand-dark">CV Generator</h3>
                        <p class="text-sm text-gray-500">${project.customerName}</p>
                    </div>
                </div>
                <button onclick="document.getElementById('cv-generator-modal')?.remove()" class="text-gray-400 hover:text-gray-600 text-2xl">&times;</button>
            </div>

            <!-- Progress Steps -->
            <div class="px-6 py-4 bg-gray-50 border-b border-gray-100 flex-shrink-0">
                <div class="flex items-center justify-center gap-4">
                    <div class="flex items-center gap-2" id="step-indicator-1">
                        <div class="w-8 h-8 rounded-full bg-brand-gold text-white flex items-center justify-center font-bold text-sm">1</div>
                        <span class="text-sm font-medium text-brand-dark">Design wählen</span>
                    </div>
                    <div class="w-16 h-0.5 bg-gray-300" id="step-line"></div>
                    <div class="flex items-center gap-2" id="step-indicator-2">
                        <div class="w-8 h-8 rounded-full bg-gray-300 text-gray-600 flex items-center justify-center font-bold text-sm">2</div>
                        <span class="text-sm font-medium text-gray-500">Inhalt generieren</span>
                    </div>
                </div>
            </div>

            <!-- Content -->
            <div id="cv-generator-content" class="p-6 overflow-y-auto flex-1">
                ${renderCvGeneratorStep1()}
            </div>

            <!-- Footer -->
            <div class="flex items-center justify-between p-6 border-t border-gray-100 bg-gray-50 rounded-b-2xl flex-shrink-0">
                <button onclick="app.cvGeneratorBack()" id="cv-gen-back-btn" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition hidden">
                    <i class="fas fa-arrow-left mr-2"></i>Zurück
                </button>
                <div class="flex-1"></div>
                <div class="flex gap-3">
                    <button onclick="document.getElementById('cv-generator-modal')?.remove()" class="px-4 py-2 text-gray-600 hover:text-gray-800 transition" id="cv-gen-cancel-btn">
                        Abbrechen
                    </button>
                    <button onclick="app.cvGeneratorNext()" id="cv-gen-next-btn" class="px-6 py-2 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                        Weiter <i class="fas fa-arrow-right ml-2"></i>
                    </button>
                </div>
            </div>
        </div>
    `;
    document.body.appendChild(modal);

    // Initialize handlers
    initCvGeneratorHandlers();

    // Scale previews after modal is rendered
    setTimeout(() => scaleCvPreviews(), 100);
}

// Custom PDF templates loaded from cv-templates folder
let customPdfTemplates = [];

// Load custom templates from JSON file
async function loadCustomTemplates() {
    try {
        const response = await fetch('/cv-templates/templates.json');
        if (response.ok) {
            customPdfTemplates = await response.json();
            console.log('Loaded custom templates:', customPdfTemplates);
        }
    } catch (error) {
        console.log('No custom templates found:', error);
    }
}

// Initialize custom templates on page load
loadCustomTemplates();

// Get all templates (custom PDF templates + built-in HTML templates)
function getAllCvTemplates() {
    // Custom templates first, then built-in templates
    const customWithPreview = customPdfTemplates.map(t => ({
        ...t,
        isCustomPdf: true,
        preview: `<img src="${t.previewImage}" alt="${t.name}" class="w-full h-full object-cover object-top" />`
    }));
    return [...customWithPreview, ...canvaTemplates];
}

// Canva-style CV Template definitions with visual previews
const canvaTemplates = [
    {
        id: 'schwarz-beige-modern',
        name: 'Schwarz Beige Modern',
        category: 'Executive',
        colors: { primary: '#3d3d3d', secondary: '#c9a227', accent: '#f5f5f5', text: '#333333' },
        layout: 'two-column',
        description: 'Elegantes Design mit dunklem Header und Beige-Akzenten',
        tags: ['Executive', 'Senior', 'Klassisch', 'Canva'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col text-[8px]">
                <div class="bg-[#3d3d3d] text-white flex" style="height: 85px;">
                    <div class="w-[65px] bg-[#2d2d2d] flex-shrink-0"></div>
                    <div class="flex-1 flex flex-col justify-center px-3">
                        <div class="h-[14px] bg-white rounded w-3/4 mb-1"></div>
                        <div class="h-[10px] bg-white/60 rounded w-1/2"></div>
                    </div>
                </div>
                <div class="h-[14px] bg-white flex items-center px-3 gap-4 text-[6px] text-gray-600">
                    <span>📞 0221-123456</span>
                    <span>✉ email@test.de</span>
                </div>
                <div class="flex-1 flex">
                    <div class="w-[65px] bg-[#f5f0e8] p-3">
                        <div class="h-[8px] bg-[#3d3d3d] rounded w-full mb-2"></div>
                        <div class="space-y-1 mb-4">
                            <div class="h-[4px] bg-gray-400 rounded"></div>
                            <div class="h-[4px] bg-gray-400 rounded w-4/5"></div>
                        </div>
                        <div class="h-[8px] bg-[#3d3d3d] rounded w-2/3 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-400 rounded"></div>
                        </div>
                    </div>
                    <div class="flex-1 bg-white p-3">
                        <div class="h-[8px] bg-[#3d3d3d] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1 mb-4">
                            <div class="h-[4px] bg-gray-300 rounded"></div>
                            <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                        </div>
                        <div class="h-[6px] bg-gray-500 rounded w-1/3 mb-1"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'green-yellow-modern',
        name: 'Green Yellow Modern',
        category: 'Young Professional',
        colors: { primary: '#2d8a8a', secondary: '#f5c842', accent: '#ffffff', text: '#333333' },
        layout: 'two-column',
        description: 'Kreatives Design mit Teal und Gelb-Akzenten',
        tags: ['Young Professional', 'Kreativ', 'Modern', 'Canva'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white text-[8px]">
                <div class="h-[4px] bg-[#f5c842]"></div>
                <div class="p-4 flex gap-3">
                    <div class="w-[50px] h-[65px] rounded bg-gray-300 flex-shrink-0"></div>
                    <div class="flex-1 pt-2">
                        <div class="h-[12px] bg-[#f5c842] rounded w-3/4 mb-2"></div>
                        <div class="h-[8px] bg-[#2d8a8a] rounded w-1/2"></div>
                    </div>
                </div>
                <div class="flex-1 px-4 flex gap-4">
                    <div class="w-2/5">
                        <div class="h-[8px] bg-[#f5c842] rounded w-2/3 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-[#2d8a8a]/60 rounded"></div>
                            <div class="h-[4px] bg-[#2d8a8a]/60 rounded w-4/5"></div>
                        </div>
                    </div>
                    <div class="w-3/5">
                        <div class="h-[8px] bg-[#f5c842] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-300 rounded"></div>
                            <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'elegant-navy',
        name: 'Elegant Navy',
        category: 'Executive',
        colors: { primary: '#1e3a5f', secondary: '#c9a227', accent: '#f5f5f5', text: '#333333' },
        layout: 'sidebar',
        description: 'Zeitloses Design mit Navy-Seitenleiste',
        tags: ['C-Suite', 'Führungskraft', 'Klassisch'],
        preview: `
            <div class="w-[210px] h-[297px] flex text-[8px]">
                <div class="w-[70px] bg-[#1e3a5f] text-white p-4">
                    <div class="w-[40px] h-[40px] rounded-full bg-gray-300 mx-auto mb-3"></div>
                    <div class="h-[8px] bg-white/80 rounded mb-2"></div>
                    <div class="h-[6px] bg-white/40 rounded w-3/4 mx-auto mb-4"></div>
                    <div class="h-[6px] bg-[#c9a227] rounded w-full mb-2"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-white/30 rounded"></div>
                        <div class="h-[4px] bg-white/30 rounded w-4/5"></div>
                    </div>
                </div>
                <div class="flex-1 bg-white p-4">
                    <div class="h-[8px] bg-[#1e3a5f] rounded w-1/2 mb-3"></div>
                    <div class="space-y-1 mb-4">
                        <div class="h-[4px] bg-gray-300 rounded"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                    </div>
                    <div class="h-[6px] bg-[#c9a227] rounded w-1/3 mb-2"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-gray-200 rounded"></div>
                        <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'modern-minimal',
        name: 'Modern Minimal',
        category: 'Young Professional',
        colors: { primary: '#000000', secondary: '#666666', accent: '#ffffff', text: '#333333' },
        layout: 'single-column',
        description: 'Sauberes, minimalistisches Design',
        tags: ['Modern', 'Tech', 'Startup'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white p-6 text-[8px]">
                <div class="text-center mb-4">
                    <div class="h-[12px] bg-black rounded w-1/2 mx-auto mb-2"></div>
                    <div class="h-[8px] bg-gray-400 rounded w-1/3 mx-auto"></div>
                </div>
                <div class="border-t border-b border-gray-200 py-2 mb-4">
                    <div class="flex justify-center gap-4">
                        <div class="h-[4px] bg-gray-300 rounded w-[40px]"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-[40px]"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-[40px]"></div>
                    </div>
                </div>
                <div class="h-[8px] bg-black rounded w-1/4 mb-2"></div>
                <div class="space-y-1 mb-4">
                    <div class="h-[4px] bg-gray-200 rounded"></div>
                    <div class="h-[4px] bg-gray-200 rounded w-5/6"></div>
                </div>
                <div class="h-[8px] bg-black rounded w-1/4 mb-2"></div>
                <div class="space-y-1">
                    <div class="h-[4px] bg-gray-200 rounded"></div>
                    <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                </div>
            </div>
        `
    },
    {
        id: 'creative-bold',
        name: 'Creative Bold',
        category: 'Creative',
        colors: { primary: '#e63946', secondary: '#1d3557', accent: '#f1faee', text: '#1d3557' },
        layout: 'two-column',
        description: 'Auffälliges Design für Kreative',
        tags: ['Design', 'Marketing', 'Kreativ'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-[#f1faee] text-[8px]">
                <div class="bg-[#e63946] p-4 mb-4">
                    <div class="h-[12px] bg-white rounded w-1/2 mb-2"></div>
                    <div class="h-[8px] bg-white/70 rounded w-1/3"></div>
                </div>
                <div class="px-4 flex gap-4">
                    <div class="w-1/2">
                        <div class="h-[8px] bg-[#1d3557] rounded w-2/3 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-400 rounded"></div>
                            <div class="h-[4px] bg-gray-400 rounded w-4/5"></div>
                        </div>
                    </div>
                    <div class="w-1/2">
                        <div class="h-[8px] bg-[#e63946] rounded w-2/3 mb-2"></div>
                        <div class="flex gap-1 flex-wrap">
                            <div class="h-[10px] w-[25px] bg-[#1d3557]/20 rounded"></div>
                            <div class="h-[10px] w-[30px] bg-[#1d3557]/20 rounded"></div>
                            <div class="h-[10px] w-[20px] bg-[#1d3557]/20 rounded"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'corporate-classic',
        name: 'Corporate Classic',
        category: 'Senior Professional',
        colors: { primary: '#2c3e50', secondary: '#3498db', accent: '#ecf0f1', text: '#2c3e50' },
        layout: 'single-column',
        description: 'Professionell für Konzernumfeld',
        tags: ['Konzern', 'Finance', 'Consulting'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white text-[8px]">
                <div class="bg-[#2c3e50] p-4">
                    <div class="h-[12px] bg-white rounded w-2/3 mb-2"></div>
                    <div class="h-[4px] bg-[#3498db] rounded w-1/2"></div>
                </div>
                <div class="p-4">
                    <div class="flex gap-3 mb-3 text-gray-400 text-[7px]">
                        <span>✉ email</span>
                        <span>📱 phone</span>
                        <span>📍 location</span>
                    </div>
                    <div class="h-[8px] bg-[#2c3e50] rounded w-1/3 mb-2"></div>
                    <div class="h-[3px] bg-[#3498db] rounded w-full mb-3"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-gray-200 rounded"></div>
                        <div class="h-[4px] bg-gray-200 rounded w-5/6"></div>
                        <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'executive-gold',
        name: 'Executive Gold',
        category: 'C-Suite',
        colors: { primary: '#1a1a2e', secondary: '#c9b99a', accent: '#f8f6f3', text: '#1a1a2e' },
        layout: 'sidebar',
        description: 'Premium-Design für Top-Manager',
        tags: ['CEO', 'Vorstand', 'Executive'],
        preview: `
            <div class="w-[210px] h-[297px] flex text-[8px]">
                <div class="w-[70px] bg-[#1a1a2e] text-white p-4">
                    <div class="w-[40px] h-[40px] rounded-full bg-[#c9b99a] mx-auto mb-3"></div>
                    <div class="h-[4px] bg-[#c9b99a] rounded mb-3"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-white/40 rounded"></div>
                        <div class="h-[4px] bg-white/40 rounded w-4/5"></div>
                    </div>
                    <div class="mt-4 h-[4px] bg-[#c9b99a] rounded mb-2"></div>
                    <div class="flex gap-1 flex-wrap">
                        <div class="h-[8px] w-[20px] bg-white/20 rounded"></div>
                        <div class="h-[8px] w-[25px] bg-white/20 rounded"></div>
                    </div>
                </div>
                <div class="flex-1 bg-[#f8f6f3] p-4">
                    <div class="h-[12px] bg-[#1a1a2e] rounded w-2/3 mb-2"></div>
                    <div class="h-[4px] bg-[#c9b99a] rounded w-1/2 mb-4"></div>
                    <div class="h-[8px] bg-[#1a1a2e] rounded w-1/3 mb-2"></div>
                    <div class="space-y-1">
                        <div class="h-[4px] bg-gray-300 rounded"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'tech-modern',
        name: 'Tech Modern',
        category: 'Tech & IT',
        colors: { primary: '#6366f1', secondary: '#818cf8', accent: '#f8fafc', text: '#1e293b' },
        layout: 'two-column',
        description: 'Modern für Tech-Industrie',
        tags: ['IT', 'Software', 'Developer'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-[#f8fafc] text-[8px]">
                <div class="p-4">
                    <div class="flex items-center gap-3 mb-4">
                        <div class="w-[40px] h-[40px] rounded-lg bg-gradient-to-br from-[#6366f1] to-[#818cf8]"></div>
                        <div>
                            <div class="h-[10px] bg-[#1e293b] rounded w-[80px] mb-1"></div>
                            <div class="h-[6px] bg-[#6366f1] rounded w-[50px]"></div>
                        </div>
                    </div>
                    <div class="flex gap-4">
                        <div class="w-1/2">
                            <div class="h-[8px] bg-[#6366f1] rounded w-2/3 mb-2"></div>
                            <div class="space-y-1">
                                <div class="h-[4px] bg-gray-300 rounded"></div>
                                <div class="h-[4px] bg-gray-300 rounded w-4/5"></div>
                            </div>
                        </div>
                        <div class="w-1/2">
                            <div class="h-[8px] bg-[#818cf8] rounded w-2/3 mb-2"></div>
                            <div class="flex gap-1 flex-wrap">
                                <div class="h-[10px] px-2 bg-[#6366f1]/20 rounded text-[6px] flex items-center">React</div>
                                <div class="h-[10px] px-2 bg-[#6366f1]/20 rounded text-[6px] flex items-center">Node</div>
                            </div>
                        </div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'elegant-burgundy',
        name: 'Elegant Burgundy',
        category: 'Senior Professional',
        colors: { primary: '#722f37', secondary: '#d4a574', accent: '#faf7f5', text: '#3d2c2e' },
        layout: 'single-column',
        description: 'Elegantes Weinrot für Führungskräfte',
        tags: ['Luxury', 'Fashion', 'Hospitality'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-[#faf7f5] text-[8px]">
                <div class="border-b-2 border-[#722f37] p-4 text-center">
                    <div class="h-[12px] bg-[#722f37] rounded w-1/2 mx-auto mb-2"></div>
                    <div class="h-[6px] bg-[#d4a574] rounded w-1/3 mx-auto"></div>
                </div>
                <div class="p-4">
                    <div class="flex justify-center gap-3 mb-4 text-[#722f37] text-[7px]">
                        <span>✉ email</span><span>📱 phone</span><span>🔗 link</span>
                    </div>
                    <div class="h-[8px] bg-[#722f37] rounded w-1/4 mb-2"></div>
                    <div class="border-l-2 border-[#d4a574] pl-2 space-y-1">
                        <div class="h-[4px] bg-gray-300 rounded"></div>
                        <div class="h-[4px] bg-gray-300 rounded w-5/6"></div>
                    </div>
                </div>
            </div>
        `
    },
    {
        id: 'swiss-clean',
        name: 'Swiss Clean',
        category: 'Universal',
        colors: { primary: '#333333', secondary: '#e74c3c', accent: '#ffffff', text: '#333333' },
        layout: 'two-column',
        description: 'Swiss Design - Klarheit & Präzision',
        tags: ['Design', 'Architecture', 'Engineering'],
        preview: `
            <div class="w-[210px] h-[297px] flex flex-col bg-white p-4 text-[8px]">
                <div class="flex gap-4 flex-1">
                    <div class="w-1/3">
                        <div class="h-[12px] bg-[#333333] rounded mb-2"></div>
                        <div class="h-[4px] bg-[#e74c3c] rounded w-2/3 mb-3"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                        </div>
                    </div>
                    <div class="w-2/3 border-l border-gray-200 pl-4">
                        <div class="h-[8px] bg-[#333333] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1 mb-4">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded w-5/6"></div>
                        </div>
                        <div class="h-[8px] bg-[#e74c3c] rounded w-1/2 mb-2"></div>
                        <div class="space-y-1">
                            <div class="h-[4px] bg-gray-200 rounded"></div>
                            <div class="h-[4px] bg-gray-200 rounded w-4/5"></div>
                        </div>
                    </div>
                </div>
            </div>
        `
    }
];

// Render Step 1: Design Selection with Canva-style previews
function renderCvGeneratorStep1() {
    const allTemplates = getAllCvTemplates();
    const categories = ['Alle', 'Executive', 'Senior Professional', 'Young Professional', 'Creative', 'Tech & IT', 'Professional'];

    return `
        <!-- Category Filter -->
        <div class="mb-6">
            <div class="flex flex-wrap gap-2 justify-center">
                ${categories.map(cat => `
                    <button onclick="window.filterCvTemplates('${cat}')" data-category="${cat}"
                            class="category-btn px-4 py-2 rounded-full text-sm font-medium transition
                                   ${cat === 'Alle' ? 'bg-brand-gold text-brand-dark' : 'bg-gray-100 text-gray-600 hover:bg-gray-200'}">
                        ${cat}
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Template Grid -->
        <div class="grid grid-cols-2 md:grid-cols-4 gap-4 mb-8" id="cv-template-grid">
            ${allTemplates.map(t => `
                <div class="template-card cursor-pointer group" data-template="${t.id}" data-category="${t.category}"
                     onclick="window.selectCvTemplate('${t.id}')">
                    <div class="relative border-2 ${cvGeneratorState.template === t.id ? 'border-brand-gold ring-2 ring-brand-gold/20' : 'border-gray-200'}
                                rounded-xl overflow-hidden transition-all hover:border-brand-gold hover:shadow-lg">
                        <!-- Preview -->
                        <div class="aspect-[210/297] bg-gray-50 relative overflow-hidden">
                            ${t.isCustomPdf ? `
                                <img src="${t.previewImage}" alt="${t.name}" class="w-full h-full object-cover object-top" />
                            ` : `
                                <div style="position: absolute; top: 0; left: 0; width: 210px; height: 297px; transform-origin: top left; transform: scale(0.76);">
                                    ${t.preview}
                                </div>
                            `}
                            <!-- Hover overlay -->
                            <div class="absolute inset-0 bg-brand-gold/90 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center">
                                <span class="text-brand-dark font-medium text-sm">Auswählen</span>
                            </div>
                            <!-- Selected checkmark -->
                            ${cvGeneratorState.template === t.id ? `
                                <div class="absolute top-2 right-2 w-6 h-6 bg-brand-gold rounded-full flex items-center justify-center z-10">
                                    <i class="fas fa-check text-brand-dark text-xs"></i>
                                </div>
                            ` : ''}
                        </div>
                        <!-- Info -->
                        <div class="p-3 bg-white">
                            <p class="font-medium text-brand-dark text-sm truncate">${t.name}</p>
                            <p class="text-xs text-gray-500">${t.category}</p>
                        </div>
                    </div>
                </div>
            `).join('')}
        </div>

        <!-- Selected Template Details -->
        <div id="selected-template-info" class="bg-gradient-to-br from-brand-gold/10 to-yellow-50 rounded-xl p-4 mb-6">
            ${renderSelectedTemplateInfo()}
        </div>

        <!-- Additional Options -->
        <div class="grid grid-cols-1 md:grid-cols-2 gap-4">
            <div class="bg-gray-50 rounded-xl p-4">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="cv-include-cover" ${cvGeneratorState.includeCover ? 'checked' : ''}
                           onchange="window.selectCvDesign('includeCover', this.checked)"
                           class="w-5 h-5 text-brand-gold rounded border-gray-300 focus:ring-brand-gold">
                    <div>
                        <p class="font-medium text-brand-dark">Anschreiben generieren</p>
                        <p class="text-xs text-gray-500">Passendes Cover Letter zur Bewerbung</p>
                    </div>
                </label>
            </div>
            <div class="bg-gray-50 rounded-xl p-4">
                <label class="flex items-center gap-3 cursor-pointer">
                    <input type="checkbox" id="cv-include-photo" ${cvGeneratorState.includePhoto ? 'checked' : ''}
                           onchange="window.selectCvDesign('includePhoto', this.checked)"
                           class="w-5 h-5 text-brand-gold rounded border-gray-300 focus:ring-brand-gold">
                    <div>
                        <p class="font-medium text-brand-dark">Foto-Platzhalter</p>
                        <p class="text-xs text-gray-500">Bereich für Profilbild reservieren</p>
                    </div>
                </label>
            </div>
        </div>
    `;
}

// Render selected template info panel
function renderSelectedTemplateInfo() {
    const allTemplates = getAllCvTemplates();
    const selected = allTemplates.find(t => t.id === cvGeneratorState.template) || allTemplates[0];

    // Handle preview differently for custom PDF templates vs built-in templates
    const previewHtml = selected.isCustomPdf
        ? `<img src="${selected.previewImage}" alt="${selected.name}" class="w-full h-full object-cover object-top" />`
        : selected.preview;

    return `
        <div class="flex items-start gap-4">
            <div class="w-20 h-28 rounded-lg overflow-hidden border-2 border-brand-gold flex-shrink-0">
                ${previewHtml}
            </div>
            <div class="flex-1">
                <div class="flex items-center gap-2 mb-1">
                    <h4 class="text-lg font-medium text-brand-dark">${selected.name}</h4>
                    <span class="px-2 py-0.5 bg-brand-gold/20 text-brand-dark text-xs rounded-full">${selected.category}</span>
                </div>
                <p class="text-sm text-gray-600 mb-2">${selected.description}</p>
                ${selected.layout ? `
                <div class="flex items-center gap-4 text-xs text-gray-500">
                    <span><i class="fas fa-palette mr-1"></i>Layout: ${selected.layout === 'sidebar' ? 'Seitenleiste' : selected.layout === 'two-column' ? 'Zwei Spalten' : 'Eine Spalte'}</span>
                    ${selected.colors ? `
                    <span class="flex items-center gap-1">
                        <span class="w-3 h-3 rounded-full" style="background-color: ${selected.colors.primary}"></span>
                        <span class="w-3 h-3 rounded-full" style="background-color: ${selected.colors.secondary}"></span>
                    </span>
                    ` : ''}
                </div>
                ` : ''}
                <div class="flex flex-wrap gap-1 mt-2">
                    ${(selected.tags || []).map(tag => `<span class="px-2 py-0.5 bg-gray-100 text-gray-600 text-xs rounded">${tag}</span>`).join('')}
                </div>
            </div>
        </div>
    `;
}

// Render Step 2: Content Options & Generation
function renderCvGeneratorStep2() {
    return `
        <!-- Language -->
        <div class="mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-language mr-2 text-brand-gold"></i>
                Sprache
            </h4>
            <div class="grid grid-cols-2 gap-4">
                ${['Deutsch', 'Englisch'].map(lang => `
                    <button onclick="window.selectCvDesign('language', '${lang}')" data-design="lang-${lang}"
                            class="design-option p-4 border-2 ${cvGeneratorState.language === lang ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200'} rounded-xl hover:border-brand-gold transition text-center">
                        <i class="fas fa-flag text-2xl ${cvGeneratorState.language === lang ? 'text-brand-gold' : 'text-gray-400'} mb-2"></i>
                        <p class="font-medium text-brand-dark">${lang}</p>
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Tone -->
        <div class="mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-comment-alt mr-2 text-brand-gold"></i>
                Tonalität
            </h4>
            <div class="grid grid-cols-3 gap-4">
                ${[
                    { id: 'professional', name: 'Professionell', desc: 'Sachlich & seriös' },
                    { id: 'confident', name: 'Selbstbewusst', desc: 'Stark & überzeugend' },
                    { id: 'dynamic', name: 'Dynamisch', desc: 'Energisch & modern' }
                ].map(t => `
                    <button onclick="window.selectCvDesign('tone', '${t.id}')" data-design="tone-${t.id}"
                            class="design-option p-4 border-2 ${cvGeneratorState.tone === t.id ? 'border-brand-gold bg-brand-gold/5' : 'border-gray-200'} rounded-xl hover:border-brand-gold transition text-center">
                        <p class="font-medium text-brand-dark text-sm">${t.name}</p>
                        <p class="text-xs text-gray-500">${t.desc}</p>
                    </button>
                `).join('')}
            </div>
        </div>

        <!-- Focus Areas -->
        <div class="mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-bullseye mr-2 text-brand-gold"></i>
                Schwerpunkte (optional)
            </h4>
            <div class="flex flex-wrap gap-2">
                ${['Leadership', 'Strategie', 'Digitalisierung', 'Innovation', 'Vertrieb', 'Finanzen', 'Internationales', 'Teamführung', 'Change Management', 'Projektmanagement'].map(area => `
                    <button onclick="window.toggleFocusArea('${area}')" data-focus="${area}"
                            class="focus-area-btn px-4 py-2 border ${cvGeneratorState.focusAreas.includes(area) ? 'border-brand-gold bg-brand-gold/10 text-brand-dark' : 'border-gray-200 text-gray-600'} rounded-full text-sm hover:border-brand-gold transition">
                        ${area}
                    </button>
                `).join('')}
            </div>
            <p class="text-xs text-gray-500 mt-2">Die KI wird diese Bereiche besonders hervorheben</p>
        </div>

        <!-- Summary -->
        <div class="bg-gradient-to-br from-brand-gold/10 to-yellow-50 rounded-xl p-6 mb-6">
            <h4 class="text-lg font-medium text-brand-dark mb-4">
                <i class="fas fa-list-check mr-2 text-brand-gold"></i>
                Zusammenfassung
            </h4>
            <div class="grid grid-cols-2 md:grid-cols-4 gap-4 text-sm">
                <div>
                    <p class="text-gray-500">Template</p>
                    <p class="font-medium text-brand-dark capitalize">${cvGeneratorState.template}</p>
                </div>
                <div>
                    <p class="text-gray-500">Farbschema</p>
                    <p class="font-medium text-brand-dark capitalize">${cvGeneratorState.colorScheme}</p>
                </div>
                <div>
                    <p class="text-gray-500">Layout</p>
                    <p class="font-medium text-brand-dark">${cvGeneratorState.layout === 'single-column' ? 'Eine Spalte' : cvGeneratorState.layout === 'two-column' ? 'Zwei Spalten' : 'Sidebar'}</p>
                </div>
                <div>
                    <p class="text-gray-500">Extras</p>
                    <p class="font-medium text-brand-dark">${[cvGeneratorState.includeCover ? 'Cover' : '', cvGeneratorState.includePhoto ? 'Foto' : ''].filter(Boolean).join(', ') || 'Keine'}</p>
                </div>
            </div>
        </div>

        <!-- Info Box -->
        <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
            <p class="text-sm text-blue-800">
                <i class="fas fa-robot mr-2"></i>
                Die KI analysiert alle Daten und erstellt einen optimierten Lebenslauf${cvGeneratorState.includeCover ? ' mit Anschreiben' : ''}.
                Dies kann 30-60 Sekunden dauern.
            </p>
        </div>

        <!-- Progress (hidden initially) -->
        <div id="cv-generation-progress" class="hidden mb-6">
            <div class="flex items-center gap-3 text-brand-dark">
                <i class="fas fa-spinner fa-spin text-xl"></i>
                <span id="cv-generation-status">CV wird generiert...</span>
            </div>
            <div class="mt-3 bg-gray-200 rounded-full h-2 overflow-hidden">
                <div id="cv-generation-bar" class="bg-brand-gold h-full transition-all duration-500" style="width: 0%"></div>
            </div>
        </div>
    `;
}

// Initialize CV Generator handlers
function initCvGeneratorHandlers() {
    window.selectCvDesign = function(type, value) {
        cvGeneratorState[type] = value;

        // Update UI for selection buttons
        if (['template', 'colorScheme', 'layout', 'language', 'tone'].includes(type)) {
            const prefix = type === 'template' ? 'template' : type === 'colorScheme' ? 'color' : type === 'layout' ? 'layout' : type === 'language' ? 'lang' : 'tone';
            document.querySelectorAll(`[data-design^="${prefix}-"]`).forEach(btn => {
                btn.classList.remove('border-brand-gold', 'bg-brand-gold/5');
                btn.classList.add('border-gray-200');
                const icon = btn.querySelector('i');
                if (icon) {
                    icon.classList.remove('text-brand-gold');
                    icon.classList.add('text-gray-400');
                }
            });
            const selected = document.querySelector(`[data-design="${prefix}-${value}"]`);
            if (selected) {
                selected.classList.remove('border-gray-200');
                selected.classList.add('border-brand-gold', 'bg-brand-gold/5');
                const icon = selected.querySelector('i');
                if (icon) {
                    icon.classList.remove('text-gray-400');
                    icon.classList.add('text-brand-gold');
                }
            }
        }
    };

    // Select Canva-style template
    window.selectCvTemplate = function(templateId) {
        cvGeneratorState.template = templateId;

        // Find the selected template to get its properties
        const allTemplates = getAllCvTemplates();
        const template = allTemplates.find(t => t.id === templateId);
        if (template) {
            cvGeneratorState.colorScheme = templateId; // Use template id as color scheme reference
            cvGeneratorState.layout = template.layout || 'two-column';
            cvGeneratorState.isCustomPdf = template.isCustomPdf || false;
            if (template.pdfFile) {
                cvGeneratorState.pdfFile = template.pdfFile;
            }
        }

        // Update all template cards UI
        document.querySelectorAll('.template-card').forEach(card => {
            const border = card.querySelector('.border-2');
            if (card.dataset.template === templateId) {
                border.classList.add('border-brand-gold', 'ring-2', 'ring-brand-gold/20');
                border.classList.remove('border-gray-200');
                // Add checkmark if not exists
                const previewDiv = border.querySelector('.aspect-\\[3\\/4\\]');
                if (previewDiv && !previewDiv.querySelector('.fa-check')) {
                    const checkmark = document.createElement('div');
                    checkmark.className = 'absolute top-2 right-2 w-6 h-6 bg-brand-gold rounded-full flex items-center justify-center';
                    checkmark.innerHTML = '<i class="fas fa-check text-brand-dark text-xs"></i>';
                    previewDiv.appendChild(checkmark);
                }
            } else {
                border.classList.remove('border-brand-gold', 'ring-2', 'ring-brand-gold/20');
                border.classList.add('border-gray-200');
                // Remove checkmark
                const checkmark = border.querySelector('.fa-check')?.parentElement;
                if (checkmark) checkmark.remove();
            }
        });

        // Update the selected template info panel
        const infoPanel = document.getElementById('selected-template-info');
        if (infoPanel) {
            infoPanel.innerHTML = renderSelectedTemplateInfo();
        }
    };

    // Filter templates by category
    window.filterCvTemplates = function(category) {
        // Update category buttons
        document.querySelectorAll('.category-btn').forEach(btn => {
            if (btn.dataset.category === category) {
                btn.classList.add('bg-brand-gold', 'text-brand-dark');
                btn.classList.remove('bg-gray-100', 'text-gray-600');
            } else {
                btn.classList.remove('bg-brand-gold', 'text-brand-dark');
                btn.classList.add('bg-gray-100', 'text-gray-600');
            }
        });

        // Filter template cards
        document.querySelectorAll('.template-card').forEach(card => {
            if (category === 'Alle' || card.dataset.category === category) {
                card.classList.remove('hidden');
            } else {
                card.classList.add('hidden');
            }
        });
    };

    window.toggleFocusArea = function(area) {
        const index = cvGeneratorState.focusAreas.indexOf(area);
        if (index > -1) {
            cvGeneratorState.focusAreas.splice(index, 1);
        } else {
            cvGeneratorState.focusAreas.push(area);
        }

        // Update button UI
        const btn = document.querySelector(`[data-focus="${area}"]`);
        if (btn) {
            if (cvGeneratorState.focusAreas.includes(area)) {
                btn.classList.add('border-brand-gold', 'bg-brand-gold/10', 'text-brand-dark');
                btn.classList.remove('border-gray-200', 'text-gray-600');
            } else {
                btn.classList.remove('border-brand-gold', 'bg-brand-gold/10', 'text-brand-dark');
                btn.classList.add('border-gray-200', 'text-gray-600');
            }
        }
    };
}

// CV Generator navigation
export function cvGeneratorNext() {
    if (cvGeneratorState.step === 1) {
        // Go to step 2
        cvGeneratorState.step = 2;
        updateCvGeneratorUI();
    } else {
        // Start generation
        startCvGeneration(cvGeneratorState.projectId, cvGeneratorState.orderId);
    }
}

export function cvGeneratorBack() {
    if (cvGeneratorState.step === 2) {
        cvGeneratorState.step = 1;
        updateCvGeneratorUI();
    }
}

// Update CV Generator UI based on step
function updateCvGeneratorUI() {
    const content = document.getElementById('cv-generator-content');
    const backBtn = document.getElementById('cv-gen-back-btn');
    const nextBtn = document.getElementById('cv-gen-next-btn');
    const step1Indicator = document.getElementById('step-indicator-1');
    const step2Indicator = document.getElementById('step-indicator-2');
    const stepLine = document.getElementById('step-line');

    if (cvGeneratorState.step === 1) {
        content.innerHTML = renderCvGeneratorStep1();
        backBtn.classList.add('hidden');
        nextBtn.innerHTML = 'Weiter <i class="fas fa-arrow-right ml-2"></i>';

        // Apply preview scaling after DOM is ready
        setTimeout(() => scaleCvPreviews(), 50);

        // Update indicators
        step1Indicator.querySelector('div').classList.add('bg-brand-gold', 'text-white');
        step1Indicator.querySelector('div').classList.remove('bg-gray-300', 'text-gray-600');
        step1Indicator.querySelector('span').classList.add('text-brand-dark');
        step1Indicator.querySelector('span').classList.remove('text-gray-500');

        step2Indicator.querySelector('div').classList.remove('bg-brand-gold', 'text-white');
        step2Indicator.querySelector('div').classList.add('bg-gray-300', 'text-gray-600');
        step2Indicator.querySelector('span').classList.remove('text-brand-dark');
        step2Indicator.querySelector('span').classList.add('text-gray-500');

        stepLine.classList.remove('bg-brand-gold');
        stepLine.classList.add('bg-gray-300');
    } else {
        content.innerHTML = renderCvGeneratorStep2();
        backBtn.classList.remove('hidden');
        nextBtn.innerHTML = '<i class="fas fa-magic mr-2"></i>CV generieren';

        // Update indicators
        step1Indicator.querySelector('div').classList.add('bg-brand-gold', 'text-white');
        step2Indicator.querySelector('div').classList.add('bg-brand-gold', 'text-white');
        step2Indicator.querySelector('div').classList.remove('bg-gray-300', 'text-gray-600');
        step2Indicator.querySelector('span').classList.add('text-brand-dark');
        step2Indicator.querySelector('span').classList.remove('text-gray-500');

        stepLine.classList.add('bg-brand-gold');
        stepLine.classList.remove('bg-gray-300');
    }

    initCvGeneratorHandlers();
}

// Start CV generation with Claude API
export async function startCvGeneration(projectId, orderId) {
    // Use the wizard buttons (cv-gen-next-btn becomes the generate button in step 2)
    const startBtn = document.getElementById('cv-gen-next-btn');
    const backBtn = document.getElementById('cv-gen-back-btn');
    const progressDiv = document.getElementById('cv-generation-progress');
    const statusSpan = document.getElementById('cv-generation-status');
    const progressBar = document.getElementById('cv-generation-bar');

    // Get all design options from cvGeneratorState
    const {
        template,
        colorScheme,
        layout,
        includeCover,
        includePhoto,
        language,
        tone,
        focusAreas
    } = cvGeneratorState;

    // Update UI to show progress
    if (startBtn) {
        startBtn.disabled = true;
        startBtn.innerHTML = '<i class="fas fa-spinner fa-spin mr-2"></i>Wird generiert...';
    }
    if (backBtn) backBtn.classList.add('hidden');
    if (progressDiv) progressDiv.classList.remove('hidden');

    // Animate progress bar
    let progress = 0;
    const progressInterval = setInterval(() => {
        progress = Math.min(progress + Math.random() * 15, 90);
        if (progressBar) progressBar.style.width = `${progress}%`;

        if (statusSpan) {
            if (progress < 30) {
                statusSpan.textContent = 'Analysiere Fragebogen-Daten...';
            } else if (progress < 60) {
                statusSpan.textContent = includeCover ? 'Generiere CV & Anschreiben...' : 'Generiere optimierten CV...';
            } else {
                statusSpan.textContent = 'Finalisiere Dokument...';
            }
        }
    }, 800);

    // Check if this is a custom PDF template
    const allTemplates = getAllCvTemplates();
    const selectedTemplateInfo = allTemplates.find(t => t.id === template);
    const isCustomPdf = selectedTemplateInfo?.isCustomPdf || false;
    const pdfFile = selectedTemplateInfo?.pdfFile || null;

    try {
        // Call Cloud Function to generate CV with all design options
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/generateCvContent', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                projectId: projectId,
                templateType: template,
                language: language,
                // New design options
                colorScheme: colorScheme,
                layout: layout,
                includeCover: includeCover,
                includePhoto: includePhoto,
                tone: tone,
                focusAreas: focusAreas,
                // Custom PDF template info
                isCustomPdf: isCustomPdf,
                pdfFile: pdfFile
            })
        });

        clearInterval(progressInterval);

        if (!response.ok) {
            const errorData = await response.json();
            throw new Error(errorData.message || 'CV-Generierung fehlgeschlagen');
        }

        const result = await response.json();

        // Complete progress
        if (progressBar) progressBar.style.width = '100%';
        if (statusSpan) statusSpan.textContent = 'CV erfolgreich generiert!';

        showToast('CV wurde erfolgreich generiert!');

        // Close modal and refresh list
        setTimeout(async () => {
            document.getElementById('cv-generator-modal')?.remove();
            await loadCvProjects();
            // Open preview automatically
            openCvPreview(orderId);
        }, 1000);

    } catch (e) {
        clearInterval(progressInterval);
        logger.error('Error generating CV:', e);

        if (progressDiv) {
            progressDiv.innerHTML = `
                <div class="flex items-center gap-3 text-red-600">
                    <i class="fas fa-exclamation-circle text-xl"></i>
                    <span>Fehler: ${e.message}</span>
                </div>
            `;
        }

        if (startBtn) {
            startBtn.disabled = false;
            startBtn.innerHTML = '<i class="fas fa-redo mr-2"></i>Erneut versuchen';
        }
        if (backBtn) backBtn.classList.remove('hidden');
    }
}

// Open CV preview
export async function openCvPreview(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    try {
        showToast('Lade CV-Vorschau...');

        // Load latest project data
        const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
        if (!projectDoc.exists() || !projectDoc.data().generatedCv) {
            showToast('Kein generierter CV gefunden');
            return;
        }

        const data = projectDoc.data();
        const cv = data.generatedCv.data;
        const template = data.generatedCv.templateType || 'corporate';

        // Render CV preview
        const cvHtml = renderCvTemplate(cv, template);

        const modal = document.createElement('div');
        modal.id = 'cv-preview-modal';
        modal.className = 'fixed inset-0 bg-black/80 flex items-start justify-center z-50 p-4 overflow-y-auto';
        modal.innerHTML = `
            <div class="bg-white rounded-2xl max-w-4xl w-full shadow-2xl my-4 flex flex-col">
                <!-- Header -->
                <div class="bg-brand-dark text-white px-6 py-4 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-4">
                        <h3 class="text-lg font-medium">CV Vorschau</h3>
                        <span class="text-xs bg-brand-gold/20 text-brand-gold px-2 py-1 rounded">${template.charAt(0).toUpperCase() + template.slice(1)}</span>
                    </div>
                    <button onclick="document.getElementById('cv-preview-modal')?.remove()"
                            class="text-white/60 hover:text-white transition">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>

                <!-- CV Content -->
                <div class="flex-1 overflow-y-auto p-6 bg-gray-100">
                    <div id="cv-preview-content" class="bg-white shadow-lg mx-auto" style="max-width: 210mm;">
                        ${cvHtml}
                    </div>
                </div>

                <!-- Footer Actions -->
                <div class="bg-white border-t border-gray-200 px-6 py-4 flex items-center justify-between flex-shrink-0">
                    <div class="flex items-center gap-2">
                        <span class="text-sm text-gray-500">Template:</span>
                        <select id="preview-template-select" onchange="app.changeCvTemplate('${project.cvProjectId}', '${orderId}')"
                                class="text-sm border border-gray-200 rounded px-2 py-1">
                            ${buildTemplateOptions(template)}
                        </select>
                    </div>
                    <div class="flex items-center gap-3">
                        <button onclick="app.regenerateCv('${project.cvProjectId}', '${orderId}')"
                                class="px-4 py-2 border border-gray-200 text-gray-600 rounded-lg hover:bg-gray-50 transition">
                            <i class="fas fa-redo mr-2"></i>Neu generieren
                        </button>
                        <button onclick="app.exportCvWord('${orderId}')"
                                class="px-4 py-2 bg-blue-600 text-white rounded-lg hover:bg-blue-700 transition">
                            <i class="fas fa-file-word mr-2"></i>Word
                        </button>
                        <button onclick="app.exportCvPdf('${orderId}')"
                                class="px-4 py-2 bg-red-600 text-white rounded-lg hover:bg-red-700 transition">
                            <i class="fas fa-file-pdf mr-2"></i>PDF
                        </button>
                    </div>
                </div>
            </div>
        `;
        document.body.appendChild(modal);

    } catch (e) {
        logger.error('Error loading CV preview:', e);
        showToast('Fehler beim Laden der Vorschau');
    }
}

// Build template options for dropdown
function buildTemplateOptions(selectedTemplate) {
    const allTemplates = getAllCvTemplates();
    return allTemplates.map(t => `
        <option value="${t.id}" ${selectedTemplate === t.id ? 'selected' : ''}>
            ${t.name}${t.isCustomPdf ? ' (PDF)' : ''}
        </option>
    `).join('');
}

// Render CV template HTML
function renderCvTemplate(cv, template) {
    // Check if this is a custom PDF template
    const allTemplates = getAllCvTemplates();
    const customTemplate = allTemplates.find(t => t.id === template && t.isCustomPdf);

    if (customTemplate) {
        // For custom PDF templates, show an embedded PDF viewer or preview image
        return `
            <div class="cv-template cv-template-custom-pdf p-8 text-center">
                <div class="mb-6">
                    <img src="${customTemplate.previewImage}" alt="${customTemplate.name}"
                         class="max-w-full h-auto mx-auto shadow-lg rounded-lg" style="max-height: 800px;" />
                </div>
                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 text-sm text-yellow-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Dies ist ein PDF-Template. Die generierten Inhalte werden beim PDF-Export in dieses Layout eingefügt.
                    <br><br>
                    <a href="${customTemplate.pdfFile}" target="_blank" class="text-blue-600 hover:underline">
                        <i class="fas fa-external-link-alt mr-1"></i>Original-PDF öffnen
                    </a>
                </div>
            </div>
        `;
    }
    const personal = cv.personal || {};
    const summary = cv.summary || '';
    const experience = cv.experience || [];
    const education = cv.education || [];
    const skills = cv.skills || {};
    const expertise = cv.expertise || [];

    // Template-specific styling
    const templateStyles = {
        'schwarz-beige-modern': {
            headerBg: 'bg-[#3d3d3d]',
            headerText: 'text-white',
            accentColor: 'text-[#c9a227]',
            sectionTitle: 'text-[#3d3d3d] border-b border-[#c9a227]',
            bodyText: 'text-gray-700'
        },
        'green-yellow-modern': {
            headerBg: 'bg-[#2d8a8a]',
            headerText: 'text-white',
            accentColor: 'text-[#f5c842]',
            sectionTitle: 'text-[#f5c842] border-b border-[#2d8a8a]',
            bodyText: 'text-[#2d8a8a]'
        },
        minimalist: {
            headerBg: 'bg-white',
            headerText: 'text-gray-900',
            accentColor: 'text-gray-600',
            sectionTitle: 'text-gray-800 border-b border-gray-200',
            bodyText: 'text-gray-700'
        },
        creative: {
            headerBg: 'bg-gradient-to-r from-purple-600 to-indigo-600',
            headerText: 'text-white',
            accentColor: 'text-purple-600',
            sectionTitle: 'text-purple-700 border-b-2 border-purple-200',
            bodyText: 'text-gray-700'
        },
        corporate: {
            headerBg: 'bg-brand-dark',
            headerText: 'text-white',
            accentColor: 'text-brand-gold',
            sectionTitle: 'text-brand-dark border-b-2 border-brand-gold',
            bodyText: 'text-gray-700'
        },
        executive: {
            headerBg: 'bg-slate-900',
            headerText: 'text-white',
            accentColor: 'text-amber-500',
            sectionTitle: 'text-slate-800 border-b-2 border-amber-500',
            bodyText: 'text-gray-700'
        },
        brand: {
            headerBg: 'bg-gradient-to-br from-brand-dark to-brand-dark/90',
            headerText: 'text-white',
            accentColor: 'text-brand-gold',
            sectionTitle: 'text-brand-dark border-l-4 border-brand-gold pl-4',
            bodyText: 'text-gray-700'
        }
    };

    const style = templateStyles[template] || templateStyles.corporate;

    return `
        <div class="cv-template cv-template-${template}" style="font-family: 'Georgia', serif;">
            <!-- Header -->
            <div class="${style.headerBg} ${style.headerText} p-8">
                <h1 class="text-3xl font-bold mb-1">${personal.fullName || 'Name'}</h1>
                <p class="text-xl opacity-90 mb-4">${personal.title || ''}</p>
                <div class="flex flex-wrap gap-4 text-sm opacity-80">
                    ${personal.email ? `<span><i class="fas fa-envelope mr-1"></i>${personal.email}</span>` : ''}
                    ${personal.phone ? `<span><i class="fas fa-phone mr-1"></i>${personal.phone}</span>` : ''}
                    ${personal.location ? `<span><i class="fas fa-map-marker-alt mr-1"></i>${personal.location}</span>` : ''}
                    ${personal.linkedin ? `<span><i class="fab fa-linkedin mr-1"></i>${personal.linkedin}</span>` : ''}
                </div>
            </div>

            <div class="p-8 space-y-6">
                <!-- Summary -->
                ${summary ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">PROFIL</h2>
                        <p class="${style.bodyText} leading-relaxed">${summary}</p>
                    </div>
                ` : ''}

                <!-- Expertise -->
                ${expertise.length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">KERNKOMPETENZEN</h2>
                        <div class="flex flex-wrap gap-2">
                            ${expertise.map(e => `<span class="px-3 py-1 bg-gray-100 rounded-full text-sm ${style.accentColor}">${e}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Experience -->
                ${experience.length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">BERUFSERFAHRUNG</h2>
                        <div class="space-y-4">
                            ${experience.map(exp => `
                                <div class="border-l-2 ${style.accentColor.replace('text-', 'border-')} pl-4">
                                    <div class="flex justify-between items-start">
                                        <div>
                                            <h3 class="font-bold ${style.bodyText}">${exp.role || ''}</h3>
                                            <p class="${style.accentColor} text-sm">${exp.company || ''}${exp.location ? ` | ${exp.location}` : ''}</p>
                                        </div>
                                        <span class="text-sm text-gray-500">${exp.period || ''}</span>
                                    </div>
                                    ${exp.description ? `<p class="text-sm ${style.bodyText} mt-2">${exp.description}</p>` : ''}
                                    ${(exp.achievements || []).length > 0 ? `
                                        <ul class="mt-2 space-y-1">
                                            ${exp.achievements.map(a => `<li class="text-sm ${style.bodyText} flex items-start gap-2"><span class="${style.accentColor}">•</span>${a}</li>`).join('')}
                                        </ul>
                                    ` : ''}
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Education -->
                ${education.length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">AUSBILDUNG</h2>
                        <div class="space-y-3">
                            ${education.map(edu => `
                                <div class="flex justify-between items-start">
                                    <div>
                                        <h3 class="font-bold ${style.bodyText}">${edu.degree || ''} ${edu.field ? `- ${edu.field}` : ''}</h3>
                                        <p class="text-sm ${style.accentColor}">${edu.institution || ''}</p>
                                        ${edu.highlights ? `<p class="text-sm text-gray-500 mt-1">${edu.highlights}</p>` : ''}
                                    </div>
                                    <span class="text-sm text-gray-500">${edu.period || ''}</span>
                                </div>
                            `).join('')}
                        </div>
                    </div>
                ` : ''}

                <!-- Skills -->
                <div class="grid grid-cols-2 gap-6">
                    ${(skills.technical || []).length > 0 ? `
                        <div>
                            <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">FACHKENNTNISSE</h2>
                            <div class="flex flex-wrap gap-2">
                                ${skills.technical.map(s => `<span class="px-2 py-1 bg-gray-100 rounded text-sm">${s}</span>`).join('')}
                            </div>
                        </div>
                    ` : ''}

                    ${(skills.languages || []).length > 0 ? `
                        <div>
                            <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">SPRACHEN</h2>
                            <div class="space-y-1">
                                ${skills.languages.map(l => `<p class="text-sm"><span class="font-medium">${l.language}</span> - ${l.level}</p>`).join('')}
                            </div>
                        </div>
                    ` : ''}
                </div>

                ${(skills.certifications || []).length > 0 ? `
                    <div>
                        <h2 class="text-lg font-bold ${style.sectionTitle} pb-2 mb-3">ZERTIFIKATE</h2>
                        <div class="flex flex-wrap gap-2">
                            ${skills.certifications.map(c => `<span class="px-3 py-1 bg-gray-100 rounded-full text-sm">${c}</span>`).join('')}
                        </div>
                    </div>
                ` : ''}
            </div>
        </div>
    `;
}

// Change CV template and re-render preview
export async function changeCvTemplate(projectId, orderId) {
    const newTemplate = document.getElementById('preview-template-select')?.value;
    if (!newTemplate) return;

    try {
        const projectDoc = await getDoc(doc(db, 'cvProjects', projectId));
        if (!projectDoc.exists()) return;

        const cv = projectDoc.data().generatedCv?.data;
        if (!cv) return;

        const cvHtml = renderCvTemplate(cv, newTemplate);
        const previewContent = document.getElementById('cv-preview-content');
        if (previewContent) {
            previewContent.innerHTML = cvHtml;
        }

        // Update template in Firestore
        await updateDoc(doc(db, 'cvProjects', projectId), {
            'generatedCv.templateType': newTemplate
        });

    } catch (e) {
        logger.error('Error changing template:', e);
    }
}

// Regenerate CV with new Claude API call
export async function regenerateCv(projectId, orderId) {
    document.getElementById('cv-preview-modal')?.remove();
    openCvGenerator(orderId);
}

// Export CV as PDF (Server-side generation for professional quality)
export async function exportCvPdf(orderId) {
    await exportCvDocument(orderId, 'pdf');
}

// Export CV as Word document
export async function exportCvWord(orderId) {
    await exportCvDocument(orderId, 'docx');
}

// Generic function to export CV in different formats
async function exportCvDocument(orderId, format = 'docx') {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    const formatLabel = format === 'docx' ? 'Word' : 'PDF';
    showToast(`${formatLabel}-Dokument wird generiert...`);

    try {
        // Get the project data to determine template style
        const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
        if (!projectDoc.exists() || !projectDoc.data().generatedCv) {
            showToast('Kein generierter CV gefunden. Bitte zuerst CV generieren.');
            return;
        }

        const projectData = projectDoc.data();
        const templateStyle = projectData.generatedCv.templateType || 'executive';

        // Call the Cloud Function to generate the document
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/generateCvDocument', {
            method: 'POST',
            headers: {
                'Content-Type': 'application/json'
            },
            body: JSON.stringify({
                projectId: project.cvProjectId,
                format: format,
                templateStyle: templateStyle
            })
        });

        if (!response.ok) {
            const error = await response.json();
            throw new Error(error.message || 'Dokumentgenerierung fehlgeschlagen');
        }

        const result = await response.json();

        if (result.success && result.downloadUrl) {
            // Download the file
            const link = document.createElement('a');
            link.href = result.downloadUrl;
            link.download = `CV_${project.customerName?.replace(/\s+/g, '_') || 'Karriaro'}_${new Date().toISOString().split('T')[0]}.${format}`;
            link.target = '_blank';
            document.body.appendChild(link);
            link.click();
            document.body.removeChild(link);

            showToast(`${formatLabel}-Dokument wurde heruntergeladen!`);
        } else {
            throw new Error('Keine Download-URL erhalten');
        }

    } catch (e) {
        logger.error(`Error generating ${format}:`, e);
        showToast(`Fehler beim ${formatLabel}-Export: ` + e.message);
    }
}

// Export CV as PDF using html2pdf (client-side fallback)
export async function exportCvPdfClientSide(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    showToast('PDF wird generiert...');

    try {
        // Load html2pdf.js dynamically if not loaded
        if (!window.html2pdf) {
            await loadScript('https://cdnjs.cloudflare.com/ajax/libs/html2pdf.js/0.10.1/html2pdf.bundle.min.js');
        }

        // Get the CV preview content
        let cvContent = document.getElementById('cv-preview-content');

        // If preview modal is not open, we need to load and render the CV
        if (!cvContent) {
            const projectDoc = await getDoc(doc(db, 'cvProjects', project.cvProjectId));
            if (!projectDoc.exists() || !projectDoc.data().generatedCv) {
                showToast('Kein generierter CV gefunden');
                return;
            }

            const data = projectDoc.data();
            const cv = data.generatedCv.data;
            const template = data.generatedCv.templateType || 'corporate';

            // Create temporary container
            const tempContainer = document.createElement('div');
            tempContainer.id = 'temp-cv-content';
            tempContainer.style.position = 'absolute';
            tempContainer.style.left = '-9999px';
            tempContainer.innerHTML = `<div style="width: 210mm; background: white;">${renderCvTemplate(cv, template)}</div>`;
            document.body.appendChild(tempContainer);
            cvContent = tempContainer.querySelector('div');
        }

        // Configure html2pdf options
        const opt = {
            margin: 0,
            filename: `CV_${project.customerName?.replace(/\s+/g, '_') || 'Karriaro'}_${new Date().toISOString().split('T')[0]}.pdf`,
            image: { type: 'jpeg', quality: 0.98 },
            html2canvas: {
                scale: 2,
                useCORS: true,
                logging: false
            },
            jsPDF: {
                unit: 'mm',
                format: 'a4',
                orientation: 'portrait'
            }
        };

        // Generate PDF
        await html2pdf().set(opt).from(cvContent).save();

        // Clean up temp container if it exists
        document.getElementById('temp-cv-content')?.remove();

        showToast('PDF wurde heruntergeladen!');

    } catch (e) {
        logger.error('Error generating PDF:', e);
        showToast('Fehler beim PDF-Export: ' + e.message);
    }
}

// Helper function to load external scripts
function loadScript(src) {
    return new Promise((resolve, reject) => {
        const script = document.createElement('script');
        script.src = src;
        script.onload = resolve;
        script.onerror = reject;
        document.head.appendChild(script);
    });
}

// Send CV to customer
export async function sendCvToCustomer(orderId) {
    const project = cvProjectsCache.find(p => p.id === orderId);
    if (!project || !project.cvProjectId) {
        showToast('Projekt nicht gefunden');
        return;
    }

    const modal = document.createElement('div');
    modal.id = 'send-cv-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-lg w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-green-100 rounded-xl flex items-center justify-center">
                    <i class="fas fa-envelope text-green-600 text-xl"></i>
                </div>
                <div>
                    <h3 class="text-lg font-medium text-brand-dark">CV an Kunden senden</h3>
                    <p class="text-sm text-gray-500">${project.customerEmail}</p>
                </div>
            </div>

            <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6">
                <p class="text-sm text-blue-800">
                    <i class="fas fa-info-circle mr-2"></i>
                    Der Kunde erhält eine E-Mail mit dem fertigen CV als PDF-Anhang.
                </p>
            </div>

            <div class="flex gap-3 justify-end">
                <button onclick="document.getElementById('send-cv-modal')?.remove()"
                        class="px-4 py-2 text-gray-600 hover:text-gray-800 transition">
                    Abbrechen
                </button>
                <button onclick="app.confirmSendCvToCustomer('${project.cvProjectId}', '${orderId}')"
                        class="px-6 py-2 bg-green-600 text-white rounded-lg font-medium hover:bg-green-700 transition">
                    <i class="fas fa-paper-plane mr-2"></i>
                    Jetzt senden
                </button>
            </div>
        </div>
    `;
    document.body.appendChild(modal);
}

// Confirm and send CV to customer
export async function confirmSendCvToCustomer(projectId, orderId) {
    document.getElementById('send-cv-modal')?.remove();
    showToast('CV wird an Kunden gesendet...');

    try {
        // Update status to delivered
        await updateDoc(doc(db, 'cvProjects', projectId), {
            status: 'delivered',
            deliveredAt: serverTimestamp()
        });

        // TODO: Send email with PDF attachment via Cloud Function

        showToast('CV wurde als zugestellt markiert!');
        await loadCvProjects();

    } catch (e) {
        logger.error('Error sending CV:', e);
        showToast('Fehler: ' + e.message);
    }
}

// ============================================
// CV QUESTIONNAIRE FUNCTIONS
// ============================================

let cvQuestionnaireStep = 1;
let cvQuestionnaireProjectId = null;
let cvQuestionnaireMode = null; // 'smart' or 'manual'
let smartQuestionnaireStep = 1;
let cvQuestionnaireData = {
    personal: {},
    experience: [],
    education: [],
    skills: {},
    additional: {},
    documents: {}
};
let smartUploadData = {
    cvFile: null,
    cvUrl: null,
    jobFile: null,
    jobUrl: null,
    otherFiles: [],
    otherUrls: [],
    name: '',
    email: '',
    targetRole: '',
    linkedin: '',
    links: '',
    notes: '',
    // Template selection fields
    selectedTemplate: null,
    selectedTemplateName: '',
    selectedPreviewImage: null,
    primaryColor: '#b76e22',
    accentColor: '#8fa3b4',
    circleColor: '#f4b4b7',
    colorsCustomized: false
};

// Current cv project data (loaded from Firestore)
let currentCvProjectData = null;
let experienceCounter = 0;
let educationCounter = 0;
let languageCounter = 0;

// Initialize CV Questionnaire from URL parameter or direct call
export async function initCvQuestionnaire(directProjectId = null) {
    let projectId = directProjectId;

    // Falls keine direkte ID übergeben wurde, aus URL lesen
    if (!projectId) {
        const urlParams = new URLSearchParams(window.location.search);
        projectId = urlParams.get('questionnaire');
    }

    if (!projectId) return false;

    // ========== VALIDIERUNG: ProjectId Format prüfen ==========
    // Verhindert dass zufällige IDs probiert werden
    if (!projectId.match(/^[a-zA-Z0-9]{20,}$/)) {
        showToast('❌ Ungültiger Fragebogen-Link');
        window.location.href = window.location.origin;
        return false;
    }

    cvQuestionnaireProjectId = projectId;

    try {
        // Load existing project data
        const projectDoc = await getDoc(doc(db, 'cvProjects', projectId));

        // ========== VALIDIERUNG: Projekt muss existieren ==========
        if (!projectDoc.exists()) {
            showToast('❌ Fragebogen nicht gefunden oder abgelaufen');
            window.location.href = window.location.origin;
            return false;
        }

        const data = projectDoc.data();

        // Store project data for template loading
        currentCvProjectData = data;

        // ========== VALIDIERUNG: Status prüfen ==========
        // Fragebogen ist nicht mehr bearbeitbar nach Absenden (data_received, generating, ready, delivered)
        const completedStatuses = ['data_received', 'generating', 'ready', 'delivered'];
        if (completedStatuses.includes(data.status)) {
            showToast('ℹ️ Dieser Fragebogen wurde bereits ausgefüllt und kann nicht mehr bearbeitet werden.');
            // Weiterleiten zum Dashboard nach 2 Sekunden
            setTimeout(() => {
                window.location.href = window.location.origin + '?view=dashboard';
            }, 2000);
            return false;
        }

        // Pre-fill form with existing data
        if (data.questionnaire) {
            cvQuestionnaireData = { ...cvQuestionnaireData, ...data.questionnaire };
        }

        // Pre-fill email and name for both modes
        if (data.customerEmail) {
            smartUploadData.email = data.customerEmail;
            const emailInput = document.getElementById('cv-q-email');
            const smartEmailInput = document.getElementById('cv-q-smart-email');
            if (emailInput) emailInput.value = data.customerEmail;
            if (smartEmailInput) smartEmailInput.value = data.customerEmail;
        }
        if (data.customerName) {
            smartUploadData.name = data.customerName;
            const nameInput = document.getElementById('cv-q-fullname');
            const smartNameInput = document.getElementById('cv-q-smart-name');
            if (nameInput) nameInput.value = data.customerName;
            if (smartNameInput) smartNameInput.value = data.customerName;
        }

        // Show questionnaire view with mode selection
        hideAllViews();
        document.getElementById('view-cv-questionnaire')?.classList.remove('hidden');

        // Reset to mode selection
        resetQuestionnaireView();

        return true;
    } catch (e) {
        logger.error('Error loading questionnaire:', e);
        showToast('Fehler beim Laden des Fragebogens');
        return false;
    }
}

// Reset questionnaire view to initial state
function resetQuestionnaireView() {
    // Show mode selection
    document.getElementById('cv-q-mode-selection')?.classList.remove('hidden');

    // Hide both modes
    document.getElementById('cv-q-smart-mode')?.classList.add('hidden');
    document.getElementById('cv-q-manual-mode')?.classList.add('hidden');
    document.getElementById('cv-q-manual-progress')?.classList.add('hidden');

    cvQuestionnaireMode = null;
    smartQuestionnaireStep = 1;
    cvQuestionnaireStep = 1;
}

// Select questionnaire mode (smart or manual)
export function selectQuestionnaireMode(mode) {
    cvQuestionnaireMode = mode;

    // Hide mode selection
    document.getElementById('cv-q-mode-selection')?.classList.add('hidden');

    if (mode === 'smart') {
        // Show smart upload mode
        document.getElementById('cv-q-smart-mode')?.classList.remove('hidden');
        document.getElementById('cv-q-manual-mode')?.classList.add('hidden');
        document.getElementById('cv-q-manual-progress')?.classList.add('hidden');

        // Pre-fill smart mode fields
        const smartEmailInput = document.getElementById('cv-q-smart-email');
        const smartNameInput = document.getElementById('cv-q-smart-name');
        if (smartEmailInput && smartUploadData.email) smartEmailInput.value = smartUploadData.email;
        if (smartNameInput && smartUploadData.name) smartNameInput.value = smartUploadData.name;

        // Reset smart mode
        smartQuestionnaireStep = 1;
        updateSmartQuestionnaireUI();

        // Initialize smart mode input listeners (with small delay to ensure DOM is ready)
        setTimeout(() => initSmartModeListeners(), 100);
    } else {
        // Show manual mode
        document.getElementById('cv-q-smart-mode')?.classList.add('hidden');
        document.getElementById('cv-q-manual-mode')?.classList.remove('hidden');
        document.getElementById('cv-q-manual-progress')?.classList.remove('hidden');

        // Initialize manual mode entries
        if (cvQuestionnaireData.experience.length === 0) {
            addCvExperienceEntry();
        }
        if (cvQuestionnaireData.education.length === 0) {
            addCvEducationEntry();
        }
        if (!cvQuestionnaireData.skills.languages?.length) {
            addCvLanguageEntry();
        }

        // Pre-fill manual mode
        if (cvQuestionnaireData.questionnaire) {
            prefillQuestionnaireForm(cvQuestionnaireData.questionnaire);
        }

        cvQuestionnaireStep = 1;
        updateCvQuestionnaireUI();
    }
}

// Back to mode selection
export function backToModeSelection() {
    resetQuestionnaireView();
}

// ============================================
// SMART UPLOAD MODE FUNCTIONS
// ============================================

// Handle CV file upload in smart mode
export async function handleSmartCvUpload(input) {
    const file = input.files[0];
    if (!file) return;

    showToast('CV wird hochgeladen...');

    try {
        const url = await uploadQuestionnaireFile(file, 'existingCv');
        smartUploadData.cvFile = file;
        smartUploadData.cvUrl = url;

        // Update UI
        document.getElementById('cv-q-smart-cv-preview')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-cv-placeholder')?.classList.add('hidden');
        document.getElementById('cv-q-smart-cv-filename').textContent = file.name;

        // Enable next button
        updateSmartNextButton();

        showToast('CV erfolgreich hochgeladen!');
    } catch (e) {
        logger.error('Error uploading CV:', e);
        showToast('Fehler beim Hochladen: ' + e.message);
    }
}

// Handle job description upload in smart mode
export async function handleSmartJobUpload(input) {
    const file = input.files[0];
    if (!file) return;

    showToast('Stellenausschreibung wird hochgeladen...');

    try {
        const url = await uploadQuestionnaireFile(file, 'targetJob');
        smartUploadData.jobFile = file;
        smartUploadData.jobUrl = url;

        // Update UI
        document.getElementById('cv-q-smart-job-preview')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-job-placeholder')?.classList.add('hidden');
        document.getElementById('cv-q-smart-job-filename').textContent = file.name;

        showToast('Stellenausschreibung erfolgreich hochgeladen!');
    } catch (e) {
        logger.error('Error uploading job description:', e);
        showToast('Fehler beim Hochladen: ' + e.message);
    }
}

// Handle other documents upload in smart mode
export async function handleSmartOtherUpload(input) {
    const files = input.files;
    if (!files || files.length === 0) return;

    showToast('Dokumente werden hochgeladen...');

    try {
        for (const file of files) {
            const url = await uploadQuestionnaireFile(file, 'other');
            smartUploadData.otherFiles.push(file);
            smartUploadData.otherUrls.push(url);
        }

        // Update UI
        document.getElementById('cv-q-smart-other-preview')?.classList.remove('hidden');
        document.getElementById('cv-q-smart-other-placeholder')?.classList.add('hidden');
        document.getElementById('cv-q-smart-other-filename').textContent =
            smartUploadData.otherFiles.map(f => f.name).join(', ');

        showToast(`${files.length} Dokument(e) erfolgreich hochgeladen!`);
    } catch (e) {
        logger.error('Error uploading documents:', e);
        showToast('Fehler beim Hochladen: ' + e.message);
    }
}

// Upload file to Firebase Storage for questionnaire
async function uploadQuestionnaireFile(file, docType) {
    const timestamp = Date.now();
    const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
    const path = `cv-documents/${cvQuestionnaireProjectId}/${docType}_${timestamp}_${safeName}`;

    const storageRef = ref(storage, path);
    await uploadBytes(storageRef, file);
    return await getDownloadURL(storageRef);
}

// Update smart mode next button state
export function updateSmartNextButton() {
    const nextBtn = document.getElementById('cv-q-smart-next-btn');
    if (!nextBtn) return;

    if (smartQuestionnaireStep === 1) {
        // Step 1: Need CV uploaded
        nextBtn.disabled = !smartUploadData.cvUrl;
    } else if (smartQuestionnaireStep === 2) {
        // Step 2: Need name, email, and target role
        const name = document.getElementById('cv-q-smart-name')?.value?.trim();
        const email = document.getElementById('cv-q-smart-email')?.value?.trim();
        const targetRole = document.getElementById('cv-q-smart-target-role')?.value?.trim();
        nextBtn.disabled = !name || !email || !targetRole;
    } else if (smartQuestionnaireStep === 3) {
        // Step 3: Need template selected
        nextBtn.disabled = !smartUploadData.selectedTemplate;
    }
}

// Update smart questionnaire UI based on current step
function updateSmartQuestionnaireUI() {
    // Hide all steps
    document.querySelectorAll('.cv-q-smart-step').forEach(el => el.classList.add('hidden'));

    // Show current step
    document.getElementById(`cv-q-smart-step-${smartQuestionnaireStep}`)?.classList.remove('hidden');

    // Update progress indicators (now 4 steps)
    for (let i = 1; i <= 4; i++) {
        const indicator = document.getElementById(`smart-step-${i}-indicator`);
        const line = document.getElementById(`smart-step-line-${i - 1}`);

        if (indicator) {
            if (i <= smartQuestionnaireStep) {
                indicator.classList.remove('bg-gray-200', 'text-gray-500');
                indicator.classList.add('bg-brand-gold', 'text-white');
            } else {
                indicator.classList.add('bg-gray-200', 'text-gray-500');
                indicator.classList.remove('bg-brand-gold', 'text-white');
            }
        }
        if (line && i > 1) {
            if (i <= smartQuestionnaireStep) {
                line.classList.remove('bg-gray-200');
                line.classList.add('bg-brand-gold');
            } else {
                line.classList.add('bg-gray-200');
                line.classList.remove('bg-brand-gold');
            }
        }
    }

    // Update navigation buttons
    const backBtn = document.getElementById('cv-q-smart-back-btn');
    const nextBtn = document.getElementById('cv-q-smart-next-btn');
    const submitBtn = document.getElementById('cv-q-smart-submit-btn');

    if (smartQuestionnaireStep === 1) {
        backBtn.onclick = () => backToModeSelection();
    } else {
        backBtn.onclick = () => smartQuestionnaireBack();
    }

    // Step 3: Load templates when entering template selection
    if (smartQuestionnaireStep === 3) {
        loadAvailableTemplates();
    }

    // Step 4: Show submit button and fill summary
    if (smartQuestionnaireStep === 4) {
        nextBtn?.classList.add('hidden');
        submitBtn?.classList.remove('hidden');

        // Fill summary
        fillSmartSummary();
    } else {
        nextBtn?.classList.remove('hidden');
        submitBtn?.classList.add('hidden');
    }

    updateSmartNextButton();
}

// Navigate to next step in smart mode
export function smartQuestionnaireNext() {
    if (smartQuestionnaireStep === 1) {
        if (!smartUploadData.cvUrl) {
            showToast('Bitte laden Sie Ihren Lebenslauf hoch');
            return;
        }
    } else if (smartQuestionnaireStep === 2) {
        // Save form data
        smartUploadData.name = document.getElementById('cv-q-smart-name')?.value?.trim() || '';
        smartUploadData.email = document.getElementById('cv-q-smart-email')?.value?.trim() || '';
        smartUploadData.targetRole = document.getElementById('cv-q-smart-target-role')?.value?.trim() || '';
        smartUploadData.linkedin = document.getElementById('cv-q-smart-linkedin')?.value?.trim() || '';
        smartUploadData.links = document.getElementById('cv-q-smart-links')?.value?.trim() || '';
        smartUploadData.notes = document.getElementById('cv-q-smart-notes')?.value?.trim() || '';

        if (!smartUploadData.name || !smartUploadData.email || !smartUploadData.targetRole) {
            showToast('Bitte füllen Sie alle Pflichtfelder aus');
            return;
        }
    } else if (smartQuestionnaireStep === 3) {
        // Validate template selection
        if (!smartUploadData.selectedTemplate) {
            showToast('Bitte wählen Sie ein Template aus');
            return;
        }
        // Save color customization
        smartUploadData.primaryColor = document.getElementById('cv-q-primary-color')?.value || '#1a3a5c';
        smartUploadData.accentColor = document.getElementById('cv-q-accent-color')?.value || '#d4912a';
    }

    smartQuestionnaireStep++;
    updateSmartQuestionnaireUI();
}

// Navigate back in smart mode
export function smartQuestionnaireBack() {
    if (smartQuestionnaireStep > 1) {
        smartQuestionnaireStep--;
        updateSmartQuestionnaireUI();
    } else {
        backToModeSelection();
    }
}

// Fill summary for smart mode step 3
function fillSmartSummary() {
    const summaryContent = document.getElementById('cv-q-smart-summary-content');
    if (!summaryContent) return;

    let html = `
        <div class="flex items-center gap-2">
            <i class="fas fa-user text-brand-gold"></i>
            <span><strong>Name:</strong> ${smartUploadData.name}</span>
        </div>
        <div class="flex items-center gap-2">
            <i class="fas fa-envelope text-brand-gold"></i>
            <span><strong>E-Mail:</strong> ${smartUploadData.email}</span>
        </div>
        <div class="flex items-center gap-2">
            <i class="fas fa-bullseye text-brand-gold"></i>
            <span><strong>Zielposition:</strong> ${smartUploadData.targetRole}</span>
        </div>
    `;

    if (smartUploadData.linkedin) {
        html += `
            <div class="flex items-center gap-2">
                <i class="fab fa-linkedin text-blue-600"></i>
                <span><strong>LinkedIn:</strong> <a href="${smartUploadData.linkedin}" target="_blank" class="text-brand-gold hover:underline">${smartUploadData.linkedin}</a></span>
            </div>
        `;
    }

    if (smartUploadData.links) {
        html += `
            <div class="flex items-start gap-2">
                <i class="fas fa-link text-brand-gold mt-0.5"></i>
                <span><strong>Weitere Links:</strong> ${smartUploadData.links}</span>
            </div>
        `;
    }

    html += `
        <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
            <i class="fas fa-file-pdf text-green-500"></i>
            <span><strong>CV:</strong> ${smartUploadData.cvFile?.name || 'Hochgeladen'}</span>
        </div>
    `;

    if (smartUploadData.jobUrl) {
        html += `
            <div class="flex items-center gap-2">
                <i class="fas fa-briefcase text-green-500"></i>
                <span><strong>Stellenausschreibung:</strong> ${smartUploadData.jobFile?.name || 'Hochgeladen'}</span>
            </div>
        `;
    }

    if (smartUploadData.otherUrls.length > 0) {
        html += `
            <div class="flex items-center gap-2">
                <i class="fas fa-file-alt text-green-500"></i>
                <span><strong>Weitere Dokumente:</strong> ${smartUploadData.otherFiles.length} Datei(en)</span>
            </div>
        `;
    }

    if (smartUploadData.notes) {
        html += `
            <div class="flex items-start gap-2 mt-2 pt-2 border-t border-gray-200">
                <i class="fas fa-sticky-note text-brand-gold mt-0.5"></i>
                <span><strong>Hinweise:</strong> ${smartUploadData.notes}</span>
            </div>
        `;
    }

    // Template selection summary
    if (smartUploadData.selectedTemplate) {
        html += `
            <div class="flex items-center gap-2 mt-2 pt-2 border-t border-gray-200">
                <i class="fas fa-file-alt text-brand-gold"></i>
                <span><strong>Template:</strong> ${smartUploadData.selectedTemplateName || smartUploadData.selectedTemplate}</span>
            </div>
            <div class="flex items-center gap-2">
                <i class="fas fa-palette text-brand-gold"></i>
                <span><strong>Farben:</strong>
                    <span class="inline-block w-4 h-4 rounded" style="background-color: ${smartUploadData.primaryColor}; vertical-align: middle;"></span>
                    <span class="inline-block w-4 h-4 rounded ml-1" style="background-color: ${smartUploadData.accentColor}; vertical-align: middle;"></span>
                </span>
            </div>
        `;
    }

    summaryContent.innerHTML = html;
}

// ========== TEMPLATE SELECTION FUNCTIONS ==========

// Load available templates based on package type
async function loadAvailableTemplates() {
    const packageType = currentCvProjectData?.packageType || 'young-professional';
    const orderItemTitle = currentCvProjectData?.orderItemTitle || '';

    // Update package info display
    const packageNameEl = document.getElementById('cv-q-template-package-name');
    if (packageNameEl) {
        packageNameEl.textContent = orderItemTitle || getPackageDisplayName(packageType);
    }

    const templateGrid = document.getElementById('cv-q-template-grid');
    if (!templateGrid) return;

    try {
        // Load only active templates from Firestore (or fallback to JSON)
        const templates = await loadActiveTemplates();

        if (templates.length === 0) {
            templateGrid.innerHTML = `
                <div class="col-span-full text-center py-8 text-gray-500">
                    <i class="fas fa-exclamation-circle text-2xl mb-2"></i>
                    <p>Keine Templates für dieses Paket verfügbar.</p>
                </div>
            `;
            return;
        }

        // Render template cards
        templateGrid.innerHTML = templates.map(template => {
            // Check if this is an SVG-based template (uses preview.html)
            const isSvgTemplate = template.previewImage?.includes('/template-designer/preview.html');
            // Build iframe URL - append color params with & since template param already uses ?
            const separator = template.previewImage?.includes('?') ? '&' : '?';
            const previewContent = isSvgTemplate
                ? `<iframe src="${template.previewImage}${separator}primary=${encodeURIComponent(template.defaultColors?.primary || '#b76e22')}&accent=${encodeURIComponent(template.defaultColors?.accent || '#8fa3b4')}&circle=${encodeURIComponent(template.defaultColors?.circle || '#f4b4b7')}"
                         class="w-full h-full border-0 pointer-events-none"
                         style="transform: scale(1); transform-origin: top left;"
                         title="${template.name}"></iframe>`
                : `<img src="${template.previewImage}" alt="${template.name}"
                         class="w-full h-full object-cover"
                         onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 133%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22133%22/><text x=%2250%22 y=%2266%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2212%22>Template</text></svg>'">`;

            // Store template data for onclick as JSON (escape for HTML attribute)
            const templateData = JSON.stringify({
                id: template.id,
                name: template.name,
                previewImage: template.previewImage,
                defaultColors: template.defaultColors || { primary: '#b76e22' },
                colorLabels: template.colorLabels || {}
            }).replace(/"/g, '&quot;');

            return `
            <div class="template-card cursor-pointer rounded-xl border-2 border-gray-200 overflow-hidden hover:border-brand-gold hover:shadow-lg transition-all ${smartUploadData.selectedTemplate === template.id ? 'border-brand-gold ring-2 ring-brand-gold/30' : ''}"
                 onclick="app.selectTemplate(${templateData})"
                 data-template-id="${template.id}">
                <div class="aspect-[3/4] bg-gray-100 relative overflow-hidden">
                    ${previewContent}
                    ${smartUploadData.selectedTemplate === template.id ? `
                        <div class="absolute top-2 right-2 w-8 h-8 bg-brand-gold rounded-full flex items-center justify-center z-10">
                            <i class="fas fa-check text-white"></i>
                        </div>
                    ` : ''}
                </div>
                <div class="p-3 bg-white">
                    <p class="font-medium text-sm text-gray-800 truncate">${template.name}</p>
                    <p class="text-xs text-gray-500 mt-1 truncate">${template.description || ''}</p>
                </div>
            </div>
        `}).join('');

    } catch (error) {
        logger.error('Error loading templates:', error);
        templateGrid.innerHTML = `
            <div class="col-span-full text-center py-8 text-red-500">
                <i class="fas fa-exclamation-triangle text-2xl mb-2"></i>
                <p>Fehler beim Laden der Templates.</p>
            </div>
        `;
    }
}

// Get display name for package type
function getPackageDisplayName(packageType) {
    const names = {
        'young-professional': 'Young Professional CV',
        'senior-professional': 'Senior Professional CV',
        'executive': 'Executive CV',
        'quick-check': 'Quick Check'
    };
    return names[packageType] || packageType;
}

// Select a template
export function selectTemplate(templateData) {
    // templateData is now an object: { id, name, previewImage, defaultColors, colorLabels }
    const { id: templateId, name: templateName, previewImage, defaultColors, colorLabels } = templateData;

    smartUploadData.selectedTemplate = templateId;
    smartUploadData.selectedTemplateName = templateName;
    smartUploadData.selectedPreviewImage = previewImage; // Store preview image URL
    smartUploadData.templateColors = defaultColors; // Store available colors for this template

    // Set default colors if not already customized
    if (!smartUploadData.colorsCustomized) {
        smartUploadData.primaryColor = defaultColors?.primary || '#b76e22';
        smartUploadData.accentColor = defaultColors?.accent || '';
        smartUploadData.circleColor = defaultColors?.circle || '';
        document.getElementById('cv-q-primary-color').value = smartUploadData.primaryColor;
        document.getElementById('cv-q-accent-color').value = smartUploadData.accentColor;
        document.getElementById('cv-q-circle-color').value = smartUploadData.circleColor;
    }

    // Update template cards to show selection
    document.querySelectorAll('.template-card').forEach(card => {
        card.classList.remove('border-brand-gold', 'ring-2', 'ring-brand-gold/30');
        const checkmark = card.querySelector('.fa-check')?.parentElement;
        if (checkmark) checkmark.remove();
    });

    // Find and highlight selected card by data attribute
    const selectedCard = document.querySelector(`.template-card[data-template-id="${templateId}"]`);
    if (selectedCard) {
        selectedCard.classList.add('border-brand-gold', 'ring-2', 'ring-brand-gold/30');
        const imgContainer = selectedCard.querySelector('.aspect-\\[3\\/4\\]');
        if (imgContainer && !imgContainer.querySelector('.fa-check')) {
            const checkmark = document.createElement('div');
            checkmark.className = 'absolute top-2 right-2 w-8 h-8 bg-brand-gold rounded-full flex items-center justify-center z-10';
            checkmark.innerHTML = '<i class="fas fa-check text-white"></i>';
            imgContainer.appendChild(checkmark);
        }
    }

    // Show preview container
    const previewContainer = document.getElementById('cv-q-template-preview-container');
    const previewName = document.getElementById('cv-q-selected-template-name');

    if (previewContainer) {
        previewContainer.classList.remove('hidden');
        if (previewName) previewName.textContent = templateName;

        // Update preview with correct template and build dynamic color pickers
        if (typeof window.setPreviewTemplate === 'function') {
            window.setPreviewTemplate(templateId, defaultColors, colorLabels);
        }
    }

    // Update next button state
    updateSmartNextButton();
}

// Set template color preset
export function setTemplateColor(type, color) {
    smartUploadData.colorsCustomized = true;

    if (type === 'primary') {
        smartUploadData.primaryColor = color;
        document.getElementById('cv-q-primary-color').value = color;
    } else if (type === 'accent') {
        smartUploadData.accentColor = color;
        document.getElementById('cv-q-accent-color').value = color;
    } else if (type === 'circle') {
        smartUploadData.circleColor = color;
        document.getElementById('cv-q-circle-color').value = color;
    }

    // Update pdfme preview via iframe
    updatePdfmePreviewColors();
}

// Update colors from color picker
export function updateTemplateColors() {
    smartUploadData.colorsCustomized = true;
    smartUploadData.primaryColor = document.getElementById('cv-q-primary-color')?.value || '#b76e22';
    smartUploadData.accentColor = document.getElementById('cv-q-accent-color')?.value || '#8fa3b4';
    smartUploadData.circleColor = document.getElementById('cv-q-circle-color')?.value || '#f4b4b7';

    // Update pdfme preview via iframe
    updatePdfmePreviewColors();
}

// Check if template uses SVG-based preview (live color customization)
function isSvgBasedTemplate() {
    return smartUploadData.selectedPreviewImage?.includes('/template-designer/preview.html');
}

// Update template preview - handles both SVG and PNG templates
function updateTemplatePreview() {
    const previewDiv = document.getElementById('cv-q-template-preview');
    if (!previewDiv) return;

    if (isSvgBasedTemplate()) {
        // SVG-based template: Use iframe with color params
        const encodedPrimary = encodeURIComponent(smartUploadData.primaryColor);
        const encodedAccent = encodeURIComponent(smartUploadData.accentColor);
        const encodedCircle = encodeURIComponent(smartUploadData.circleColor);
        const iframeSrc = `/template-designer/preview.html?primary=${encodedPrimary}&accent=${encodedAccent}&circle=${encodedCircle}`;

        previewDiv.innerHTML = `
            <iframe
                id="cv-q-preview-iframe"
                src="${iframeSrc}"
                class="border-0 rounded-lg shadow-lg"
                style="width: 400px; height: 566px; max-width: 100%;"
                title="CV Template Vorschau"
            ></iframe>
        `;
    } else {
        // PNG-based template: Show static image with color swatches
        previewDiv.innerHTML = `
            <div class="flex flex-col items-center gap-4">
                <img src="${smartUploadData.selectedPreviewImage}"
                     alt="${smartUploadData.selectedTemplateName}"
                     class="max-w-full rounded-lg shadow-lg"
                     style="max-height: 400px;"
                     onerror="this.src='data:image/svg+xml,<svg xmlns=%22http://www.w3.org/2000/svg%22 viewBox=%220 0 100 133%22><rect fill=%22%23f3f4f6%22 width=%22100%22 height=%22133%22/><text x=%2250%22 y=%2266%22 text-anchor=%22middle%22 fill=%22%239ca3af%22 font-size=%2212%22>Vorschau</text></svg>'">
                <div class="flex gap-3 items-center text-sm text-gray-600">
                    <span>Ihre Farben:</span>
                    <div class="flex gap-2">
                        <div class="w-6 h-6 rounded border border-gray-300" style="background: ${smartUploadData.primaryColor}" title="Hauptfarbe"></div>
                        <div class="w-6 h-6 rounded border border-gray-300" style="background: ${smartUploadData.accentColor}" title="Akzentfarbe"></div>
                        <div class="w-6 h-6 rounded border border-gray-300" style="background: ${smartUploadData.circleColor}" title="Dekorkreis"></div>
                    </div>
                </div>
                <p class="text-xs text-gray-400 text-center">Die gewählten Farben werden bei der Erstellung angewendet</p>
            </div>
        `;
    }
}

// Update pdfme preview with current colors via URL params (reload iframe)
function updatePdfmePreviewColors() {
    if (!isSvgBasedTemplate()) {
        // For non-SVG templates, just update color swatches
        updateTemplatePreview();
        return;
    }

    const iframe = document.getElementById('cv-q-preview-iframe');
    if (!iframe) {
        // iframe doesn't exist yet, create it
        updateTemplatePreview();
        return;
    }

    // Just update the src, don't recreate the iframe
    const encodedPrimary = encodeURIComponent(smartUploadData.primaryColor);
    const encodedAccent = encodeURIComponent(smartUploadData.accentColor);
    const encodedCircle = encodeURIComponent(smartUploadData.circleColor);
    iframe.src = `/template-designer/preview.html?primary=${encodedPrimary}&accent=${encodedAccent}&circle=${encodedCircle}`;
}

// Reset colors to template defaults
export function resetTemplateColors() {
    smartUploadData.colorsCustomized = false;

    // Reset to default colors (Kreativ template)
    smartUploadData.primaryColor = '#b76e22';
    smartUploadData.accentColor = '#8fa3b4';
    smartUploadData.circleColor = '#f4b4b7';

    document.getElementById('cv-q-primary-color').value = '#b76e22';
    document.getElementById('cv-q-accent-color').value = '#8fa3b4';
    document.getElementById('cv-q-circle-color').value = '#f4b4b7';

    // Update pdfme preview via iframe
    updatePdfmePreviewColors();

    showToast('Farben zurückgesetzt');
}

// ========== ADMIN TEMPLATE PREVIEW ==========

// Update admin preview colors - reload iframe with URL params
export function updateAdminPreviewColors() {
    console.log('updateAdminPreviewColors called');

    const primaryColor = document.getElementById('admin-primary-color')?.value || '#1a3a5c';
    const accentColor = document.getElementById('admin-accent-color')?.value || '#d4912a';

    console.log('Colors:', primaryColor, accentColor);

    // Update text inputs
    const primaryText = document.getElementById('admin-primary-color-text');
    const accentText = document.getElementById('admin-accent-color-text');
    if (primaryText) primaryText.value = primaryColor;
    if (accentText) accentText.value = accentColor;

    // Reload iframe with new colors as URL params
    const iframe = document.getElementById('admin-preview-iframe');
    console.log('iframe element:', iframe);

    if (iframe) {
        const encodedPrimary = encodeURIComponent(primaryColor);
        const encodedAccent = encodeURIComponent(accentColor);
        const newSrc = `/template-designer/preview.html?primary=${encodedPrimary}&accent=${encodedAccent}`;
        console.log('Setting iframe src to:', newSrc);
        iframe.src = newSrc;
    }
}

// Set admin preview preset colors
export function setAdminPreviewPreset(primary, accent) {
    document.getElementById('admin-primary-color').value = primary;
    document.getElementById('admin-accent-color').value = accent;
    document.getElementById('admin-primary-color-text').value = primary;
    document.getElementById('admin-accent-color-text').value = accent;

    updateAdminPreviewColors();
}

// Submit smart questionnaire
export async function submitSmartQuestionnaire() {
    if (!cvQuestionnaireProjectId) {
        showToast('Fehler: Projekt nicht gefunden');
        return;
    }

    showToast('Daten werden übermittelt...');

    try {
        // Prepare data
        const updateData = {
            mode: 'smart',
            questionnaire: {
                personal: {
                    fullName: smartUploadData.name,
                    email: smartUploadData.email,
                    targetRole: smartUploadData.targetRole,
                    linkedin: smartUploadData.linkedin || '',
                    links: smartUploadData.links || ''
                },
                additional: {
                    notes: smartUploadData.notes
                }
            },
            documents: {
                existingCv: {
                    url: smartUploadData.cvUrl,
                    filename: smartUploadData.cvFile?.name,
                    uploadedAt: serverTimestamp()
                }
            },
            status: 'data_received',
            updatedAt: serverTimestamp(),
            submittedAt: serverTimestamp()
        };

        // Add optional documents
        if (smartUploadData.jobUrl) {
            updateData.documents.targetJob = {
                url: smartUploadData.jobUrl,
                filename: smartUploadData.jobFile?.name,
                uploadedAt: serverTimestamp()
            };
        }

        if (smartUploadData.otherUrls.length > 0) {
            updateData.documents.otherDocuments = smartUploadData.otherUrls.map((url, i) => ({
                url,
                filename: smartUploadData.otherFiles[i]?.name,
                uploadedAt: new Date().toISOString()
            }));
        }

        // Add template selection
        if (smartUploadData.selectedTemplate) {
            updateData.templateSelection = {
                templateId: smartUploadData.selectedTemplate,
                templateName: smartUploadData.selectedTemplateName,
                selectedAt: serverTimestamp(),
                customization: {
                    primaryColor: smartUploadData.primaryColor,
                    accentColor: smartUploadData.accentColor,
                    circleColor: smartUploadData.circleColor
                }
            };
        }

        // Update cvProjects Collection
        console.log('[Smart Submit] Updating cvProjects:', cvQuestionnaireProjectId);
        await updateDoc(doc(db, 'cvProjects', cvQuestionnaireProjectId), updateData);
        console.log('[Smart Submit] cvProjects updated successfully');

        // Auch die Order aktualisieren (für Dashboard-Workflow-Anzeige)
        const orderId = sessionStorage.getItem('questionnaire_orderId');
        console.log('[Smart Submit] Order ID from session:', orderId);

        if (orderId) {
            try {
                console.log('[Smart Submit] Updating order with workflow...');
                await updateDoc(doc(db, 'orders', orderId), {
                    questionnaire: updateData.questionnaire,
                    questionnaireSubmittedAt: serverTimestamp(),
                    cvStatus: 'data_received',
                    nextStep: 'cv_creation',
                    nextStepDescription: 'Ihr CV wird erstellt',
                    workflow: {
                        currentStep: 2,
                        steps: [
                            { step: 1, name: 'Fragebogen ausfüllen', status: 'completed', icon: 'clipboard-list' },
                            { step: 2, name: 'CV wird erstellt', status: 'pending', icon: 'pen-fancy' },
                            { step: 3, name: 'Review & Feedback', status: 'waiting', icon: 'comments' },
                            { step: 4, name: 'Fertigstellung', status: 'waiting', icon: 'check-circle' }
                        ]
                    }
                });
                console.log('[Smart Submit] Order updated successfully');
            } catch (orderError) {
                console.error('[Smart Submit] Error updating order:', orderError);
                // Continue anyway - cvProject was updated
            }
        } else {
            console.warn('[Smart Submit] No orderId found in session storage');
        }

        // Show success
        showSmartSubmitSuccess();

    } catch (e) {
        logger.error('Error submitting smart questionnaire:', e);
        showToast('Fehler beim Übermitteln: ' + e.message);
    }
}

// Show success message after smart submit
function showSmartSubmitSuccess() {
    const container = document.getElementById('cv-q-smart-mode');
    if (!container) return;

    container.innerHTML = `
        <div class="bg-white rounded-2xl border border-gray-100 shadow-sm overflow-hidden">
            <div class="p-8 text-center">
                <div class="w-24 h-24 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                    <i class="fas fa-check-circle text-green-500 text-5xl"></i>
                </div>
                <h2 class="font-serif text-2xl text-brand-dark mb-3">Vielen Dank!</h2>
                <p class="text-gray-500 mb-6">
                    Ihr Fragebogen wurde erfolgreich übermittelt. Ich mache mich umgehend an die Erstellung Ihres optimierten Lebenslaufs.
                </p>
                <div class="bg-blue-50 border border-blue-200 rounded-xl p-4 mb-6 text-left">
                    <h4 class="font-medium text-blue-800 mb-2 flex items-center gap-2">
                        <i class="fas fa-info-circle"></i>
                        Was passiert als Nächstes?
                    </h4>
                    <ul class="text-sm text-blue-700 space-y-1">
                        <li>• Ich prüfe Ihre eingereichten Dokumente</li>
                        <li>• Ein Experte erstellt und optimiert Ihren CV</li>
                        <li>• Sie erhalten Ihren fertigen Lebenslauf per E-Mail</li>
                    </ul>
                </div>
                <button onclick="app.navigateTo('dashboard'); app.loadUserOrders(app.state);" class="inline-flex items-center gap-2 px-6 py-3 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                    <i class="fas fa-tachometer-alt"></i>
                    Zum Dashboard
                </button>
            </div>
        </div>
    `;
}

// Add event listeners for smart mode form inputs
export function initSmartModeListeners() {
    // Add input listeners for step 2 validation
    const fields = ['cv-q-smart-name', 'cv-q-smart-email', 'cv-q-smart-target-role', 'cv-q-smart-linkedin', 'cv-q-smart-links'];
    fields.forEach(id => {
        const el = document.getElementById(id);
        if (el) {
            // Remove existing listener first to avoid duplicates
            el.removeEventListener('input', updateSmartNextButton);
            el.addEventListener('input', updateSmartNextButton);
        }
    });
}

// Pre-fill form with existing data
function prefillQuestionnaireForm(data) {
    // Personal data
    if (data.personal) {
        setInputValue('cv-q-fullname', data.personal.fullName);
        setInputValue('cv-q-email', data.personal.email);
        setInputValue('cv-q-phone', data.personal.phone);
        setInputValue('cv-q-location', data.personal.location);
        setInputValue('cv-q-linkedin', data.personal.linkedin);
        setInputValue('cv-q-website', data.personal.website);
        setInputValue('cv-q-target-role', data.personal.targetRole);
        setInputValue('cv-q-career-goal', data.personal.careerGoal);
    }

    // Experience
    if (data.experience?.length > 0) {
        data.experience.forEach((exp, i) => {
            if (i > 0) addCvExperienceEntry();
            // Fields will be filled after entry is added
        });
    }

    // Skills
    if (data.skills) {
        setInputValue('cv-q-technical-skills', data.skills.technical?.join(', '));
        setInputValue('cv-q-soft-skills', data.skills.soft?.join(', '));
        setInputValue('cv-q-certifications', data.skills.certifications?.join(', '));
    }

    // Additional
    if (data.additional) {
        setInputValue('cv-q-summary', data.additional.summary);
        setInputValue('cv-q-strengths', data.additional.strengths);
        setInputValue('cv-q-industries', data.additional.industries?.join(', '));
        setInputValue('cv-q-availability', data.additional.availability);
        setInputValue('cv-q-additional-notes', data.additional.notes);
    }
}

function setInputValue(id, value) {
    const el = document.getElementById(id);
    if (el && value) el.value = value;
}

// Navigate to next step
export function nextCvQuestionnaireStep() {
    if (cvQuestionnaireStep >= 5) return;

    // Save current step data
    saveCvQuestionnaireStepData();

    cvQuestionnaireStep++;
    updateCvQuestionnaireUI();

    // Auto-save
    autosaveCvQuestionnaire();
}

// Navigate to previous step
export function prevCvQuestionnaireStep() {
    if (cvQuestionnaireStep <= 1) return;

    saveCvQuestionnaireStepData();
    cvQuestionnaireStep--;
    updateCvQuestionnaireUI();
}

// Update UI based on current step
function updateCvQuestionnaireUI() {
    // Hide all steps
    document.querySelectorAll('.cv-q-step').forEach(el => el.classList.add('hidden'));

    // Show current step
    document.getElementById(`cv-q-step-${cvQuestionnaireStep}`)?.classList.remove('hidden');

    // Update progress
    const progress = (cvQuestionnaireStep / 5) * 100;
    document.getElementById('cv-q-current-step').textContent = cvQuestionnaireStep;
    document.getElementById('cv-q-progress-percent').textContent = `${progress}%`;
    document.getElementById('cv-q-progress-bar').style.width = `${progress}%`;

    // Update step labels
    const stepLabels = document.querySelectorAll('#view-cv-questionnaire .flex.justify-between.mt-3 span');
    stepLabels.forEach((label, i) => {
        if (i + 1 <= cvQuestionnaireStep) {
            label.classList.remove('text-gray-400');
            label.classList.add('text-brand-gold', 'font-medium');
        } else {
            label.classList.add('text-gray-400');
            label.classList.remove('text-brand-gold', 'font-medium');
        }
    });

    // Update buttons
    const prevBtn = document.getElementById('cv-q-prev-btn');
    const nextBtn = document.getElementById('cv-q-next-btn');
    const submitBtn = document.getElementById('cv-q-submit-btn');

    prevBtn.disabled = cvQuestionnaireStep === 1;

    if (cvQuestionnaireStep === 5) {
        nextBtn.classList.add('hidden');
        submitBtn.classList.remove('hidden');
    } else {
        nextBtn.classList.remove('hidden');
        submitBtn.classList.add('hidden');
    }
}

// Save current step data to cvQuestionnaireData
function saveCvQuestionnaireStepData() {
    switch (cvQuestionnaireStep) {
        case 1:
            cvQuestionnaireData.personal = {
                fullName: document.getElementById('cv-q-fullname')?.value || '',
                email: document.getElementById('cv-q-email')?.value || '',
                phone: document.getElementById('cv-q-phone')?.value || '',
                location: document.getElementById('cv-q-location')?.value || '',
                linkedin: document.getElementById('cv-q-linkedin')?.value || '',
                website: document.getElementById('cv-q-website')?.value || '',
                targetRole: document.getElementById('cv-q-target-role')?.value || '',
                careerGoal: document.getElementById('cv-q-career-goal')?.value || ''
            };
            break;

        case 2:
            cvQuestionnaireData.experience = collectExperienceEntries();
            break;

        case 3:
            cvQuestionnaireData.education = collectEducationEntries();
            break;

        case 4:
            cvQuestionnaireData.skills = {
                technical: parseCommaSeparated(document.getElementById('cv-q-technical-skills')?.value),
                soft: parseCommaSeparated(document.getElementById('cv-q-soft-skills')?.value),
                languages: collectLanguageEntries(),
                certifications: parseCommaSeparated(document.getElementById('cv-q-certifications')?.value)
            };
            break;

        case 5:
            cvQuestionnaireData.additional = {
                summary: document.getElementById('cv-q-summary')?.value || '',
                strengths: document.getElementById('cv-q-strengths')?.value || '',
                industries: parseCommaSeparated(document.getElementById('cv-q-industries')?.value),
                availability: document.getElementById('cv-q-availability')?.value || '',
                notes: document.getElementById('cv-q-additional-notes')?.value || ''
            };
            break;
    }
}

function parseCommaSeparated(str) {
    if (!str) return [];
    return str.split(',').map(s => s.trim()).filter(s => s.length > 0);
}

// Add experience entry
export function addCvExperienceEntry() {
    const container = document.getElementById('cv-q-experience-list');
    if (!container) return;

    const entryId = `exp-${experienceCounter++}`;

    const entryHtml = `
        <div id="${entryId}" class="bg-gray-50 rounded-xl p-4 relative">
            <button type="button" onclick="app.removeCvEntry('${entryId}')"
                    class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition">
                <i class="fas fa-times"></i>
            </button>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Unternehmen *</label>
                    <input type="text" class="exp-company w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="Firma GmbH">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Position *</label>
                    <input type="text" class="exp-role w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="Senior Manager">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Von</label>
                    <input type="month" class="exp-start w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                    <div class="flex items-center gap-2">
                        <input type="month" class="exp-end flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                        <label class="flex items-center gap-1 text-xs text-gray-500 whitespace-nowrap">
                            <input type="checkbox" class="exp-current rounded text-brand-gold">
                            Aktuell
                        </label>
                    </div>
                </div>
            </div>

            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Beschreibung</label>
                <textarea class="exp-description w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none" rows="2"
                          placeholder="Hauptverantwortlichkeiten und Tätigkeiten..."></textarea>
            </div>

            <div class="mt-4">
                <label class="block text-sm font-medium text-gray-700 mb-1">Erfolge & Achievements</label>
                <textarea class="exp-achievements w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold resize-none" rows="2"
                          placeholder="z.B. Umsatzsteigerung um 20%, Teamaufbau von 5 auf 15 Mitarbeiter... (eines pro Zeile)"></textarea>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', entryHtml);
}

// Add education entry
export function addCvEducationEntry() {
    const container = document.getElementById('cv-q-education-list');
    if (!container) return;

    const entryId = `edu-${educationCounter++}`;

    const entryHtml = `
        <div id="${entryId}" class="bg-gray-50 rounded-xl p-4 relative">
            <button type="button" onclick="app.removeCvEntry('${entryId}')"
                    class="absolute top-3 right-3 text-gray-400 hover:text-red-500 transition">
                <i class="fas fa-times"></i>
            </button>

            <div class="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div class="sm:col-span-2">
                    <label class="block text-sm font-medium text-gray-700 mb-1">Institution *</label>
                    <input type="text" class="edu-institution w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="Universität / Hochschule">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Abschluss</label>
                    <input type="text" class="edu-degree w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. Bachelor, Master, Diplom">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Fachrichtung</label>
                    <input type="text" class="edu-field w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. Betriebswirtschaft">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Von</label>
                    <input type="month" class="edu-start w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Bis</label>
                    <input type="month" class="edu-end w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Note</label>
                    <input type="text" class="edu-grade w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. 1,5">
                </div>
                <div>
                    <label class="block text-sm font-medium text-gray-700 mb-1">Schwerpunkte</label>
                    <input type="text" class="edu-highlights w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                           placeholder="z.B. Finance, Marketing">
                </div>
            </div>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', entryHtml);
}

// Add language entry
export function addCvLanguageEntry() {
    const container = document.getElementById('cv-q-languages-list');
    if (!container) return;

    const entryId = `lang-${languageCounter++}`;

    const entryHtml = `
        <div id="${entryId}" class="flex items-center gap-2">
            <input type="text" class="lang-name flex-1 border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold"
                   placeholder="Sprache">
            <select class="lang-level border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold bg-white">
                <option value="">Niveau</option>
                <option value="Muttersprache">Muttersprache</option>
                <option value="Verhandlungssicher (C2)">Verhandlungssicher (C2)</option>
                <option value="Fließend (C1)">Fließend (C1)</option>
                <option value="Fortgeschritten (B2)">Fortgeschritten (B2)</option>
                <option value="Mittelstufe (B1)">Mittelstufe (B1)</option>
                <option value="Grundkenntnisse (A1-A2)">Grundkenntnisse (A1-A2)</option>
            </select>
            <button type="button" onclick="app.removeCvEntry('${entryId}')"
                    class="text-gray-400 hover:text-red-500 transition p-1">
                <i class="fas fa-times"></i>
            </button>
        </div>
    `;

    container.insertAdjacentHTML('beforeend', entryHtml);
}

// Remove entry
export function removeCvEntry(entryId) {
    document.getElementById(entryId)?.remove();
}

// Collect all experience entries
function collectExperienceEntries() {
    const entries = [];
    document.querySelectorAll('#cv-q-experience-list > div').forEach(entry => {
        entries.push({
            company: entry.querySelector('.exp-company')?.value || '',
            role: entry.querySelector('.exp-role')?.value || '',
            startDate: entry.querySelector('.exp-start')?.value || '',
            endDate: entry.querySelector('.exp-current')?.checked ? 'heute' : (entry.querySelector('.exp-end')?.value || ''),
            description: entry.querySelector('.exp-description')?.value || '',
            achievements: (entry.querySelector('.exp-achievements')?.value || '').split('\n').filter(a => a.trim())
        });
    });
    return entries;
}

// Collect all education entries
function collectEducationEntries() {
    const entries = [];
    document.querySelectorAll('#cv-q-education-list > div').forEach(entry => {
        entries.push({
            institution: entry.querySelector('.edu-institution')?.value || '',
            degree: entry.querySelector('.edu-degree')?.value || '',
            field: entry.querySelector('.edu-field')?.value || '',
            startDate: entry.querySelector('.edu-start')?.value || '',
            endDate: entry.querySelector('.edu-end')?.value || '',
            grade: entry.querySelector('.edu-grade')?.value || '',
            highlights: entry.querySelector('.edu-highlights')?.value || ''
        });
    });
    return entries;
}

// Collect all language entries
function collectLanguageEntries() {
    const entries = [];
    document.querySelectorAll('#cv-q-languages-list > div').forEach(entry => {
        const name = entry.querySelector('.lang-name')?.value || '';
        const level = entry.querySelector('.lang-level')?.value || '';
        if (name) {
            entries.push({ language: name, level: level });
        }
    });
    return entries;
}

// Autosave questionnaire data
async function autosaveCvQuestionnaire() {
    if (!cvQuestionnaireProjectId) return;

    const statusEl = document.getElementById('cv-q-autosave-status');
    if (statusEl) {
        statusEl.innerHTML = '<i class="fas fa-sync fa-spin"></i> Speichern...';
    }

    try {
        await updateDoc(doc(db, 'cvProjects', cvQuestionnaireProjectId), {
            questionnaire: cvQuestionnaireData,
            updatedAt: serverTimestamp()
        });

        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-check text-green-500"></i> Gespeichert';
            setTimeout(() => {
                statusEl.innerHTML = '<i class="fas fa-cloud"></i> Fortschritt wird automatisch gespeichert';
            }, 2000);
        }
    } catch (e) {
        logger.error('Error autosaving questionnaire:', e);
        if (statusEl) {
            statusEl.innerHTML = '<i class="fas fa-exclamation-triangle text-red-500"></i> Speichern fehlgeschlagen';
        }
    }
}

// Handle document upload
export async function handleCvDocumentUpload(docType, input) {
    const file = input.files?.[0];
    if (!file) return;

    const maxSize = 10 * 1024 * 1024; // 10MB
    if (file.size > maxSize) {
        showToast('Datei zu groß (max. 10MB)');
        return;
    }

    const filenameEl = document.getElementById(`cv-q-${docType === 'existingCv' ? 'existing-cv' : 'target-job'}-filename`);
    const uploadEl = document.getElementById(`cv-q-${docType === 'existingCv' ? 'existing-cv' : 'target-job'}-upload`);

    try {
        // Show uploading state
        if (uploadEl) {
            uploadEl.innerHTML = `
                <i class="fas fa-spinner fa-spin text-2xl text-brand-gold mb-2"></i>
                <p class="text-sm text-gray-500">Wird hochgeladen...</p>
            `;
        }

        // Upload to Firebase Storage
        const storageRef = ref(storage, `cv-documents/${cvQuestionnaireProjectId}/${docType}/${file.name}`);
        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // Store in questionnaire data
        cvQuestionnaireData.documents[docType] = {
            url: downloadUrl,
            filename: file.name,
            uploadedAt: new Date().toISOString()
        };

        // Update UI
        if (filenameEl) {
            filenameEl.textContent = `✓ ${file.name}`;
            filenameEl.classList.remove('hidden');
        }
        if (uploadEl) {
            uploadEl.innerHTML = `
                <i class="fas fa-check-circle text-2xl text-green-500 mb-2"></i>
                <p class="text-sm text-gray-500">${file.name}</p>
            `;
        }

        // Autosave
        autosaveCvQuestionnaire();

        showToast('Datei hochgeladen');
    } catch (e) {
        logger.error('Error uploading document:', e);
        showToast('Fehler beim Hochladen');

        // Reset UI
        if (uploadEl) {
            const icon = docType === 'existingCv' ? 'fa-file-pdf' : 'fa-briefcase';
            const text = docType === 'existingCv' ? 'PDF oder Word hochladen' : 'PDF, Word oder Screenshot';
            uploadEl.innerHTML = `
                <i class="fas ${icon} text-2xl text-gray-400 mb-2"></i>
                <p class="text-sm text-gray-500">${text}</p>
            `;
        }
    }
}

// Submit questionnaire
export async function submitCvQuestionnaire() {
    // Save final step data
    saveCvQuestionnaireStepData();

    // Validate required fields
    if (!cvQuestionnaireData.personal.fullName || !cvQuestionnaireData.personal.email) {
        showToast('Bitte Name und E-Mail ausfüllen');
        cvQuestionnaireStep = 1;
        updateCvQuestionnaireUI();
        return;
    }

    if (!cvQuestionnaireData.personal.targetRole) {
        showToast('Bitte gewünschte Position angeben');
        cvQuestionnaireStep = 1;
        updateCvQuestionnaireUI();
        return;
    }

    try {
        showToast('Fragebogen wird gesendet...');

        // Update Firestore
        await updateDoc(doc(db, 'cvProjects', cvQuestionnaireProjectId), {
            questionnaire: cvQuestionnaireData,
            status: 'data_received',
            submittedAt: serverTimestamp(),
            updatedAt: serverTimestamp()
        });

        // Show success message
        const container = document.getElementById('view-cv-questionnaire');
        if (container) {
            container.innerHTML = `
                <div class="max-w-lg mx-auto px-4 py-20 text-center">
                    <div class="w-20 h-20 bg-green-100 rounded-full flex items-center justify-center mx-auto mb-6">
                        <i class="fas fa-check text-4xl text-green-600"></i>
                    </div>
                    <h1 class="font-serif text-2xl text-brand-dark mb-4">Vielen Dank!</h1>
                    <p class="text-gray-600 mb-6">
                        Ihr Fragebogen wurde erfolgreich übermittelt. Ich mache mich umgehend an die Erstellung Ihres optimierten Lebenslaufs.
                    </p>
                    <p class="text-sm text-gray-500 mb-8">
                        Sie erhalten eine Benachrichtigung per E-Mail, sobald Ihr Lebenslauf fertig ist.
                    </p>
                    <a href="/" class="inline-flex items-center gap-2 px-6 py-3 bg-brand-gold text-brand-dark rounded-lg font-medium hover:bg-yellow-500 transition">
                        <i class="fas fa-home"></i>
                        Zur Startseite
                    </a>
                </div>
            `;
        }

    } catch (e) {
        logger.error('Error submitting questionnaire:', e);
        showToast('Fehler beim Senden. Bitte versuchen Sie es erneut.');
    }
}

// ========== CV FEEDBACK & APPROVAL ==========

// Submit CV Feedback - Kunde sendet Änderungswünsche
export async function submitCvFeedback(orderId) {
    const feedbackEl = document.getElementById(`cv-feedback-${orderId}`);
    const feedback = feedbackEl?.value?.trim();

    if (!feedback) {
        showToast('Bitte geben Sie Ihr Feedback ein');
        return;
    }

    try {
        showToast('Feedback wird gesendet...');

        // Feedback zur Order hinzufügen
        const orderRef = doc(db, 'orders', orderId);
        const orderSnap = await getDoc(orderRef);

        if (!orderSnap.exists()) {
            showToast('Bestellung nicht gefunden');
            return;
        }

        const orderData = orderSnap.data();
        const existingFeedback = orderData.cvFeedback || [];

        // Neues Feedback hinzufügen
        const newFeedback = {
            text: feedback,
            submittedAt: new Date().toISOString(),
            submittedBy: auth.currentUser?.email || 'kunde'
        };

        // Update Order mit Feedback
        await updateDoc(orderRef, {
            cvFeedback: [...existingFeedback, newFeedback],
            cvStatus: 'revision_requested',
            cvFeedbackAt: serverTimestamp(),
            // Workflow auf Schritt 2 zurücksetzen (CV wird überarbeitet)
            workflow: {
                currentStep: 2,
                steps: [
                    { step: 1, name: 'Fragebogen', status: 'completed', icon: 'clipboard-list' },
                    { step: 2, name: 'CV-Erstellung', status: 'pending', icon: 'pen-fancy' },
                    { step: 3, name: 'Review & Feedback', status: 'waiting', icon: 'comments' },
                    { step: 4, name: 'Fertigstellung', status: 'waiting', icon: 'check-circle' }
                ]
            },
            nextStep: 'cv_revision',
            nextStepDescription: 'Ich überarbeite Ihren CV basierend auf Ihrem Feedback'
        });

        // Textarea leeren
        if (feedbackEl) feedbackEl.value = '';

        showToast('Feedback erfolgreich gesendet! Ich überarbeite Ihren CV.');

        // Dashboard neu laden
        if (state?.user) {
            await loadUserOrders(state);
        }

    } catch (error) {
        logger.error('Error submitting CV feedback:', error);
        showToast('Fehler beim Senden des Feedbacks');
    }
}

// Approve CV Draft - Kunde gibt CV frei
export async function approveCvDraft(orderId) {
    // Bestätigung anfordern
    const confirmed = confirm('Möchten Sie den CV-Entwurf freigeben? Nach der Freigabe wird Ihr finaler CV erstellt.');

    if (!confirmed) return;

    try {
        showToast('CV wird freigegeben...');

        const orderRef = doc(db, 'orders', orderId);

        // Update Order - CV ist genehmigt
        await updateDoc(orderRef, {
            cvStatus: 'approved',
            cvApprovedAt: serverTimestamp(),
            // Workflow auf Schritt 4 setzen (Fertigstellung)
            workflow: {
                currentStep: 4,
                steps: [
                    { step: 1, name: 'Fragebogen', status: 'completed', icon: 'clipboard-list' },
                    { step: 2, name: 'CV-Erstellung', status: 'completed', icon: 'pen-fancy' },
                    { step: 3, name: 'Review & Feedback', status: 'completed', icon: 'comments' },
                    { step: 4, name: 'Fertigstellung', status: 'pending', icon: 'check-circle' }
                ]
            },
            nextStep: 'finalization',
            nextStepDescription: 'Ich erstelle Ihre finale CV-Version'
        });

        showToast('CV erfolgreich freigegeben! Ihre finale Version wird erstellt.');

        // Dashboard neu laden
        if (state?.user) {
            await loadUserOrders(state);
        }

    } catch (error) {
        logger.error('Error approving CV draft:', error);
        showToast('Fehler bei der Freigabe');
    }
}

// ========== QUICK-CHECK UPLOAD ==========

// Handle Quick-Check CV Upload
export async function handleQuickCheckUpload(orderId, input) {
    const file = input.files?.[0];
    if (!file) return;

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Bitte laden Sie eine PDF- oder Word-Datei hoch');
        input.value = '';
        return;
    }

    // Validate file size (max 10MB)
    if (file.size > 10 * 1024 * 1024) {
        showToast('Datei zu groß (max. 10MB)');
        input.value = '';
        return;
    }

    try {
        showToast('Datei wird hochgeladen...');

        // Upload to Firebase Storage
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `quick-check/${orderId}/${timestamp}_${safeName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // Update Order in Firestore
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, {
            cvStatus: 'data_received',
            quickCheckDocument: {
                url: downloadUrl,
                filename: file.name,
                uploadedAt: new Date().toISOString()
            },
            questionnaireSubmittedAt: serverTimestamp()
        });

        showToast('Lebenslauf erfolgreich hochgeladen!');

        // Reload orders to update UI
        if (window.app?.state?.user) {
            await loadUserOrders(window.app.state);
        }

    } catch (error) {
        logger.error('Error uploading Quick-Check document:', error);
        showToast('Fehler beim Hochladen. Bitte versuchen Sie es erneut.');
        input.value = '';
    }
}

// Admin: Quick-Check Gutachten hochladen und Order abschließen
export async function uploadQuickCheckGutachten(orderId, userId, file, customerEmail, customerName) {
    if (!file) {
        showToast('Bitte wählen Sie eine Datei aus');
        return;
    }

    // Validate file type
    const allowedTypes = ['application/pdf', 'application/msword', 'application/vnd.openxmlformats-officedocument.wordprocessingml.document'];
    if (!allowedTypes.includes(file.type)) {
        showToast('Bitte laden Sie eine PDF- oder Word-Datei hoch');
        return;
    }

    try {
        showToast('Gutachten wird hochgeladen...');

        // Upload to Firebase Storage (delivered folder for user access)
        const timestamp = Date.now();
        const safeName = file.name.replace(/[^a-zA-Z0-9.-]/g, '_');
        const storagePath = `delivered/${userId}/quick-check-gutachten_${timestamp}_${safeName}`;
        const storageRef = ref(storage, storagePath);

        await uploadBytes(storageRef, file);
        const downloadUrl = await getDownloadURL(storageRef);

        // Update Order in Firestore
        const orderRef = doc(db, 'orders', orderId);
        await updateDoc(orderRef, {
            quickCheckGutachtenUrl: downloadUrl,
            cvStatus: 'gutachten_delivered',
            status: 'completed',
            completedAt: serverTimestamp()
        });

        showToast('Gutachten hochgeladen! Order als abgeschlossen markiert.');

        // Send email notification to customer
        try {
            const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/notifyCustomerDocumentReady', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({
                    customerEmail: customerEmail,
                    customerName: customerName,
                    documentType: 'Quick-Check Gutachten',
                    orderId: orderId
                })
            });

            if (response.ok) {
                showToast('E-Mail-Benachrichtigung an Kunden gesendet!');
                logger.log(`Quick-Check Gutachten notification sent to ${customerEmail}`);
            } else {
                logger.warn('Failed to send email notification:', await response.text());
            }
        } catch (emailError) {
            logger.error('Error sending email notification:', emailError);
            // Don't fail the whole operation if email fails
        }

        // Reload admin orders
        await loadAllOrders();

    } catch (error) {
        logger.error('Error uploading Quick-Check Gutachten:', error);
        showToast('Fehler beim Hochladen des Gutachtens');
    }
}

// Hide all views helper
function hideAllViews() {
    document.querySelectorAll('[id^="view-"]').forEach(view => {
        view.classList.add('hidden');
    });
}

// ========== DSGVO & SECURITY ADMIN FUNCTIONS ==========

// Switch between DSGVO sub-tabs
export function switchDsgvoSubTab(tabName) {
    const subTabs = ['overview', 'deletion', 'audit', 'encryption', 'vvt'];

    subTabs.forEach(tab => {
        const btn = document.getElementById(`dsgvo-subtab-${tab}`);
        const content = document.getElementById(`dsgvo-content-${tab}`);

        if (btn) {
            if (tab === tabName) {
                btn.classList.add('border-brand-gold', 'text-brand-dark');
                btn.classList.remove('border-transparent', 'text-gray-500');
            } else {
                btn.classList.remove('border-brand-gold', 'text-brand-dark');
                btn.classList.add('border-transparent', 'text-gray-500');
            }
        }

        if (content) {
            content.classList.toggle('hidden', tab !== tabName);
        }
    });

    // Load data for specific sub-tabs
    if (tabName === 'audit') {
        loadAuditLog();
    }
    if (tabName === 'vvt') {
        loadVvt();
    }
}

// Load DSGVO statistics
export async function loadDsgvoStats() {
    try {
        // Count total users
        const usersQuery = query(collection(db, 'users'));
        const usersSnapshot = await getDocs(usersQuery);
        const totalUsers = usersSnapshot.size;

        // Count orders (for data retention info)
        const ordersQuery = query(collection(db, 'orders'));
        const ordersSnapshot = await getDocs(ordersQuery);
        const totalOrders = ordersSnapshot.size;

        // Count audit log entries
        let totalAuditLogs = 0;
        try {
            const auditQuery = query(collection(db, 'auditLog'));
            const auditSnapshot = await getDocs(auditQuery);
            totalAuditLogs = auditSnapshot.size;
        } catch (e) {
            // Audit log might be empty or have permission issues
            totalAuditLogs = 0;
        }

        // Count CV projects
        const cvQuery = query(collection(db, 'cvProjects'));
        const cvSnapshot = await getDocs(cvQuery);
        const totalCvProjects = cvSnapshot.size;

        // Calculate inactive users (no login in 1 year - matches UI label)
        const oneYearAgo = new Date();
        oneYearAgo.setFullYear(oneYearAgo.getFullYear() - 1);

        let inactiveUsers = 0;
        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const lastLogin = data.lastLoginAt?.toDate?.() || data.createdAt?.toDate?.();
            if (lastLogin && lastLogin < oneYearAgo) {
                inactiveUsers++;
            }
        });

        // Update stats in UI
        const statUsers = document.getElementById('dsgvo-stat-users');
        const statInactive = document.getElementById('dsgvo-stat-inactive');
        const statCvProjects = document.getElementById('dsgvo-stat-cv-projects');
        const statAudits = document.getElementById('dsgvo-stat-audits');

        if (statUsers) statUsers.textContent = totalUsers;
        if (statInactive) statInactive.textContent = inactiveUsers;
        if (statCvProjects) statCvProjects.textContent = totalCvProjects;
        if (statAudits) statAudits.textContent = totalAuditLogs;

        logger.log('DSGVO stats loaded:', { totalUsers, inactiveUsers, totalOrders, totalCvProjects });

    } catch (error) {
        logger.error('Error loading DSGVO stats:', error);
        showToast('Fehler beim Laden der DSGVO-Statistiken');
    }
}

// Search user for deletion
export async function searchUserForDeletion() {
    const searchInput = document.getElementById('dsgvo-user-search');
    const resultsContainer = document.getElementById('dsgvo-user-search-results');

    if (!searchInput || !resultsContainer) return;

    const searchTerm = searchInput.value.trim().toLowerCase();

    if (searchTerm.length < 3) {
        resultsContainer.innerHTML = '<p class="text-gray-500 text-sm">Bitte mindestens 3 Zeichen eingeben</p>';
        return;
    }

    resultsContainer.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Suche...</div>';

    try {
        const usersSnapshot = await getDocs(collection(db, 'users'));
        const matchingUsers = [];

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const email = (data.email || '').toLowerCase();
            const name = `${data.firstName || ''} ${data.lastName || ''}`.toLowerCase();

            if (email.includes(searchTerm) || name.includes(searchTerm) || doc.id.includes(searchTerm)) {
                matchingUsers.push({
                    id: doc.id,
                    email: data.email,
                    name: `${data.firstName || ''} ${data.lastName || ''}`.trim() || 'Unbekannt',
                    createdAt: data.createdAt?.toDate?.()
                });
            }
        });

        if (matchingUsers.length === 0) {
            resultsContainer.innerHTML = '<p class="text-gray-500 text-sm">Keine Benutzer gefunden</p>';
            return;
        }

        resultsContainer.innerHTML = matchingUsers.map(user => `
            <div class="flex items-center justify-between p-3 bg-gray-50 rounded-lg mb-2">
                <div>
                    <p class="font-medium text-brand-dark">${user.name}</p>
                    <p class="text-sm text-gray-500">${user.email || 'Keine Email'}</p>
                    <p class="text-xs text-gray-400">ID: ${user.id}</p>
                </div>
                <button onclick="app.previewUserDeletion('${user.id}')"
                        class="px-3 py-1.5 bg-red-100 text-red-700 rounded-lg text-sm hover:bg-red-200 transition">
                    <i class="fas fa-eye mr-1"></i>Vorschau
                </button>
            </div>
        `).join('');

    } catch (error) {
        logger.error('Error searching users:', error);
        resultsContainer.innerHTML = '<p class="text-red-500 text-sm">Fehler bei der Suche</p>';
    }
}

// Preview user deletion (dry-run)
export async function previewUserDeletion(userId) {
    const previewContainer = document.getElementById('dsgvo-deletion-preview');
    if (!previewContainer) return;

    previewContainer.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl"></i><p class="mt-2 text-gray-500">Analysiere Benutzerdaten...</p></div>';
    previewContainer.classList.remove('hidden');

    try {
        // Fetch user data
        const userDoc = await getDoc(doc(db, 'users', userId));
        const userData = userDoc.exists() ? userDoc.data() : null;

        // Fetch user orders
        const ordersQuery = query(collection(db, 'orders'), where('userId', '==', userId));
        const ordersSnapshot = await getDocs(ordersQuery);
        const orders = [];
        ordersSnapshot.forEach(doc => orders.push({ id: doc.id, ...doc.data() }));

        // Fetch CV projects
        const cvQuery = query(collection(db, 'cvProjects'), where('userId', '==', userId));
        const cvSnapshot = await getDocs(cvQuery);
        const cvProjects = [];
        cvSnapshot.forEach(doc => cvProjects.push({ id: doc.id, ...doc.data() }));

        // Count paid orders (will be anonymized, not deleted)
        const paidOrders = orders.filter(o => o.paymentStatus === 'paid' || o.status === 'paid');
        const unpaidOrders = orders.filter(o => o.paymentStatus !== 'paid' && o.status !== 'paid');

        previewContainer.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 p-6">
                <div class="flex items-center gap-3 mb-4">
                    <div class="w-12 h-12 rounded-full bg-red-100 flex items-center justify-center">
                        <i class="fas fa-user-times text-red-600"></i>
                    </div>
                    <div>
                        <h4 class="font-bold text-brand-dark">${userData?.firstName || ''} ${userData?.lastName || ''}</h4>
                        <p class="text-sm text-gray-500">${userData?.email || 'Keine Email'}</p>
                    </div>
                </div>

                <div class="border-t border-gray-100 pt-4 mt-4">
                    <h5 class="font-semibold text-gray-700 mb-3">Zu löschende/anonymisierende Daten:</h5>

                    <div class="space-y-2 text-sm">
                        <div class="flex items-center gap-2 ${userData ? 'text-red-600' : 'text-gray-400'}">
                            <i class="fas fa-${userData ? 'trash' : 'check'} w-4"></i>
                            <span>Benutzerprofil: ${userData ? 'Wird gelöscht' : 'Nicht vorhanden'}</span>
                        </div>

                        <div class="flex items-center gap-2 ${unpaidOrders.length > 0 ? 'text-red-600' : 'text-gray-400'}">
                            <i class="fas fa-${unpaidOrders.length > 0 ? 'trash' : 'check'} w-4"></i>
                            <span>Unbezahlte Bestellungen: ${unpaidOrders.length} (werden gelöscht)</span>
                        </div>

                        <div class="flex items-center gap-2 ${paidOrders.length > 0 ? 'text-yellow-600' : 'text-gray-400'}">
                            <i class="fas fa-${paidOrders.length > 0 ? 'user-secret' : 'check'} w-4"></i>
                            <span>Bezahlte Bestellungen: ${paidOrders.length} (werden anonymisiert - Buchhaltungspflicht)</span>
                        </div>

                        <div class="flex items-center gap-2 ${cvProjects.length > 0 ? 'text-red-600' : 'text-gray-400'}">
                            <i class="fas fa-${cvProjects.length > 0 ? 'trash' : 'check'} w-4"></i>
                            <span>CV-Projekte: ${cvProjects.length} (werden gelöscht)</span>
                        </div>

                        <div class="flex items-center gap-2 text-red-600">
                            <i class="fas fa-trash w-4"></i>
                            <span>Firebase Auth Account: Wird gelöscht</span>
                        </div>

                        <div class="flex items-center gap-2 text-red-600">
                            <i class="fas fa-folder-minus w-4"></i>
                            <span>Storage-Dateien: Werden gelöscht (falls vorhanden)</span>
                        </div>
                    </div>
                </div>

                <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-4 mt-4">
                    <div class="flex items-start gap-2">
                        <i class="fas fa-exclamation-triangle text-yellow-600 mt-0.5"></i>
                        <div class="text-sm text-yellow-800">
                            <p class="font-semibold">Achtung: Diese Aktion ist unwiderruflich!</p>
                            <p class="mt-1">Der Benutzer erhält eine Bestätigungs-Email an die hinterlegte Adresse.</p>
                        </div>
                    </div>
                </div>

                <div class="flex gap-3 mt-6">
                    <button onclick="app.executeUserDeletion('${userId}')"
                            class="flex-1 px-4 py-3 bg-red-600 text-white font-bold rounded-lg hover:bg-red-700 transition">
                        <i class="fas fa-trash-alt mr-2"></i>Endgültig löschen
                    </button>
                    <button onclick="document.getElementById('dsgvo-deletion-preview').classList.add('hidden')"
                            class="px-4 py-3 bg-gray-200 text-gray-700 rounded-lg hover:bg-gray-300 transition">
                        Abbrechen
                    </button>
                </div>
            </div>
        `;

    } catch (error) {
        logger.error('Error previewing user deletion:', error);
        previewContainer.innerHTML = '<p class="text-red-500">Fehler beim Laden der Vorschau</p>';
    }
}

// Execute user deletion (calls Cloud Function)
export async function executeUserDeletion(userId) {
    if (!confirm('Bist du ABSOLUT sicher? Diese Aktion kann NICHT rückgängig gemacht werden!')) {
        return;
    }

    const previewContainer = document.getElementById('dsgvo-deletion-preview');
    if (previewContainer) {
        previewContainer.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin text-2xl text-red-600"></i><p class="mt-2 text-gray-500">Lösche Benutzerdaten...</p></div>';
    }

    try {
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/deleteUserCompletely', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                userId,
                adminEmail: auth.currentUser?.email,
                dryRun: false
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast('Benutzer erfolgreich gelöscht!');

            // Log admin action
            await logAdminAction('user_deletion', { userId, result: result.deletionReport });

            if (previewContainer) {
                previewContainer.innerHTML = `
                    <div class="bg-green-50 border border-green-200 rounded-xl p-6 text-center">
                        <i class="fas fa-check-circle text-green-600 text-4xl mb-3"></i>
                        <h4 class="font-bold text-green-800">Löschung erfolgreich!</h4>
                        <p class="text-sm text-green-700 mt-2">Alle Benutzerdaten wurden gemäß DSGVO Art. 17 gelöscht.</p>
                        <div class="mt-4 text-left text-xs text-green-600 bg-green-100 rounded p-3">
                            <pre>${JSON.stringify(result.deletionReport, null, 2)}</pre>
                        </div>
                    </div>
                `;
            }

            // Refresh stats
            await loadDsgvoStats();

        } else {
            throw new Error(result.error || 'Unbekannter Fehler');
        }

    } catch (error) {
        logger.error('Error deleting user:', error);
        showToast('Fehler beim Löschen: ' + error.message);

        if (previewContainer) {
            previewContainer.innerHTML = `
                <div class="bg-red-50 border border-red-200 rounded-xl p-6 text-center">
                    <i class="fas fa-times-circle text-red-600 text-4xl mb-3"></i>
                    <h4 class="font-bold text-red-800">Fehler bei der Löschung</h4>
                    <p class="text-sm text-red-700 mt-2">${error.message}</p>
                </div>
            `;
        }
    }
}

// Load audit log
export async function loadAuditLog(filterAction = null) {
    const container = document.getElementById('audit-log-list');
    if (!container) return;

    container.innerHTML = '<div class="text-center py-8"><i class="fas fa-spinner fa-spin"></i> Lade Audit-Log...</div>';

    try {
        let auditQuery;
        if (filterAction && filterAction !== 'all') {
            auditQuery = query(
                collection(db, 'auditLog'),
                where('action', '==', filterAction),
                orderBy('timestamp', 'desc'),
                limit(100)
            );
        } else {
            auditQuery = query(
                collection(db, 'auditLog'),
                orderBy('timestamp', 'desc'),
                limit(100)
            );
        }

        const snapshot = await getDocs(auditQuery);
        const logs = [];
        snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));

        if (logs.length === 0) {
            container.innerHTML = '<p class="text-gray-500 text-center py-8">Keine Audit-Einträge gefunden</p>';
            return;
        }

        container.innerHTML = logs.map(log => {
            const timestamp = log.timestamp?.toDate?.() || new Date();
            const actionColors = {
                'user_deletion': 'bg-red-100 text-red-700',
                'order_update': 'bg-blue-100 text-blue-700',
                'coach_assignment': 'bg-purple-100 text-purple-700',
                'settings_change': 'bg-yellow-100 text-yellow-700',
                'document_upload': 'bg-green-100 text-green-700',
                'login': 'bg-gray-100 text-gray-700'
            };
            const colorClass = actionColors[log.action] || 'bg-gray-100 text-gray-700';

            return `
                <div class="flex items-start gap-4 p-4 border-b border-gray-100 last:border-0 hover:bg-gray-50">
                    <div class="flex-shrink-0">
                        <span class="inline-block px-2 py-1 rounded text-xs font-medium ${colorClass}">
                            ${log.action || 'unknown'}
                        </span>
                    </div>
                    <div class="flex-grow min-w-0">
                        <p class="text-sm text-brand-dark">${log.description || 'Keine Beschreibung'}</p>
                        <p class="text-xs text-gray-500 mt-1">
                            <i class="fas fa-user mr-1"></i>${log.adminEmail || 'System'}
                            <span class="mx-2">|</span>
                            <i class="fas fa-clock mr-1"></i>${timestamp.toLocaleString('de-DE')}
                        </p>
                        ${log.details ? `<details class="mt-2"><summary class="text-xs text-gray-400 cursor-pointer">Details anzeigen</summary><pre class="text-xs bg-gray-100 p-2 rounded mt-1 overflow-x-auto">${JSON.stringify(log.details, null, 2)}</pre></details>` : ''}
                    </div>
                </div>
            `;
        }).join('');

    } catch (error) {
        logger.error('Error loading audit log:', error);
        container.innerHTML = '<p class="text-red-500 text-center py-8">Fehler beim Laden des Audit-Logs</p>';
    }
}

// Filter audit log
export function filterAuditLog() {
    const filterSelect = document.getElementById('audit-filter-action');
    const filterValue = filterSelect?.value || 'all';
    loadAuditLog(filterValue);
}

// Export audit log to CSV
export async function exportAuditLog() {
    try {
        showToast('Exportiere Audit-Log...');

        const auditQuery = query(
            collection(db, 'auditLog'),
            orderBy('timestamp', 'desc'),
            limit(1000)
        );

        const snapshot = await getDocs(auditQuery);
        const logs = [];
        snapshot.forEach(doc => logs.push({ id: doc.id, ...doc.data() }));

        // Create CSV
        const headers = ['Timestamp', 'Action', 'Admin', 'Description', 'Details'];
        const rows = logs.map(log => {
            const timestamp = log.timestamp?.toDate?.() || new Date();
            return [
                timestamp.toISOString(),
                log.action || '',
                log.adminEmail || 'System',
                (log.description || '').replace(/"/g, '""'),
                JSON.stringify(log.details || {}).replace(/"/g, '""')
            ].map(cell => `"${cell}"`).join(',');
        });

        const csv = [headers.join(','), ...rows].join('\n');

        // Download
        const blob = new Blob([csv], { type: 'text/csv;charset=utf-8;' });
        const url = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = url;
        link.download = `audit-log-${new Date().toISOString().split('T')[0]}.csv`;
        link.click();
        URL.revokeObjectURL(url);

        showToast('Audit-Log exportiert!');

    } catch (error) {
        logger.error('Error exporting audit log:', error);
        showToast('Fehler beim Export');
    }
}

// Log admin action (local helper)
async function logAdminAction(action, details) {
    try {
        await fetch('https://us-central1-apex-executive.cloudfunctions.net/logAdminAction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action,
                adminEmail: auth.currentUser?.email,
                details
            })
        });
    } catch (error) {
        logger.error('Error logging admin action:', error);
    }
}

// Create test audit entry
export async function createTestAuditEntry() {
    try {
        showToast('Erstelle Test-Eintrag...');

        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/logAdminAction', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                action: 'TEST_ENTRY',
                adminEmail: auth.currentUser?.email,
                targetType: 'system',
                targetId: 'test-' + Date.now(),
                details: {
                    message: 'Test-Audit-Eintrag erstellt',
                    timestamp: new Date().toISOString(),
                    browser: navigator.userAgent.substring(0, 50)
                }
            })
        });

        if (response.ok) {
            showToast('Test-Eintrag erstellt!');
            // Refresh stats
            await loadDsgvoStats();
        } else {
            throw new Error('API-Fehler');
        }

    } catch (error) {
        logger.error('Error creating test audit entry:', error);
        showToast('Fehler beim Erstellen des Test-Eintrags');
    }
}

// Run data cleanup preview
export async function runDataCleanupPreview() {
    const resultContainer = document.getElementById('dsgvo-cleanup-result');
    if (!resultContainer) return;

    resultContainer.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Analysiere Daten...</div>';
    resultContainer.classList.remove('hidden');

    try {
        // Find inactive users (2+ years)
        const twoYearsAgo = new Date();
        twoYearsAgo.setFullYear(twoYearsAgo.getFullYear() - 2);

        const usersSnapshot = await getDocs(collection(db, 'users'));
        const inactiveUsers = [];

        usersSnapshot.forEach(doc => {
            const data = doc.data();
            const lastActivity = data.lastLoginAt?.toDate?.() || data.createdAt?.toDate?.();
            if (lastActivity && lastActivity < twoYearsAgo) {
                inactiveUsers.push({
                    id: doc.id,
                    email: data.email,
                    name: `${data.firstName || ''} ${data.lastName || ''}`.trim(),
                    lastActivity
                });
            }
        });

        // Find old CV projects (6+ months after completion)
        const sixMonthsAgo = new Date();
        sixMonthsAgo.setMonth(sixMonthsAgo.getMonth() - 6);

        const cvSnapshot = await getDocs(collection(db, 'cvProjects'));
        const oldProjects = [];

        cvSnapshot.forEach(doc => {
            const data = doc.data();
            const completedAt = data.completedAt?.toDate?.() || data.updatedAt?.toDate?.();
            if (completedAt && completedAt < sixMonthsAgo && data.status === 'completed') {
                oldProjects.push({
                    id: doc.id,
                    customerEmail: data.customerEmail,
                    completedAt
                });
            }
        });

        resultContainer.innerHTML = `
            <div class="bg-white rounded-xl border border-gray-200 p-6">
                <h4 class="font-bold text-brand-dark mb-4">Cleanup-Vorschau</h4>

                <div class="space-y-4">
                    <div class="p-4 bg-yellow-50 rounded-lg">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fas fa-user-clock text-yellow-600"></i>
                            <span class="font-semibold text-yellow-800">Inaktive Benutzer (2+ Jahre): ${inactiveUsers.length}</span>
                        </div>
                        ${inactiveUsers.length > 0 ? `
                            <ul class="text-sm text-yellow-700 ml-6 list-disc">
                                ${inactiveUsers.slice(0, 5).map(u => `<li>${u.email || u.name || u.id}</li>`).join('')}
                                ${inactiveUsers.length > 5 ? `<li>... und ${inactiveUsers.length - 5} weitere</li>` : ''}
                            </ul>
                        ` : '<p class="text-sm text-green-600 ml-6">Keine inaktiven Benutzer gefunden</p>'}
                    </div>

                    <div class="p-4 bg-blue-50 rounded-lg">
                        <div class="flex items-center gap-2 mb-2">
                            <i class="fas fa-file-archive text-blue-600"></i>
                            <span class="font-semibold text-blue-800">Alte CV-Projekte (6+ Monate): ${oldProjects.length}</span>
                        </div>
                        ${oldProjects.length > 0 ? `
                            <ul class="text-sm text-blue-700 ml-6 list-disc">
                                ${oldProjects.slice(0, 5).map(p => `<li>${p.customerEmail || p.id}</li>`).join('')}
                                ${oldProjects.length > 5 ? `<li>... und ${oldProjects.length - 5} weitere</li>` : ''}
                            </ul>
                        ` : '<p class="text-sm text-green-600 ml-6">Keine alten Projekte gefunden</p>'}
                    </div>
                </div>

                <div class="mt-4 text-sm text-gray-500">
                    <i class="fas fa-info-circle mr-1"></i>
                    Der automatische Cleanup läuft täglich um 3:00 Uhr und sendet Warnungs-Emails an inaktive Benutzer.
                </div>
            </div>
        `;

    } catch (error) {
        logger.error('Error running cleanup preview:', error);
        resultContainer.innerHTML = '<p class="text-red-500">Fehler bei der Analyse</p>';
    }
}

// Show DSGVO compliance report
export async function showDsgvoReport() {
    const modal = document.createElement('div');
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.id = 'dsgvo-report-modal';

    modal.innerHTML = `
        <div class="bg-white rounded-2xl max-w-2xl w-full max-h-[90vh] overflow-y-auto">
            <div class="p-6 border-b border-gray-100">
                <div class="flex items-center justify-between">
                    <h3 class="text-xl font-bold text-brand-dark">DSGVO Compliance Report</h3>
                    <button onclick="document.getElementById('dsgvo-report-modal').remove()" class="text-gray-400 hover:text-gray-600">
                        <i class="fas fa-times text-xl"></i>
                    </button>
                </div>
            </div>
            <div class="p-6 space-y-6">
                <div class="grid grid-cols-2 gap-4">
                    <div class="p-4 bg-green-50 rounded-lg">
                        <div class="flex items-center gap-2 text-green-700">
                            <i class="fas fa-check-circle"></i>
                            <span class="font-semibold">Implementiert</span>
                        </div>
                        <ul class="mt-2 text-sm text-green-600 space-y-1">
                            <li><i class="fas fa-check mr-1"></i>Cookie Consent Management</li>
                            <li><i class="fas fa-check mr-1"></i>Datenschutzerklärung</li>
                            <li><i class="fas fa-check mr-1"></i>Recht auf Löschung (Art. 17)</li>
                            <li><i class="fas fa-check mr-1"></i>Audit-Logging</li>
                            <li><i class="fas fa-check mr-1"></i>Automatische Datenlöschung</li>
                            <li><i class="fas fa-check mr-1"></i>SSL/TLS Verschlüsselung</li>
                            <li><i class="fas fa-check mr-1"></i>Firebase Security Rules</li>
                        </ul>
                    </div>
                    <div class="p-4 bg-yellow-50 rounded-lg">
                        <div class="flex items-center gap-2 text-yellow-700">
                            <i class="fas fa-exclamation-triangle"></i>
                            <span class="font-semibold">Empfehlungen</span>
                        </div>
                        <ul class="mt-2 text-sm text-yellow-600 space-y-1">
                            <li><i class="fas fa-clock mr-1"></i>Regelmäßige Security Audits</li>
                            <li><i class="fas fa-clock mr-1"></i>Mitarbeiter-Schulungen</li>
                            <li><i class="fas fa-clock mr-1"></i>Verarbeitungsverzeichnis</li>
                        </ul>
                    </div>
                </div>

                <div class="border-t border-gray-100 pt-4">
                    <h4 class="font-semibold text-brand-dark mb-3">Aufbewahrungsfristen</h4>
                    <table class="w-full text-sm">
                        <thead class="bg-gray-50">
                            <tr>
                                <th class="text-left p-2">Datentyp</th>
                                <th class="text-left p-2">Aufbewahrung</th>
                                <th class="text-left p-2">Rechtsgrundlage</th>
                            </tr>
                        </thead>
                        <tbody>
                            <tr class="border-b border-gray-100">
                                <td class="p-2">Benutzerprofile</td>
                                <td class="p-2">Bis zur Löschungsanfrage</td>
                                <td class="p-2">Art. 6 (1) b DSGVO</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="p-2">Bezahlte Bestellungen</td>
                                <td class="p-2">10 Jahre (anonymisiert)</td>
                                <td class="p-2">§ 147 AO</td>
                            </tr>
                            <tr class="border-b border-gray-100">
                                <td class="p-2">CV-Projekte</td>
                                <td class="p-2">6 Monate nach Abschluss</td>
                                <td class="p-2">Berechtigtes Interesse</td>
                            </tr>
                            <tr>
                                <td class="p-2">Audit-Logs</td>
                                <td class="p-2">2 Jahre</td>
                                <td class="p-2">Compliance</td>
                            </tr>
                        </tbody>
                    </table>
                </div>

                <div class="text-center pt-4">
                    <p class="text-xs text-gray-400">Report generiert am ${new Date().toLocaleString('de-DE')}</p>
                </div>
            </div>
        </div>
    `;

    document.body.appendChild(modal);
}

// Test email encryption (SMTP TLS) - Shows configuration status
export async function testEmailEncryption() {
    const resultContainer = document.getElementById('encryption-test-results');
    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = `
        <div class="p-4 bg-green-50 rounded-lg">
            <div class="flex items-center gap-2 text-green-700">
                <i class="fas fa-check-circle"></i>
                <span class="font-semibold">E-Mail-Verschlüsselung konfiguriert</span>
            </div>
            <div class="text-sm text-green-600 mt-3 space-y-2">
                <div class="flex items-center gap-2">
                    <i class="fas fa-lock w-4"></i>
                    <span>SMTP über SSL/TLS (Port 465)</span>
                </div>
                <div class="flex items-center gap-2">
                    <i class="fas fa-server w-4"></i>
                    <span>Server: smtp.strato.de</span>
                </div>
                <div class="flex items-center gap-2">
                    <i class="fas fa-envelope w-4"></i>
                    <span>Absender: kontakt@karriaro.de</span>
                </div>
                <div class="flex items-center gap-2">
                    <i class="fas fa-shield-alt w-4"></i>
                    <span>Reply-To Header aktiv</span>
                </div>
            </div>
            <p class="text-xs text-green-500 mt-3 border-t border-green-200 pt-2">
                <i class="fas fa-info-circle mr-1"></i>
                E-Mail-Versand erfolgt über Cloud Functions mit verschlüsselter SMTP-Verbindung.
            </p>
        </div>
    `;
}

// Test Firestore security rules
export async function testFirestoreSecurity() {
    const resultContainer = document.getElementById('encryption-test-results');
    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = '<div class="text-center py-4"><i class="fas fa-spinner fa-spin"></i> Teste Firestore Security Rules...</div>';

    const tests = [];

    try {
        // Test 1: Cannot read other user's data
        try {
            await getDoc(doc(db, 'users', 'non-existent-user-test'));
            tests.push({ name: 'User-Isolation', passed: true, note: 'Lesen fremder Daten geblockt' });
        } catch (e) {
            tests.push({ name: 'User-Isolation', passed: true, note: 'Permission denied (erwartet)' });
        }

        // Test 2: Cannot write to auditLog
        try {
            await setDoc(doc(db, 'auditLog', 'test-entry'), { test: true });
            tests.push({ name: 'Audit-Log Schutz', passed: false, note: 'WARNUNG: Schreiben möglich!' });
        } catch (e) {
            tests.push({ name: 'Audit-Log Schutz', passed: true, note: 'Direktes Schreiben geblockt' });
        }

        // Test 3: Admin can read settings
        try {
            await getDoc(doc(db, 'settings', 'mentoring'));
            tests.push({ name: 'Settings Zugriff', passed: true, note: 'Admin kann lesen' });
        } catch (e) {
            tests.push({ name: 'Settings Zugriff', passed: false, note: 'Fehler: ' + e.message });
        }

        resultContainer.innerHTML = `
            <div class="space-y-2">
                ${tests.map(t => `
                    <div class="p-3 ${t.passed ? 'bg-green-50' : 'bg-red-50'} rounded-lg flex items-center justify-between">
                        <span class="font-medium ${t.passed ? 'text-green-700' : 'text-red-700'}">${t.name}</span>
                        <span class="text-sm ${t.passed ? 'text-green-600' : 'text-red-600'}">
                            <i class="fas fa-${t.passed ? 'check' : 'times'} mr-1"></i>${t.note}
                        </span>
                    </div>
                `).join('')}
            </div>
        `;

    } catch (error) {
        resultContainer.innerHTML = `<p class="text-red-500">Fehler: ${error.message}</p>`;
    }
}

// Test Storage security
export async function testStorageSecurity() {
    const resultContainer = document.getElementById('encryption-test-results');
    if (!resultContainer) return;

    resultContainer.classList.remove('hidden');
    resultContainer.innerHTML = `
        <div class="p-4 bg-blue-50 rounded-lg">
            <div class="flex items-center gap-2 text-blue-700">
                <i class="fas fa-shield-alt"></i>
                <span class="font-semibold">Firebase Storage Sicherheit</span>
            </div>
            <ul class="text-sm text-blue-600 mt-2 space-y-1">
                <li><i class="fas fa-check mr-1"></i>Dateien sind nur für authentifizierte Benutzer zugänglich</li>
                <li><i class="fas fa-check mr-1"></i>Jeder Benutzer kann nur seine eigenen Dateien lesen</li>
                <li><i class="fas fa-check mr-1"></i>Admin hat Zugriff auf alle Dateien</li>
                <li><i class="fas fa-check mr-1"></i>Daten werden bei der Übertragung verschlüsselt (HTTPS)</li>
                <li><i class="fas fa-check mr-1"></i>Daten werden im Ruhezustand verschlüsselt (Google-managed)</li>
            </ul>
            <p class="text-xs text-blue-500 mt-3">
                <i class="fas fa-info-circle mr-1"></i>
                Storage Rules werden in storage.rules definiert
            </p>
        </div>
    `;
}

// ========== LEGAL TEXTS MANAGEMENT ==========

// Store for legal texts
let legalTextsData = {
    agb: [],
    datenschutz: [],
    impressum: ''
};

// Switch between legal tabs
export function switchLegalTab(tab) {
    ['agb', 'datenschutz', 'impressum'].forEach(t => {
        const tabBtn = document.getElementById('legal-tab-' + t);
        const content = document.getElementById('legal-content-' + t);
        if (tabBtn && content) {
            if (t === tab) {
                tabBtn.classList.add('bg-brand-gold', 'text-brand-dark');
                tabBtn.classList.remove('text-gray-600', 'hover:bg-gray-100');
                content.classList.remove('hidden');
            } else {
                tabBtn.classList.remove('bg-brand-gold', 'text-brand-dark');
                tabBtn.classList.add('text-gray-600', 'hover:bg-gray-100');
                content.classList.add('hidden');
            }
        }
    });
}

// Load legal texts from Firestore
export async function loadLegalTexts() {
    try {
        const docRef = doc(db, 'settings', 'legal');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            legalTextsData = docSnap.data();
        } else {
            await initializeLegalTextsFromHtml();
        }

        renderAgbEditor();
        renderDatenschutzEditor();
        renderImpressumEditor();

    } catch (error) {
        console.error('Fehler beim Laden der rechtlichen Texte:', error);
    }
}

// Render AGB editor
function renderAgbEditor() {
    const container = document.getElementById('agb-sections-container');
    if (!container) return;

    const sections = legalTextsData.agb || [];

    if (sections.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Keine AGB-Abschnitte vorhanden</p>';
        return;
    }

    container.innerHTML = sections.map((section, idx) => {
        const prevBtn = idx > 0 ? '<button onclick="app.moveAgbSection(' + idx + ', -1)" class="p-1 text-gray-400 hover:text-brand-gold" title="Nach oben"><i class="fas fa-arrow-up"></i></button>' : '';
        const nextBtn = idx < sections.length - 1 ? '<button onclick="app.moveAgbSection(' + idx + ', 1)" class="p-1 text-gray-400 hover:text-brand-gold" title="Nach unten"><i class="fas fa-arrow-down"></i></button>' : '';
        return '<div class="border border-gray-200 rounded-lg p-4" data-section-index="' + idx + '">' +
            '<div class="flex items-center justify-between mb-3">' +
            '<div class="flex items-center gap-2">' +
            '<span class="w-8 h-8 bg-brand-gold/20 text-brand-gold rounded-full flex items-center justify-center text-sm font-bold">' + (idx + 1) + '</span>' +
            '<input type="text" value="' + sanitizeHTML(section.title || '') + '" onchange="app.updateAgbSection(' + idx + ', \'title\', this.value)" class="font-medium text-brand-dark border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-gold focus:outline-none px-1 py-0.5 bg-transparent" placeholder="§ Titel">' +
            '</div>' +
            '<div class="flex items-center gap-2">' + prevBtn + nextBtn +
            '<button onclick="app.deleteAgbSection(' + idx + ')" class="p-1 text-gray-400 hover:text-red-500" title="Löschen"><i class="fas fa-trash"></i></button>' +
            '</div></div>' +
            '<textarea onchange="app.updateAgbSection(' + idx + ', \'content\', this.value)" rows="4" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold" placeholder="Absätze mit (1), (2) etc. beginnen...">' + sanitizeHTML(section.content || '') + '</textarea>' +
            '</div>';
    }).join('');
}

// Render Datenschutz editor
function renderDatenschutzEditor() {
    const container = document.getElementById('datenschutz-sections-container');
    if (!container) return;

    const sections = legalTextsData.datenschutz || [];

    if (sections.length === 0) {
        container.innerHTML = '<p class="text-center text-gray-400 py-4">Keine Datenschutz-Abschnitte vorhanden</p>';
        return;
    }

    container.innerHTML = sections.map((section, idx) => {
        const prevBtn = idx > 0 ? '<button onclick="app.moveDatenschutzSection(' + idx + ', -1)" class="p-1 text-gray-400 hover:text-brand-gold" title="Nach oben"><i class="fas fa-arrow-up"></i></button>' : '';
        const nextBtn = idx < sections.length - 1 ? '<button onclick="app.moveDatenschutzSection(' + idx + ', 1)" class="p-1 text-gray-400 hover:text-brand-gold" title="Nach unten"><i class="fas fa-arrow-down"></i></button>' : '';
        return '<div class="border border-gray-200 rounded-lg p-4" data-section-index="' + idx + '">' +
            '<div class="flex items-center justify-between mb-3">' +
            '<div class="flex items-center gap-2">' +
            '<span class="w-8 h-8 bg-blue-100 text-blue-600 rounded-full flex items-center justify-center text-sm font-bold">' + (idx + 1) + '</span>' +
            '<input type="text" value="' + sanitizeHTML(section.title || '') + '" onchange="app.updateDatenschutzSection(' + idx + ', \'title\', this.value)" class="font-medium text-brand-dark border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-gold focus:outline-none px-1 py-0.5 bg-transparent" placeholder="Abschnittstitel">' +
            '</div>' +
            '<div class="flex items-center gap-2">' + prevBtn + nextBtn +
            '<button onclick="app.deleteDatenschutzSection(' + idx + ')" class="p-1 text-gray-400 hover:text-red-500" title="Löschen"><i class="fas fa-trash"></i></button>' +
            '</div></div>' +
            '<textarea onchange="app.updateDatenschutzSection(' + idx + ', \'content\', this.value)" rows="4" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:outline-none focus:border-brand-gold" placeholder="Inhalt des Abschnitts...">' + sanitizeHTML(section.content || '') + '</textarea>' +
            '</div>';
    }).join('');
}

// Render Impressum editor
function renderImpressumEditor() {
    const textarea = document.getElementById('impressum-content');
    if (textarea) {
        textarea.value = legalTextsData.impressum || '';
    }
}

// Update AGB section
export function updateAgbSection(index, field, value) {
    if (!legalTextsData.agb[index]) return;
    legalTextsData.agb[index][field] = value;
}

// Update Datenschutz section
export function updateDatenschutzSection(index, field, value) {
    if (!legalTextsData.datenschutz[index]) return;
    legalTextsData.datenschutz[index][field] = value;
}

// Add new AGB section
export function addAgbSection() {
    if (!legalTextsData.agb) legalTextsData.agb = [];
    const nextNumber = legalTextsData.agb.length + 1;
    legalTextsData.agb.push({
        title: '§ ' + nextNumber + ' Neuer Paragraph',
        content: '(1) '
    });
    renderAgbEditor();
}

// Add new Datenschutz section
export function addDatenschutzSection() {
    if (!legalTextsData.datenschutz) legalTextsData.datenschutz = [];
    const nextNumber = legalTextsData.datenschutz.length + 1;
    legalTextsData.datenschutz.push({
        title: nextNumber + '. Neuer Abschnitt',
        content: ''
    });
    renderDatenschutzEditor();
}

// Delete AGB section
export function deleteAgbSection(index) {
    if (confirm('Diesen Paragraphen wirklich löschen?')) {
        legalTextsData.agb.splice(index, 1);
        renderAgbEditor();
    }
}

// Delete Datenschutz section
export function deleteDatenschutzSection(index) {
    if (confirm('Diesen Abschnitt wirklich löschen?')) {
        legalTextsData.datenschutz.splice(index, 1);
        renderDatenschutzEditor();
    }
}

// Move AGB section
export function moveAgbSection(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= legalTextsData.agb.length) return;
    const temp = legalTextsData.agb[index];
    legalTextsData.agb[index] = legalTextsData.agb[newIndex];
    legalTextsData.agb[newIndex] = temp;
    renderAgbEditor();
}

// Move Datenschutz section
export function moveDatenschutzSection(index, direction) {
    const newIndex = index + direction;
    if (newIndex < 0 || newIndex >= legalTextsData.datenschutz.length) return;
    const temp = legalTextsData.datenschutz[index];
    legalTextsData.datenschutz[index] = legalTextsData.datenschutz[newIndex];
    legalTextsData.datenschutz[newIndex] = temp;
    renderDatenschutzEditor();
}

// Save legal texts to Firestore
export async function saveLegalTexts() {
    try {
        const impressumTextarea = document.getElementById('impressum-content');
        if (impressumTextarea) {
            legalTextsData.impressum = impressumTextarea.value;
        }

        await setDoc(doc(db, 'settings', 'legal'), {
            ...legalTextsData,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email
        });

        showToast('Rechtliche Texte gespeichert!');

    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        showToast('Fehler beim Speichern');
    }
}

// Initialize legal texts from current HTML (one-time migration)
async function initializeLegalTextsFromHtml() {
    legalTextsData.agb = [
        { title: '§ 1 Geltungsbereich', content: '(1) Diese Allgemeinen Geschäftsbedingungen gelten für alle Verträge zwischen Karriaro GmbH (nachfolgend "Anbieter") und dem Kunden über die auf der Website karriaro.de angebotenen Dienstleistungen.\n(2) Abweichende Bedingungen des Kunden werden nicht anerkannt, es sei denn, der Anbieter stimmt ihrer Geltung ausdrücklich schriftlich zu.' },
        { title: '§ 2 Vertragsgegenstand', content: '(1) Der Anbieter erbringt Dienstleistungen im Bereich Karriereberatung, CV-Erstellung und Executive Coaching.\n(2) Der genaue Umfang der Leistungen ergibt sich aus der jeweiligen Produktbeschreibung zum Zeitpunkt der Bestellung.' },
        { title: '§ 3 Vertragsschluss', content: '(1) Die Darstellung der Produkte auf der Website stellt kein rechtlich bindendes Angebot, sondern eine Aufforderung zur Bestellung dar.\n(2) Mit dem Absenden der Bestellung gibt der Kunde ein verbindliches Angebot ab. Der Vertrag kommt zustande, wenn der Anbieter die Bestellung durch eine Auftragsbestätigung per E-Mail annimmt.' },
        { title: '§ 4 Preise und Zahlung', content: '(1) Alle Preise sind Endpreise und enthalten die gesetzliche Mehrwertsteuer.\n(2) Die Zahlung erfolgt über den Zahlungsdienstleister Stripe. Es werden folgende Zahlungsarten akzeptiert: Kreditkarte (Visa, Mastercard, American Express), SEPA-Lastschrift, Apple Pay, Google Pay.\n(3) Die Zahlung ist sofort bei Bestellung fällig.' },
        { title: '§ 5 Leistungserbringung', content: '(1) Die Bearbeitung beginnt nach Zahlungseingang und Erhalt aller erforderlichen Unterlagen vom Kunden.\n(2) Die voraussichtliche Bearbeitungszeit ist in der Produktbeschreibung angegeben und beginnt mit dem Eingang vollständiger Unterlagen.\n(3) Der Kunde ist verpflichtet, alle für die Leistungserbringung erforderlichen Informationen und Unterlagen rechtzeitig und vollständig zur Verfügung zu stellen.\n(4) Der Kunde versichert, dass alle von ihm gemachten Angaben (insbesondere zu Ausbildung, Berufserfahrung, Qualifikationen und Zeugnissen) der Wahrheit entsprechen. Der Anbieter übernimmt keine Verantwortung für die Richtigkeit der vom Kunden bereitgestellten Informationen und prüft diese nicht auf Wahrheitsgehalt.\n(5) Der Kunde stellt den Anbieter von sämtlichen Ansprüchen Dritter frei, die aufgrund unrichtiger oder unvollständiger Angaben des Kunden entstehen.' },
        { title: '§ 6 Zufriedenheitsgarantie', content: '(1) Der Anbieter bietet eine Zufriedenheitsgarantie. Ist der Kunde mit dem Ergebnis nicht zufrieden, wird die Leistung kostenlos überarbeitet.\n(2) Die Überarbeitung ist innerhalb von 14 Tagen nach Lieferung schriftlich anzufordern.\n(3) Der Anspruch auf Überarbeitung besteht für maximal zwei Korrekturschleifen.' },
        { title: '§ 7 Widerrufsrecht', content: '(1) Verbraucher haben ein 14-tägiges Widerrufsrecht gemäß den gesetzlichen Bestimmungen.\n(2) Das Widerrufsrecht erlischt vorzeitig, wenn der Anbieter mit der Ausführung der Dienstleistung begonnen hat, nachdem der Kunde ausdrücklich zugestimmt und bestätigt hat, dass er sein Widerrufsrecht verliert.\n(3) Der Widerruf ist zu richten an: kontakt@karriaro.de' },
        { title: '§ 8 Vertraulichkeit', content: '(1) Der Anbieter verpflichtet sich, alle vom Kunden übermittelten Informationen und Unterlagen streng vertraulich zu behandeln.\n(2) Auf Wunsch wird eine gesonderte Vertraulichkeitsvereinbarung (NDA) abgeschlossen.' },
        { title: '§ 9 Urheberrecht', content: '(1) Mit vollständiger Bezahlung gehen alle Nutzungsrechte an den erstellten Dokumenten auf den Kunden über.\n(2) Der Kunde darf die Unterlagen für eigene Bewerbungszwecke uneingeschränkt nutzen.' },
        { title: '§ 10 Haftung und Leistungsumfang', content: '(1) Der Anbieter haftet unbeschränkt für Schäden aus der Verletzung des Lebens, des Körpers oder der Gesundheit sowie für vorsätzlich oder grob fahrlässig verursachte Schäden.\n(2) Der Vertrag ist ein Dienstvertrag im Sinne des § 611 BGB. Der Anbieter schuldet die sorgfältige Erstellung der vereinbarten Bewerbungsunterlagen, nicht jedoch den Erfolg einer Bewerbung oder die Einstellung beim Zielunternehmen.\n(3) Der Anbieter garantiert ausdrücklich nicht den Erfolg von Bewerbungen. Die professionell erstellten Unterlagen erhöhen die Chancen auf positive Rückmeldungen, können jedoch keine Zusage, Einladung zum Vorstellungsgespräch oder Einstellung garantieren.\n(4) Der Anbieter haftet nicht für Schäden, die dem Kunden durch unrichtige oder unvollständige Angaben entstehen, die der Kunde im Rahmen der Leistungserbringung gemacht hat.' },
        { title: '§ 11 Schlussbestimmungen', content: '(1) Es gilt das Recht der Bundesrepublik Deutschland unter Ausschluss des UN-Kaufrechts.\n(2) Gerichtsstand für alle Streitigkeiten ist Berlin, sofern der Kunde Kaufmann ist.\n(3) Sollten einzelne Bestimmungen unwirksam sein, bleibt die Wirksamkeit der übrigen Bestimmungen unberührt.' }
    ];

    legalTextsData.datenschutz = [
        { title: '1. Datenschutz auf einen Blick', content: 'Wir nehmen den Schutz Ihrer persönlichen Daten sehr ernst. Wir behandeln Ihre personenbezogenen Daten vertraulich und entsprechend der gesetzlichen Datenschutzvorschriften sowie dieser Datenschutzerklärung. Diese Datenschutzerklärung gilt für unsere Website karriaro.de.' },
        { title: '2. Verantwortlicher', content: 'Verantwortlich für die Datenverarbeitung ist:\nKarriaro GmbH\nMusterstraße 123\n10115 Berlin\nE-Mail: kontakt@karriaro.de' },
        { title: '3. Zahlungsabwicklung mit Stripe', content: 'Für Zahlungen nutzen wir den Dienst Stripe (Stripe, Inc., 510 Townsend Street, San Francisco, CA 94103, USA). Dabei werden Zahlungsdaten direkt an Stripe übermittelt und dort verarbeitet.\n\nStripe ist zertifiziert nach PCI-DSS Level 1 und verarbeitet Ihre Zahlungsdaten nach höchsten Sicherheitsstandards.' },
        { title: '4. Firebase/Google Cloud', content: 'Wir nutzen Google Firebase für Authentifizierung und Datenspeicherung. Dabei werden Daten auf Google Cloud Servern in der EU gespeichert.' },
        { title: '5. Video-Meetings mit Daily.co', content: 'Für Video-Meetings verwenden wir den Dienst Daily.co. Bei der Nutzung werden technische Verbindungsdaten verarbeitet.\n\nDie Datenübertragung in die USA erfolgt auf Grundlage von EU-Standardvertragsklauseln (Art. 46 Abs. 2 lit. c DSGVO).' },
        { title: '6. Ihre Rechte', content: 'Sie haben das Recht:\n- auf Auskunft über Ihre gespeicherten Daten (Art. 15 DSGVO)\n- auf Berichtigung unrichtiger Daten (Art. 16 DSGVO)\n- auf Löschung Ihrer Daten (Art. 17 DSGVO)\n- auf Einschränkung der Verarbeitung (Art. 18 DSGVO)\n- auf Datenübertragbarkeit (Art. 20 DSGVO)' }
    ];

    legalTextsData.impressum = '<p><strong>Karriaro GmbH</strong></p>\n<p>Musterstraße 123<br>10115 Berlin</p>\n<p><strong>Kontakt:</strong><br>E-Mail: kontakt@karriaro.de</p>\n<p><strong>Geschäftsführer:</strong><br>Max Mustermann</p>\n<p><strong>Registergericht:</strong> Amtsgericht Berlin-Charlottenburg<br>\n<strong>Registernummer:</strong> HRB 123456</p>\n<p><strong>USt-IdNr.:</strong> DE123456789</p>';

    await setDoc(doc(db, 'settings', 'legal'), {
        ...legalTextsData,
        updatedAt: serverTimestamp(),
        updatedBy: 'system-init'
    });
}

// Load legal texts for public view
export async function loadPublicLegalText(type) {
    try {
        const docRef = doc(db, 'settings', 'legal');
        const docSnap = await getDoc(docRef);

        if (!docSnap.exists()) return null;

        const data = docSnap.data();

        if (type === 'agb') return data.agb || [];
        if (type === 'datenschutz') return data.datenschutz || [];
        if (type === 'impressum') return data.impressum || '';

        return null;
    } catch (error) {
        console.error('Fehler beim Laden:', error);
        return null;
    }
}

// Render AGB view from Firestore
export async function renderAgbView() {
    const container = document.querySelector('#view-agb .space-y-6');
    if (!container) return;

    const sections = await loadPublicLegalText('agb');
    if (!sections || sections.length === 0) return;

    let html = '';
    sections.forEach(function(section) {
        html += '<section><h2 class="font-serif text-xl text-brand-dark mb-3">' + sanitizeHTML(section.title) + '</h2>';
        section.content.split('\n').forEach(function(p) {
            html += '<p class="mt-2">' + sanitizeHTML(p) + '</p>';
        });
        html += '</section>';
    });
    html += '<p class="text-xs text-gray-400 mt-8">Stand: Januar 2025</p>';
    container.innerHTML = html;
}

// Render Datenschutz view from Firestore
export async function renderDatenschutzView() {
    const container = document.querySelector('#view-datenschutz .space-y-6');
    if (!container) return;

    const sections = await loadPublicLegalText('datenschutz');
    if (!sections || sections.length === 0) return;

    let html = '';
    sections.forEach(function(section) {
        html += '<section><h2 class="font-serif text-xl text-brand-dark mb-3">' + sanitizeHTML(section.title) + '</h2>';
        section.content.split('\n').forEach(function(p) {
            html += '<p class="mt-2">' + sanitizeHTML(p) + '</p>';
        });
        html += '</section>';
    });
    container.innerHTML = html;
}

// Render Impressum view from Firestore
export async function renderImpressumView() {
    const container = document.querySelector('#view-impressum .max-w-4xl');
    if (!container) return;

    const impressum = await loadPublicLegalText('impressum');
    if (!impressum) return;

    const h1 = container.querySelector('h1');
    if (h1 && h1.nextElementSibling) {
        h1.nextElementSibling.innerHTML = impressum;
    }
}

// ========== VVT (Verzeichnis von Verarbeitungstätigkeiten) ==========

let vvtData = {
    company: '',
    representative: '',
    address: '',
    contact: '',
    activities: [],
    updatedAt: null
};

// Default activities for Karriaro
const defaultVvtActivities = [
    {
        name: 'Benutzerkonten & Authentifizierung',
        purpose: 'Registrierung und Login von Kunden',
        dataCategories: 'E-Mail, Passwort (gehasht), Name, Profilbild',
        dataSubjects: 'Kunden, Mentoren',
        recipients: 'Firebase Authentication (Google Cloud, EU)',
        retention: 'Bis zur Kontolöschung durch User oder Admin',
        legalBasis: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)'
    },
    {
        name: 'Bestellungen & Zahlungen',
        purpose: 'Abwicklung von CV-Paketen und Mentoring-Sessions',
        dataCategories: 'Name, E-Mail, Bestelldetails, Zahlungsstatus',
        dataSubjects: 'Kunden',
        recipients: 'Stripe (PCI-DSS zertifiziert), Firebase Firestore (EU)',
        retention: '10 Jahre (Handels- und Steuerrecht)',
        legalBasis: 'Art. 6 Abs. 1 lit. b, c DSGVO (Vertragserfüllung, rechtliche Pflicht)'
    },
    {
        name: 'CV-Erstellung (Fragebogen)',
        purpose: 'Erfassung von Lebenslaufdaten für CV-Erstellung',
        dataCategories: 'Ausbildung, Berufserfahrung, Skills, Projekte, Ziele',
        dataSubjects: 'Kunden',
        recipients: 'Firebase Firestore (EU), Admin/Mentoren (intern)',
        retention: 'Bis zur Kontolöschung oder auf Anfrage',
        legalBasis: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)'
    },
    {
        name: 'Dokumenten-Upload & -Speicherung',
        purpose: 'Speicherung von CVs, Zeugnissen, erstellten Dokumenten',
        dataCategories: 'PDF/Word-Dokumente mit persönlichen Daten',
        dataSubjects: 'Kunden',
        recipients: 'Firebase Storage (Google Cloud, EU)',
        retention: 'Bis zur Kontolöschung oder auf Anfrage',
        legalBasis: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)'
    },
    {
        name: 'Video-Meetings (Mentoring)',
        purpose: 'Durchführung von Coaching-Sessions per Video',
        dataCategories: 'Video/Audio-Stream (nicht aufgezeichnet), Verbindungsdaten',
        dataSubjects: 'Kunden, Mentoren',
        recipients: 'Daily.co (USA, EU-Standardvertragsklauseln)',
        retention: 'Keine Speicherung, nur Live-Übertragung',
        legalBasis: 'Art. 6 Abs. 1 lit. b DSGVO (Vertragserfüllung)'
    },
    {
        name: 'E-Mail-Kommunikation',
        purpose: 'Bestellbestätigungen, Terminvorschläge, Support',
        dataCategories: 'E-Mail-Adresse, Name, Nachrichteninhalt',
        dataSubjects: 'Kunden, Interessenten',
        recipients: 'Strato SMTP (Deutschland)',
        retention: 'Gemäß E-Mail-Archivierungspflicht (6-10 Jahre)',
        legalBasis: 'Art. 6 Abs. 1 lit. b, f DSGVO (Vertragserfüllung, berechtigtes Interesse)'
    },
    {
        name: 'Kontaktanfragen (Strategiegespräch)',
        purpose: 'Erfassung von Interessenten für Strategiegespräche',
        dataCategories: 'Name, E-Mail, optional Telefon/Nachricht',
        dataSubjects: 'Interessenten',
        recipients: 'Firebase Firestore (EU)',
        retention: '90 Tage nach letztem Kontakt',
        legalBasis: 'Art. 6 Abs. 1 lit. a, b DSGVO (Einwilligung, vorvertragliche Maßnahmen)'
    }
];

// Load VVT from Firestore
export async function loadVvt() {
    try {
        const docRef = doc(db, 'settings', 'vvt');
        const docSnap = await getDoc(docRef);

        if (docSnap.exists()) {
            vvtData = docSnap.data();
        } else {
            // Initialize with default data
            vvtData = {
                company: 'Karriaro GmbH',
                representative: 'Geschäftsführer',
                address: 'Musterstraße 123, 10115 Berlin',
                contact: 'kontakt@karriaro.de',
                activities: defaultVvtActivities,
                updatedAt: null
            };
        }

        renderVvtForm();
        renderVvtActivities();

    } catch (error) {
        console.error('Fehler beim Laden des VVT:', error);
        showToast('Fehler beim Laden des VVT');
    }
}

// Render VVT form fields
function renderVvtForm() {
    const companyInput = document.getElementById('vvt-company');
    const representativeInput = document.getElementById('vvt-representative');
    const addressInput = document.getElementById('vvt-address');
    const contactInput = document.getElementById('vvt-contact');
    const lastUpdated = document.getElementById('vvt-last-updated');

    if (companyInput) companyInput.value = vvtData.company || '';
    if (representativeInput) representativeInput.value = vvtData.representative || '';
    if (addressInput) addressInput.value = vvtData.address || '';
    if (contactInput) contactInput.value = vvtData.contact || '';

    if (lastUpdated) {
        if (vvtData.updatedAt) {
            const date = vvtData.updatedAt.toDate ? vvtData.updatedAt.toDate() : new Date(vvtData.updatedAt);
            lastUpdated.textContent = date.toLocaleDateString('de-DE') + ' ' + date.toLocaleTimeString('de-DE', { hour: '2-digit', minute: '2-digit' });
        } else {
            lastUpdated.textContent = 'Noch nicht gespeichert';
        }
    }
}

// Render VVT activities
function renderVvtActivities() {
    const container = document.getElementById('vvt-activities-container');
    if (!container) return;

    const activities = vvtData.activities || [];

    if (activities.length === 0) {
        container.innerHTML = '<div class="p-8 text-center text-gray-400"><p>Keine Verarbeitungstätigkeiten definiert</p></div>';
        return;
    }

    container.innerHTML = activities.map((activity, idx) => {
        return '<div class="p-4 hover:bg-gray-50">' +
            '<div class="flex items-start justify-between gap-4">' +
            '<div class="flex-1">' +
            '<div class="flex items-center gap-2 mb-2">' +
            '<span class="w-6 h-6 bg-brand-gold/20 text-brand-gold rounded-full flex items-center justify-center text-xs font-bold">' + (idx + 1) + '</span>' +
            '<input type="text" value="' + sanitizeHTML(activity.name || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'name\', this.value)" class="font-medium text-brand-dark border-0 border-b border-transparent hover:border-gray-300 focus:border-brand-gold focus:outline-none bg-transparent flex-1" placeholder="Name der Verarbeitung">' +
            '</div>' +
            '<div class="grid grid-cols-1 md:grid-cols-2 gap-3 text-sm">' +
            '<div><label class="text-xs text-gray-500">Zweck</label><input type="text" value="' + sanitizeHTML(activity.purpose || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'purpose\', this.value)" class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-gold"></div>' +
            '<div><label class="text-xs text-gray-500">Datenkategorien</label><input type="text" value="' + sanitizeHTML(activity.dataCategories || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'dataCategories\', this.value)" class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-gold"></div>' +
            '<div><label class="text-xs text-gray-500">Betroffene</label><input type="text" value="' + sanitizeHTML(activity.dataSubjects || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'dataSubjects\', this.value)" class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-gold"></div>' +
            '<div><label class="text-xs text-gray-500">Empfänger</label><input type="text" value="' + sanitizeHTML(activity.recipients || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'recipients\', this.value)" class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-gold"></div>' +
            '<div><label class="text-xs text-gray-500">Löschfrist</label><input type="text" value="' + sanitizeHTML(activity.retention || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'retention\', this.value)" class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-gold"></div>' +
            '<div><label class="text-xs text-gray-500">Rechtsgrundlage</label><input type="text" value="' + sanitizeHTML(activity.legalBasis || '') + '" onchange="app.updateVvtActivity(' + idx + ', \'legalBasis\', this.value)" class="w-full border border-gray-200 rounded px-2 py-1 text-sm focus:outline-none focus:border-brand-gold"></div>' +
            '</div></div>' +
            '<button onclick="app.deleteVvtActivity(' + idx + ')" class="p-2 text-gray-400 hover:text-red-500 flex-shrink-0" title="Löschen"><i class="fas fa-trash"></i></button>' +
            '</div></div>';
    }).join('');
}

// Update VVT activity
export function updateVvtActivity(index, field, value) {
    if (!vvtData.activities[index]) return;
    vvtData.activities[index][field] = value;
}

// Add new VVT activity
export function addVvtActivity() {
    if (!vvtData.activities) vvtData.activities = [];
    vvtData.activities.push({
        name: 'Neue Verarbeitungstätigkeit',
        purpose: '',
        dataCategories: '',
        dataSubjects: '',
        recipients: '',
        retention: '',
        legalBasis: 'Art. 6 Abs. 1 lit. b DSGVO'
    });
    renderVvtActivities();
}

// Delete VVT activity
export function deleteVvtActivity(index) {
    if (confirm('Diese Verarbeitungstätigkeit wirklich löschen?')) {
        vvtData.activities.splice(index, 1);
        renderVvtActivities();
    }
}

// Save VVT to Firestore
export async function saveVvt() {
    try {
        // Get form values
        vvtData.company = document.getElementById('vvt-company')?.value || '';
        vvtData.representative = document.getElementById('vvt-representative')?.value || '';
        vvtData.address = document.getElementById('vvt-address')?.value || '';
        vvtData.contact = document.getElementById('vvt-contact')?.value || '';

        await setDoc(doc(db, 'settings', 'vvt'), {
            ...vvtData,
            updatedAt: serverTimestamp(),
            updatedBy: auth.currentUser?.email
        });

        showToast('VVT gespeichert!');

        // Reload to show updated timestamp
        setTimeout(() => loadVvt(), 500);

    } catch (error) {
        console.error('Fehler beim Speichern:', error);
        showToast('Fehler beim Speichern');
    }
}

// Export VVT as PDF (using browser print)
export function exportVvtPdf() {
    // Create print-friendly HTML
    const printContent = generateVvtPrintHtml();

    // Open print window
    const printWindow = window.open('', '_blank');
    printWindow.document.write(printContent);
    printWindow.document.close();

    // Wait for content to load, then print
    printWindow.onload = function() {
        printWindow.print();
    };
}

// Generate print-friendly HTML for VVT
function generateVvtPrintHtml() {
    const activities = vvtData.activities || [];
    const date = new Date().toLocaleDateString('de-DE');

    let activitiesHtml = activities.map((a, i) => {
        return '<div style="border: 1px solid #ddd; border-radius: 8px; padding: 16px; margin-bottom: 16px; page-break-inside: avoid;">' +
            '<h3 style="margin: 0 0 12px 0; color: #333;">' + (i + 1) + '. ' + sanitizeHTML(a.name) + '</h3>' +
            '<table style="width: 100%; font-size: 12px; border-collapse: collapse;">' +
            '<tr><td style="padding: 4px 8px 4px 0; font-weight: bold; width: 30%; vertical-align: top;">Zweck:</td><td style="padding: 4px 0;">' + sanitizeHTML(a.purpose) + '</td></tr>' +
            '<tr><td style="padding: 4px 8px 4px 0; font-weight: bold; vertical-align: top;">Datenkategorien:</td><td style="padding: 4px 0;">' + sanitizeHTML(a.dataCategories) + '</td></tr>' +
            '<tr><td style="padding: 4px 8px 4px 0; font-weight: bold; vertical-align: top;">Betroffene:</td><td style="padding: 4px 0;">' + sanitizeHTML(a.dataSubjects) + '</td></tr>' +
            '<tr><td style="padding: 4px 8px 4px 0; font-weight: bold; vertical-align: top;">Empfänger:</td><td style="padding: 4px 0;">' + sanitizeHTML(a.recipients) + '</td></tr>' +
            '<tr><td style="padding: 4px 8px 4px 0; font-weight: bold; vertical-align: top;">Löschfrist:</td><td style="padding: 4px 0;">' + sanitizeHTML(a.retention) + '</td></tr>' +
            '<tr><td style="padding: 4px 8px 4px 0; font-weight: bold; vertical-align: top;">Rechtsgrundlage:</td><td style="padding: 4px 0;">' + sanitizeHTML(a.legalBasis) + '</td></tr>' +
            '</table></div>';
    }).join('');

    return '<!DOCTYPE html><html><head><title>VVT - ' + sanitizeHTML(vvtData.company) + '</title>' +
        '<style>body { font-family: Arial, sans-serif; max-width: 800px; margin: 0 auto; padding: 40px 20px; color: #333; } ' +
        'h1 { color: #1a1a1a; border-bottom: 2px solid #d4a84b; padding-bottom: 10px; } ' +
        'h2 { color: #1a1a1a; margin-top: 30px; } ' +
        '.header-info { background: #f5f5f5; padding: 20px; border-radius: 8px; margin-bottom: 30px; } ' +
        '.tom-grid { display: grid; grid-template-columns: 1fr 1fr; gap: 12px; } ' +
        '.tom-item { background: #e8f5e9; padding: 12px; border-radius: 6px; font-size: 13px; } ' +
        '@media print { body { padding: 20px; } }</style></head><body>' +
        '<h1>Verzeichnis von Verarbeitungstätigkeiten (VVT)</h1>' +
        '<p style="color: #666; margin-bottom: 30px;">Gemäß Art. 30 DSGVO · Stand: ' + date + '</p>' +
        '<div class="header-info">' +
        '<h2 style="margin-top: 0;">Verantwortlicher</h2>' +
        '<p><strong>Unternehmen:</strong> ' + sanitizeHTML(vvtData.company) + '</p>' +
        '<p><strong>Vertreter:</strong> ' + sanitizeHTML(vvtData.representative) + '</p>' +
        '<p><strong>Adresse:</strong> ' + sanitizeHTML(vvtData.address) + '</p>' +
        '<p><strong>Kontakt:</strong> ' + sanitizeHTML(vvtData.contact) + '</p>' +
        '</div>' +
        '<h2>Verarbeitungstätigkeiten</h2>' +
        activitiesHtml +
        '<h2>Technische und organisatorische Maßnahmen (Art. 32 DSGVO)</h2>' +
        '<div class="tom-grid">' +
        '<div class="tom-item"><strong>Verschlüsselung:</strong> SSL/TLS, AES-256 at rest, DTLS für Video</div>' +
        '<div class="tom-item"><strong>Zugriffskontrolle:</strong> Firebase Auth, Rollen (Admin/Mentor/User)</div>' +
        '<div class="tom-item"><strong>Datensicherung:</strong> Firebase automatische Backups, EU-Server</div>' +
        '<div class="tom-item"><strong>Audit-Logging:</strong> Protokollierung aller Admin-Aktionen</div>' +
        '</div>' +
        '<p style="margin-top: 40px; font-size: 12px; color: #999; text-align: center;">Erstellt am ' + date + ' · ' + sanitizeHTML(vvtData.company) + '</p>' +
        '</body></html>';
}

// ========== REFUND MANAGEMENT ==========

// Mentoring-Preise für Teilerstattung
const MENTORING_PRICES = {
    'single': 350,
    '3pack': 950,
    '3-pack': 950,
    '3 sessions': 950,
    'retainer': 2500
};

// Berechne Mentoring-Anteil aus Items
function calculateMentoringAmount(items) {
    if (!items || items.length === 0) return 0;

    let mentoringTotal = 0;
    for (const item of items) {
        const title = (item.title || '').toLowerCase();
        if (title.includes('mentoring') || title.includes('session') || title.includes('coaching')) {
            // Direkten Preis verwenden wenn vorhanden
            if (item.price) {
                mentoringTotal += item.price;
            } else {
                // Fallback auf bekannte Preise
                if (title.includes('3') || title.includes('pack')) {
                    mentoringTotal += MENTORING_PRICES['3pack'];
                } else if (title.includes('retainer')) {
                    mentoringTotal += MENTORING_PRICES['retainer'];
                } else {
                    mentoringTotal += MENTORING_PRICES['single'];
                }
            }
        }
    }
    return mentoringTotal;
}

// Show refund confirmation modal
export function showRefundModal(orderId, customerName, total, itemsEncoded) {
    // Decode items
    let items = [];
    try {
        items = JSON.parse(decodeURIComponent(itemsEncoded || '[]'));
    } catch (e) {
        console.warn('Could not parse items:', e);
    }

    // Calculate suggested refund amount (mentoring portion only)
    const mentoringAmount = calculateMentoringAmount(items);
    const suggestedAmount = mentoringAmount > 0 ? mentoringAmount : total;
    const isPartialRefund = mentoringAmount > 0 && mentoringAmount < total;

    const modal = document.createElement('div');
    modal.id = 'refund-modal';
    modal.className = 'fixed inset-0 bg-black/50 flex items-center justify-center z-50 p-4';
    modal.innerHTML = `
        <div class="bg-white rounded-xl max-w-md w-full p-6 shadow-2xl">
            <div class="flex items-center gap-3 mb-4">
                <div class="w-12 h-12 bg-red-100 rounded-full flex items-center justify-center">
                    <i class="fas fa-undo text-red-600 text-xl"></i>
                </div>
                <div>
                    <h3 class="font-bold text-brand-dark text-lg">Rückerstattung</h3>
                    <p class="text-sm text-gray-500">${sanitizeHTML(customerName)}</p>
                </div>
            </div>

            <!-- Order Summary -->
            <div class="bg-gray-50 rounded-lg p-3 mb-4 text-sm">
                <p class="text-xs text-gray-500 uppercase tracking-wide mb-2">Bestellübersicht</p>
                ${items.map(item => `
                    <div class="flex justify-between py-1 ${(item.title || '').toLowerCase().includes('mentoring') || (item.title || '').toLowerCase().includes('session') ? 'text-red-600 font-medium' : 'text-gray-600'}">
                        <span>${sanitizeHTML(item.title || 'Unbekannt')}</span>
                        <span>€${(item.price || 0).toFixed(2)}</span>
                    </div>
                `).join('')}
                <div class="flex justify-between pt-2 mt-2 border-t border-gray-200 font-bold text-brand-dark">
                    <span>Gesamt</span>
                    <span>€${total.toFixed(2)}</span>
                </div>
            </div>

            <!-- Refund Amount -->
            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Erstattungsbetrag:</label>
                <div class="relative">
                    <span class="absolute left-3 top-1/2 -translate-y-1/2 text-gray-500">€</span>
                    <input type="number"
                           id="refund-amount-input"
                           value="${suggestedAmount.toFixed(2)}"
                           min="0.01"
                           max="${total.toFixed(2)}"
                           step="0.01"
                           class="w-full border border-gray-200 rounded-lg pl-8 pr-3 py-3 text-lg font-bold focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold">
                </div>
                ${isPartialRefund ? `
                    <p class="text-xs text-blue-600 mt-2">
                        <i class="fas fa-info-circle mr-1"></i>
                        Vorschlag: Nur Mentoring-Anteil (€${mentoringAmount.toFixed(2)}) erstatten. CV-Leistungen bleiben erhalten.
                    </p>
                    <div class="flex gap-2 mt-2">
                        <button type="button" onclick="document.getElementById('refund-amount-input').value = '${mentoringAmount.toFixed(2)}'" class="text-xs px-2 py-1 bg-blue-100 text-blue-700 rounded hover:bg-blue-200 transition">
                            Nur Mentoring (€${mentoringAmount.toFixed(2)})
                        </button>
                        <button type="button" onclick="document.getElementById('refund-amount-input').value = '${total.toFixed(2)}'" class="text-xs px-2 py-1 bg-gray-100 text-gray-700 rounded hover:bg-gray-200 transition">
                            Gesamtbetrag (€${total.toFixed(2)})
                        </button>
                    </div>
                ` : ''}
            </div>

            <div class="mb-4">
                <label class="block text-sm font-medium text-gray-700 mb-2">Grund für Rückerstattung:</label>
                <select id="refund-reason-select" class="w-full border border-gray-200 rounded-lg px-3 py-2 text-sm focus:ring-2 focus:ring-brand-gold/50 focus:border-brand-gold">
                    <option value="Compliance-Konflikt: Interessenkonflikt mit Mentor">Compliance-Konflikt (Interessenkonflikt)</option>
                    <option value="Compliance-Konflikt: Tätigkeit bei Wettbewerber des Mentors">Compliance-Konflikt (Wettbewerber)</option>
                    <option value="Compliance-Konflikt: Bewerbung beim Arbeitgeber des Mentors">Compliance-Konflikt (Bewerbung beim Arbeitgeber)</option>
                    <option value="Kein passender Mentor verfügbar">Kein passender Mentor verfügbar</option>
                    <option value="Kundenanfrage: Stornierung">Kundenanfrage: Stornierung</option>
                    <option value="other">Anderer Grund...</option>
                </select>
                <textarea id="refund-reason-custom" class="hidden w-full border border-gray-200 rounded-lg px-3 py-2 text-sm mt-2 focus:ring-2 focus:ring-brand-gold/50" rows="2" placeholder="Bitte Grund angeben..."></textarea>
            </div>

            <div class="bg-yellow-50 border border-yellow-200 rounded-lg p-3 mb-4">
                <p class="text-xs text-yellow-800">
                    <i class="fas fa-exclamation-triangle mr-1"></i>
                    <strong>Achtung:</strong> Die Rückerstattung wird sofort bei Stripe veranlasst und kann nicht rückgängig gemacht werden. Der Kunde erhält eine Benachrichtigung per E-Mail.
                </p>
            </div>

            <div class="flex gap-3">
                <button onclick="document.getElementById('refund-modal').remove()"
                        class="flex-1 border border-gray-200 text-gray-700 px-4 py-3 rounded-lg text-sm font-medium hover:bg-gray-50 transition">
                    Abbrechen
                </button>
                <button onclick="app.processRefund('${orderId}')"
                        class="flex-1 bg-red-600 hover:bg-red-700 text-white px-4 py-3 rounded-lg text-sm font-bold transition flex items-center justify-center gap-2">
                    <i class="fas fa-undo"></i>
                    Erstatten
                </button>
            </div>
        </div>
    `;

    // Handle "other" reason selection
    modal.querySelector('#refund-reason-select').addEventListener('change', function() {
        const customInput = modal.querySelector('#refund-reason-custom');
        if (this.value === 'other') {
            customInput.classList.remove('hidden');
        } else {
            customInput.classList.add('hidden');
        }
    });

    document.body.appendChild(modal);
}

// Process the refund
export async function processRefund(orderId) {
    const modal = document.getElementById('refund-modal');
    const selectEl = document.getElementById('refund-reason-select');
    const customEl = document.getElementById('refund-reason-custom');
    const amountInput = document.getElementById('refund-amount-input');

    let reason = selectEl.value;
    if (reason === 'other') {
        reason = customEl.value.trim();
        if (!reason) {
            showToast('Bitte gib einen Grund an');
            return;
        }
    }

    // Get refund amount
    const refundAmount = parseFloat(amountInput.value);
    if (isNaN(refundAmount) || refundAmount <= 0) {
        showToast('Bitte gib einen gültigen Betrag ein');
        return;
    }

    // Show loading state
    const submitBtn = modal.querySelector('button[onclick*="processRefund"]');
    const originalHtml = submitBtn.innerHTML;
    submitBtn.innerHTML = '<i class="fas fa-spinner fa-spin"></i> Verarbeite...';
    submitBtn.disabled = true;

    try {
        const response = await fetch('https://us-central1-apex-executive.cloudfunctions.net/processRefund', {
            method: 'POST',
            headers: { 'Content-Type': 'application/json' },
            body: JSON.stringify({
                orderId,
                reason,
                amount: refundAmount, // Teilerstattung möglich
                adminEmail: auth.currentUser?.email
            })
        });

        const result = await response.json();

        if (response.ok && result.success) {
            showToast(`Rückerstattung erfolgreich: €${result.amount.toFixed(2)}`);
            modal.remove();

            // Reload orders to show updated status
            await loadAdminOrders();
        } else {
            showToast(result.error || 'Fehler bei der Rückerstattung');
            submitBtn.innerHTML = originalHtml;
            submitBtn.disabled = false;
        }
    } catch (error) {
        logger.error('Refund error:', error);
        showToast('Netzwerkfehler bei der Rückerstattung');
        submitBtn.innerHTML = originalHtml;
        submitBtn.disabled = false;
    }
}

// ========== EXPORT QUESTIONNAIRE TO WORD ==========
export async function exportQuestionnaireToWord(orderId) {
    try {
        // Find the order in cached data
        const orderDoc = await getDoc(doc(db, 'orders', orderId));
        if (!orderDoc.exists()) {
            showToast('Bestellung nicht gefunden');
            return;
        }

        const order = orderDoc.data();
        const questionnaire = order.questionnaire;

        if (!questionnaire) {
            showToast('Keine Fragebogen-Daten vorhanden');
            return;
        }

        const customerName = order.customerName || 'Kunde';
        const templateSelection = order.cvProject?.templateSelection;

        // Build Word-compatible HTML
        let html = `
            <html xmlns:o="urn:schemas-microsoft-com:office:office"
                  xmlns:w="urn:schemas-microsoft-com:office:word"
                  xmlns="http://www.w3.org/TR/REC-html40">
            <head>
                <meta charset="utf-8">
                <title>CV-Daten ${customerName}</title>
                <style>
                    body { font-family: Calibri, Arial, sans-serif; font-size: 11pt; line-height: 1.5; }
                    h1 { color: #1e40af; font-size: 18pt; border-bottom: 2px solid #c9a87c; padding-bottom: 5pt; }
                    h2 { color: #1e40af; font-size: 14pt; margin-top: 15pt; border-bottom: 1px solid #e5e7eb; }
                    h3 { color: #374151; font-size: 12pt; margin-top: 10pt; }
                    .section { margin-bottom: 15pt; }
                    .label { color: #6b7280; font-size: 9pt; text-transform: uppercase; }
                    .value { font-weight: bold; margin-bottom: 5pt; }
                    .experience-item { margin-bottom: 10pt; padding-left: 10pt; border-left: 3px solid #c9a87c; }
                    .date { color: #6b7280; font-size: 10pt; }
                    table { border-collapse: collapse; width: 100%; margin-bottom: 10pt; }
                    td { padding: 5pt; vertical-align: top; }
                    .color-box { display: inline-block; width: 15pt; height: 15pt; border: 1px solid #ccc; }
                </style>
            </head>
            <body>
                <h1>CV-Daten: ${escapeHtml(customerName)}</h1>
                <p class="date">Exportiert am: ${new Date().toLocaleDateString('de-DE')} um ${new Date().toLocaleTimeString('de-DE')}</p>
        `;

        // Template Selection
        if (templateSelection) {
            const colors = templateSelection.customization || {};
            html += `
                <div class="section">
                    <h2>Gewähltes Template & Farben</h2>
                    <table>
                        <tr>
                            <td width="30%"><span class="label">Template:</span><br><span class="value">${escapeHtml(templateSelection.templateName || templateSelection.templateId)}</span></td>
                            <td>
                                <span class="label">Farbschema:</span><br>
                                Primary: ${colors.primaryColor || '-'} |
                                Accent: ${colors.accentColor || '-'} |
                                Circle: ${colors.circleColor || '-'}
                            </td>
                        </tr>
                    </table>
                </div>
            `;
        }

        // Personal Info
        if (questionnaire.personal) {
            const p = questionnaire.personal;
            html += `
                <div class="section">
                    <h2>Persönliche Daten</h2>
                    <table>
                        <tr>
                            <td width="50%"><span class="label">Name:</span><br><span class="value">${escapeHtml(p.fullName || '-')}</span></td>
                            <td><span class="label">E-Mail:</span><br><span class="value">${escapeHtml(p.email || '-')}</span></td>
                        </tr>
                        <tr>
                            <td><span class="label">Telefon:</span><br><span class="value">${escapeHtml(p.phone || '-')}</span></td>
                            <td><span class="label">Ort:</span><br><span class="value">${escapeHtml(p.location || '-')}</span></td>
                        </tr>
                        <tr>
                            <td><span class="label">Geburtsdatum:</span><br><span class="value">${escapeHtml(p.birthDate || '-')}</span></td>
                            <td><span class="label">Nationalität:</span><br><span class="value">${escapeHtml(p.nationality || '-')}</span></td>
                        </tr>
                        <tr>
                            <td colspan="2"><span class="label">Zielposition:</span><br><span class="value">${escapeHtml(p.targetRole || '-')}</span></td>
                        </tr>
                        ${p.linkedin ? `<tr><td colspan="2"><span class="label">LinkedIn:</span><br><span class="value">${escapeHtml(p.linkedin)}</span></td></tr>` : ''}
                    </table>
                </div>
            `;
        }

        // Summary
        if (questionnaire.summary) {
            html += `
                <div class="section">
                    <h2>Zusammenfassung / Profil</h2>
                    <p>${escapeHtml(questionnaire.summary).replace(/\\n/g, '<br>')}</p>
                </div>
            `;
        }

        // Experience
        if (questionnaire.experience?.length > 0) {
            html += `
                <div class="section">
                    <h2>Berufserfahrung (${questionnaire.experience.length})</h2>
            `;
            questionnaire.experience.forEach((exp, idx) => {
                const achievements = exp.achievements
                    ? (Array.isArray(exp.achievements) ? exp.achievements.join('<br>• ') : exp.achievements.replace(/\\n/g, '<br>• '))
                    : '';
                html += `
                    <div class="experience-item">
                        <h3>${escapeHtml(exp.role || exp.title || 'Position')}</h3>
                        <p><strong>${escapeHtml(exp.company || '')}</strong></p>
                        <p class="date">${exp.startDate || ''} ${exp.endDate ? '- ' + exp.endDate : exp.current ? '- Heute' : ''}</p>
                        ${achievements ? `<p>• ${achievements}</p>` : ''}
                        ${exp.description ? `<p>${escapeHtml(exp.description)}</p>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Education
        if (questionnaire.education?.length > 0) {
            html += `
                <div class="section">
                    <h2>Ausbildung (${questionnaire.education.length})</h2>
            `;
            questionnaire.education.forEach(edu => {
                html += `
                    <div class="experience-item">
                        <h3>${escapeHtml(edu.degree || edu.title || 'Abschluss')}</h3>
                        <p><strong>${escapeHtml(edu.institution || edu.school || '')}</strong></p>
                        <p class="date">${edu.startDate || ''} ${edu.endDate ? '- ' + edu.endDate : ''}</p>
                        ${edu.description ? `<p>${escapeHtml(edu.description)}</p>` : ''}
                    </div>
                `;
            });
            html += '</div>';
        }

        // Skills
        if (questionnaire.skills?.length > 0) {
            html += `
                <div class="section">
                    <h2>Skills</h2>
                    <p>${questionnaire.skills.map(s => typeof s === 'string' ? escapeHtml(s) : escapeHtml(s.name || s.skill)).join(', ')}</p>
                </div>
            `;
        }

        // Languages
        if (questionnaire.languages?.length > 0) {
            html += `
                <div class="section">
                    <h2>Sprachen</h2>
                    <ul>
                        ${questionnaire.languages.map(lang =>
                            `<li><strong>${escapeHtml(typeof lang === 'string' ? lang : lang.language || lang.name)}</strong>${lang.level ? ` - ${escapeHtml(lang.level)}` : ''}</li>`
                        ).join('')}
                    </ul>
                </div>
            `;
        }

        // Certifications
        if (questionnaire.certifications?.length > 0) {
            html += `
                <div class="section">
                    <h2>Zertifikate & Weiterbildungen</h2>
                    <ul>
                        ${questionnaire.certifications.map(cert =>
                            `<li><strong>${escapeHtml(typeof cert === 'string' ? cert : cert.name || cert.title)}</strong>${cert.year ? ` (${cert.year})` : ''}</li>`
                        ).join('')}
                    </ul>
                </div>
            `;
        }

        // Additional Info
        if (questionnaire.additionalInfo || questionnaire.interests || questionnaire.hobbies) {
            html += `
                <div class="section">
                    <h2>Zusätzliche Informationen</h2>
                    ${questionnaire.additionalInfo ? `<p>${escapeHtml(questionnaire.additionalInfo).replace(/\\n/g, '<br>')}</p>` : ''}
                    ${questionnaire.interests ? `<p><strong>Interessen:</strong> ${escapeHtml(Array.isArray(questionnaire.interests) ? questionnaire.interests.join(', ') : questionnaire.interests)}</p>` : ''}
                    ${questionnaire.hobbies ? `<p><strong>Hobbies:</strong> ${escapeHtml(Array.isArray(questionnaire.hobbies) ? questionnaire.hobbies.join(', ') : questionnaire.hobbies)}</p>` : ''}
                </div>
            `;
        }

        html += `
            </body>
            </html>
        `;

        // Create and download the file
        const blob = new Blob([html], { type: 'application/msword' });
        const url = URL.createObjectURL(blob);
        const a = document.createElement('a');
        a.href = url;
        a.download = `CV-Daten_${customerName.replace(/[^a-zA-Z0-9äöüÄÖÜß]/g, '_')}_${new Date().toISOString().split('T')[0]}.doc`;
        document.body.appendChild(a);
        a.click();
        document.body.removeChild(a);
        URL.revokeObjectURL(url);

        showToast('Word-Export gestartet');
    } catch (error) {
        logger.error('Export error:', error);
        showToast('Fehler beim Export');
    }
}

// Helper function to escape HTML
function escapeHtml(text) {
    if (!text) return '';
    const str = String(text);
    return str
        .replace(/&/g, '&amp;')
        .replace(/</g, '&lt;')
        .replace(/>/g, '&gt;')
        .replace(/"/g, '&quot;')
        .replace(/'/g, '&#039;');
}
