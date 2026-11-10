/**
 * Every word Ally sends on WhatsApp. Short, in the sender's language, names the coordinator, says what happens
 * next, and promises no outcome. No advice of any kind.
 *
 * NATIVE SPEAKER REVIEW NEEDED: the Hindi, Gujarati and Marathi texts are drafts, not reviewed by a native speaker
 * or a lawyer. The consent wording also needs the lawyer (see NOTES.md, WhatsApp).
 */
export type WaLang = "English" | "Hindi" | "Gujarati" | "Marathi";
export const WA_LANG_CODE: Record<WaLang, string> = { English: "en", Hindi: "hi", Gujarati: "gu", Marathi: "mr" };
export const asWaLang = (l: string | null | undefined): WaLang => (l === "Hindi" || l === "Gujarati" || l === "Marathi" ? l : "English");

export const CONSENT_WORDING_VERSION = "wa-consent-draft-2026-11-10";

export type ReplyKind =
  | "received" | "request_opened" | "request_continued" | "emergency" | "emergency_unknown" | "unknown" | "consent_prompt" | "consent_thanks"
  | "consent_person_only" | "consent_declined" | "stopped" | "human" | "refused" | "professional" | "unsupported_media" | "too_big"
  | "waiting_plan" | "approved" | "declined" | "undone" | "approval_failed" | "approval_not_owner" | "linked" | "link_failed";

type Vars = { name?: string; coordinator?: string; ref?: string };
type Text = (v: Required<Vars>) => string;

const FOOT: Record<WaLang, (c: string) => string> = {
  English: (c) => `Type HUMAN to reach ${c}.`,
  Hindi: (c) => `${c} से बात करने के लिए HUMAN लिखें।`,
  Gujarati: (c) => `${c} સાથે વાત કરવા HUMAN લખો.`,
  Marathi: (c) => `${c} यांच्याशी बोलण्यासाठी HUMAN लिहा.`,
};

const R: Record<ReplyKind, Record<WaLang, Text>> = {
  received: {
    English: (v) => `Namaste ${v.name}. ${v.coordinator} at Ally has your message and will look at it today. You will hear back here.`,
    Hindi: (v) => `नमस्ते ${v.name}. Ally में ${v.coordinator} को आपका संदेश मिल गया है और वे आज इसे देखेंगे। जवाब यहीं मिलेगा।`,
    Gujarati: (v) => `નમસ્તે ${v.name}. Ally માં ${v.coordinator} ને તમારો સંદેશ મળ્યો છે અને તેઓ આજે જોશે. જવાબ અહીં જ મળશે.`,
    Marathi: (v) => `नमस्कार ${v.name}. Ally मध्ये ${v.coordinator} यांना तुमचा संदेश मिळाला आहे, ते आज पाहतील. उत्तर इथेच मिळेल.`,
  },
  request_opened: {
    English: (v) => `Namaste ${v.name}. We have opened request ${v.ref}. ${v.coordinator} will check it and tell you the next step. Nothing is paid or sent without your yes.`,
    Hindi: (v) => `नमस्ते ${v.name}. हमने अनुरोध ${v.ref} खोला है। ${v.coordinator} इसे देखकर अगला कदम बताएंगे। आपकी हाँ के बिना कुछ भी भुगतान या भेजा नहीं जाता।`,
    Gujarati: (v) => `નમસ્તે ${v.name}. અમે વિનંતી ${v.ref} ખોલી છે. ${v.coordinator} તપાસીને આગળનું પગલું જણાવશે. તમારી હા વગર કંઈ ચૂકવાતું કે મોકલાતું નથી.`,
    Marathi: (v) => `नमस्कार ${v.name}. आम्ही विनंती ${v.ref} उघडली आहे. ${v.coordinator} ती तपासून पुढची पायरी सांगतील. तुमच्या होकाराशिवाय काहीही भरले किंवा पाठवले जात नाही.`,
  },
  request_continued: {
    English: (v) => `Thank you. This is added to ${v.ref}. ${v.coordinator} will see it.`,
    Hindi: (v) => `धन्यवाद। यह ${v.ref} में जोड़ दिया गया है। ${v.coordinator} इसे देखेंगे।`,
    Gujarati: (v) => `આભાર. આ ${v.ref} માં ઉમેરાયું છે. ${v.coordinator} જોશે.`,
    Marathi: (v) => `धन्यवाद. हे ${v.ref} मध्ये जोडले आहे. ${v.coordinator} पाहतील.`,
  },
  emergency: {
    English: (v) => `If anyone is in danger, please call 112 now. ${v.coordinator} has been alerted and will call you.`,
    Hindi: (v) => `अगर किसी की जान को खतरा है, तो अभी 112 पर फोन करें। ${v.coordinator} को बता दिया गया है, वे आपको फोन करेंगे।`,
    Gujarati: (v) => `જો કોઈ જોખમમાં હોય તો હમણાં 112 પર ફોન કરો. ${v.coordinator} ને જાણ કરી છે, તેઓ તમને ફોન કરશે.`,
    Marathi: (v) => `कोणी धोक्यात असल्यास आत्ताच 112 वर फोन करा. ${v.coordinator} यांना कळवले आहे, ते तुम्हाला फोन करतील.`,
  },
  emergency_unknown: {
    English: () => "If anyone is in danger, please call 112 now. A person at Ally will see this message.",
    Hindi: () => "अगर किसी की जान को खतरा है, तो अभी 112 पर फोन करें। Ally में कोई व्यक्ति यह संदेश देखेगा।",
    Gujarati: () => "જો કોઈ જોખમમાં હોય તો હમણાં 112 પર ફોન કરો. Ally માં કોઈ વ્યક્તિ આ સંદેશ જોશે.",
    Marathi: () => "कोणी धोक्यात असल्यास आत्ताच 112 वर फोन करा. Ally मधील एक व्यक्ती हा संदेश पाहील.",
  },
  unknown: {
    English: () => "Namaste. This is Ally. We could not find this number. Please reply with the account holder's full name, and a person will get back to you.",
    Hindi: () => "नमस्ते। यह Ally है। हमें यह नंबर नहीं मिला। कृपया खाताधारक का पूरा नाम लिखें, कोई व्यक्ति आपसे संपर्क करेगा।",
    Gujarati: () => "નમસ્તે. આ Ally છે. અમને આ નંબર મળ્યો નથી. ખાતાધારકનું પૂરું નામ લખો, કોઈ વ્યક્તિ તમારો સંપર્ક કરશે.",
    Marathi: () => "नमस्कार. हे Ally आहे. आम्हाला हा नंबर सापडला नाही. कृपया खातेदाराचे पूर्ण नाव लिहा, एक व्यक्ती तुमच्याशी संपर्क करेल.",
  },
  consent_prompt: {
    English: () => "Namaste. This is Ally, a desk that helps families with work in India. Before we read or keep what you send here, we need your yes. Reply YES to let a coordinator read and keep your messages and files, with an AI service outside India reading the text first and a person checking. Reply PERSON ONLY to have only a person read them. Reply STOP at any time.",
    Hindi: () => "नमस्ते। यह Ally है, जो परिवारों का भारत में काम करवाती है। आप जो भेजें उसे पढ़ने या रखने से पहले हमें आपकी हाँ चाहिए। हाँ के लिए YES लिखें: कोऑर्डिनेटर आपके संदेश और फाइलें पढ़ेंगे और रखेंगे, पहले भारत के बाहर की एक AI सेवा पाठ पढ़ेगी और फिर कोई व्यक्ति जांचेगा। केवल व्यक्ति पढ़े, इसके लिए PERSON ONLY लिखें। कभी भी STOP लिखें।",
    Gujarati: () => "નમસ્તે. આ Ally છે, જે પરિવારોના ભારતના કામ કરાવે છે. તમે મોકલો તે વાંચતા કે રાખતા પહેલાં અમને તમારી હા જોઈએ. YES લખો: કોઓર્ડિનેટર તમારા સંદેશ અને ફાઇલો વાંચશે અને રાખશે, પહેલાં ભારત બહારની AI સેવા લખાણ વાંચશે અને પછી વ્યક્તિ તપાસશે. માત્ર વ્યક્તિ વાંચે તે માટે PERSON ONLY લખો. ક્યારેય પણ STOP લખો.",
    Marathi: () => "नमस्कार. हे Ally आहे, जे कुटुंबांची भारतातील कामे करून देते. तुम्ही पाठवलेले वाचण्यापूर्वी किंवा ठेवण्यापूर्वी आम्हाला तुमचा होकार हवा. YES लिहा: कोऑर्डिनेटर तुमचे संदेश आणि फाइल्स वाचतील आणि ठेवतील, आधी भारताबाहेरील AI सेवा मजकूर वाचेल आणि मग एक व्यक्ती तपासेल. फक्त व्यक्तीने वाचावे यासाठी PERSON ONLY लिहा. कधीही STOP लिहा.",
  },
  consent_thanks: {
    English: (v) => `Thank you. ${v.coordinator} will now look at your messages. Reply STOP at any time.`,
    Hindi: (v) => `धन्यवाद। अब ${v.coordinator} आपके संदेश देखेंगे। कभी भी STOP लिखें।`,
    Gujarati: (v) => `આભાર. હવે ${v.coordinator} તમારા સંદેશ જોશે. ક્યારેય પણ STOP લખો.`,
    Marathi: (v) => `धन्यवाद. आता ${v.coordinator} तुमचे संदेश पाहतील. कधीही STOP लिहा.`,
  },
  consent_person_only: {
    English: (v) => `Thank you. Only ${v.coordinator} or another person at Ally will read your messages. No AI service will. Reply STOP at any time.`,
    Hindi: (v) => `धन्यवाद। आपके संदेश केवल ${v.coordinator} या Ally का कोई व्यक्ति पढ़ेगा, कोई AI सेवा नहीं। कभी भी STOP लिखें।`,
    Gujarati: (v) => `આભાર. તમારા સંદેશ માત્ર ${v.coordinator} અથવા Ally ની કોઈ વ્યક્તિ વાંચશે, કોઈ AI સેવા નહીં. ક્યારેય પણ STOP લખો.`,
    Marathi: (v) => `धन्यवाद. तुमचे संदेश फक्त ${v.coordinator} किंवा Ally मधील एखादी व्यक्ती वाचेल, कोणतीही AI सेवा नाही. कधीही STOP लिहा.`,
  },
  consent_declined: {
    English: () => "Understood. We will not read or keep your messages. Reply YES if you change your mind.",
    Hindi: () => "समझ गए। हम आपके संदेश न पढ़ेंगे, न रखेंगे। मन बदले तो YES लिखें।",
    Gujarati: () => "સમજાયું. અમે તમારા સંદેશ નહીં વાંચીએ કે નહીં રાખીએ. મન બદલાય તો YES લખો.",
    Marathi: () => "समजले. आम्ही तुमचे संदेश वाचणार नाही किंवा ठेवणार नाही. विचार बदलल्यास YES लिहा.",
  },
  stopped: {
    English: () => "You will get no more messages from Ally, and we have stopped work on your messages. Reply START to begin again.",
    Hindi: () => "अब Ally से आपको कोई संदेश नहीं आएगा, और हमने आपके संदेशों पर काम रोक दिया है। फिर से शुरू करने के लिए START लिखें।",
    Gujarati: () => "હવે Ally તરફથી તમને કોઈ સંદેશ નહીં આવે, અને અમે તમારા સંદેશ પર કામ બંધ કર્યું છે. ફરી શરૂ કરવા START લખો.",
    Marathi: () => "आता Ally कडून तुम्हाला कोणताही संदेश येणार नाही, आणि आम्ही तुमच्या संदेशांवरील काम थांबवले आहे. पुन्हा सुरू करण्यासाठी START लिहा.",
  },
  human: {
    English: (v) => `${v.coordinator} will call or message you soon. If anyone is in danger, call 112.`,
    Hindi: (v) => `${v.coordinator} जल्द ही आपको फोन या संदेश करेंगे। अगर किसी की जान को खतरा है, तो 112 पर फोन करें।`,
    Gujarati: (v) => `${v.coordinator} જલ્દી તમને ફોન કે સંદેશ કરશે. જો કોઈ જોખમમાં હોય તો 112 પર ફોન કરો.`,
    Marathi: (v) => `${v.coordinator} लवकरच तुम्हाला फोन किंवा संदेश करतील. कोणी धोक्यात असल्यास 112 वर फोन करा.`,
  },
  refused: {
    English: (v) => `${v.coordinator} has your message. This is something we cannot do, because we only use lawful routes. ${v.coordinator} will explain.`,
    Hindi: (v) => `${v.coordinator} को आपका संदेश मिल गया है। यह काम हम नहीं कर सकते, क्योंकि हम केवल कानूनी रास्ते अपनाते हैं। ${v.coordinator} समझाएंगे।`,
    Gujarati: (v) => `${v.coordinator} ને તમારો સંદેશ મળ્યો છે. આ કામ અમે કરી શકતા નથી, કારણ કે અમે માત્ર કાયદેસર રસ્તા અપનાવીએ છીએ. ${v.coordinator} સમજાવશે.`,
    Marathi: (v) => `${v.coordinator} यांना तुमचा संदेश मिळाला आहे. हे काम आम्ही करू शकत नाही, कारण आम्ही फक्त कायदेशीर मार्ग वापरतो. ${v.coordinator} समजावून सांगतील.`,
  },
  professional: {
    English: (v) => `${v.coordinator} has your message. Part of this needs a doctor, advocate or CA, and we do not give that advice. ${v.coordinator} will help you reach one and get your papers ready.`,
    Hindi: (v) => `${v.coordinator} को आपका संदेश मिल गया है। इसके एक हिस्से के लिए डॉक्टर, वकील या CA चाहिए, यह सलाह हम नहीं देते। ${v.coordinator} उन तक पहुंचने और काग़ज़ तैयार करने में मदद करेंगे।`,
    Gujarati: (v) => `${v.coordinator} ને તમારો સંદેશ મળ્યો છે. આના એક ભાગ માટે ડોક્ટર, વકીલ કે CA જોઈએ, એ સલાહ અમે આપતા નથી. ${v.coordinator} તેમના સુધી પહોંચવામાં અને કાગળો તૈયાર કરવામાં મદદ કરશે.`,
    Marathi: (v) => `${v.coordinator} यांना तुमचा संदेश मिळाला आहे. याच्या एका भागासाठी डॉक्टर, वकील किंवा CA लागतील, तो सल्ला आम्ही देत नाही. ${v.coordinator} त्यांच्यापर्यंत पोहोचण्यात आणि कागदपत्रे तयार करण्यात मदत करतील.`,
  },
  unsupported_media: {
    English: () => "Sorry, we can only open photos, PDF files and voice notes. Please send it as one of those, or type what you need.",
    Hindi: () => "माफ़ कीजिए, हम केवल फोटो, PDF फाइल और वॉइस नोट खोल सकते हैं। कृपया इनमें से किसी रूप में भेजें, या जो चाहिए वह लिखें।",
    Gujarati: () => "માફ કરશો, અમે માત્ર ફોટો, PDF ફાઇલ અને વોઇસ નોટ ખોલી શકીએ છીએ. આમાંથી કોઈ રૂપે મોકલો, અથવા જે જોઈએ તે લખો.",
    Marathi: () => "माफ करा, आम्ही फक्त फोटो, PDF फाइल आणि व्हॉइस नोट उघडू शकतो. कृपया यापैकी एका स्वरूपात पाठवा, किंवा काय हवे ते लिहा.",
  },
  too_big: {
    English: () => "Sorry, that file is too big for us. Please send one under 16 MB.",
    Hindi: () => "माफ़ कीजिए, यह फाइल बहुत बड़ी है। कृपया 16 MB से छोटी फाइल भेजें।",
    Gujarati: () => "માફ કરશો, આ ફાઇલ ખૂબ મોટી છે. 16 MB થી નાની ફાઇલ મોકલો.",
    Marathi: () => "माफ करा, ही फाइल खूप मोठी आहे. कृपया 16 MB पेक्षा लहान फाइल पाठवा.",
  },
  waiting_plan: {
    English: (v) => `${v.coordinator} has your message. This month's requests on the plan are used, so it waits until the account holder decides. Nothing else is needed from you.`,
    Hindi: (v) => `${v.coordinator} को आपका संदेश मिल गया है। इस महीने प्लान के अनुरोध पूरे हो गए हैं, इसलिए खाताधारक के फ़ैसले तक यह रुका रहेगा। आपको और कुछ नहीं करना है।`,
    Gujarati: (v) => `${v.coordinator} ને તમારો સંદેશ મળ્યો છે. આ મહિને પ્લાનની વિનંતીઓ પૂરી થઈ ગઈ છે, તેથી ખાતાધારક નક્કી કરે ત્યાં સુધી આ રાહ જોશે. તમારે બીજું કંઈ કરવાનું નથી.`,
    Marathi: (v) => `${v.coordinator} यांना तुमचा संदेश मिळाला आहे. या महिन्यातील प्लॅनच्या विनंत्या संपल्या आहेत, म्हणून खातेदार निर्णय घेईपर्यंत हे थांबेल. तुम्हाला आणखी काही करायचे नाही.`,
  },
  approved: {
    English: (v) => `Approved: ${v.ref}. You can undo this for 5 minutes by replying UNDO ${v.ref}. ${v.coordinator} will arrange it after that.`,
    Hindi: (v) => `मंज़ूर: ${v.ref}. 5 मिनट तक UNDO ${v.ref} लिखकर इसे वापस ले सकते हैं। उसके बाद ${v.coordinator} इसका इंतज़ाम करेंगे।`,
    Gujarati: (v) => `મંજૂર: ${v.ref}. 5 મિનિટ સુધી UNDO ${v.ref} લખીને પાછું લઈ શકો છો. પછી ${v.coordinator} ગોઠવણ કરશે.`,
    Marathi: (v) => `मंजूर: ${v.ref}. 5 मिनिटांपर्यंत UNDO ${v.ref} लिहून हे मागे घेऊ शकता. त्यानंतर ${v.coordinator} व्यवस्था करतील.`,
  },
  declined: {
    English: (v) => `Declined: ${v.ref}. ${v.coordinator} will come back to you.`,
    Hindi: (v) => `अस्वीकार: ${v.ref}. ${v.coordinator} आपसे फिर बात करेंगे।`,
    Gujarati: (v) => `નામંજૂર: ${v.ref}. ${v.coordinator} ફરી સંપર્ક કરશે.`,
    Marathi: (v) => `नामंजूर: ${v.ref}. ${v.coordinator} पुन्हा संपर्क करतील.`,
  },
  undone: {
    English: (v) => `Undone. ${v.ref} is waiting for your decision again.`,
    Hindi: (v) => `वापस लिया गया। ${v.ref} फिर से आपके फ़ैसले का इंतज़ार कर रहा है।`,
    Gujarati: (v) => `પાછું લીધું. ${v.ref} ફરી તમારા નિર્ણયની રાહ જુએ છે.`,
    Marathi: (v) => `मागे घेतले. ${v.ref} पुन्हा तुमच्या निर्णयाची वाट पाहत आहे.`,
  },
  approval_failed: {
    English: (v) => `We could not do that for ${v.ref}. It may already be decided, or the 5 minutes have passed. Please open the Ally app.`,
    Hindi: (v) => `${v.ref} के लिए यह नहीं हो सका। शायद फ़ैसला पहले ही हो चुका है, या 5 मिनट बीत गए। कृपया Ally ऐप खोलें।`,
    Gujarati: (v) => `${v.ref} માટે આ થઈ શક્યું નહીં. કદાચ નિર્ણય થઈ ગયો છે, અથવા 5 મિનિટ વીતી ગઈ. Ally એપ ખોલો.`,
    Marathi: (v) => `${v.ref} साठी हे होऊ शकले नाही. कदाचित निर्णय आधीच झाला आहे, किंवा 5 मिनिटे उलटली. कृपया Ally अ‍ॅप उघडा.`,
  },
  approval_not_owner: {
    English: () => "Only the account holder's linked number can approve or decline. Please use the Ally app.",
    Hindi: () => "केवल खाताधारक का जुड़ा हुआ नंबर ही मंज़ूर या अस्वीकार कर सकता है। कृपया Ally ऐप का उपयोग करें।",
    Gujarati: () => "માત્ર ખાતાધારકનો જોડાયેલો નંબર જ મંજૂર કે નામંજૂર કરી શકે. Ally એપ વાપરો.",
    Marathi: () => "फक्त खातेदाराचा जोडलेला नंबरच मंजूर किंवा नामंजूर करू शकतो. कृपया Ally अ‍ॅप वापरा.",
  },
  linked: {
    English: () => "This number is now linked to your Ally account.",
    Hindi: () => "यह नंबर अब आपके Ally खाते से जुड़ गया है।",
    Gujarati: () => "આ નંબર હવે તમારા Ally ખાતા સાથે જોડાયો છે.",
    Marathi: () => "हा नंबर आता तुमच्या Ally खात्याशी जोडला आहे.",
  },
  link_failed: {
    English: () => "That code did not work. Please make a new one in the Ally app.",
    Hindi: () => "यह कोड काम नहीं किया। कृपया Ally ऐप में नया कोड बनाएं।",
    Gujarati: () => "આ કોડ ચાલ્યો નહીં. Ally એપમાં નવો કોડ બનાવો.",
    Marathi: () => "हा कोड चालला नाही. कृपया Ally अ‍ॅपमध्ये नवीन कोड तयार करा.",
  },
};

const NO_FOOTER: ReplyKind[] = ["consent_prompt", "consent_declined", "stopped", "unknown", "emergency_unknown", "human", "linked", "link_failed", "approval_not_owner"];

export function replyText(kind: ReplyKind, lang: WaLang, v: Vars = {}): string {
  const vars = { name: v.name || "ji", coordinator: v.coordinator || "Your coordinator", ref: v.ref || "" };
  const body = R[kind][lang](vars);
  return NO_FOOTER.includes(kind) ? body : `${body} ${FOOT[lang](vars.coordinator)}`;
}

export const REPLY_KINDS = Object.keys(R) as ReplyKind[];

// ---------- Approved templates, for replies more than 24 hours after the person last wrote ----------
// Names, languages and variables must match what Meta approves. Texts are listed for submission in docs/whatsapp-templates.md.
export interface TemplateDef { name: string; category: "UTILITY"; vars: string[]; text: Record<WaLang, string> }

export const WA_TEMPLATES: TemplateDef[] = [
  {
    name: "ally_reply_waiting",
    category: "UTILITY",
    vars: ["name", "coordinator"],
    text: {
      English: "Namaste {{1}}. {{2}} from Ally has replied to your message. Reply here to read it. Type HUMAN to reach {{2}}.",
      Hindi: "नमस्ते {{1}}. Ally से {{2}} ने आपके संदेश का जवाब दिया है। पढ़ने के लिए यहां जवाब दें। {{2}} से बात करने के लिए HUMAN लिखें।",
      Gujarati: "નમસ્તે {{1}}. Ally તરફથી {{2}} એ તમારા સંદેશનો જવાબ આપ્યો છે. વાંચવા માટે અહીં જવાબ આપો. {{2}} સાથે વાત કરવા HUMAN લખો.",
      Marathi: "नमस्कार {{1}}. Ally कडून {{2}} यांनी तुमच्या संदेशाला उत्तर दिले आहे. वाचण्यासाठी इथे उत्तर द्या. {{2}} यांच्याशी बोलण्यासाठी HUMAN लिहा.",
    },
  },
  {
    name: "ally_request_update",
    category: "UTILITY",
    vars: ["name", "ref", "coordinator"],
    text: {
      English: "Namaste {{1}}. There is an update on your request {{2}}. {{3}} at Ally will tell you the next step when you reply here.",
      Hindi: "नमस्ते {{1}}. आपके अनुरोध {{2}} पर नई जानकारी है। यहां जवाब देने पर Ally के {{3}} अगला कदम बताएंगे।",
      Gujarati: "નમસ્તે {{1}}. તમારી વિનંતી {{2}} પર નવી માહિતી છે. અહીં જવાબ આપશો ત્યારે Ally ના {{3}} આગળનું પગલું જણાવશે.",
      Marathi: "नमस्कार {{1}}. तुमच्या विनंती {{2}} बद्दल नवीन माहिती आहे. इथे उत्तर दिल्यावर Ally चे {{3}} पुढची पायरी सांगतील.",
    },
  },
  {
    name: "ally_decision_needed",
    category: "UTILITY",
    vars: ["name", "ref"],
    text: {
      English: "Namaste {{1}}. Request {{2}} is waiting for your decision in the Ally app. Nothing happens until you decide.",
      Hindi: "नमस्ते {{1}}. अनुरोध {{2}} Ally ऐप में आपके फ़ैसले का इंतज़ार कर रहा है। आपके फ़ैसले तक कुछ नहीं होगा।",
      Gujarati: "નમસ્તે {{1}}. વિનંતી {{2}} Ally એપમાં તમારા નિર્ણયની રાહ જુએ છે. તમે નક્કી ન કરો ત્યાં સુધી કંઈ નહીં થાય.",
      Marathi: "नमस्कार {{1}}. विनंती {{2}} Ally अ‍ॅपमध्ये तुमच्या निर्णयाची वाट पाहत आहे. तुम्ही ठरवेपर्यंत काहीही होणार नाही.",
    },
  },
  {
    name: "ally_plan_limit",
    category: "UTILITY",
    vars: ["name", "plan"],
    text: {
      English: "Namaste {{1}}. A new WhatsApp request is waiting because this month's requests on your {{2}} plan are used. You can change plan in the Ally app, or it will start next month.",
      Hindi: "नमस्ते {{1}}. एक नया WhatsApp अनुरोध रुका है, क्योंकि आपके {{2}} प्लान के इस महीने के अनुरोध पूरे हो गए हैं। Ally ऐप में प्लान बदल सकते हैं, नहीं तो यह अगले महीने शुरू होगा।",
      Gujarati: "નમસ્તે {{1}}. એક નવી WhatsApp વિનંતી રાહ જુએ છે, કારણ કે તમારા {{2}} પ્લાનની આ મહિનાની વિનંતીઓ પૂરી થઈ છે. Ally એપમાં પ્લાન બદલી શકો, નહીં તો તે આવતા મહિને શરૂ થશે.",
      Marathi: "नमस्कार {{1}}. एक नवीन WhatsApp विनंती थांबली आहे, कारण तुमच्या {{2}} प्लॅनच्या या महिन्यातील विनंत्या संपल्या आहेत. Ally अ‍ॅपमध्ये प्लॅन बदलू शकता, नाहीतर ती पुढच्या महिन्यात सुरू होईल.",
    },
  },
];

export const templateByName = (name: string) => WA_TEMPLATES.find((t) => t.name === name);

export function renderTemplate(def: TemplateDef, lang: WaLang, values: string[]): string {
  return def.text[lang].replace(/\{\{(\d+)\}\}/g, (_, i) => values[Number(i) - 1] ?? "");
}
