/**
 * Starting points for "Kitob yozish": each template is a list of chapters
 * with a few guiding questions. The questions are written into the book as
 * light italic prompts the author replaces with their own text.
 */
import type { DocNode, WriteupDoc } from "./writeup-doc";
import { type Locale } from "@/i18n/config";
import { toCyrillic } from "./uz-cyrl";

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
    { title: "Sözboşi", prompts: ["Nega bu kitobni yozyapsiz? Uni kim öqişini xohlaysiz?"] },
    {
      title: "Bolaligim",
      prompts: [
        "Qayerda, qanday oilada tuğilgansiz?",
        "Eng birinçi eslab qolgan voqeangiz qaysi?",
        "Bolaligingizdagi uy, köça, hidlar va tovuşlar…",
      ],
    },
    {
      title: "Oilam",
      prompts: [
        "Ota-onangiz, bobo-buvilaringiz qanday insonlar edi?",
        "Oilangizdan örgangan eng muhim saboq?",
      ],
    },
    {
      title: "Maktab va öqiş yillari",
      prompts: ["Sizga ta’sir qilgan ustoz kim?", "Öşa yillardagi döstlaringiz va orzularingiz…"],
    },
    {
      title: "Iş va kasbim",
      prompts: [
        "Kasbingizni qanday tanladingiz?",
        "Faxrlanadigan işingiz va eng qiyin sinovingiz…",
      ],
    },
    {
      title: "Sinovlar va burilişlar",
      prompts: [
        "Hayotingizni özgartirgan qaror yoki voqea?",
        "Qiyin paytda sizni nima uşlab turdi?",
      ],
    },
    {
      title: "Hayotdan saboqlarim",
      prompts: [
        "Yoşlarga qanday maslahat bergan bölardingiz?",
        "Endi boşqaça qilgan bölardingiz nimani?",
      ],
    },
    { title: "Kelajakka maktub", prompts: ["Farzand va nevaralaringizga nima demoqçisiz?"] },
  ],
  family: [
    {
      title: "Oilamiz ildizlari",
      prompts: ["Ajdodlaringiz qayerdan bölgan? Qanday kasb qilişgan?"],
    },
    { title: "Bobo va buvilar", prompts: ["Ular haqida qanday hikoyalar eşitgansiz?"] },
    { title: "Ota-onam", prompts: ["Ular qanday tanişgan? Hayot yöllari qanday bölgan?"] },
    { title: "Oilaviy an’analar", prompts: ["Bayramlar, taomlar, urf-odatlar…"] },
    { title: "Unutilmas voqealar", prompts: ["Oila davrasida eng köp aytiladigan hikoya qaysi?"] },
    {
      title: "Avlodlarga meros",
      prompts: ["Oilangiz qadriyatlaridan nimani saqlab qoliş kerak?"],
    },
  ],
  knowledge: [
    { title: "Kiriş", prompts: ["Bu kitob kim uçun va qanday muammoni hal qiladi?"] },
    { title: "Asosiy tuşunçalar", prompts: ["Öquvçi avval nimani bilişi kerak?"] },
    { title: "Amaliy qism", prompts: ["Bosqiçma-bosqiç qöllanma, misollar…"] },
    {
      title: "Köp uçraydigan xatolar",
      prompts: ["Qayerda adaşişadi va qanday oldini oliş mumkin?"],
    },
    { title: "Xulosa", prompts: ["Eng muhim 5 ta fikr…"] },
  ],
  stories: [
    {
      title: "1-hikoya",
      prompts: ["Qahramon kim? U nimani xohlaydi va unga nima tösqinlik qiladi?"],
    },
    { title: "2-hikoya", prompts: ["Voqea qayerda va qaçon bölib ötadi?"] },
    { title: "3-hikoya", prompts: ["Hikoyaning yakuni öquvçida qanday his qoldirsin?"] },
  ],
  travel: [
    { title: "Yölga çiqiş", prompts: ["Qayerga, nega va kim bilan bordingiz?"] },
    { title: "Birinçi taassurotlar", prompts: ["Odamlar, köçalar, taomlar…"] },
    { title: "Unutilmas kunlar", prompts: ["Eng yorqin lahzangiz qaysi?"] },
    {
      title: "Safar menga nima örgatdi",
      prompts: ["Qaytgaç nimani boşqaça köra boşladingiz?"],
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

const RU: Record<BookTemplate, Chapter[]> = {
  memoir: [
    { title: "Предисловие", prompts: ["Зачем вы пишете эту книгу? Кто, по-вашему, её прочтёт?"] },
    {
      title: "Моё детство",
      prompts: [
        "Где и в какой семье вы родились?",
        "Какое ваше самое первое воспоминание?",
        "Дом, улица, запахи и звуки вашего детства…",
      ],
    },
    {
      title: "Моя семья",
      prompts: [
        "Какими людьми были ваши родители, бабушки и дедушки?",
        "Самый важный урок, который дала вам семья?",
      ],
    },
    {
      title: "Школьные годы",
      prompts: ["Какой учитель повлиял на вас?", "Ваши друзья и мечты тех лет…"],
    },
    {
      title: "Работа и профессия",
      prompts: ["Как вы выбрали своё дело?", "Чем вы гордитесь и что было труднее всего…"],
    },
    {
      title: "Испытания и повороты",
      prompts: [
        "Решение или событие, изменившее вашу жизнь?",
        "Что поддерживало вас в трудное время?",
      ],
    },
    {
      title: "Уроки жизни",
      prompts: ["Что бы вы посоветовали молодым?", "Что бы вы сделали иначе сейчас?"],
    },
    {
      title: "Письмо в будущее",
      prompts: ["Что вы хотите сказать детям и внукам?"],
    },
  ],
  family: [
    { title: "Наши корни", prompts: ["Откуда родом ваши предки? Чем они занимались?"] },
    { title: "Бабушки и дедушки", prompts: ["Какие истории вы о них слышали?"] },
    { title: "Мои родители", prompts: ["Как они познакомились? Какой была их жизнь?"] },
    { title: "Семейные традиции", prompts: ["Праздники, блюда, обычаи…"] },
    {
      title: "Незабываемые моменты",
      prompts: ["Какую историю чаще всего рассказывают на семейных встречах?"],
    },
    { title: "Наследие для потомков", prompts: ["Какие семейные ценности важно сохранить?"] },
  ],
  knowledge: [
    { title: "Введение", prompts: ["Для кого эта книга и какую задачу она решает?"] },
    { title: "Главные понятия", prompts: ["Что читателю нужно знать в первую очередь?"] },
    { title: "На практике", prompts: ["Пошаговое руководство, примеры…"] },
    { title: "Частые ошибки", prompts: ["Где люди ошибаются и как этого избежать?"] },
    { title: "Заключение", prompts: ["5 самых важных мыслей…"] },
  ],
  stories: [
    {
      title: "Рассказ 1",
      prompts: ["Кто герой? Чего он хочет и что ему мешает?"],
    },
    { title: "Рассказ 2", prompts: ["Где и когда это происходит?"] },
    { title: "Рассказ 3", prompts: ["Какое чувство должен оставить финал?"] },
  ],
  travel: [
    { title: "В путь", prompts: ["Куда, зачем и с кем вы поехали?"] },
    { title: "Первые впечатления", prompts: ["Люди, улицы, еда…"] },
    { title: "Незабываемые дни", prompts: ["Самый яркий момент?"] },
    {
      title: "Чему научило путешествие",
      prompts: ["Что вы видите иначе после возвращения?"],
    },
  ],
  blank: [{ title: "Глава 1", prompts: [] }],
};

/** The templates in a language (Uzbek Cyrillic is made from the Latin text). */
function chaptersFor(locale: Locale): Record<BookTemplate, Chapter[]> {
  if (locale !== "uz-Cyrl") return { uz: UZ, ru: RU, en: EN }[locale];
  return Object.fromEntries(
    Object.entries(UZ).map(([k, list]) => [
      k,
      list.map((c) => ({ title: toCyrillic(c.title), prompts: c.prompts.map(toCyrillic) })),
    ]),
  ) as Record<BookTemplate, Chapter[]>;
}

/** The starting document of a new book (chapters + italic guiding prompts). */
export function templateDoc(template: BookTemplate, locale: Locale): WriteupDoc {
  const chapters = chaptersFor(locale)[template];
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

export function templateChapters(template: BookTemplate, locale: Locale) {
  return chaptersFor(locale)[template].map((c) => c.title);
}
