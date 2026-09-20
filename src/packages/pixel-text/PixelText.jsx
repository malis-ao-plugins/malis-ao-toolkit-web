import { useMemo } from "react";
import { useAtlas } from "./loader";
import { canRender, maskFor } from "./render";
import { fit } from "./measure";
import "./pixel-text.css";

/**
 * Text drawn from a bitmap atlas instead of by the font rasteriser.
 *
 * Props:
 *   size    12 | 16 | 24            nearest is used for anything else
 *   weight  400 | 700               >= 600 counts as bold
 *   scale   integer upscale, default 1
 *   upper   uppercase the string (CSS text-transform cannot reach a mask)
 *   maxCh   truncate to this many characters, with an ellipsis
 *   as      element type, default "span"
 *
 * Colour comes from CSS: the element paints `currentColor` through the mask,
 * so `color` is inherited and :hover works as it would for real text.
 *
 * Selection and copy work because the real string is still there, laid over
 * the mask in the matching webfont at the matching size and rendered
 * transparent. The generated face is monospaced with the same cell as the
 * atlas, so the invisible glyph boxes line up with the visible pixels exactly
 * — dragging across the word highlights the word, and the clipboard gets text.
 */
export function PixelText({
  children,
  size = 12,
  weight = 400,
  scale = 1,
  upper = false,
  maxCh,
  as: Tag = "span",
  className = "",
  style,
  title,
  ...rest
}) {
  const source = Array.isArray(children)
    ? children.join("")
    : String(children ?? "");
  const raw = upper ? source.toUpperCase() : source;
  const text = maxCh ? fit(raw, maxCh) : raw;

  const atlas = useAtlas(size, weight);
  const step = Math.max(1, Math.round(scale));

  const mask = useMemo(() => {
    if (!atlas || !canRender(text, atlas)) return null;
    return maskFor(text, atlas, step);
  }, [atlas, text, step]);

  // Before the atlas decodes, or for a string with a glyph the sheet lacks,
  // fall back to ordinary text. Softer, but never missing.
  if (!mask) {
    return (
      <Tag
        className={`pxt pxt--fallback ${className}`}
        style={style}
        title={title ?? (text !== raw ? raw : undefined)}
        {...rest}
      >
        {text}
      </Tag>
    );
  }

  const { meta } = atlas;

  return (
    <Tag
      className={`pxt ${className}`}
      title={title ?? (text !== raw ? raw : undefined)}
      style={{
        width: mask.width,
        height: mask.height,
        WebkitMaskImage: `url(${mask.url})`,
        maskImage: `url(${mask.url})`,
        ...style,
      }}
      {...rest}
    >
      <span
        className="pxt__text"
        style={{
          fontFamily: `"TerminusPx${meta.size}", monospace`,
          fontSize: meta.size * step,
          lineHeight: `${meta.cellH * step}px`,
          fontWeight: meta.weight,
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
