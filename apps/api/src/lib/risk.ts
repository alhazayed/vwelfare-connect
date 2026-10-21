// Words that may signal risk of self-harm, in English and Arabic. A match flags the chat for the provider
// and shows the patient the emergency numbers. This is a safety net, not an assessment: the clinical
// lead should review and extend this list.
const RISK = /(suicid|kill myself|end my life|hurt myself|harm myself|self[- ]harm|want to die|don'?t want to live|انتحار|أنتحر|انتحر|أقتل نفسي|اقتل نفسي|أؤذي نفسي|اؤذي نفسي|إيذاء نفسي|أنهي حياتي|انهي حياتي|أريد أن أموت)/i;

export const hasRiskWords = (text: string) => RISK.test(text);
