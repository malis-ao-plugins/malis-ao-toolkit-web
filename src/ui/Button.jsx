import { cx } from "./cx";
import { pixelize } from "./pixel";

/**
 * Push button.
 *
 * variant: "default" | "primary" | "danger" | "ghost"
 * size:    "sm" | "md" | "lg"
 */
export function Button({
  variant = "default",
  size = "md",
  block = false,
  className,
  children,
  ...rest
}) {
  return (
    <button
      type="button"
      className={cx(
        "ph-btn",
        variant !== "default" && `ph-btn--${variant}`,
        size !== "md" && `ph-btn--${size}`,
        block && "ph-btn--block",
        className,
      )}
      {...rest}
    >
      {pixelize(children, { upper: true, size: size === "lg" ? 16 : 12 })}
    </button>
  );
}

export default Button;
