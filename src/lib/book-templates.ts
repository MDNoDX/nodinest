/**
 * Starting points for "Kitob yozish": each template is a list of chapters
 * with a few guiding questions. The questions are written into the book as
 * light italic prompts the author replaces with their own text.
 */
import type { DocNode, WriteupDoc } from "./writeup-doc";

export const BOOK_TEMPLATES = [
  "memoir",
  "family",
  "knowledge",
  "stories",
  "travel",
  "blank",
] as const;
export type BookTemplate = (typeof BOOK_TEMPLATES)[number];

type Chapter = { title: string; prompts: string[] };

const UZ: Record<BookTemplate, Chapter[]> = {
  memoir: [
    { title: "So‘zboshi", prompts: ["Nega bu kitobni yozyapsiz? Uni kim o‘qishini xohlaysiz?"] },
    {
      title: "Bolaligim",
      prompts: [
        "Qayerda, qanday oilada tug‘ilgansiz?",
        "Eng birinchi eslab qolgan voqeangiz qaysi?",
        "Bolaligingizdagi uy, ko‘cha, hidlar va tovushlar…",
      ],
    },
    {
      title: "Oilam",
      prompts: [
        "Ota-onangiz, bobo-buvilaringiz qanday insonlar edi?",
        "Oilangizdan o‘rgangan eng muhim saboq?",
      ],
    },
    {
      title: "Maktab va o‘qish yillari",
      prompts: [
        "Sizga ta’sir qilgan ustoz kim?",
        "O‘sha yillardagi do‘stlaringiz va orzularingiz…",
      ],
    },
    {
      title: "Ish va kasbim",
      prompts: [
        "Kasbingizni qanday tanladingiz?",
        "Faxrlanadigan ishingiz va eng qiyin sinovingiz…",
      ],
    },
    {
      title: "Sinovlar va burilishlar",
      prompts: [
        "Hayotingizni o‘zgartirgan qaror yoki voqea?",
        "Qiyin paytda sizni nima ushlab turdi?",
      ],
    },
    {
      title: "Hayotdan saboqlarim",
      prompts: [
        "Yoshlarga qanday maslahat bergan bo‘lardingiz?",
        "Endi boshqacha qilgan bo‘lardingiz nimani?",
      ],
    },
    { title: "Kelajakka maktub", prompts: ["Farzand va nevaralaringizga nima demoqchisiz?"] },
  ],
  family: [
    {
      title: "Oilamiz ildizlari",
      prompts: ["Ajdodlaringiz qayerdan bo‘lgan? Qanday kasb qilishgan?"],
    },
    { title: "Bobo va buvilar", prompts: ["Ular haqida qanday hikoyalar eshitgansiz?"] },
    { title: "Ota-onam", prompts: ["Ular qanday tanishgan? Hayot yo‘llari qanday bo‘lgan?"] },
    { title: "Oilaviy an’analar", prompts: ["Bayramlar, taomlar, urf-odatlar…"] },
    { title: "Unutilmas voqealar", prompts: ["Oila davrasida eng ko‘p aytiladigan hikoya qaysi?"] },
    {
      title: "Avlodlarga meros",
      prompts: ["Oilangiz qadriyatlaridan nimani saqlab qolish kerak?"],
    },
  ],
  knowledge: [
    { title: "Kirish", prompts: ["Bu kitob kim uchun va qanday muammoni hal qiladi?"] },
    { title: "Asosiy tushunchalar", prompts: ["O‘quvchi avval nimani bilishi kerak?"] },
    { title: "Amaliy qism", prompts: ["Bosqichma-bosqich qo‘llanma, misollar…"] },
    {
      title: "Ko‘p uchraydigan xatolar",
      prompts: ["Qayerda adashishadi va qanday oldini olish mumkin?"],
    },
    { title: "Xulosa", prompts: ["Eng muhim 5 ta fikr…"] },
  ],
  stories: [
    {
      title: "1-hikoya",
      prompts: ["Qahramon kim? U nimani xohlaydi va unga nima to‘sqinlik qiladi?"],
    },
    { title: "2-hikoya", prompts: ["Voqea qayerda va qachon bo‘lib o‘tadi?"] },
    { title: "3-hikoya", prompts: ["Hikoyaning yakuni o‘quvchida qanday his qoldirsin?"] },
  ],
  travel: [
    { title: "Yo‘lga chiqish", prompts: ["Qayerga, nega va kim bilan bordingiz?"] },
    { title: "Birinchi taassurotlar", prompts: ["Odamlar, ko‘chalar, taomlar…"] },
    { title: "Unutilmas kunlar", prompts: ["Eng yorqin lahzangiz qaysi?"] },
    {
      title: "Safar menga nima o‘rgatdi",
      prompts: ["Qaytgach nimani boshqacha ko‘ra boshladingiz?"],
    },
  ],
  blank: [{ title: "1-bob", prompts: [] }],
};

const EN: Record<BookTemplate, Chapter[]> = {
  memoir: [
    { title: "Preface", prompts: ["Why are you writing this book? Who do you want to read it?"] },
    {
      title: "My childhood",
      prompts: [
        "Where and into what family were you born?",
        "What is your very first memory?",
        "The house, street, smells and sounds of your childhood…",
      ],
    },
    {
      title: "My family",
      prompts: [
        "What were your parents and grandparents like?",
        "The most important lesson from your family?",
      ],
    },
    {
      title: "School years",
      prompts: ["Which teacher shaped you?", "Your friends and dreams back then…"],
    },
    {
      title: "Work and career",
      prompts: ["How did you choose your work?", "Proudest moment and hardest test…"],
    },
    {
      title: "Trials and turning points",
      prompts: ["A decision or event that changed your life?", "What held you up in hard times?"],
    },
    {
      title: "Lessons from life",
      prompts: ["What would you advise young people?", "What would you do differently now?"],
    },
    {
      title: "A letter to the future",
      prompts: ["What do you want to tell your children and grandchildren?"],
    },
  ],
  family: [
    { title: "Our roots", prompts: ["Where did your ancestors come from? What did they do?"] },
    { title: "Grandparents", prompts: ["What stories have you heard about them?"] },
    { title: "My parents", prompts: ["How did they meet? What were their lives like?"] },
    { title: "Family traditions", prompts: ["Holidays, dishes, customs…"] },
    {
      title: "Unforgettable moments",
      prompts: ["The story told most often at family gatherings?"],
    },
    { title: "A legacy for the next generations", prompts: ["Which family values must be kept?"] },
  ],
  knowledge: [
    { title: "Introduction", prompts: ["Who is this book for and what problem does it solve?"] },
    { title: "Key ideas", prompts: ["What must the reader know first?"] },
    { title: "In practice", prompts: ["Step-by-step guide, examples…"] },
    { title: "Common mistakes", prompts: ["Where do people go wrong and how to avoid it?"] },
    { title: "Conclusion", prompts: ["The 5 most important points…"] },
  ],
  stories: [
    {
      title: "Story 1",
      prompts: ["Who is the hero? What do they want and what stands in the way?"],
    },
    { title: "Story 2", prompts: ["Where and when does it happen?"] },
    { title: "Story 3", prompts: ["What feeling should the ending leave?"] },
  ],
  travel: [
    { title: "Setting off", prompts: ["Where, why and with whom did you go?"] },
    { title: "First impressions", prompts: ["People, streets, food…"] },
    { title: "Unforgettable days", prompts: ["Your brightest moment?"] },
    {
      title: "What the journey taught me",
      prompts: ["What do you see differently since you came back?"],
    },
  ],
  blank: [{ title: "Chapter 1", prompts: [] }],
};

/** The starting document of a new book (chapters + italic guiding prompts). */
export function templateDoc(template: BookTemplate, locale: "uz" | "en"): WriteupDoc {
  const chapters = (locale === "en" ? EN : UZ)[template];
  const content: DocNode[] = [];
  for (const c of chapters) {
    content.push({
      type: "heading",
      attrs: { level: 2 },
      content: [{ type: "text", text: c.title }],
    });
    for (const p of c.prompts)
      content.push({
        type: "paragraph",
        content: [{ type: "text", text: p, marks: [{ type: "italic" }] }],
      });
    if (!c.prompts.length) content.push({ type: "paragraph" });
  }
  return { type: "doc", content };
}

export function templateChapters(template: BookTemplate, locale: "uz" | "en") {
  return (locale === "en" ? EN : UZ)[template].map((c) => c.title);
}
