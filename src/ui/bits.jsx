import { useEffect, useState } from "react";
import { cx } from "./cx";
import { PixelText, pixelize } from "./pixel";

/** Vertical flex stack. `gap` is in grid units (1 = 4px). */
export function Stack({ gap = 2, className, children, ...rest }) {
  return (
    <div className={cx("ph-stack", `ph-gap-${gap}`, className)} {...rest}>
      {children}
    </div>
  );
}

/** Horizontal flex row. */
export function Row({ gap = 2, between = false, wrap = false, className, children, ...rest }) {
  return (
    <div
      className={cx(
        "ph-row",
        `ph-gap-${gap}`,
        between && "ph-row--between",
        wrap && "ph-row--wrap",
        className,
      )}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Label/value pair. `num` tints the value as data. */
export function Stat({ k, v, num = false, className }) {
  return (
    <div className={cx("ph-stat", className)}>
      <PixelText upper className="ph-stat__k">
        {k}
      </PixelText>
      {pixelize(v, { className: cx("ph-stat__v", num && "ph-stat__v--num") })}
    </div>
  );
}

/** Small pill. tone: "default" | "accent" | "info" */
export function Badge({ tone = "default", className, children }) {
  return (
    <span
      className={cx("ph-badge", tone !== "default" && `ph-badge--${tone}`, className)}
    >
      {pixelize(children, { upper: true })}
    </span>
  );
}

/** Fixed icon cell. Renders a dashed placeholder when `src` is absent. */
export function Slot({ src, alt = "", size = "md", title, className, ...rest }) {
  return (
    <div
      className={cx(
        "ph-slot",
        !src && "ph-slot--empty",
        size === "sm" && "ph-slot--sm",
        className,
      )}
      title={title}
      {...rest}
    >
      {src && <img src={src} alt={alt} draggable={false} />}
    </div>
  );
}

/** Scrollable region. Callers set the height via style/class. */
export function List({ className, children, ...rest }) {
  return (
    <div className={cx("ph-list", className)} {...rest}>
      {children}
    </div>
  );
}

/** One line inside a List. */
export function ListRow({ on = false, className, children, ...rest }) {
  return (
    <div
      className={cx("ph-listrow", on && "ph-listrow--on", className)}
      {...rest}
    >
      {children}
    </div>
  );
}

/** Keep in step with the transition in ui.css. */
const COLLAPSE_MS = 140;

/**
 * Height-only reveal — content is never scaled, so glyphs stay sharp.
 *
 * Closed content is not rendered. A grid-rows reveal does not need it to be:
 * the row animates from 0fr whether or not anything is in it, and the
 * content appears as it opens.
 *
 * That matters more than it sounds. The roller's Config tab has 46 zones,
 * each with four bounds fields behind a collapse, and every one of them was
 * being built on every visit to the tab — 184 number inputs nobody could
 * see, which is most of what made switching to that tab take a fifth of a
 * second. Every item row mounts a variant table the same way.
 *
 * The content does outlive `open` by one transition, though, or closing
 * would snap shut while opening eased — there would be nothing left to
 * collapse.
 */
export function Collapse({ open, className, children }) {
  const [render, setRender] = useState(open);

  useEffect(() => {
    if (open) {
      setRender(true);
      return undefined;
    }
    const timer = setTimeout(() => setRender(false), COLLAPSE_MS);
    return () => clearTimeout(timer);
  }, [open]);

  return (
    <div className={cx("ph-collapse", open && "ph-collapse--open", className)}>
      <div className="ph-collapse__inner">{render ? children : null}</div>
    </div>
  );
}

/**
 * Centred placeholder line.
 *
 * Uppercasing happens here rather than in CSS: `text-transform` acts on the
 * font pipeline, and PixelText paints a mask, so the transform would never
 * reach it.
 */
export function Empty({ children }) {
  return (
    <div className="ph-empty">
      <PixelText>{String(children ?? "").toUpperCase()}</PixelText>
    </div>
  );
}

export function Divider() {
  return <div className="ph-hr" />;
}

/**
 * Stand-in bars, for a panel that has not been built yet.
 *
 * Bars rather than a spinner: they take the shape of what is coming, so the
 * panel does not jump when the real thing arrives.
 */
export function Skeleton({ rows = 3, height, className }) {
  return (
    <div className={cx("ph-skel", className)}>
      {Array.from({ length: rows }, (_, i) => (
        <div key={i} className="ph-skel__bar" style={height ? { height } : undefined} />
      ))}
    </div>
  );
}

/**
 * Show `placeholder` for one frame, then the real children.
 *
 * A tab switch renders every panel on it at once, and a panel with a lot of
 * drawn labels in it is enough work to be felt — the switch waits on all of
 * it before anything appears. This lets the tab paint immediately and the
 * panel arrive a frame later, which is the difference between a tab that
 * hesitates and one that does not.
 *
 * The children are still constructed either way; what is deferred is
 * mounting them, which is where the cost is.
 */
export function Defer({ placeholder = null, children }) {
  const [ready, setReady] = useState(false);

  useEffect(() => {
    const frame = requestAnimationFrame(() => setReady(true));
    return () => cancelAnimationFrame(frame);
  }, []);

  return ready ? children : placeholder;
}
