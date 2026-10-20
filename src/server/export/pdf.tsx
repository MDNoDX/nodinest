/* eslint-disable jsx-a11y/alt-text */
/**
 * Taqriz → PDF (react-pdf). Noto Serif body / Noto Sans headings (full
 * Uzbek Latin + Cyrillic coverage), clickable contents, page numbers.
 */
import path from "node:path";
import {
  Document,
  Font,
  Image,
  Link,
  Page,
  Polygon,
  StyleSheet,
  Svg,
  Text,
  View,
  renderToBuffer,
} from "@react-pdf/renderer";
import type { DocMark, DocNode } from "@/lib/writeup-doc";
import type { ExportItem } from "./data";
import { facts, fmtWhen, labels, type Labels, type Loc } from "./labels";

const FONTS = path.join(process.cwd(), "src/server/export/fonts");
let registered = false;
function registerFonts() {
  if (registered) return;
  registered = true;
  Font.register({
    family: "Serif",
    fonts: [
      { src: path.join(FONTS, "NotoSerif_400Regular.ttf") },
      { src: path.join(FONTS, "NotoSerif_400Regular_Italic.ttf"), fontStyle: "italic" },
      { src: path.join(FONTS, "NotoSerif_700Bold.ttf"), fontWeight: 700 },
      {
        src: path.join(FONTS, "NotoSerif_700Bold_Italic.ttf"),
        fontWeight: 700,
        fontStyle: "italic",
      },
    ],
  });
  Font.register({
    family: "Sans",
    fonts: [
      { src: path.join(FONTS, "NotoSans_400Regular.ttf") },
      { src: path.join(FONTS, "NotoSans_600SemiBold.ttf"), fontWeight: 600 },
      { src: path.join(FONTS, "NotoSans_700Bold.ttf"), fontWeight: 700 },
    ],
  });
  // Uzbek words must not be broken with English hyphenation rules.
  Font.registerHyphenationCallback((w) => [w]);
}

const BLUE = "#2459e0";
const INK = "#0f172a";
const MUTED = "#5b6478";
const LINE = "#dfe4ee";

const s = StyleSheet.create({
  page: {
    paddingTop: 56,
    paddingBottom: 64,
    paddingHorizontal: 58,
    fontFamily: "Serif",
    fontSize: 11.2,
    color: INK,
  },
  footer: {
    position: "absolute",
    bottom: 26,
    left: 58,
    right: 58,
    flexDirection: "row",
    justifyContent: "space-between",
    fontFamily: "Sans",
    fontSize: 8,
    color: MUTED,
  },
  kicker: {
    fontFamily: "Sans",
    fontSize: 8.5,
    fontWeight: 600,
    color: BLUE,
    letterSpacing: 1.2,
    textTransform: "uppercase",
  },
  title: { fontFamily: "Sans", fontSize: 24, fontWeight: 700, lineHeight: 1.2, marginTop: 6 },
  subtitle: { fontStyle: "italic", color: MUTED, marginTop: 4 },
  authors: { fontFamily: "Sans", fontSize: 12, fontWeight: 600, marginTop: 8 },
  facts: { flexDirection: "row", flexWrap: "wrap", marginTop: 14 },
  fact: { width: "50%", marginBottom: 8, paddingRight: 8 },
  factLabel: {
    fontFamily: "Sans",
    fontSize: 7.5,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 0.6,
  },
  factValue: { fontFamily: "Sans", fontSize: 10.5, fontWeight: 600, marginTop: 1 },
  opinion: {
    marginTop: 16,
    paddingHorizontal: 12,
    paddingTop: 10,
    paddingBottom: 4,
    backgroundColor: "#f3f6fd",
    borderLeftWidth: 3,
    borderLeftColor: BLUE,
    fontStyle: "italic",
  },
  tocTitle: {
    fontFamily: "Sans",
    fontSize: 10,
    fontWeight: 700,
    color: MUTED,
    textTransform: "uppercase",
    letterSpacing: 1,
    marginTop: 22,
    marginBottom: 6,
  },
  tocItem: {
    fontFamily: "Sans",
    fontSize: 10.5,
    color: INK,
    textDecoration: "none",
    marginBottom: 3,
  },
  rule: { borderBottomWidth: 1, borderBottomColor: LINE, marginVertical: 20 },
  h2: {
    fontFamily: "Sans",
    fontSize: 16,
    fontWeight: 700,
    lineHeight: 1.3,
    marginTop: 18,
    marginBottom: 6,
  },
  h2bar: { width: 30, height: 3, backgroundColor: BLUE, borderRadius: 2, marginTop: 14 },
  h3: { fontFamily: "Sans", fontSize: 12.5, fontWeight: 600, marginTop: 12, marginBottom: 4 },
  p: { marginBottom: 7, textAlign: "justify", lineHeight: 1.62 },
  quote: {
    borderLeftWidth: 2,
    borderLeftColor: BLUE,
    paddingLeft: 10,
    marginVertical: 6,
    color: "#334155",
    fontStyle: "italic",
  },
  li: { flexDirection: "row", marginBottom: 3 },
  bullet: { width: 16, color: BLUE },
  link: { color: BLUE, textDecoration: "underline" },
  empty: { color: MUTED, fontStyle: "italic" },
  noteBox: { marginBottom: 10, paddingBottom: 8, borderBottomWidth: 0.5, borderBottomColor: LINE },
  noteMeta: { fontFamily: "Sans", fontSize: 8, color: MUTED, marginTop: 3 },
});

function Stars({ value }: { value: number }) {
  const pts = "12,2 15,9 22,9.5 16.5,14 18.5,21 12,17 5.5,21 7.5,14 2,9.5 9,9";
  return (
    <View style={{ flexDirection: "row", alignItems: "center" }}>
      {Array.from({ length: 10 }, (_, i) => (
        <Svg key={i} viewBox="0 0 24 24" style={{ width: 11, height: 11, marginRight: 1.5 }}>
          <Polygon points={pts} fill={i < value ? "#f59e0b" : "#e2e8f0"} />
        </Svg>
      ))}
      <Text style={{ fontFamily: "Sans", fontSize: 9.5, fontWeight: 700, marginLeft: 5 }}>
        {value}/10
      </Text>
    </View>
  );
}

function markStyle(marks?: DocMark[]) {
  const st: Record<string, string | number> = {};
  const deco: string[] = [];
  for (const m of marks ?? []) {
    if (m.type === "bold") st.fontWeight = 700;
    if (m.type === "italic") st.fontStyle = "italic";
    if (m.type === "underline") deco.push("underline");
    if (m.type === "strike") deco.push("line-through");
  }
  if (deco.length) st.textDecoration = deco.join(" ");
  return st;
}

function Inline({ nodes }: { nodes?: DocNode[] }) {
  return (
    <>
      {(nodes ?? []).map((n, i) => {
        if (n.type === "hardBreak") return <Text key={i}>{"\n"}</Text>;
        const link = n.marks?.find((m) => m.type === "link")?.attrs?.href;
        const txt = (
          <Text key={i} style={markStyle(n.marks)}>
            {n.text}
          </Text>
        );
        return link ? (
          <Link key={i} src={link} style={s.link}>
            {txt}
          </Link>
        ) : (
          txt
        );
      })}
    </>
  );
}

function Blocks({
  nodes,
  anchor,
  depth = 0,
  images = {},
  t,
}: {
  nodes: DocNode[];
  anchor: string;
  depth?: number;
  images?: Record<string, Uint8Array>;
  t?: Labels;
}) {
  return (
    <>
      {nodes.map((n, i) => {
        const key = `${anchor}-${i}`;
        switch (n.type) {
          case "heading":
            return n.attrs?.level === 3 ? (
              <Text key={key} id={depth ? undefined : key} style={s.h3}>
                <Inline nodes={n.content} />
              </Text>
            ) : (
              <View key={key} wrap={false}>
                <View style={s.h2bar} />
                <Text id={depth ? undefined : key} style={s.h2}>
                  <Inline nodes={n.content} />
                </Text>
              </View>
            );
          case "paragraph":
            return n.content?.length ? (
              <Text key={key} style={s.p}>
                <Inline nodes={n.content} />
              </Text>
            ) : null;
          case "blockquote":
            return (
              <View key={key} style={s.quote}>
                <Blocks nodes={n.content ?? []} anchor={key} depth={depth + 1} />
              </View>
            );
          case "horizontalRule":
            return <View key={key} style={s.rule} />;
          case "image": {
            const data = images[String(n.attrs?.fileId)];
            return data ? (
              <Image
                key={key}
                src={{ data: Buffer.from(data), format: "jpg" }}
                style={{ maxHeight: 420, objectFit: "contain", marginVertical: 8, borderRadius: 4 }}
              />
            ) : null;
          }
          case "audio":
          case "file":
            return (
              <Text
                key={key}
                style={{ fontFamily: "Sans", fontSize: 9.5, color: MUTED, marginVertical: 4 }}
              >
                {n.type === "audio" ? (t?.audio ?? "Audio") : (t?.file ?? "File")}:{" "}
                {String(n.attrs?.name ?? "")}
              </Text>
            );
          case "bulletList":
          case "orderedList": {
            const start = Number(n.attrs?.start ?? 1);
            return (
              <View key={key} style={{ marginBottom: 6, marginLeft: depth ? 10 : 0 }}>
                {(n.content ?? []).map((li, j) => (
                  <View key={j} style={s.li} wrap={false}>
                    <Text style={s.bullet}>{n.type === "orderedList" ? `${start + j}.` : "•"}</Text>
                    <View style={{ flex: 1 }}>
                      <Blocks nodes={li.content ?? []} anchor={`${key}-${j}`} depth={depth + 1} />
                    </View>
                  </View>
                ))}
              </View>
            );
          }
          default:
            return null;
        }
      })}
    </>
  );
}

function BookPages({
  it,
  idx,
  loc,
  tz,
  t,
}: {
  it: ExportItem;
  idx: number;
  loc: Loc;
  tz: string;
  t: Labels;
}) {
  const anchor = `b${idx}`;
  const chapters = (it.doc?.content ?? [])
    .map((n, i) => ({ n, i }))
    .filter(({ n }) => n.type === "heading" && n.attrs?.level !== 3);
  const f = facts(it, loc);
  const started = fmtWhen(it.startedAt, it.startedPrecision, loc, tz);
  const finished = fmtWhen(it.completedAt, it.completedPrecision, loc, tz);
  const hasText = (it.doc?.content ?? []).some((n) => n.content?.length || n.attrs?.fileId);
  return (
    <>
      <Page size="A4" style={s.page} wrap>
        <View id={anchor} style={{ flexDirection: "row" }} wrap={false}>
          {it.cover && (
            <Image
              src={{ data: Buffer.from(it.cover), format: "jpg" }}
              style={{
                width: 128,
                marginRight: 22,
                borderRadius: 4,
                objectFit: "contain",
                alignSelf: "flex-start",
              }}
            />
          )}
          <View style={{ flex: 1 }}>
            <Text style={s.kicker}>
              {it.docLabel ?? t.writeup} · {t.types[it.type] ?? it.type}
            </Text>
            <Text style={s.title}>{it.title}</Text>
            {it.originalTitle && <Text style={s.subtitle}>{it.originalTitle}</Text>}
            {it.authors && <Text style={s.authors}>{it.authors}</Text>}
            {f.length > 0 && (
              <View style={s.facts}>
                {f.map(([k, v]) => (
                  <View key={k} style={s.fact}>
                    <Text style={s.factLabel}>{k}</Text>
                    <Text style={s.factValue}>{v}</Text>
                  </View>
                ))}
              </View>
            )}
            {it.rating ? (
              <View style={{ marginTop: 4 }}>
                <Text style={s.factLabel}>{t.rating}</Text>
                <Stars value={it.rating} />
              </View>
            ) : null}
            {(it.status || started || finished) && (
              <Text style={{ fontFamily: "Sans", fontSize: 9, color: MUTED, marginTop: 10 }}>
                {[
                  it.status ? t.status[it.status] : null,
                  started && `${t.started}: ${started}`,
                  finished && `${t.finished}: ${finished}`,
                ]
                  .filter(Boolean)
                  .join("  ·  ")}
              </Text>
            )}
          </View>
        </View>

        {it.opinion && (
          <View style={s.opinion}>
            <Text
              style={{
                fontFamily: "Sans",
                fontSize: 7.5,
                fontStyle: "normal",
                color: BLUE,
                fontWeight: 600,
                textTransform: "uppercase",
                letterSpacing: 0.8,
                marginBottom: 3,
              }}
            >
              {t.opinion}
            </Text>
            <Text style={{ lineHeight: 1.55 }}>{it.opinion}</Text>
          </View>
        )}

        {chapters.length > 1 && (
          <View>
            <Text style={s.tocTitle}>{t.contents}</Text>
            {chapters.map(({ n, i }, k) => (
              <Link key={i} src={`#${anchor}-${i}`} style={s.tocItem}>
                {k + 1}. {(n.content ?? []).map((c) => c.text ?? "").join("")}
              </Link>
            ))}
          </View>
        )}

        <View style={s.rule} />
        {hasText ? (
          <Blocks nodes={it.doc!.content} anchor={anchor} images={it.images} t={t} />
        ) : (
          <Text style={s.empty}>{t.noText}</Text>
        )}

        {it.notes.length > 0 && (
          <View break>
            <View style={s.h2bar} />
            <Text style={s.h2}>{t.notes}</Text>
            {it.notes.map((n, j) => (
              <View key={j} style={s.noteBox} wrap={false}>
                {n.kind === "quote" ? (
                  <Text style={{ fontStyle: "italic", lineHeight: 1.55 }}>“{n.quoteText}”</Text>
                ) : (
                  <Text style={{ lineHeight: 1.55 }}>
                    {n.title ? <Text style={{ fontWeight: 700 }}>{n.title}. </Text> : null}
                    {n.body}
                  </Text>
                )}
                {n.kind === "quote" && n.body && <Text style={{ marginTop: 3 }}>{n.body}</Text>}
                {(n.pageFrom != null || n.location) && (
                  <Text style={s.noteMeta}>
                    {[
                      n.pageFrom != null
                        ? `${t.page} ${n.pageFrom}${n.pageTo && n.pageTo !== n.pageFrom ? `–${n.pageTo}` : ""}`
                        : null,
                      n.location,
                    ]
                      .filter(Boolean)
                      .join(" · ")}
                  </Text>
                )}
              </View>
            ))}
          </View>
        )}
        <View fixed style={s.footer}>
          <Text>NodiNest · {it.title.length > 70 ? `${it.title.slice(0, 70)}…` : it.title}</Text>
          <Text render={({ pageNumber, totalPages }) => `${pageNumber} / ${totalPages}`} />
        </View>
      </Page>
    </>
  );
}

export async function renderPdf(
  items: ExportItem[],
  opts: { loc: Loc; timeZone: string; owner: string; combined: boolean },
): Promise<Buffer> {
  registerFonts();
  const t = labels(opts.loc);
  const totalWords = items.reduce((a, it) => a + it.words, 0);
  const today = new Intl.DateTimeFormat(opts.loc === "uz" ? "uz-Latn-UZ" : "en-GB", {
    dateStyle: "long",
    timeZone: opts.timeZone,
  }).format(new Date());
  const doc = (
    <Document
      title={
        opts.combined
          ? `${t.myWriteups} — ${opts.owner}`
          : `${items[0]?.docLabel ?? t.writeup} — ${items[0]?.title ?? ""}`
      }
      author={opts.owner}
      creator="NodiNest"
      producer="NodiNest"
      language={opts.loc}
    >
      {opts.combined && (
        <Page size="A4" style={[s.page, { justifyContent: "center" }]}>
          <Text style={s.kicker}>NodiNest</Text>
          <Text style={[s.title, { fontSize: 34 }]}>{t.myWriteups}</Text>
          <Text style={[s.authors, { fontSize: 14 }]}>{opts.owner}</Text>
          <Text style={{ fontFamily: "Sans", fontSize: 10, color: MUTED, marginTop: 6 }}>
            {t.books(items.length)} · {t.words(totalWords)} · {t.exportedOn}: {today}
          </Text>
          <View style={[s.rule, { marginVertical: 26 }]} />
          <Text style={s.tocTitle}>{t.contents}</Text>
          {items.map((it, i) => (
            <Link
              key={it.resourceId}
              src={`#b${i}`}
              style={[s.tocItem, { fontSize: 11.5, marginBottom: 5 }]}
            >
              {i + 1}. {it.title}
              {it.authors ? ` — ${it.authors}` : ""}
            </Link>
          ))}
        </Page>
      )}
      {items.map((it, i) => (
        <BookPages key={it.resourceId} it={it} idx={i} loc={opts.loc} tz={opts.timeZone} t={t} />
      ))}
    </Document>
  );
  return renderToBuffer(doc);
}
