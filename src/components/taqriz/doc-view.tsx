/* eslint-disable @next/next/no-img-element */
import type { WriteupDoc } from "@/lib/writeup-doc";

type Mark = { type: string; attrs?: { href?: string } };
type Node = {
  type: string;
  text?: string;
  marks?: Mark[];
  attrs?: Record<string, string | number | undefined>;
  content?: Node[];
};

function Text({ n }: { n: Node }) {
  let out: React.ReactNode = n.text;
  for (const m of n.marks ?? []) {
    if (m.type === "bold") out = <strong>{out}</strong>;
    else if (m.type === "italic") out = <em>{out}</em>;
    else if (m.type === "underline") out = <u>{out}</u>;
    else if (m.type === "strike") out = <s>{out}</s>;
    else if (m.type === "link" && m.attrs?.href)
      out = (
        <a href={m.attrs.href} target="_blank" rel="noopener noreferrer" className="underline">
          {out}
        </a>
      );
  }
  return out;
}

const kids = (n: Node) => n.content?.map((c, i) => <Block key={i} n={c} />);

function Block({ n }: { n: Node }) {
  const file = `/api/files/${n.attrs?.fileId}`;
  switch (n.type) {
    case "text":
      return <Text n={n} />;
    case "paragraph":
      return <p className="mb-3 leading-relaxed">{kids(n)}</p>;
    case "heading":
      return <h3 className="mt-5 mb-2 text-lg font-semibold">{kids(n)}</h3>;
    case "bulletList":
      return <ul className="mb-3 list-disc pl-5">{kids(n)}</ul>;
    case "orderedList":
      return <ol className="mb-3 list-decimal pl-5">{kids(n)}</ol>;
    case "listItem":
      return <li>{kids(n)}</li>;
    case "blockquote":
      return <blockquote className="border-primary/50 mb-3 border-l-2 pl-3">{kids(n)}</blockquote>;
    case "horizontalRule":
      return <hr className="border-border my-4" />;
    case "image":
      return <img src={file} alt="" loading="lazy" className="mb-3 max-w-full rounded-lg" />;
    case "audio":
      return <audio controls preload="none" src={file} className="mb-3 w-full" />;
    case "video":
      return <video controls preload="none" src={file} className="mb-3 w-full rounded-lg" />;
    case "youtube":
      return (
        <iframe
          src={`https://www.youtube-nocookie.com/embed/${n.attrs?.videoId}`}
          title={String(n.attrs?.title ?? "YouTube")}
          allow="encrypted-media; picture-in-picture"
          className="mb-3 aspect-video w-full rounded-lg"
        />
      );
    default:
      return null;
  }
}

/** A write-up to read, not to change. It was sanitised when it was saved. */
export function DocView({ doc }: { doc: WriteupDoc }) {
  return (
    <div className="text-[15px]">
      {(doc.content as Node[]).map((n, i) => (
        <Block key={i} n={n} />
      ))}
    </div>
  );
}
