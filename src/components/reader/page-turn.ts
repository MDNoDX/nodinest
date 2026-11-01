/**
 * The page turn: one sheet of paper, rolling away. The page stays exactly where
 * it is, cut along a crease that crosses it from the bottom right corner, so its
 * text never moves or blurs. The part already turned is a narrow roll of plain
 * paper running along the crease, never a second page lying on the first, with a
 * soft shadow on either side of it.
 */
const MS = 720;
/** How far the crease leans when it starts (radians). */
const TILT = 0.14;
/** The longest step of one frame: a slow frame pauses the turn, it never jumps. */
const STEP = 40;

const ease = (t: number) => 0.5 - Math.cos(Math.PI * t) / 2;

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
    const dpr = Math.min(2, window.devicePixelRatio || 1);
    c.style.width = `${width}px`;
    c.style.height = `${height}px`;
    c.width = Math.ceil(width * dpr);
    c.height = Math.ceil(height * dpr);
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
  /** The widest the roll gets. */
  const ROLL = Math.max(44, Math.min(150, W * 0.11));
  const start = W + (H / 2) * Math.tan(TILT);

  const shade = div("book-turn-shade");
  const edge = div("book-turn-edge");
  const paper = div("book-turn-paper", shade);
  const roll = div("book-turn-roll", paper, edge);
  const clip = div("book-turn-clip", roll);
  const cast = div("book-turn-cast");
  const layer = div("book-turn");
  layer.setAttribute("aria-hidden", "true");
  if (under) layer.append(under);
  layer.append(cast, leaf, clip);
  layer.style.setProperty("--w", `${W}px`);
  layer.style.setProperty("--h", `${H}px`);
  layer.style.setProperty("--s", `${S}px`);
  box.appendChild(layer);
  const body = leaf.querySelector<HTMLElement>(".book-body");
  if (body) body.scrollTop = scroll;

  /** p: 0 the page lies flat, 1 it has gone past the left edge. */
  const paint = (p: number) => {
    const a = TILT * (1 - p);
    const x = start * (1 - p);
    const lean = (H / 2) * Math.tan(a);
    leaf.style.clipPath = `polygon(0 0, ${x + lean}px 0, ${x - lean}px ${H}px, 0 ${H}px)`;
    // What has been turned so far is squeezed into the roll: a bit of paper
    // when the corner lifts, its full width from then on.
    const turned = Math.max(1, W - x + lean);
    const k = Math.min(0.9, Math.min(ROLL, turned * 0.6) / turned);
    clip.style.transform = `translate(${x}px, ${H / 2}px) rotate(${a}rad)`;
    roll.style.transform = `scaleX(${-k}) rotate(${-a}rad) translate(${-x}px, ${-H / 2}px)`;
    // These two turn about their own middle, which is level with the page's.
    const along = `translate(${x}px) rotate(${a}rad)`;
    shade.style.transform = `${along} scaleX(${turned / W})`;
    edge.style.transform = `scaleX(${1 / k})`;
    // Starts a little under the roll, so no light line shows between them.
    cast.style.transform = `translate(${x - 2}px) rotate(${a}rad)`;
    cast.style.opacity = String(Math.min(1, 6 * Math.sin(Math.PI * p)));
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
