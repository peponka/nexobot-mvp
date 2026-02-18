// =============================================
// NexoBot MVP — Multi-Currency Service
// =============================================
// Handles PYG ↔ USD conversion for Paraguay.
// Uses a cached exchange rate (updated periodically).
//
// Exchange rate sources:
//   1. BCP (Banco Central del Paraguay) — primary
//   2. Fallback to a hardcoded conservative rate
//
// NOTE: In Paraguay, the informal market uses a different
// rate than the official one. We use a middle-market rate.

import supabase from '../config/supabase.js';

// =============================================
// CONFIGURATION
// =============================================

// Fallback rate (updated manually as backup)
const FALLBACK_RATE = {
    USD_PYG: 7350,          // 1 USD = ~7,350 PYG (Feb 2026 approx)
    last_updated: '2026-02-17',
    source: 'fallback'
};

// Cache with 6-hour TTL
let rateCache = null;
let rateCacheExpiry = 0;
const CACHE_TTL_MS = 6 * 60 * 60 * 1000; // 6 hours

// =============================================
// EXCHANGE RATE
// =============================================

/**
 * Get the current USD → PYG exchange rate
 * Tries to fetch from external API, falls back to stored/hardcoded rate
 * @returns {{ buy: number, sell: number, mid: number, source: string, updated: string }}
 */
export async function getExchangeRate() {
    // Return cached if fresh
    if (rateCache && Date.now() < rateCacheExpiry) {
        return rateCache;
    }

    // Try to fetch fresh rate
    try {
        const rate = await fetchExternalRate();
        if (rate) {
            rateCache = rate;
            rateCacheExpiry = Date.now() + CACHE_TTL_MS;

            // Save to DB for persistence
            await saveRate(rate);

            console.log(`💱 Exchange rate updated: 1 USD = ${rate.mid} PYG (${rate.source})`);
            return rate;
        }
    } catch (error) {
        console.error('Exchange rate fetch error:', error.message);
    }

    // Try to load from DB
    try {
        const dbRate = await loadRate();
        if (dbRate) {
            rateCache = dbRate;
            rateCacheExpiry = Date.now() + CACHE_TTL_MS / 2; // Shorter TTL for DB rate
            return dbRate;
        }
    } catch (error) {
        console.error('DB rate load error:', error.message);
    }

    // Final fallback
    const fallback = {
        buy: FALLBACK_RATE.USD_PYG - 50,   // Banks buy cheaper
        sell: FALLBACK_RATE.USD_PYG + 50,   // Banks sell higher
        mid: FALLBACK_RATE.USD_PYG,
        source: 'fallback',
        updated: FALLBACK_RATE.last_updated,
    };

    rateCache = fallback;
    rateCacheExpiry = Date.now() + 30 * 60 * 1000; // Only 30 min for fallback
    return fallback;
}

/**
 * Fetch exchange rate from an external API
 * Using a free API that provides Paraguay rates
 */
async function fetchExternalRate() {
    try {
        // Try exchangerate-api.com (free tier)
        const res = await fetch('https://open.er-api.com/v6/latest/USD', {
            signal: AbortSignal.timeout(5000)
        });

        if (!res.ok) return null;
        const data = await res.json();

        if (data.rates?.PYG) {
            const mid = Math.round(data.rates.PYG);
            return {
                buy: Math.round(mid * 0.993),  // ~0.7% spread
                sell: Math.round(mid * 1.007),
                mid,
                source: 'exchangerate-api',
                updated: new Date().toISOString(),
            };
        }
    } catch (error) {
        // Silently fail — will use fallback
    }
    return null;
}

// =============================================
// CONVERSION FUNCTIONS
// =============================================

/**
 * Convert an amount between currencies
 * @param {number} amount - Amount to convert
 * @param {string} from - Source currency ('PYG' | 'USD')
 * @param {string} to - Target currency ('PYG' | 'USD')
 * @returns {{ amount: number, rate: number, from: string, to: string }}
 */
export async function convert(amount, from, to) {
    if (from === to) return { amount, rate: 1, from, to };

    const rate = await getExchangeRate();

    if (from === 'USD' && to === 'PYG') {
        // USD → PYG: use the sell rate (merchant is "buying" guaraníes)
        const converted = Math.round(amount * rate.mid);
        return {
            amount: converted,
            original: amount,
            rate: rate.mid,
            from: 'USD',
            to: 'PYG',
            display: `$${amount} USD = Gs. ${converted.toLocaleString('es-PY')}`,
        };
    }

    if (from === 'PYG' && to === 'USD') {
        // PYG → USD: use the buy rate
        const converted = Math.round((amount / rate.mid) * 100) / 100;
        return {
            amount: converted,
            original: amount,
            rate: rate.mid,
            from: 'PYG',
            to: 'USD',
            display: `Gs. ${amount.toLocaleString('es-PY')} = $${converted} USD`,
        };
    }

    throw new Error(`Conversion not supported: ${from} → ${to}`);
}

/**
 * Convert USD amount to PYG (quick helper)
 */
export async function usdToPyg(usdAmount) {
    const result = await convert(usdAmount, 'USD', 'PYG');
    return result.amount;
}

/**
 * Convert PYG amount to USD (quick helper)
 */
export async function pygToUsd(pygAmount) {
    const result = await convert(pygAmount, 'PYG', 'USD');
    return result.amount;
}

// =============================================
// FORMAT HELPERS
// =============================================

/**
 * Format any amount with its currency symbol
 */
export function formatAmount(amount, currency = 'PYG') {
    if (currency === 'USD') {
        return `$${amount.toLocaleString('en-US', { minimumFractionDigits: 0, maximumFractionDigits: 2 })} USD`;
    }

    if (amount >= 1000000) {
        return `Gs. ${(amount / 1000000).toFixed(1).replace('.0', '')} millones`;
    }
    return `Gs. ${amount.toLocaleString('es-PY')}`;
}

/**
 * Format a dual-currency display string
 * Shows amount in original currency with PYG equivalent
 */
export async function formatDualCurrency(amount, currency) {
    if (currency === 'PYG') {
        const usd = await pygToUsd(amount);
        return `${formatAmount(amount, 'PYG')} (~$${usd} USD)`;
    }

    if (currency === 'USD') {
        const pyg = await usdToPyg(amount);
        return `$${amount} USD (${formatAmount(pyg, 'PYG')})`;
    }

    return formatAmount(amount, currency);
}

// =============================================
// DATABASE PERSISTENCE
// =============================================

async function saveRate(rate) {
    if (!supabase) return;
    try {
        await supabase.from('exchange_rates').upsert({
            currency_pair: 'USD_PYG',
            buy: rate.buy,
            sell: rate.sell,
            mid: rate.mid,
            source: rate.source,
            fetched_at: rate.updated,
        }, { onConflict: 'currency_pair' });
    } catch (error) {
        console.error('Error saving exchange rate:', error.message);
    }
}

async function loadRate() {
    if (!supabase) return null;
    try {
        const { data } = await supabase
            .from('exchange_rates')
            .select('*')
            .eq('currency_pair', 'USD_PYG')
            .single();

        if (!data) return null;
        return {
            buy: data.buy,
            sell: data.sell,
            mid: data.mid,
            source: data.source + ' (cached)',
            updated: data.fetched_at,
        };
    } catch (error) {
        return null;
    }
}

// =============================================
// CRON: Update exchange rate every 6 hours
// =============================================

export function startExchangeRateCron() {
    // Update immediately on boot
    getExchangeRate().then(r => {
        if (r) console.log(`💱 Exchange rate loaded: 1 USD = ${r.mid} PYG (${r.source})`);
    }).catch(() => { });

    // Then every 6 hours
    setInterval(() => {
        rateCacheExpiry = 0; // Force refresh
        getExchangeRate().catch(() => { });
    }, CACHE_TTL_MS);
}

export default {
    getExchangeRate,
    convert,
    usdToPyg,
    pygToUsd,
    formatAmount,
    formatDualCurrency,
    startExchangeRateCron,
};
