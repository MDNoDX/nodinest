"use client";
import { markdownToNodes, type DocNode } from "@/lib/writeup-doc";

// ── Small pieces ──────────────────────────────────────────────────────────

export function SmallBtn({
  onClick,
  icon,
  children,
}: {
  onClick: () => void;
  icon: React.ReactNode;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="text-muted hover:text-foreground hover:bg-surface-2 inline-flex items-center gap-1 rounded-md px-1.5 py-0.5 text-xs font-medium [&_svg]:size-3.5"
    >
      {icon}
      {children}
    </button>
  );
}

/** Renders the light Markdown the AI returns (same rules as markdownToNodes). */
export function MdView({ text }: { text: string }) {
  const render = (n: DocNode, i: number): React.ReactNode => {
    const kids = n.content?.map(render);
    switch (n.type) {
      case "text": {
        let el: React.ReactNode = n.text;
        for (const m of n.marks ?? [])
          el = m.type === "bold" ? <strong key={i}>{el}</strong> : <em key={i}>{el}</em>;
        return <span key={i}>{el}</span>;
      }
      case "bulletList":
        return (
          <ul key={i} className="list-disc pl-5">
            {kids}
          </ul>
        );
      case "orderedList":
        return (
          <ol key={i} className="list-decimal pl-5">
            {kids}
          </ol>
        );
      case "listItem":
        return <li key={i}>{kids}</li>;
      case "blockquote":
        return (
          <blockquote key={i} className="border-border border-l-2 pl-2 italic">
            {kids}
          </blockquote>
        );
      case "heading":
        return (
          <p key={i} className="font-semibold">
            {kids}
          </p>
        );
      default:
        return <p key={i}>{kids}</p>;
    }
  };
  return (
    <div className="flex flex-col gap-1.5 text-sm leading-relaxed">
      {markdownToNodes(text).map(render)}
    </div>
  );
}
