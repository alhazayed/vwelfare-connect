// The risk-word safety net. Each row is a phrase a patient might write; the clinical lead should review both lists.
import { describe, expect, it } from "vitest";
import { hasRiskWords } from "../src/lib/risk.ts";

const FLAGGED = [
  // English, including informal forms
  "I'm going to kill myself",
  "i wanna die",
  "I want to die",
  "thinking of ending it all",
  "I keep thinking I want to hurt myself",
  "I've been cutting myself again",
  "self-harm",
  "I don’t want to live anymore",
  "everyone would be better off without me",
  "I wish I was dead",
  "there's no reason to live",
  "I have nothing left to live for",
  "I can't go on anymore",
  "I'm going to take all my pills",
  "having suicidal thoughts",
  // Arabic: standard
  "انتحار",
  "أفكر بالانتحار",
  "أريد أن أموت",
  "أُريدُ أنْ أموتَ",
  "سأقتل نفسي",
  "أؤذي نفسي",
  "أفكر في إيذاء نفسي",
  "أنهي حياتي",
  "لا أريد أن أعيش",
  "أتمنى الموت",
  // Arabic: dialect and informal
  "بدي موت",
  "بدي اموت",
  "ما بدي عيش",
  "مابدي اعيش",
  "ابي اموت",
  "ابغى اموت",
  "عايز اموت",
  "مش عايزة أعيش",
  "رح انتحر",
  "ياريتني ميت",
  "ليتني مت",
  "تعبت من الحياة",
  "الموت ارحم",
  "بقطع شرياني",
  "ـانـتـحـار" // tatweel
];

const NOT_FLAGGED = [
  "I tried the thought record you gave me",
  "My sleep was better this week",
  "I'm dying to tell you about my new job",
  "The film was killer",
  "شكرا دكتور، أحس أني أفضل",
  "نمت جيدا هذا الأسبوع",
  "بدي موعد الأسبوع الجاي",
  "ما بدي أتأخر على الجلسة"
];

describe("risk words", () => {
  it.each(FLAGGED)("flags %s", text => { expect(hasRiskWords(text)).toBe(true); });
  it.each(NOT_FLAGGED)("doesn't flag %s", text => { expect(hasRiskWords(text)).toBe(false); });
});
