// Writes the plan icons (colour, Fluent Emoji Flat, MIT) to public/plan-icons/.
// Run after changing the list: node scripts/make-plan-icons.mjs
import { mkdirSync, readFileSync, rmSync, writeFileSync } from "node:fs";

const ICONS = {
  mosque: "mosque",
  dua: "palms-up-together",
  beads: "prayer-beads",
  quran: "green-book",
  book: "open-book",
  books: "books",
  grad: "graduation-cap",
  notebook: "spiral-notepad",
  pen: "writing-hand",
  memo: "memo",
  brain: "brain",
  bulb: "light-bulb",
  languages: "speaking-head",
  globe: "globe-showing-asia-australia",
  sound: "speaker-high-volume",
  mic: "studio-microphone",
  headphones: "headphone",
  music: "musical-notes",
  video: "clapper-board",
  camera: "camera",
  sunrise: "sunrise",
  sun: "sun",
  moon: "crescent-moon",
  alarm: "alarm-clock",
  bed: "bed",
  shower: "shower",
  dumbbell: "flexed-biceps",
  run: "person-running",
  walk: "person-walking",
  bike: "bicycle",
  swim: "person-swimming",
  football: "soccer-ball",
  yoga: "person-in-lotus-position",
  water: "droplet",
  doctor: "stethoscope",
  pill: "pill",
  salad: "green-salad",
  apple: "red-apple",
  coffee: "hot-beverage",
  food: "fork-and-knife-with-plate",
  flask: "test-tube",
  calc: "abacus",
  code: "laptop",
  briefcase: "briefcase",
  target: "bullseye",
  timer: "stopwatch",
  sparkles: "sparkles",
  users: "busts-in-silhouette",
  child: "child",
  phone: "mobile-phone",
  chat: "speech-balloon",
  home: "house",
  leaf: "herb",
  tree: "evergreen-tree",
  flower: "tulip",
  sprout: "seedling",
  palette: "artist-palette",
  game: "video-game",
  wallet: "money-bag",
  coin: "coin",
  car: "automobile",
  rest: "couch-and-lamp",
  star: "star",
  broom: "broom",
  cart: "shopping-cart",
  plane: "airplane",
  gift: "wrapped-gift",
  calendar: "spiral-calendar",
  tooth: "tooth",
  pin: "pushpin",
};

const {
  icons,
  width = 32,
  height = 32,
} = JSON.parse(readFileSync("node_modules/@iconify-json/fluent-emoji-flat/icons.json", "utf8"));
rmSync("public/plan-icons", { recursive: true, force: true });
mkdirSync("public/plan-icons");
let total = 0;
for (const [key, name] of Object.entries(ICONS)) {
  const icon = icons[name];
  if (!icon) throw new Error(`no icon: ${name}`);
  const svg = `<svg xmlns="http://www.w3.org/2000/svg" viewBox="0 0 ${icon.width ?? width} ${icon.height ?? height}">${icon.body}</svg>`;
  total += svg.length;
  writeFileSync(`public/plan-icons/${key}.svg`, svg);
}
console.log(`${Object.keys(ICONS).length} icons, ${Math.round(total / 1024)} KB`);
