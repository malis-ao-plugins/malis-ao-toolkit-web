import { useEffect, useLayoutEffect, useMemo, useRef, useState } from "react";
import { onDeviceScaleChange } from "../pixelfont/index.js";
import { fitToWidth, fontFor, onFamilyChange } from "./fonts";
import "./pixel.css";

/**
 * Text drawn with aowebui's pixelfont, painted through a CSS mask.
 *
 * The glyphs come from `src/pixelfont` — atlases rasterised out of Windows'
 * own font machinery, so they are the shapes the game itself would draw.
 *
 * ── Why a mask rather than <pixel-text> ───────────────────────────────────
 *
 * The library's element paints a canvas in an explicit `ink` colour. This
 * kit colours text from CSS and always has: a button brightens its label on
 * hover, a toggle turns amber when on, the active tab and the highlighted
 * type-ahead row recolour, `.ph-num` tints every number cyan. Roughly forty
 * rules, none of which a canvas can see.
 *
 * So the composed bitmap is used as a mask over `currentColor` instead. The
 * glyphs are pixelfont's, bit for bit — `font.render` does the composing and
 * the device-pixel snapping — but the colour stays in the stylesheet, and
 * every one of those rules keeps working. It is also far cheaper in the item
 * list, where a canvas per label would mean hundreds of backing stores.
 *
 * The real string is still in the DOM underneath, transparent, so selecting
 * drags over real text and the clipboard gets text.
 */

/**
 * Composed masks, keyed by face, text and device scale.
 *
 * Labels repeat heavily — every row says "PULL", every panel head is one of
 * a dozen words — so this stays small. The bound is only there to stop a
 * pathological case, such as a live counter, growing without limit.
 */
const cache = new Map();
const MAX_CACHE = 2000;

function maskFor(text, size, weight, scale) {
  const font = fontFor(size, weight);
  // Weight belongs in the key: a face reports its family as its name, so
  // regular and bold at the same size answered to the same one and whichever
  // drew first was handed to both.
  const key = [
    font.name,
    font.size,
    font.atlas.bold ? "b" : "r",
    scale,
    window.devicePixelRatio,
    text,
  ].join("|");

  const hit = cache.get(key);
  if (hit) return hit;

  // pad 0: the box is the text, so a trailing gap would offset everything
  // laid out after it.
  const { canvas, comp, s, dpr } = font.render(text, {
    ink: "#ffffff",
    scale,
    pad: 0,
  });

  const result = {
    url: canvas.toDataURL("image/png"),
    width: (comp.w * s) / dpr,
    height: (comp.h * s) / dpr,
  };

  if (cache.size >= MAX_CACHE) cache.clear();
  cache.set(key, result);
  return result;
}

/**
 * Re-render every drawn string when what it should look like changes.
 *
 * Two things do that. Browser zoom changes the device pixel ratio and so the
 * size every mask should be — without this a label keeps whatever it was
 * given at the old ratio and only corrects itself the next time something
 * happens to re-render it, which reads as text resizing when you click near
 * it. And choosing a different face changes all of them outright.
 *
 * The listeners are wired once and never taken down. Tying them to the
 * first subscriber looked tidier and was wrong: whichever PixelText mounted
 * first owned them, and the moment it unmounted — which happens constantly,
 * every time a list redraws — they were removed for everyone still on
 * screen. Changing the face then did nothing until the page was reloaded.
 */
const subscribers = new Set();
let wired = false;

function refreshAll() {
  cache.clear();
  for (const fn of subscribers) fn();
}

function wire() {
  if (wired) return;
  wired = true;
  onDeviceScaleChange(refreshAll);
  onFamilyChange(refreshAll);
}

function useFontRefresh() {
  const [, force] = useState(0);

  useEffect(() => {
    wire();
    const bump = () => force((n) => n + 1);
    subscribers.add(bump);
    return () => subscribers.delete(bump);
  }, []);
}

/**
 * Props:
 *   size    13 | 16 | 20      nearest registered atlas is used
 *   weight  400 | 700         >= 600 counts as bold
 *   scale   integer upscale, default 1
 *   upper   uppercase the string (a mask cannot be text-transformed)
 *   maxPx   truncate to this pixel width, with an ellipsis
 *   fit     truncate to the room actually available. The element stops
 *           carrying its own width and takes it from the layout instead, so
 *           it must sit in something that will size it — a flex item with a
 *           basis of 0, a stretched child of a column, a grid cell.
 *   as      element type, default "span"
 */
export function PixelText({
  children,
  size = 13,
  weight = 400,
  scale = 1,
  upper = false,
  maxPx,
  fit = false,
  as: Tag = "span",
  className = "",
  style,
  title,
  ...rest
}) {
  useFontRefresh();

  const hostRef = useRef(null);
  const [room, setRoom] = useState(null);

  /**
   * How much room this element has actually been given.
   *
   * Its own box. A fitting PixelText does not set a width — see below — so
   * layout sizes it, and what layout gives it is exactly the answer. That
   * also sidesteps having to guess which ancestor holds the real width: a
   * parent may be the whole control with a box and padding in the way, or
   * may be `display: contents` and have no box at all.
   *
   * Whatever sizes it must do so independently of this text. A flex basis
   * of 0, not `auto`: with `auto` the text sets the basis, then truncates to
   * it, then the box shrinks to the shorter text, and the two chase each
   * other down to a few characters.
   */
  useLayoutEffect(() => {
    if (!fit) return undefined;
    const el = hostRef.current;
    if (!el) return undefined;

    const read = () => setRoom(Math.floor(el.getBoundingClientRect().width));
    read();

    const observer = new ResizeObserver(read);
    observer.observe(el);
    return () => observer.disconnect();
  }, [fit]);

  const source = Array.isArray(children)
    ? children.join("")
    : String(children ?? "");
  const raw = upper ? source.toUpperCase() : source;
  const budget = maxPx ?? (fit ? room : null);

  const text = budget != null ? fitToWidth(raw, budget, size, weight) : raw;

  const step = Math.max(1, Math.round(scale));
  const face = fontFor(size, weight);
  const mask = useMemo(
    () => (text ? maskFor(text, size, weight, step) : null),
    [text, size, weight, step],
  );

  if (!mask) {
    return (
      <Tag
        ref={hostRef}
        className={`pxt ${className}`}
        style={style}
        title={title}
        {...rest}
      />
    );
  }

  return (
    <Tag
      ref={hostRef}
      className={`pxt ${className}`}
      title={title ?? (text !== raw ? raw : undefined)}
      style={{
        // A fitting element takes its width from layout instead. The mask is
        // drawn at its own size regardless — mask-size says so — so a box
        // wider than the glyphs simply has room to spare.
        ...(fit ? null : { width: mask.width }),
        height: mask.height,
        WebkitMaskImage: `url(${mask.url})`,
        maskImage: `url(${mask.url})`,
        WebkitMaskSize: `${mask.width}px ${mask.height}px`,
        maskSize: `${mask.width}px ${mask.height}px`,
        ...style,
      }}
      {...rest}
    >
      <span
        className="pxt__text"
        style={{
          // The atlas was exported from this face at this pixel height, and
          // Verdana is a system font, so the invisible glyph boxes land close
          // to the drawn pixels and a selection covers what it looks like it
          // covers.
          fontFamily: `"${face.name}", sans-serif`,
          fontSize: `${face.size * step}px`,
          lineHeight: `${face.height * step}px`,
          fontWeight: face.atlas.bold ? 700 : 400,
        }}
      >
        {text}
      </span>
    </Tag>
  );
}

/**
 * Wrap a plain string, pass anything else through.
 *
 * Lets a component accept `children` that may be a label or may be an icon,
 * without every caller having to decide.
 */
export function pixelize(node, props) {
  return typeof node === "string" || typeof node === "number" ? (
    <PixelText {...props}>{node}</PixelText>
  ) : (
    node
  );
}

export default PixelText;
