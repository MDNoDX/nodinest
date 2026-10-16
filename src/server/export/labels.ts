/** Strings and formatting for exported files (uz / en). */
import { formatPartialDate } from "@/lib/dates";
import type { ExportItem } from "./data";

export type Loc = "uz" | "en";

const L = {
  uz: {
    myWriteups: "Taqrizlarim",
    writeup: "Taqriz",
    contents: "Mundarija",
    books: (n: number) => `${n} ta manba`,
    words: (n: number) => `${n.toLocaleString("uz-UZ")} so‘z`,
    exportedOn: "Yuklab olingan sana",
    original: "Yozilgan",
    edition: "Nashr",
    release: "Chiqqan",
    publisher: "Nashriyot",
    pages: "Sahifalar",
    duration: "Davomiyligi",
    where: "Qayerda",
    rating: "Baho",
    started: "Boshladim",
    finished: "Tugatdim",
    opinion: "Qisqa fikr",
    notes: "Qaydlar va iqtiboslar",
    page: "bet",
    noText: "Taqriz hali yozilmagan.",
    audio: "Audio yozuv",
    file: "Fayl",
    image: "Rasm",
    status: {
      planned: "Rejada",
      in_progress: "Jarayonda",
      completed: "Tugatilgan",
      paused: "To‘xtatilgan",
    } as Record<string, string>,
    types: {
      book: "Kitob",
      course: "Kurs",
      video: "Video",
      lecture: "Ma’ruza",
      interview: "Suhbat",
      article: "Maqola",
      podcast: "Podkast",
      other: "Boshqa",
    } as Record<string, string>,
    minutes: (m: number) => (m >= 60 ? `${Math.floor(m / 60)} soat ${m % 60} daq.` : `${m} daq.`),
  },
  en: {
    myWriteups: "My write-ups",
    writeup: "Write-up",
    contents: "Contents",
    books: (n: number) => `${n} ${n === 1 ? "title" : "titles"}`,
    words: (n: number) => `${n.toLocaleString("en-US")} words`,
    exportedOn: "Exported on",
    original: "Written",
    edition: "Edition",
    release: "Released",
    publisher: "Publisher",
    pages: "Pages",
    duration: "Duration",
    where: "Where",
    rating: "Rating",
    started: "Started",
    finished: "Finished",
    opinion: "In short",
    notes: "Notes and quotes",
    page: "p.",
    noText: "No write-up yet.",
    audio: "Audio recording",
    file: "File",
    image: "Image",
    status: {
      planned: "Planned",
      in_progress: "In progress",
      completed: "Finished",
      paused: "Paused",
    } as Record<string, string>,
    types: {
      book: "Book",
      course: "Course",
      video: "Video",
      lecture: "Lecture",
      interview: "Interview",
      article: "Article",
      podcast: "Podcast",
      other: "Other",
    } as Record<string, string>,
    minutes: (m: number) => (m >= 60 ? `${Math.floor(m / 60)} h ${m % 60} min` : `${m} min`),
  },
};
export const labels = (loc: Loc) => L[loc];
export type Labels = (typeof L)["uz"];

export function fmtWhen(d: Date | null, loc: Loc, timeZone: string) {
  if (!d) return null;
  return new Intl.DateTimeFormat(loc === "uz" ? "uz-Latn-UZ" : "en-GB", {
    dateStyle: "long",
    timeStyle: "short",
    timeZone,
  }).format(d);
}

/** Label/value pairs shown under the title (only facts that exist). */
export function facts(it: ExportItem, loc: Loc): [string, string][] {
  const t = labels(loc);
  const book = it.type === "book";
  const out: [string, string | null][] = book
    ? [
        [t.original, it.originalDate ? formatPartialDate(it.originalDate, loc) : null],
        [t.edition, it.publicationDate ? formatPartialDate(it.publicationDate, loc) : null],
        [t.publisher, it.publisher],
        [t.pages, it.pageCount ? String(it.pageCount) : null],
      ]
    : [
        [t.release, it.publicationDate ? formatPartialDate(it.publicationDate, loc) : null],
        [t.duration, it.durationSeconds ? t.minutes(Math.round(it.durationSeconds / 60)) : null],
        [t.where, it.where],
      ];
  return out.filter((f): f is [string, string] => !!f[1]);
}

/** Safe, readable file name: "Taqriz — Xamsa.pdf". */
export function fileName(base: string, ext: string) {
  const clean = base
    .replace(/[\\/:*?"<>|\u0000-\u001f]+/g, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 120);
  return `${clean || "NodiNest"}.${ext}`;
}
