import { cx } from "./cx";
import { PixelText } from "../packages/pixel-text";

/**
 * Titled container. The head doubles as the collapse control when
 * `collapsible` is set, and as a drag handle when the host passes
 * `onHeadMouseDown` (the window shell uses that for section reordering).
 */
export function Panel({
  title,
  right,
  collapsible = false,
  open = true,
  onToggle,
  onHeadMouseDown,
  flush = false,
  className,
  bodyClassName,
  children,
}) {
  const interactive = collapsible || !!onHeadMouseDown;

  return (
    <div className={cx("ph-panel", className)}>
      {title != null && (
        <div
          className={cx(
            "ph-panel__head",
            interactive && "ph-panel__head--clickable",
          )}
          onMouseDown={onHeadMouseDown}
          onClick={collapsible ? onToggle : undefined}
        >
          {collapsible && (
            <span className="ph-panel__caret">{open ? "−" : "+"}</span>
          )}
          <PixelText className="ph-panel__title">
            {String(title).toUpperCase()}
          </PixelText>
          {right}
        </div>
      )}

      {open && (
        <div
          className={cx(
            "ph-panel__body",
            flush && "ph-panel__body--flush",
            bodyClassName,
          )}
        >
          {children}
        </div>
      )}
    </div>
  );
}

export default Panel;
