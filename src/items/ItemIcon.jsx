import { cx } from "../ui";
import "./items.css";

/**
 * An AO item icon.
 *
 * The source art is 48x48, so the only sizes that survive are 48, 24, 16 and
 * 12 — whole divisors. Anything else resamples and the icon stops matching the
 * text beside it, which after all the work on the glyphs is the last thing
 * worth getting wrong.
 *
 *   size: "full" (48) | "half" (24) | "tiny" (16)
 */
export function ItemIcon({ src, alt = "", size = "full", className, ...rest }) {
  return (
    <span
      className={cx("iicon", `iicon--${size}`, !src && "iicon--empty", className)}
      {...rest}
    >
      {src && (
        <img
          src={src}
          alt={alt}
          draggable={false}
          onError={(e) => {
            e.currentTarget.style.visibility = "hidden";
          }}
        />
      )}
    </span>
  );
}

export default ItemIcon;
