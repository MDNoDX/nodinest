/**
 * The page turn. A real sheet is drawn in two pieces: what still lies flat, and
 * the folded part laid back over it, its reverse side showing. The crease runs
 * in from the bottom right corner and straightens as it crosses the page, with
 * shadows on the page beneath and under the fold. Only transforms and opacity
 * change, on a few layers, so it stays smooth on large pages and on phones.
 */
const MS = 820;
/** How far the crease leans when it starts (radians). */
const TILT = 0.2;
/** A fold is round, so the part laid back looks narrower than flat paper. */
const ROUND = 0.84;
/** The longest step of one frame: a slow frame pauses the turn, it never jumps. */
const STEP = 40;

const ease = (t: number) => 1 - (1 - t) ** 2.5;

const div = (className: string, ...kids: Node[]) => {
  const d = document.createElement("div");
  d.className = className;
  d.append(...kids);
  return d;
};

/** A copy of a sheet; cloning leaves canvases blank, so PDF pages are drawn again. */
export function copySheet(sheet: HTMLElement) {
  const out = sheet.cloneNode(true) as HTMLElement;
  out.removeAttribute("data-sheet");
  const from = sheet.querySelectorAll("canvas");
  out.querySelectorAll("canvas").forEach((c, i) => {
    const src = from[i];
    const { width, height } = src.getBoundingClientRect();
    if (!width || !src.width) return;
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    c.width = Math.ceil(width);
    c.height = Math.ceil(height);
    c.getContext("2d")?.drawImage(src, 0, 0, c.width, c.height);
  });
  return out;
}

/** Turns `leaf` away (forward) or back into place, over `under` when going back. */
export function turnPage({
  box,
  leaf,
  under,
  dir,
  scroll = 0,
}: {
  box: HTMLElement;
  /** The sheet that moves. */
  leaf: HTMLElement;
  /** Going back the real page is the one arriving, so the old one stays on top of it. */
  under?: HTMLElement;
  dir: 1 | -1;
  /** How far the moving sheet was scrolled (a zoomed page). */
  scroll?: number;
}) {
  const W = box.clientWidth;
  const H = box.clientHeight;
  const S = 2 * (W + H);
  const start = W + (H / 2) * Math.tan(TILT);

  const flat = div("book-turn-page", leaf);
  const flatClip = div("book-turn-clip", flat);
  const shade = div("book-turn-shade");
  const back = div("book-turn-back", copySheet(leaf), div("book-turn-tint"), shade);
  const fold = div("book-turn-page", back, div("book-turn-edge"));
  const foldClip = div("book-turn-clip", fold);
  const cast = div("book-turn-cast");
  const layer = div("book-turn");
  layer.setAttribute("aria-hidden", "true");
  if (under) layer.append(under);
  layer.append(cast, flatClip, foldClip);
  layer.style.setProperty("--w", `${W}px`);
  layer.style.setProperty("--h", `${H}px`);
  layer.style.setProperty("--s", `${S}px`);
  box.appendChild(layer);
  layer.querySelectorAll<HTMLElement>(".book-body").forEach((b) => (b.scrollTop = scroll));

  /** p: 0 the page lies flat, 1 it has gone past the left edge. */
  const paint = (p: number) => {
    const a = TILT * (1 - p) ** 1.5;
    const x = start * (1 - p);
    const crease = `translate(${x}px, ${H / 2}px) rotate(${a}rad)`;
    const page = `rotate(${-a}rad) translate(${-x}px, ${-H / 2}px)`;
    flatClip.style.transform = foldClip.style.transform = crease;
    flat.style.transform = page;
    fold.style.transform = `scaleX(${-ROUND}) ${page}`;
    shade.style.transform = crease;
    cast.style.transform = crease;
    cast.style.opacity = String(Math.sin(Math.PI * p) ** 0.6);
  };
  paint(dir === 1 ? 0 : 1);

  let frame = 0;
  let last = 0;
  let spent = 0;
  const stop = () => {
    cancelAnimationFrame(frame);
    layer.remove();
  };
  const tick = (now: number) => {
    spent += last ? Math.min(now - last, STEP) : 0;
    last = now;
    const t = Math.min(1, spent / MS);
    paint(dir === 1 ? ease(t) : 1 - ease(t));
    if (t < 1) frame = requestAnimationFrame(tick);
    else stop();
  };
  frame = requestAnimationFrame(tick);
  return stop;
}
