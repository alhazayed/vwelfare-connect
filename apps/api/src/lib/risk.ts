// Words that may signal risk of self-harm, in English and Arabic (standard and common dialect forms). A match flags
// the chat for the provider and shows the patient the emergency numbers. This is a safety net, not an assessment:
// the clinical lead should review and extend this list. Every phrase here has a case in test/risk.test.ts.

/**
 * Arabic is matched after removing diacritics and tatweel and folding letter variants (أ إ آ ٱ → ا, ى → ي, ة → ه,
 * ؤ → و, ئ → ي), so "أنتحر", "انتحر" and "إنتحر" are the same word. English is lower-cased with plain apostrophes.
 * Patterns below are written in that folded form.
 */
export function normaliseForRisk(text: string) {
  return text
    .toLowerCase()
    .replace(/[ً-ٰٟۖ-ۭـ]/g, "")
    .replace(/[أإآٱ]/g, "ا")
    .replace(/ى/g, "ي")
    .replace(/ة/g, "ه")
    .replace(/ؤ/g, "و")
    .replace(/ئ/g, "ي")
    .replace(/[‘’ʼ`´]/g, "'")
    .replace(/\s+/g, " ");
}

const EN = [
  /suicid/,
  /\bkill(ing)? my ?self\b/,
  /\b(hurt|harm|cut|cutting|hurting|harming)( my ?self)\b/,
  /\bself[- ]?harm/,
  /\bend(ing)? (my life|it all|my own life|everything)\b/,
  /\b(want|wanna|wanting|going|gonna|ready|wish|deserve) (to )?die\b/,
  /\bwish i (was|were) dead\b/,
  /\bbetter off (dead|without me)\b/,
  /\b(don'?t|do not|dont) want to (live|be alive|exist|wake up|be here anymore)\b/,
  /\b(no reason|nothing( left)?) to live for\b/,
  /\bno reason to live\b/,
  /\bcan'?t (go on|keep going) (anymore|any more)\b/,
  /\boverdose\b/,
  /\btake all (my|the) pills\b/
];

const AR = [
  /انتحار/,
  /نتحر/, // انتحر، أنتحر، بنتحر، رح انتحر
  /(قتل|اقتل|موت) نفسي/,
  /(اذي|اوذي|ايذا|ايذاء|اذيه|اذيت|اضر) نفسي/,
  /(نهي|انهاء|انهي|خلص) (حياتي|على حياتي|عمري)/,
  /(اريد|بدي|ابي|ابغي|ابغا|عايز|عايزه|عاوز|عاوزه|ودي|حابب|حابه|نفسي) (ان )?ا?موت/,
  /اتمني (ال)?موت/,
  /اتمني (لو )?اموت/,
  /(ما|مش|مو|لا) ?(بدي|ابي|ابغي|ابغا|عايز|عايزه|عاوز|عاوزه|اريد|اريد ان|حابب|حابه|ودي) ?ا?عيش/,
  /(مابي|مابدي|مابغي) ?ا?عيش/,
  /(ريتني|ليتني|يا ريت لو) (مت|ميت|ميته)/,
  /(الموت ارحم|الموت احسن)/,
  /(تعبت|زهقت|مليت|كرهت) (من )?(الحياه|حياتي|العيشه|عيشتي)/,
  /(اقطع|قطع|بقطع) (شرياني|عروقي|وريدي|ايدي)/,
  /جرعه زايده/
];

export const hasRiskWords = (text: string) => {
  const t = normaliseForRisk(text);
  return EN.some(r => r.test(t)) || AR.some(r => r.test(t));
};
