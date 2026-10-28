/**
 * A write-up or own book together with its audio, video and pictures:
 *  - "zip": an offline web book (index.html with players, contents and print
 *    styles, a media/ folder and the text as Markdown);
 *  - "epub": an EPUB 3 e-book (Apple Books and others play its audio / video).
 * The server only builds the text files and the list of media; the browser
 * fetches the media and packs the archive, so big videos never pass through
 * a serverless response.
 */
import "server-only";
import type { DocMark, DocNode, WriteupDoc } from "@/lib/writeup-doc";
import { docMedia } from "@/lib/writeup-doc";
import { describeFiles } from "../ai/media";
import type { ExportItem } from "./data";
import { fileName, labels, type Loc } from "./labels";
import { renderText } from "./text";

export const BUNDLE_KINDS = ["zip", "epub"] as const;
export type BundleKind = (typeof BUNDLE_KINDS)[number];

export type BundleManifest = {
  /** Download file name (with extension). */
  name: string;
  kind: BundleKind;
  /** Text files, in archive order. `store` = no compression (EPUB mimetype). */
  text: { path: string; content: string; store?: boolean }[];
  /** Media to fetch from /api/files/{fileId} and store at `path`. */
  media: { path: string; fileId: string; size: number }[];
  totalBytes: number;
};

const EXT: Record<string, string> = {
  "image/jpeg": "jpg",
  "image/png": "png",
  "image/webp": "webp",
  "image/gif": "gif",
  "image/avif": "avif",
  "image/heic": "heic",
  "audio/mpeg": "mp3",
  "audio/mp3": "mp3",
  "audio/mp4": "m4a",
  "audio/x-m4a": "m4a",
  "audio/m4a": "m4a",
  "audio/aac": "aac",
  "audio/ogg": "ogg",
  "audio/webm": "webm",
  "audio/wav": "wav",
  "audio/x-wav": "wav",
  "audio/flac": "flac",
  "video/mp4": "mp4",
  "video/webm": "webm",
  "video/quicktime": "mov",
  "application/pdf": "pdf",
};

const esc = (s: string) =>
  s.replace(/&/g, "&amp;").replace(/</g, "&lt;").replace(/>/g, "&gt;").replace(/"/g, "&quot;");

function safeName(name: string, mime: string, n: number) {
  const ext = EXT[mime] ?? "bin";
  const stem =
    name
      .replace(/\.[a-z0-9]{2,5}$/i, "")
      .normalize("NFKD")
      .replace(/[^\w-]+/g, "_")
      .replace(/^_+|_+$/g, "")
      .slice(0, 60) || "media";
  return `${String(n).padStart(2, "0")}-${stem}.${ext}`;
}

const MARK_TAG: Record<string, string> = {
  bold: "strong",
  italic: "em",
  underline: "u",
  strike: "s",
  note: "mark",
};

function inline(nodes: DocNode[] | undefined, x: boolean): string {
  return (nodes ?? [])
    .map((n) => {
      if (n.type === "hardBreak") return x ? "<br/>" : "<br>";
      let h = esc(n.text ?? "");
      for (const m of (n.marks ?? []) as DocMark[]) {
        if (m.type === "link" && m.attrs?.href) h = `<a href="${esc(m.attrs.href)}">${h}</a>`;
        else if (MARK_TAG[m.type]) h = `<${MARK_TAG[m.type]}>${h}</${MARK_TAG[m.type]}>`;
      }
      return h;
    })
    .join("");
}

type Ctx = {
  /** fileId → relative path of the media file. */
  media: Map<string, { path: string; mime: string }>;
  /** XHTML (EPUB) instead of HTML. */
  x: boolean;
  t: Labels;
  /** Heading ids, in document order. */
  ids: { next: number };
};
type Labels = ReturnType<typeof bundleLabels>;

function blocks(nodes: DocNode[], c: Ctx): string {
  const attr = (k: string) => (c.x ? ` ${k}="${k}"` : ` ${k}`);
  return nodes
    .map((n) => {
      switch (n.type) {
        case "paragraph":
          return n.content?.length ? `<p>${inline(n.content, c.x)}</p>` : "";
        case "heading": {
          if (!textOf(n).trim()) return "";
          const lv = n.attrs?.level === 3 ? 3 : 2;
          return `<h${lv} id="h${c.ids.next++}">${inline(n.content, c.x)}</h${lv}>`;
        }
        case "blockquote":
          return `<blockquote>${blocks(n.content ?? [], c)}</blockquote>`;
        case "horizontalRule":
          return c.x ? "<hr/>" : "<hr>";
        case "bulletList":
        case "orderedList": {
          const tag = n.type === "orderedList" ? "ol" : "ul";
          const start = Number(n.attrs?.start ?? 1);
          const items = (n.content ?? [])
            .map((li) => `<li>${blocks(li.content ?? [], c)}</li>`)
            .join("");
          return `<${tag}${tag === "ol" && start > 1 ? ` start="${start}"` : ""}>${items}</${tag}>`;
        }
        case "image":
        case "audio":
        case "video":
        case "file": {
          const m = c.media.get(String(n.attrs?.fileId));
          const name = esc(String(n.attrs?.name ?? ""));
          if (!m) return `<p class="missing">[${name}]</p>`;
          const src = esc(m.path);
          if (n.type === "image")
            return `<figure><img src="${src}" alt="${name}"${c.x ? "/" : ""}></figure>`;
          if (n.type === "audio")
            return `<figure class="media"><figcaption>🎧 ${name}</figcaption><audio${attr("controls")} preload="metadata" src="${src}"><a href="${src}">${name}</a></audio></figure>`;
          if (n.type === "video")
            return `<figure class="media"><video${attr("controls")}${attr("playsinline")} preload="metadata" src="${src}"><a href="${src}">${name}</a></video><figcaption>🎬 ${name}</figcaption></figure>`;
          return `<p class="file"><a href="${src}">📎 ${name}</a></p>`;
        }
        case "youtube": {
          const id = String(n.attrs?.videoId);
          const url = `https://youtu.be/${id}`;
          const title = esc(String(n.attrs?.title ?? "") || url);
          // E-book readers rarely allow frames: a link there, the player in the web book.
          if (c.x) return `<p class="yt"><a href="${url}">▶ ${c.t.youtube}: ${title}</a></p>`;
          return `<figure class="media yt"><div class="frame"><iframe src="https://www.youtube-nocookie.com/embed/${id}" title="${title}" allow="encrypted-media; picture-in-picture; fullscreen" allowfullscreen loading="lazy"></iframe></div><figcaption><a href="${url}">▶ ${title}</a> <span class="muted">(${c.t.online})</span></figcaption></figure>`;
        }
        default:
          return "";
      }
    })
    .join("\n");
}

const textOf = (n: DocNode): string =>
  n.type === "text" ? (n.text ?? "") : (n.content ?? []).map(textOf).join("");

function bundleLabels(loc: Loc) {
  const t = labels(loc);
  if (loc === "ru")
    return {
      ...t,
      by: "автор",
      youtube: "Видео YouTube",
      online: "откроется при наличии интернета",
      made: "Написано в NodiNote",
      intro: "Начало",
      readme:
        "Откройте index.html в любом браузере: текст, изображения, аудио и видео здесь и работают без интернета (для видео YouTube нужен интернет). Только текст — в файле .md. Чтобы напечатать или сохранить в PDF, используйте «Печать» в браузере.",
    };
  return loc === "en"
    ? {
        ...t,
        by: "by",
        youtube: "YouTube video",
        online: "plays when online",
        made: "Made with NodiNote",
        intro: "Beginning",
        readme:
          "Open index.html in any browser: the text, pictures, audio and video are all here and work offline (YouTube videos need the internet). The text alone is in the .md file. To print or save as PDF, use the browser's Print.",
      }
    : {
        ...t,
        by: "muallif",
        youtube: "YouTube video",
        online: "internet bölsa oçiladi",
        made: "NodiNote’da yozilgan",
        intro: "Boşlaniş",
        readme:
          "index.html faylini istalgan brauzerda oçing: matn, rasmlar, audio va videolar şu yerda, internetsiz ham işlaydi (YouTube videolari uçun internet kerak). Faqat matni .md faylida. Çop etiş yoki PDF qiliş uçun brauzerdagi “Çop etiş”dan foydalaning.",
      };
}

const CSS = `
:root{--bg:#fbf8f2;--fg:#1f2430;--muted:#6b7280;--line:#e6dfd2;--accent:#8a5a1f;--card:#fff}
@media (prefers-color-scheme:dark){:root{--bg:#16181d;--fg:#e8e6e1;--muted:#9aa0aa;--line:#2c3038;--accent:#d9a35c;--card:#1e2128}}
*{box-sizing:border-box}
body{margin:0;background:var(--bg);color:var(--fg);font:18px/1.75 Georgia,"Times New Roman",serif}
.layout{display:grid;grid-template-columns:16rem 1fr;min-height:100vh}
nav{position:sticky;top:0;height:100vh;overflow:auto;padding:2rem 1.25rem;border-right:1px solid var(--line);font:14px/1.5 system-ui,sans-serif}
nav h2{font-size:12px;letter-spacing:.08em;text-transform:uppercase;color:var(--muted);margin:0 0 .75rem}
nav a{display:block;color:var(--fg);text-decoration:none;padding:.3rem .5rem;border-radius:6px}
nav a:hover{background:var(--line)}
nav a.sub{padding-left:1.4rem;color:var(--muted)}
main{max-width:42rem;margin:0 auto;padding:3rem 1.5rem 6rem}
.title{text-align:center;padding:4rem 0 3rem;border-bottom:1px solid var(--line);margin-bottom:2.5rem}
.title .label{font:600 12px system-ui,sans-serif;letter-spacing:.14em;text-transform:uppercase;color:var(--accent)}
.title h1{font-size:2.6rem;line-height:1.2;margin:.6rem 0}
.title .sub{color:var(--muted);font-style:italic}
.title .author{margin-top:1.5rem;font-size:1.1rem}
h2{font-size:1.7rem;line-height:1.3;margin:3rem 0 1rem}
h3{font-size:1.3rem;margin:2rem 0 .75rem}
p{margin:0 0 1rem}
blockquote{margin:1.5rem 0;padding:.25rem 1.25rem;border-left:3px solid var(--accent);color:var(--muted);font-style:italic}
figure{margin:1.75rem 0;text-align:center}
img{max-width:100%;height:auto;border-radius:8px}
figure.media{background:var(--card);border:1px solid var(--line);border-radius:12px;padding:.75rem}
audio,video{width:100%;display:block;border-radius:8px}
video{background:#000;max-height:70vh}
figcaption{font:13px/1.5 system-ui,sans-serif;color:var(--muted);margin:.5rem 0}
.frame{position:relative;aspect-ratio:16/9;border-radius:8px;overflow:hidden;background:#000}
.frame iframe{position:absolute;inset:0;width:100%;height:100%;border:0}
a{color:var(--accent)}
mark{background:rgba(217,119,6,.18);color:inherit;border-bottom:2px solid rgba(217,119,6,.6);border-radius:3px}
.muted{color:var(--muted)}
footer{margin-top:4rem;padding-top:1.5rem;border-top:1px solid var(--line);text-align:center;font:13px system-ui,sans-serif;color:var(--muted)}
@media (max-width:800px){.layout{display:block}nav{position:static;height:auto;border-right:0;border-bottom:1px solid var(--line)}main{padding:2rem 1rem 4rem}.title h1{font-size:2rem}}
@media print{nav,.frame,audio,video{display:none}.layout{display:block}body{background:#fff;color:#000}h2{break-before:page}figure.media{border:0;padding:0}}
`;

const EPUB_CSS = `
body{font-family:serif;line-height:1.6;margin:0 5%}
h1{text-align:center;margin-top:30%}
.label{text-align:center;text-transform:uppercase;letter-spacing:.12em;font-size:.75em}
.sub,.author{text-align:center}
.sub{font-style:italic}
blockquote{margin:1em 0;padding-left:1em;border-left:3px solid #b8894a;font-style:italic}
figure{margin:1.2em 0;text-align:center}
img,video{max-width:100%}
audio{width:100%}
figcaption{font-size:.8em;color:#666}
`;

function htmlPage(
  it: ExportItem,
  body: string,
  outline: { lv: number; text: string }[],
  t: Labels,
  author: string | null,
  loc: Loc,
) {
  const toc = outline.length
    ? `<nav aria-label="${esc(t.contents)}"><h2>${esc(t.contents)}</h2>${outline
        .map((o, i) => `<a href="#h${i}"${o.lv === 3 ? ' class="sub"' : ""}>${esc(o.text)}</a>`)
        .join("")}</nav>`
    : "";
  return `<!doctype html>
<html lang="${loc}">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${esc(it.title)}</title>
<style>${CSS}</style>
</head>
<body>
<div class="layout"${toc ? "" : ' style="display:block"'}>
${toc}
<main>
<header class="title">
<div class="label">${esc(it.docLabel ?? t.writeup)}</div>
<h1>${esc(it.title)}</h1>
${it.originalTitle ? `<div class="sub">${esc(it.originalTitle)}</div>` : ""}
${author ? `<div class="author">${esc(author)}</div>` : ""}
</header>
${body}
<footer>${esc(t.made)}</footer>
</main>
</div>
</body>
</html>
`;
}

function xhtml(title: string, body: string, loc: Loc) {
  return `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${loc}" lang="${loc}">
<head><meta charset="utf-8"/><title>${esc(title)}</title><link rel="stylesheet" type="text/css" href="../style.css"/></head>
<body>
${body}
</body>
</html>
`;
}

/** Text files + media list for one item (its document, title page and contents). */
export async function buildBundle(
  ctx: { userId: string; role: "user" | "superadmin" },
  it: ExportItem,
  opts: { kind: BundleKind; loc: Loc; timeZone: string; owner: string },
): Promise<BundleManifest> {
  const t = bundleLabels(opts.loc);
  const doc: WriteupDoc = it.doc ?? { type: "doc", content: [] };
  const refs = docMedia(doc);
  const infos = await describeFiles(ctx, [...new Set(refs.map((r) => r.fileId))]);
  const dir = opts.kind === "epub" ? "OEBPS/media/" : "media/";
  const media = new Map<string, { path: string; mime: string }>();
  const list: BundleManifest["media"] = [];
  infos.forEach((f, i) => {
    const path = dir + safeName(f.name, f.mime, i + 1);
    media.set(f.fileId, {
      path: opts.kind === "epub" ? path.replace("OEBPS/", "../") : path,
      mime: f.mime,
    });
    list.push({ path, fileId: f.fileId, size: f.size });
  });
  const author = it.authors;
  const base = `${it.docLabel ?? t.writeup} — ${it.title}`;
  const totalBytes = list.reduce((s, m) => s + m.size, 0);

  if (opts.kind === "zip") {
    const body = blocks(doc.content, { media, x: false, t, ids: { next: 0 } });
    const outline = doc.content
      .filter((n) => n.type === "heading" && textOf(n).trim())
      .map((n) => ({ lv: n.attrs?.level === 3 ? 3 : 2, text: textOf(n).trim() }));
    const html = htmlPage(it, body, outline, t, author, opts.loc);
    const folder = fileName(base, "x").slice(0, -2);
    const md = renderText([{ ...it, notes: [] }], {
      loc: opts.loc,
      timeZone: opts.timeZone,
      owner: opts.owner,
      combined: false,
      markdown: true,
    });
    return {
      name: fileName(base, "zip"),
      kind: "zip",
      text: [
        { path: `${folder}/index.html`, content: html },
        { path: `${folder}/${fileName(it.title, "md")}`, content: md },
        { path: `${folder}/README.txt`, content: t.readme + "\n" },
      ],
      media: list.map((m) => ({ ...m, path: `${folder}/${m.path}` })),
      totalBytes,
    };
  }

  // EPUB: one XHTML file per chapter (split at level-2 headings).
  const parts: { title: string; nodes: DocNode[] }[] = [];
  for (const n of doc.content) {
    if (n.type === "heading" && n.attrs?.level !== 3 && textOf(n).trim())
      parts.push({ title: textOf(n).trim(), nodes: [n] });
    else if (parts.length) parts[parts.length - 1].nodes.push(n);
    else parts.push({ title: t.intro, nodes: [n] });
  }
  const real = parts.filter((p) =>
    p.nodes.some((n) => n.type !== "paragraph" || n.content?.length),
  );
  const titlePage = xhtml(
    it.title,
    `<div class="label">${esc(it.docLabel ?? t.writeup)}</div><h1>${esc(it.title)}</h1>${
      it.originalTitle ? `<p class="sub">${esc(it.originalTitle)}</p>` : ""
    }${author ? `<p class="author">${esc(author)}</p>` : ""}`,
    opts.loc,
  );
  const chapters = real.map((p, i) => ({
    id: `ch${i + 1}`,
    title: p.title,
    content: xhtml(
      p.title,
      blocks(p.nodes, { media, x: true, t, ids: { next: i * 1000 } }),
      opts.loc,
    ),
  }));
  const nav = `<?xml version="1.0" encoding="utf-8"?>
<!DOCTYPE html>
<html xmlns="http://www.w3.org/1999/xhtml" xmlns:epub="http://www.idpf.org/2007/ops" xml:lang="${opts.loc}" lang="${opts.loc}">
<head><meta charset="utf-8"/><title>${esc(t.contents)}</title></head>
<body><nav epub:type="toc" id="toc"><h1>${esc(t.contents)}</h1><ol>
${chapters.map((c) => `<li><a href="text/${c.id}.xhtml">${esc(c.title)}</a></li>`).join("\n")}
</ol></nav></body></html>
`;
  const modified = new Date().toISOString().replace(/\.\d+Z$/, "Z");
  const opf = `<?xml version="1.0" encoding="utf-8"?>
<package xmlns="http://www.idpf.org/2007/opf" version="3.0" unique-identifier="bookid" xml:lang="${opts.loc}">
<metadata xmlns:dc="http://purl.org/dc/elements/1.1/">
<dc:identifier id="bookid">urn:uuid:${it.resourceId}</dc:identifier>
<dc:title>${esc(it.title)}</dc:title>
<dc:language>${opts.loc}</dc:language>
${author ? `<dc:creator>${esc(author)}</dc:creator>` : ""}
<meta property="dcterms:modified">${modified}</meta>
</metadata>
<manifest>
<item id="nav" href="nav.xhtml" media-type="application/xhtml+xml" properties="nav"/>
<item id="css" href="style.css" media-type="text/css"/>
<item id="title" href="text/title.xhtml" media-type="application/xhtml+xml"/>
${chapters.map((c) => `<item id="${c.id}" href="text/${c.id}.xhtml" media-type="application/xhtml+xml"/>`).join("\n")}
${list
  .map(
    (m, i) =>
      `<item id="m${i + 1}" href="${esc(m.path.replace("OEBPS/", ""))}" media-type="${media.get(m.fileId)?.mime ?? "application/octet-stream"}"/>`,
  )
  .join("\n")}
</manifest>
<spine>
<itemref idref="title"/>
${chapters.map((c) => `<itemref idref="${c.id}"/>`).join("\n")}
</spine>
</package>
`;
  return {
    name: fileName(base, "epub"),
    kind: "epub",
    text: [
      { path: "mimetype", content: "application/epub+zip", store: true },
      {
        path: "META-INF/container.xml",
        content: `<?xml version="1.0" encoding="utf-8"?>
<container version="1.0" xmlns="urn:oasis:names:tc:opendocument:xmlns:container">
<rootfiles><rootfile full-path="OEBPS/content.opf" media-type="application/oebps-package+xml"/></rootfiles>
</container>
`,
      },
      { path: "OEBPS/content.opf", content: opf },
      { path: "OEBPS/nav.xhtml", content: nav },
      { path: "OEBPS/style.css", content: EPUB_CSS },
      { path: "OEBPS/text/title.xhtml", content: titlePage },
      ...chapters.map((c) => ({ path: `OEBPS/text/${c.id}.xhtml`, content: c.content })),
    ],
    media: list,
    totalBytes,
  };
}
