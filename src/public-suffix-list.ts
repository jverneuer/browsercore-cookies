/**
 * Bundled snapshot of the Mozilla Public Suffix List (PSL).
 *
 * A public suffix is a domain under which users can directly register names
 * (e.g. "com", "co.uk", "github.io"). Per RFC 6265 §5.3 step 11 a server MUST
 * NOT set a cookie whose Domain attribute is a public suffix. Per the Cookies
 * Having Independent Partitioned State draft and the Secure/Host prefix rules,
 * the jar also needs registrable-domain computation for same-site comparison.
 *
 * This is a curated snapshot — all ISO 3166-1 alpha-2 country codes, the common
 * generic TLDs, the important multi-level ICANN suffixes, the well-known
 * private-domain suffixes used by CDNs/PaaS, and a few wildcard/exception rules
 * to demonstrate correct algorithm behavior. The binary-search matching works
 * identically regardless of list size.
 *
 * Each list is sorted lexicographically so {@link binarySearch} is correct.
 */

/** A normal rule: the suffix itself is a public suffix (e.g. "co.uk"). */
const NORMAL: readonly string[] = [
    // --- Common generic TLDs ---
    "com",
    "edu",
    "gov",
    "info",
    "int",
    "mil",
    "net",
    "org",
    "biz",
    "name",
    "pro",
    "aero",
    "coop",
    "museum",
    "travel",
    "cat",
    "jobs",
    "mobi",
    "tel",
    "asia",
    "post",
    // --- ISO 3166-1 alpha-2 country codes (all 249) ---
    "ad",
    "ae",
    "af",
    "ag",
    "ai",
    "al",
    "am",
    "ao",
    "aq",
    "ar",
    "as",
    "at",
    "au",
    "aw",
    "ax",
    "az",
    "ba",
    "bb",
    "bd",
    "be",
    "bf",
    "bg",
    "bh",
    "bi",
    "bj",
    "bl",
    "bm",
    "bn",
    "bo",
    "bq",
    "br",
    "bs",
    "bt",
    "bv",
    "bw",
    "by",
    "bz",
    "ca",
    "cc",
    "cd",
    "cf",
    "cg",
    "ch",
    "ci",
    "ck",
    "cl",
    "cm",
    "cn",
    "co",
    "cr",
    "cu",
    "cv",
    "cw",
    "cx",
    "cy",
    "cz",
    "de",
    "dj",
    "dk",
    "dm",
    "do",
    "dz",
    "ec",
    "ee",
    "eg",
    "eh",
    "er",
    "es",
    "et",
    "fi",
    "fj",
    "fk",
    "fm",
    "fo",
    "fr",
    "ga",
    "gb",
    "gd",
    "ge",
    "gf",
    "gg",
    "gh",
    "gi",
    "gl",
    "gm",
    "gn",
    "gp",
    "gq",
    "gr",
    "gs",
    "gt",
    "gu",
    "gw",
    "gy",
    "hk",
    "hm",
    "hn",
    "hr",
    "ht",
    "hu",
    "id",
    "ie",
    "il",
    "im",
    "in",
    "io",
    "iq",
    "ir",
    "is",
    "it",
    "je",
    "jm",
    "jo",
    "jp",
    "ke",
    "kg",
    "kh",
    "ki",
    "km",
    "kn",
    "kp",
    "kr",
    "kw",
    "ky",
    "kz",
    "la",
    "lb",
    "lc",
    "li",
    "lk",
    "lr",
    "ls",
    "lt",
    "lu",
    "lv",
    "ly",
    "ma",
    "mc",
    "md",
    "me",
    "mf",
    "mg",
    "mh",
    "mk",
    "ml",
    "mm",
    "mn",
    "mo",
    "mp",
    "mq",
    "mr",
    "ms",
    "mt",
    "mu",
    "mv",
    "mw",
    "mx",
    "my",
    "mz",
    "na",
    "nc",
    "ne",
    "nf",
    "ng",
    "ni",
    "nl",
    "no",
    "np",
    "nr",
    "nu",
    "nz",
    "om",
    "pa",
    "pe",
    "pf",
    "pg",
    "ph",
    "pk",
    "pl",
    "pm",
    "pn",
    "pr",
    "ps",
    "pt",
    "pw",
    "py",
    "qa",
    "re",
    "ro",
    "rs",
    "ru",
    "rw",
    "sa",
    "sb",
    "sc",
    "sd",
    "se",
    "sg",
    "sh",
    "si",
    "sj",
    "sk",
    "sl",
    "sm",
    "sn",
    "so",
    "sr",
    "ss",
    "st",
    "sv",
    "sx",
    "sy",
    "sz",
    "tc",
    "td",
    "tf",
    "tg",
    "th",
    "tj",
    "tk",
    "tl",
    "tm",
    "tn",
    "to",
    "tr",
    "tt",
    "tv",
    "tw",
    "tz",
    "ua",
    "ug",
    "um",
    "us",
    "uy",
    "uz",
    "va",
    "vc",
    "ve",
    "vg",
    "vi",
    "vn",
    "vu",
    "wf",
    "ws",
    "ye",
    "yt",
    "za",
    "zm",
    "zw",
    // --- Common multi-level ICANN suffixes ---
    "ac.uk",
    "co.uk",
    "gov.uk",
    "ltd.uk",
    "me.uk",
    "net.uk",
    "nhs.uk",
    "org.uk",
    "plc.uk",
    "sch.uk",
    "com.au",
    "net.au",
    "org.au",
    "edu.au",
    "gov.au",
    "asn.au",
    "id.au",
    "co.jp",
    "or.jp",
    "ne.jp",
    "ac.jp",
    "go.jp",
    "ad.jp",
    "ed.jp",
    "gr.jp",
    "lg.jp",
    "co.nz",
    "org.nz",
    "net.nz",
    "govt.nz",
    "iwi.nz",
    "maori.nz",
    "school.nz",
    "com.br",
    "net.br",
    "org.br",
    "edu.br",
    "gov.br",
    "mil.br",
    "com.cn",
    "net.cn",
    "org.cn",
    "gov.cn",
    "edu.cn",
    "com.tw",
    "net.tw",
    "org.tw",
    "co.kr",
    "or.kr",
    "ne.kr",
    "ac.kr",
    "go.kr",
    "com.hk",
    "net.hk",
    "org.hk",
    "edu.hk",
    "gov.hk",
    "com.sg",
    "net.sg",
    "org.sg",
    "edu.sg",
    "gov.sg",
    "com.my",
    "net.my",
    "org.my",
    "edu.my",
    "gov.my",
    "co.th",
    "or.th",
    "ne.th",
    "ac.th",
    "go.th",
    "co.in",
    "or.in",
    "ne.in",
    "ac.in",
    "go.in",
    "co.za",
    "org.za",
    "net.za",
    "gov.za",
    "web.za",
    "com.tr",
    "net.tr",
    "org.tr",
    "edu.tr",
    "gov.tr",
    "co.id",
    "or.id",
    "net.id",
    "ac.id",
    "go.id",
    "com.vn",
    "net.vn",
    "org.vn",
    "edu.vn",
    "gov.vn",
    "com.ar",
    "net.ar",
    "org.ar",
    "edu.ar",
    "gov.ar",
    "com.mx",
    "net.mx",
    "org.mx",
    "edu.mx",
    "gob.mx",
    "com.ph",
    "net.ph",
    "org.ph",
    "edu.ph",
    "gov.ph",
    "com.pk",
    "net.pk",
    "org.pk",
    "edu.pk",
    "gov.pk",
    "co.ke",
    "or.ke",
    "ne.ke",
    "ac.ke",
    "go.ke",
    "co.ug",
    "or.ug",
    "ac.ug",
    "go.ug",
    "com.ng",
    "net.ng",
    "org.ng",
    "edu.ng",
    "gov.ng",
    "com.ua",
    "net.ua",
    "org.ua",
    "edu.ua",
    "gov.ua",
    "com.pl",
    "net.pl",
    "org.pl",
    "edu.pl",
    "gov.pl",
    "com.gr",
    "net.gr",
    "org.gr",
    "edu.gr",
    "gov.gr",
    "com.co",
    "net.co",
    "org.co",
    "edu.co",
    "gov.co",
    // --- Common private-domain suffixes (CDN / PaaS) ---
    "github.io",
    "gitlab.io",
    "herokuapp.com",
    "herokussl.com",
    "heroku.com",
    "cloudfront.net",
    "s3.amazonaws.com",
    "elasticbeanstalk.com",
    "azurewebsites.net",
    "azureedge.net",
    "cloudapp.net",
    "cloudfunctions.net",
    "firebaseapp.com",
    "appspot.com",
    "blogspot.com",
    "vercel.app",
    "netlify.app",
    "pages.dev",
    "deno.dev",
    "fly.dev",
    "onrender.com",
    "firebaseio.com",
    "fastly.net",
    "akamai.net",
    "akamaiedge.net",
    "edgekey.net",
    "squarespace.com",
    "shopify.com",
    "myshopify.com",
    "wpengine.com",
    "pantheonsite.io",
    "wpcomstaging.com",
].sort();

/** A wildcard rule: "<any-single-label>.<suffix>" is a public suffix. */
const WILDCARD: readonly string[] = [
    "ck",
    "fk",
    "jp",
].sort();

/**
 * An exception rule: the named domain is NOT a public suffix, overriding the
 * wildcard rule for that one specific label. Stored WITHOUT the leading "!".
 */
const EXCEPTION: readonly string[] = [
    "www.ck",
].sort();

/**
 * Binary search over a sorted `readonly string[]`. Returns true if `target` is
 * present. Iterative, no recursion — O(log n) time, O(1) space.
 */
function binarySearch(sorted: readonly string[], target: string): boolean {
    let lo = 0;
    let hi = sorted.length;
    while (lo < hi) {
        const mid = (lo + hi) >>> 1;
        const val = sorted[mid];
        if (val === undefined) {
            return false;
        }
        if (val === target) {
            return true;
        }
        if (val < target) {
            lo = mid + 1;
        } else {
            hi = mid;
        }
    }
    return false;
}

/**
 * Normalize a domain for PSL matching: lowercase and strip leading/trailing
 * dots (same semantics as {@link import("./cookie.js").normalizeDomain}).
 */
function normalizePsl(domain: string): string {
    return domain.trim().toLowerCase().replaceAll(/^\.+|\.+$/gu, "");
}

/**
 * Find the public-suffix label count for a domain, per the canonical PSL
 * algorithm (publicsuffix.org/format/). Returns the number of labels from the
 * END of the domain that form the public suffix, or null if the domain is empty.
 *
 * Algorithm (RFC 6265 §5.3 step 11 + PSL spec):
 *  1. Walk every suffix of the domain, checking normal, wildcard, and
 *     exception rules. The matching rule with the most labels wins.
 *  2. Tie on label count → exception rule prevails.
 *  3. If the prevailing rule is an exception, drop its leftmost label
 *     (the exception says "this name is NOT a public suffix").
 *  4. No rule matched → default rule: the last label (the TLD) is the public
 *     suffix, unless the domain is empty.
 */
function findPublicSuffixLabelCount(domain: string): number | null {
    const normalized = normalizePsl(domain);
    if (normalized === "") {
        return null;
    }
    const labels = normalized.split(".");

    let bestLabelCount = 0;
    let bestIsException = false;

    for (let i = 0; i < labels.length; i++) {
        const suffix = labels.slice(i).join(".");
        const remaining = labels.length - i;

        // 1. Exception rule "!suffix": the full domain ending in this suffix is
        //    explicitly NOT a public suffix — but it overrides wildcard matches
        //    at the same depth (tie-break toward exception).
        if (binarySearch(EXCEPTION, suffix)) {
            if (remaining > bestLabelCount) {
                bestLabelCount = remaining;
                bestIsException = true;
            } else if (remaining === bestLabelCount) {
                bestIsException = true;
            }
        }

        // 2. Wildcard rule "*.suffix": "<anything>.suffix" is a public suffix.
        //    Requires a label before the suffix (i > 0) for the "*" to bind.
        if (i > 0 && binarySearch(WILDCARD, suffix)) {
            const matchCount = remaining + 1;
            if (matchCount > bestLabelCount) {
                bestLabelCount = matchCount;
                bestIsException = false;
            }
        }

        // 3. Normal rule "suffix": the suffix itself is a public suffix.
        if (binarySearch(NORMAL, suffix) && remaining > bestLabelCount) {
            bestLabelCount = remaining;
            bestIsException = false;
        }
    }

    // No rule matched → default rule: the last label (TLD) is the public suffix.
    if (bestLabelCount === 0) {
        const lastLabel = labels.at(-1);
        return lastLabel !== undefined && lastLabel !== "" ? 1 : null;
    }

    // Exception rule transformation: drop one label from the public suffix.
    if (bestIsException) {
        bestLabelCount -= 1;
    }

    return bestLabelCount > 0 ? bestLabelCount : null;
}

/**
 * Test whether `domain` is a public suffix per the bundled PSL snapshot.
 *
 * A public suffix is a domain under which users register names. Setting a
 * cookie with `Domain=<public-suffix>` is forbidden by RFC 6265 §5.3 step 11.
 *
 * @example
 * isPublicSuffix("com")        // true  — "com" is a public suffix
 * isPublicSuffix("co.uk")      // true  — multi-level ICANN suffix
 * isPublicSuffix("example.com") // false — a registrable name under "com"
 * isPublicSuffix("www.ck")     // false — exception to the "*.ck" wildcard
 * isPublicSuffix("foo.ck")     // true  — wildcard "*.ck" applies
 */
export function isPublicSuffix(domain: string): boolean {
    const normalized = normalizePsl(domain);
    if (normalized === "") {
        return false;
    }
    const labels = normalized.split(".");
    const psLabels = findPublicSuffixLabelCount(normalized);
    if (psLabels === null) {
        return false;
    }
    return psLabels >= labels.length;
}

/**
 * Compute the registrable domain (aka "effective top-level domain + 1") of a
 * domain. This is the public suffix plus one label — the domain at which a
 * user would register a name.
 *
 * Returns null if the domain has no registrable suffix: either the domain IS a
 * public suffix (no label above it to register under) or the domain is empty.
 *
 * Used by same-site comparison so that e.g. `example.co.uk` and
 * `login.example.co.uk` are recognized as same-site (both registrable domain
 * `example.co.uk`) while `example.co.uk` and `evil.co.uk` are not.
 *
 * @example
 * registrableDomain("example.com")        // "example.com"
 * registrableDomain("login.example.com")  // "example.com"
 * registrableDomain("example.co.uk")      // "example.co.uk"
 * registrableDomain("com")                // null  — public suffix, no registrable domain
 * registrableDomain("foo.ck")             // null  — wildcard public suffix
 * registrableDomain("www.ck")             // "www.ck" — exception, registrable under "ck"
 */
export function registrableDomain(domain: string): string | null {
    const normalized = normalizePsl(domain);
    if (normalized === "") {
        return null;
    }
    const labels = normalized.split(".");
    const psLabels = findPublicSuffixLabelCount(normalized);
    if (psLabels === null || psLabels >= labels.length) {
        // The domain IS a public suffix (or deeper), so no registrable domain.
        return null;
    }
    return labels.slice(labels.length - psLabels - 1).join(".");
}
