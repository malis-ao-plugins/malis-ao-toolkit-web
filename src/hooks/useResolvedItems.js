import { useState, useEffect, useMemo, useRef } from "react";
import { getItemMembers, getItemNames, getItemIcons } from "../lib/db";

export function useResolvedItems(stubs) {
  const [resolved, setResolved] = useState([]);
  const stableKey = useMemo(
    () => stubs.map((s) => `${s.ids.join("-")}-${s.ql ?? ""}`).join("|"),
    [stubs],
  );

  const stubsRef = useRef(stubs);
  stubsRef.current = stubs;

  useEffect(() => {
    const currentStubs = stubsRef.current;
    if (currentStubs.length === 0) {
      setResolved([]);
      return;
    }
    let cancelled = false;
    (async () => {
      const items = await Promise.all(
        currentStubs.map(async (stub) => {
          const raw = await getItemMembers(stub.ids[0]);
          const memberList = raw.filter(
            (m, i, arr) => arr.findIndex((x) => x.id === m.id) === i,
          );
          const member =
            memberList.find((m) => m.ql === stub.ql) ?? memberList[0];
          const [nameMap, iconMap] = await Promise.all([
            getItemNames(memberList.map((m) => m.id)),
            getItemIcons(memberList.map((m) => m.id)),
          ]);
          const members = memberList.map((m) => ({
            ...m,
            name: nameMap[m.id] ?? null,
            iconSrc: iconMap[m.id] ?? null,
          }));
          return {
            ...stub,
            low_id: stub.ids[0],
            high_id: stub.ids[1],
            members,
            name: nameMap[member.id] ?? null,
          };
        }),
      );
      if (!cancelled) setResolved(items);
    })().catch((err) => console.error("useResolvedItems failed", err));
    return () => {
      cancelled = true;
    };
  }, [stableKey]);

  return resolved;
}
