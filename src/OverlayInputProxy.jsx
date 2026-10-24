import { useEffect, useRef, useState } from "react";
import { installMetricsFontByName } from "./ui/fonts";
import "./OverlayInputProxy.css";

const sendChange = (field, input) => {
  if (!field || !input) return;

  window.electronAPI?.sendOverlayInputProxyChange?.({
    id: field.id,
    value: input.value,
    selectionStart: input.selectionStart,
    selectionEnd: input.selectionEnd,
    scrollLeft: input.scrollLeft,
  });
};

const proxyFontSize = (field) => {
  const size = Number.parseFloat(field?.fontSize);
  const scale = Number(field?.pixelScale) || 1;
  return Number.isFinite(size) ? `${size * scale}px` : field?.fontSize || "13px";
};

export default function OverlayInputProxy() {
  const inputRef = useRef(null);
  const [field, setField] = useState(null);

  useEffect(() => {
    let latestInit = 0;
    const activate = async (next) => {
      const initId = ++latestInit;
      if (next.metricsFontKey) {
        const family = await installMetricsFontByName(next.metricsFontKey);
        if (family) {
          await document.fonts.load(
            `${next.fontWeight || 400} ${proxyFontSize(next)} "${family}"`,
          );
        }
      }
      if (initId !== latestInit) return;

      setField(next);
      requestAnimationFrame(() => {
        const input = inputRef.current;
        if (!input) return;
        input.focus({ preventScroll: true });
        input.setSelectionRange(
          next.selectionStart ?? next.value.length,
          next.selectionEnd ?? next.value.length,
        );
        input.scrollLeft = next.scrollLeft ?? 0;
      });
    };
    const stopInit = window.electronAPI?.onOverlayInputProxyInit?.(activate);
    const stopUpdate = window.electronAPI?.onOverlayInputProxyUpdate?.((update) => {
      setField((current) => {
        if (!current || current.id !== update.id || current.value === update.value) {
          return current;
        }
        return { ...current, value: update.value };
      });
    });
    window.electronAPI?.readyOverlayInputProxy?.();

    return () => {
      stopInit?.();
      stopUpdate?.();
    };
  }, []);

  useEffect(() => {
    document.documentElement.style.cssText =
      "margin:0;width:100%;height:100%;overflow:hidden;background:transparent";
    document.body.style.cssText =
      "margin:0;width:100%;height:100%;overflow:hidden;background:transparent";
    const root = document.getElementById("root");
    if (root) {
      root.style.cssText =
        "width:100%;height:100%;overflow:hidden;background:transparent";
    }
  }, []);

  const change = (event) => {
    setField((current) => {
      if (!current) return current;
      const next = { ...current, value: event.target.value };
      sendChange(next, event.target);
      return next;
    });
  };

  if (!field) return null;

  return (
    <input
      ref={inputRef}
      className="ao-text-input-proxy"
      autoFocus
      type={field.type || "text"}
      value={field.value ?? ""}
      placeholder={field.placeholder || ""}
      inputMode={field.inputMode}
      maxLength={field.maxLength}
      spellCheck={false}
      onFocus={() => window.electronAPI?.reportOverlayInputProxyFocus?.()}
      onChange={change}
      onSelect={(event) => sendChange(field, event.currentTarget)}
      onScroll={(event) => sendChange(field, event.currentTarget)}
      onKeyDown={(event) => {
        if (event.key !== "Enter" && event.key !== "Escape") return;
        event.preventDefault();
        window.electronAPI?.finishOverlayInputProxy?.({
          id: field.id,
          commit: true,
        });
      }}
      style={{
        position: "absolute",
        inset: 0,
        display: "block",
        width: "100%",
        height: "100%",
        margin: 0,
        outline: "none",
        background: "transparent",
        color: "transparent",
        caretColor: "transparent",
        fontFamily: field.fontFamily || "monospace",
        fontSize: proxyFontSize(field),
        fontWeight: field.fontWeight || 400,
        fontStyle: field.fontStyle || "normal",
        lineHeight: field.lineHeight || "normal",
        letterSpacing: field.letterSpacing || "normal",
        textAlign: field.textAlign || "left",
        textIndent: field.textIndent || "0px",
        padding: field.padding || "0px",
        borderWidth: field.borderWidth || "0px",
        borderStyle: "solid",
        borderColor: "transparent",
        boxSizing: field.boxSizing || "border-box",
        direction: field.direction || "ltr",
      }}
    />
  );
}
