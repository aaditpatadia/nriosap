import { deskChat, SUPPORT_EMAIL, supportMail } from "./contact";
import { understandRequest } from "./request-engine";

/**
 * What Ally can do and where to do it, in the assistant's own voice. Every answer comes with buttons that go straight there.
 * Nothing here reads anyone's records. It only knows the product.
 */
export interface AssistantAction { label: string; href: string; external?: boolean }
export interface KbAnswer { kind: "answer" | "refused"; text: string; actions: AssistantAction[] }

/** Ways to reach a person. The email button shows only when a support address has been set. */
export function contactActions(subject = "A question about Ally"): AssistantAction[] {
  const mail = supportMail(subject);
  return [{ label: "Message us on WhatsApp", href: deskChat("Hi Ally, I have a question."), external: true }, ...(mail ? [{ label: "Email us", href: mail, external: true }] : [])];
}
const reach = () => (SUPPORT_EMAIL ? "message us on WhatsApp or email us" : "message us on WhatsApp");

interface Entry { id: string; test: RegExp; build: (base: string) => Omit<KbAnswer, "kind"> & { kind?: KbAnswer["kind"] } }
const req = (base: string, text?: string) => `${base}/requests/new${text ? `?text=${encodeURIComponent(text)}` : ""}`;

const ENTRIES: Entry[] = [
  {
    id: "emergency",
    test: /\b(emergency|ambulance|accident|fell down|heart attack|chest pain|fire|police)\b/,
    build: () => ({ kind: "answer", text: "If someone is in danger, contact your local emergency services first. Ally is not an emergency service. Once everyone is safe, tell us and we will help with what comes next.", actions: contactActions("Urgent") }),
  },
  {
    id: "not_offered",
    test: /\b(loans?|mortgage|invest\w*|stocks?|shares?|mutual funds?|crypto\w*|bitcoin|trading|lottery|gambl\w*|betting|send money|wire money|transfer money)\b/,
    build: () => ({ kind: "refused", text: `No, that is not something we do. We do not handle loans, investments or moving money for you. If you are not sure, ${reach()} and we will point you the right way.`, actions: contactActions("Something you do not offer") }),
  },
  {
    id: "other_city",
    test: /\b(delhi|new delhi|bengaluru|bangalore|hyderabad|ahmedabad|chennai|kolkata|pune|surat|jaipur|lucknow|nagpur|indore|bhopal|vadodara|baroda|rajkot|noida|gurugram|gurgaon|goa|kochi|nashik|thane|navi mumbai)\b/,
    build: (base) => ({ kind: "refused", text: "We only work in Mumbai for now, so we cannot take that on yet. We are sorry. Leave your details and we will write to you when we open in your city.", actions: [{ label: "Join the waitlist", href: "/#waitlist" }, ...contactActions("Please open in my city"), { label: "See what we do in Mumbai", href: req(base) }] }),
  },
  {
    id: "capabilities",
    test: /\b(what (can|do|all) (you|ally)|what is ally|who are you|how can you help|what services|your services|what do you offer|what (else )?can i (ask|do)|help me|^help$)\b/,
    build: (base) => ({
      text: "I can help you get things done in Mumbai, and find things in your own records. Your coordinator and our riders can: check a flat or property, arrange repairs and cleaning, collect and drop papers and parcels, get certified copies and paperwork, keep track of bills and renewals, help with insurance paperwork, and run errands for your family. We are in Mumbai only for now. Tell me what you need, or pick one below.",
      actions: [{ label: "Start a request", href: req(base) }, { label: "Send a voice note instead", href: `${base}/requests/new#voice` }, { label: "Upload a document", href: `${base}/documents` }, ...contactActions()],
    }),
  },
  {
    id: "voice",
    test: /\b(voice (note|message|record\w*)|record (my|a|the)|speak|talk instead|say it|dictate|rather talk|don'?t want to (type|click)|no typing)\b/,
    build: (base) => ({
      text: "Yes, you can send just a voice note. Press New request, then Record my voice note, and say it in English, Hindi, Gujarati or Marathi. To get it done fastest, cover: what you need, where in Mumbai (building, area and PIN code), who we meet and their phone number, the day and time that suits you, how soon, how long you think it will take, what we carry, and anything special like a gate or a floor. Your coordinator listens and sets everything up. You approve the price before anything starts.",
      actions: [{ label: "Send a voice note", href: `${base}/requests/new#voice` }, { label: "Type it instead", href: req(base) }],
    }),
  },
  {
    id: "delivery",
    test: /\b(pick ?up|drop ?off|drop (it|this|that|a|the)|deliver\w*|courier|parcel|collect (a|the|my|some)|bring (it|me|a|the)|errand|send (a|the|my) (file|document|parcel|package))\b/,
    build: (base) => ({
      text: "Yes, in Mumbai. A person collects it and drops it where you say. Tell us both places with PIN codes, who we meet at each, the day and time that suits you, how long you think it will take, and what we are carrying. You see the price before anything starts, and you pay in full before the work begins.",
      actions: [{ label: "Start a pick up and drop", href: req(base, "Please pick up a file from ") }, { label: "Send a voice note", href: `${base}/requests/new#voice` }],
    }),
  },
  {
    id: "repairs",
    test: /\b(plumber|plumbing|leak\w*|electrician|repair\w*|clean\w*|cleaner|paint\w*|geyser|ac\b|air conditioner|pest|carpenter|maintenance|fix (the|my|a))\b/,
    build: (base) => ({
      text: "We can arrange that in Mumbai. We find a local provider, send you a written quotation, and nothing starts until you approve it. Tell us what is wrong, where, and when someone can be there.",
      actions: [{ label: "Arrange a repair", href: req(base, "Please arrange someone to fix a problem at my flat in Mumbai. ") }, { label: "Send a voice note", href: `${base}/requests/new#voice` }],
    }),
  },
  {
    id: "property",
    test: /\b(propert(y|ies)|inspect\w*|tenant|rent\b|rental|flat|apartment|house|society)\b/,
    build: (base) => ({
      text: "For a property in Mumbai we can arrange a check, speak to a tenant or the society, and send you a written report with photos. Add the property first so everything stays in one place, then make a request.",
      actions: [{ label: "Ask for a property check", href: req(base, "Please arrange someone to check my property in Mumbai. ") }, { label: "Add or see properties", href: `${base}/properties` }],
    }),
  },
  {
    id: "documents",
    test: /\b(upload|vault|scan|store (a|my|the)|documents?|papers?|passport|certificate|certified cop(y|ies)|attest\w*|affidavit|aadhaar|pan card)\b/,
    build: (base) => ({
      text: "Add papers on the Documents page. Choose the file, pick a category, and set an expiry date if it has one, and we will remind you before it runs out. For a certified copy or other paperwork, make a request and we will tell you what is needed.",
      actions: [{ label: "Open Documents", href: `${base}/documents` }, { label: "Ask for paperwork", href: req(base, "I need help getting a copy of ") }],
    }),
  },
  {
    id: "bills",
    test: /\b(bills?|renewals?|due dates?|deadlines?|remind\w*|property tax|electricity|water bill|premium)\b/,
    build: (base) => ({
      text: "Add bills, renewals and important dates under Bills and dates, and I will show them in order of what is due first. We can also act on a bill: make a request, approve the cost, and the desk handles it. Nothing is paid without your approval.",
      actions: [{ label: "Open Bills and dates", href: `${base}/bills` }, { label: "Ask us to handle a bill", href: req(base, "Please help me with a bill: ") }],
    }),
  },
  {
    id: "insurance",
    test: /\b(insurance|insurer|claim|cashless|policy|hospital|discharge)\b/,
    build: (base) => ({
      text: "We organise the paperwork and follow up with the insurer or the hospital desk. We do not give medical advice. Upload the policy and the papers you have, then make a request and tell us what happened.",
      actions: [{ label: "Open claims", href: `${base}/claims` }, { label: "Start an insurance request", href: req(base, "Please help with an insurance matter: ") }, { label: "Upload a document", href: `${base}/documents` }],
    }),
  },
  {
    id: "family",
    test: /\b(family members?|add (a |my )?(mother|father|mum|mom|dad|parent|sister|brother|relative|someone)|invite|my parents?|contacts?)\b/,
    build: (base) => ({
      text: "Add the people involved under Family and details. You choose what each person can see, down to a single document. A parent does not need the app. We can reach them on WhatsApp in their own language.",
      actions: [{ label: "Open Family and details", href: `${base}/details` }, { label: "Add a family member", href: `${base}/people` }],
    }),
  },
  {
    id: "approvals",
    test: /\b(approv\w*|decide|undo|decision)\b/,
    build: (base) => ({ text: "Quotations and costs wait for you under Approvals. Nothing is paid, filed or sent until you say yes, and you have 5 minutes to undo.", actions: [{ label: "Open Approvals", href: `${base}/approvals` }] }),
  },
  {
    id: "pricing",
    test: /\b(price|prices|pricing|cost|costs|charge[sd]?|fee|fees|rate|rates|how much|quote|quotation|expensive|cheap)\b/,
    build: (base) => ({
      text: "Every request gets a written quotation before anything happens. The price depends on where the work is, how long it takes including travelling, and how soon you need it. Provider costs are passed on at cost. You see the total in rupees and in dollars, you approve it, and you pay in full before the work starts.",
      actions: [{ label: "See my requests and quotations", href: `${base}/requests` }, { label: "Start a request", href: req(base) }],
    }),
  },
  {
    id: "payment",
    test: /\b(pay\b|paying|payment|advance|refund|invoice|receipt|card|upi|currency|dollars?|usd|gbp|pounds?)\b/,
    build: (base) => ({
      text: "After you approve a quotation, your coordinator sends a secure payment link. You pay the full amount before the work starts. Nothing is shown as paid until the payment is confirmed. For a refund or a problem with a payment, talk to your coordinator.",
      actions: [{ label: "See approvals", href: `${base}/approvals` }, ...contactActions("A payment question")],
    }),
  },
  {
    id: "cancel_request",
    test: /\b(cancel\w* (a |my |the )?(request|work|task|order)|stop (a |my |the )?(request|work))\b/,
    build: (base) => ({
      text: "Open the request and press Cancel request. If work has already started or you have paid, talk to your coordinator about what can be done.",
      actions: [{ label: "Open my requests", href: `${base}/requests` }, ...contactActions("Cancel a request")],
    }),
  },
  {
    id: "privacy",
    test: /\b(privacy|delete (my|the|everything|account|data)|export|download (my )?data|consent|gdpr|my data|who (opened|saw|looked))\b/,
    build: (base) => ({
      text: "Your data is yours. On Privacy and your data you can see what you agreed to, who opened what, take a copy of everything, or delete it all.",
      actions: [{ label: "Open Privacy and data", href: `${base}/privacy` }],
    }),
  },
  {
    id: "plan",
    test: /\b(subscription|plan|plans|billing|upgrade|downgrade|lite|family plan)\b/,
    build: (base) => ({ text: "Your plan, what it includes and your subscription are under Plan and billing.", actions: [{ label: "Open Plan and billing", href: `${base}/billing` }] }),
  },
  {
    id: "whatsapp",
    test: /\b(whatsapp|link (my )?(number|phone))\b/,
    build: (base) => ({
      text: "You can message us on WhatsApp any time. To approve quotations by replying on WhatsApp, link your number under Settings: press Link my WhatsApp number and send the code you are shown.",
      actions: [...contactActions(), { label: "Open Settings", href: `${base}/settings` }],
    }),
  },
  {
    id: "report",
    test: /\b(report|monthly summary|summary pdf)\b/,
    build: (base) => ({ text: "Each month there is a report of what was done, what is in progress and what waits on you. You can download it as a PDF.", actions: [{ label: "Open this month's report", href: `${base}/report` }] }),
  },
  {
    id: "settings",
    test: /\b(settings|notifications?|language|country|city|profile|sign out|log ?out|time ?zone)\b/,
    build: (base) => ({ text: "Your country, cities, language and how we reach you are under Family and details. Your account and display options are under Settings.", actions: [{ label: "Family and details", href: `${base}/details` }, { label: "Settings", href: `${base}/settings` }] }),
  },
  {
    id: "contact",
    test: /\b(talk to|speak to|call|contact|reach|human|person|support|someone|coordinator|email|mail)\b/,
    build: () => ({ text: `You can ${reach()} any time. A named coordinator looks after your account.`, actions: contactActions("I need to talk to a person") }),
  },
  {
    id: "start",
    test: /\b((how|where) (do|can|should) i (start|begin|make|raise|send|create|place|get|book|submit|ask)|start a request|new request|make a request|get (something|this|it) done|book)\b/,
    build: (base) => ({
      text: "Press New request and say what you need handled in Mumbai. You can type it, or send a voice note. You check everything before it is sent, and nothing costs anything until you approve a quotation.",
      actions: [{ label: "Start a request", href: req(base) }, { label: "Send a voice note", href: `${base}/requests/new#voice` }],
    }),
  },
  {
    id: "hello",
    test: /^(hi|hello|hey|namaste|good (morning|afternoon|evening)|thanks|thank you)\b/,
    build: (base) => ({ text: "Hello. Tell me what you need, or pick something below.", actions: [{ label: "Start a request", href: req(base) }, { label: "Send a voice note", href: `${base}/requests/new#voice` }, { label: "Upload a document", href: `${base}/documents` }] }),
  },
];

/** True for questions about how to do something, which should be answered from what we offer before we search records. */
export const isHowTo = (q: string) => /^(how|where|can|could|do you|does|is it possible|is there|what (can|do|services|all)|who|i want|i need|i would like|i'd like|please|add|upload|book|get|start|show me how|help|are you|will you|would you)\b/i.test(q.trim());

export function answerFromKb(question: string, base: string): KbAnswer | null {
  const q = question.trim().toLowerCase();
  // A city we do not serve beats everything else, but only when the question is about doing something there.
  const place = understandRequest(question).location;
  if (place && !/^(mumbai|bombay)$/i.test(place) && /\b(need|want|can|do|get|arrange|visit|check|send|help|service|work)\b/.test(q)) {
    const e = ENTRIES.find((x) => x.id === "other_city")!;
    return { kind: "refused", ...(e.build(base) as Omit<KbAnswer, "kind">) } as KbAnswer;
  }
  for (const e of ENTRIES) {
    if (e.test.test(q)) {
      const b = e.build(base);
      return { kind: b.kind ?? "answer", text: b.text, actions: b.actions };
    }
  }
  return null;
}

/** Shown on an empty chat and after an answer we could not give. */
export const STARTERS: { group: string; items: string[] }[] = [
  { group: "Get something done", items: ["What can you do?", "I need a delivery in Mumbai", "How do I send a voice note instead of typing?", "How do I get a property checked?"] },
  { group: "Find your way around", items: ["How do I upload a document?", "How does pricing work?", "How do I talk to a person?", "How do I take a copy of my data?"] },
  { group: "In your records", items: ["What needs my attention this week?", "Which bills are due this month?", "Which documents are expiring?"] },
];
