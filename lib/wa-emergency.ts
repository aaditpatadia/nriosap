/**
 * Emergency words in English, Hindi, Gujarati and Marathi, in script and in Roman letters.
 * Runs before anything else on every WhatsApp text, and needs no AI service, so it works when the model is down.
 * It is tuned to over-trigger: a false alarm costs a phone call, a miss can cost much more.
 * Test set: tests/fixtures/emergency-messages.ts. NATIVE SPEAKER REVIEW NEEDED for the Indian-language lists.
 *
 * Indian scripts are matched as substrings, because \b only understands Latin letters.
 */
const ENGLISH: RegExp[] = [
  /\bemergenc(y|ies)\b/i,
  /\bambulance\b/i,
  /\bchest pain\b/i,
  /\b(fell|fallen|collapsed?|fainted|passed out)\b/i,
  /\bhad a fall\b|\bfall(ing|s)? (in|from|down|off)\b/i,
  /\b(can'?t|cannot|not able to) breathe\b|\bnot breathing\b|\bbreathing (problem|difficulty)\b/i,
  /\b(admitted|rushed|taken) (to|in|into)( the)? (hospital|icu)\b/i,
  /\bicu\b/i,
  /\b(unconscious|unresponsive|not responding|heart attack|stroke|seizure|had a fit|having a fit)\b/i,
  /\b(bleeding heavily|heavy bleeding|bleeding a lot|blood (won'?t|will not|does not|doesn'?t) stop)\b/i,
  /\b(fire in|on fire|caught fire)\b/i,
  /\bgas leak/i,
  /\b(broke into|break-in|burglar|intruder|thief)\b/i,
  /\btoo many (tablets|pills)\b|\boverdose\b/i,
  /\baccident\b/i,
  /\b(not able to|unable to|can'?t|cannot) wake\b/i,
  /\bflood(ing|ed)?\b/i,
  /\b(very serious|critical condition|severe (chest|pain|bleeding))\b/i,
];

const HINDI = [
  "गिर गए", "गिर गई", "गिर गये", "गिर पड़े", "छाती में दर्द", "सीने में दर्द", "एम्बुलेंस", "एंबुलेंस", "बेहोश", "हार्ट अटैक", "दिल का दौरा",
  "सांस नहीं", "साँस नहीं", "अस्पताल ले", "इमरजेंसी", "आपातकाल", "आग लग", "गैस लीक", "लकवा", "एक्सीडेंट", "दुर्घटना", "खून बह", "खून रुक नहीं",
  "उठ नहीं रह", "गोलियां खा ली", "गोलियाँ खा ली", "घर में घुस",
];
const HINGLISH: RegExp[] = [
  /\bgir (gaye|gayi|gai|gaya|pade|padi)\b/i,
  /\b(chhati|chhaati|chati|seene|sine) (me|mein|main|ma) (dard|dukh)/i,
  /\bbehosh\b/i,
  /\b(saans|sans|shwas|swas) nahi\b/i,
  /\bhospital le ja/i,
  /\baag lag/i,
];

const GUJARATI = [
  "પડી ગયા", "પડી ગઈ", "પડી ગયાં", "છાતીમાં દુખાવો", "છાતીમાં દુખે", "એમ્બ્યુલન્સ", "બેભાન", "હાર્ટ એટેક", "શ્વાસ નથી", "શ્વાસ લેવાતો નથી",
  "હોસ્પિટલ લઈ", "દવાખાને લઈ", "ઇમરજન્સી", "આગ લાગી", "ગેસ લીક", "લકવો", "અકસ્માત", "લોહી બંધ નથી", "લોહી નીકળ", "ઉઠતા નથી", "ઘૂસી ગયો",
];
const GUJARATI_ROMAN: RegExp[] = [/\bpadi (gaya|gai|gayi)\b/i, /\bchhati ma dukh/i, /\bbebhan\b/i, /\b(shwas|swas) nathi\b/i, /\bhospital lai ja/i];

const MARATHI = [
  "पडले", "पडल्या", "छातीत दुख", "रुग्णवाहिका", "ॲम्ब्युलन्स", "अ‍ॅम्ब्युलन्स", "अँब्युलन्स", "बेशुद्ध", "हार्ट अटॅक", "हृदयविकाराचा झटका",
  "श्वास घेता येत नाही", "श्वास घेता येईना", "रुग्णालयात ने", "दवाखान्यात ने", "आणीबाणी", "आग लागली", "गॅस गळती", "अर्धांगवायू", "पक्षाघात",
  "अपघात", "रक्त थांबत नाही", "उठत नाही",
];
const MARATHI_ROMAN: RegExp[] = [/\bpad(le|lya)\b/i, /\bchhatit dukh/i, /\bbeshuddh/i, /\bshwas gheta yet nahi/i, /\bhospital madhe ne/i, /\bapghat\b/i];

const PATTERNS = [...ENGLISH, ...HINGLISH, ...GUJARATI_ROMAN, ...MARATHI_ROMAN];
const PHRASES = [...HINDI, ...GUJARATI, ...MARATHI];

export function detectEmergency(text: string | null | undefined): boolean {
  if (!text) return false;
  const t = text.normalize("NFC");
  return PATTERNS.some((p) => p.test(t)) || PHRASES.some((p) => t.includes(p));
}
