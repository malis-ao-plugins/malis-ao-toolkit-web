import { useEffect, useRef, useState } from "react";
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

export default function OverlayInputProxy() {
  const inputRef = useRef(null);
  const [field, setField] = useState(null);

  useEffect(() => {
    const stopInit = window.electronAPI?.onOverlayInputProxyInit?.((next) => {
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
    });
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
        padding: 0,
        border: 0,
        outline: "none",
        background: "transparent",
        color: "transparent",
        caretColor: field.caretColor || "#ffb454",
        fontFamily: field.fontFamily || "monospace",
        fontSize: field.fontSize || "13px",
        fontWeight: field.fontWeight || 400,
        lineHeight: field.lineHeight || "normal",
        letterSpacing: field.letterSpacing || "normal",
        textAlign: field.textAlign || "left",
        boxSizing: "border-box",
      }}
    />
  );
}
