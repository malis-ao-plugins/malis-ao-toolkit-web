import { useState, useEffect, useRef } from "react";

export function useWebSocket() {
  const ws = useRef(null);
  const onMessageRef = useRef(null);

  const [connected, setConnected] = useState(false);
  const [rolling, setRolling] = useState(false);

  useEffect(() => {
    let timer;
    let mounted = true; // ← guard

    const connect = () => {
      if (!mounted) return; // ← stop ghost reconnects
      try {
        ws.current = new WebSocket("ws://localhost:7069/ws");
        ws.current.onopen = () => {
          if (mounted) setConnected(true);
        };
        ws.current.onclose = () => {
          if (!mounted) return; // ← don't reconnect after unmount
          setConnected(false);
          timer = setTimeout(connect, 2000);
        };
        ws.current.onerror = () => ws.current?.close(); // ← surface errors
        ws.current.onmessage = (e) =>
          onMessageRef.current?.(JSON.parse(e.data));
      } catch {}
    };

    connect();

    return () => {
      mounted = false; // ← signal all async callbacks to bail
      clearTimeout(timer);
      ws.current?.close();
      ws.current = null;
    };
  }, []);

  const send = (msg) => {
    return (
      ws.current?.readyState === WebSocket.OPEN &&
      ws.current.send(JSON.stringify(msg))
    );
  };
  const setMessageHandler = (fn) => {
    onMessageRef.current = fn;
  };

  return { connected, rolling, setRolling, send, setMessageHandler };
}
