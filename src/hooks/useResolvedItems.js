import { useEffect, useMemo, useRef, useState } from "react";
import { iconsOf, membersOf, namesOf } from "../lib/itemCache";

/**
 * Turn `{ ids, ql }` stubs into items with templates, names and icons.
 *
 * The roll list and a mission's rewards both store an item as little more
 * than an id, because that is all the plugin sends. This fills them in.
 *
 * It used to do so one stub at a time — for each, fetch the family, then its
 * names, then its icons — so a fifty-entry roll list was about a hundred and
 * fifty requests, repeated in full whenever the list changed, with nothing
 * shared between entries or with the rest of the app. The families still
 * need one request each (the service has no batch endpoint for them), but
 * they are cached; the names and icons are now one batched, cached request
 * for the union of every id involved.
 *
 * A stub whose family cannot be fetched is dropped rather than failing the
 * whole list: one dead id should not empty the panel.
 */

const stubKey = (stub) => `${stub.ids?.join("-") ?? ""}@${stub.ql ?? ""}`;

export function useResolvedItems(stubs) {
  const [resolved, setResolved] = useState([]);

  // The array identity changes on every render of the panel above; its
  // contents are what actually decide whether there is new work.
  const key = useMemo(() => stubs.map(stubKey).join("|"), [stubs]);

  const stubsRef = useRef(stubs);
  stubsRef.current = stubs;

  useEffect(() => {
    const current = stubsRef.current;

    if (!current.length) {
      setResolved((prev) => (prev.length ? [] : prev));
      return undefined;
    }

    let cancelled = false;

    (async () => {
      const families = await Promise.all(
        current.map((stub) =>
          membersOf(stub.ids[0]).catch((err) => {
            console.error("[items] could not resolve", stub.ids?.[0], err);
            return null;
          }),
        ),
      );
      if (cancelled) return;

      const ids = families.flatMap((family) => family?.map((m) => m.id) ?? []);
      const [names, icons] = await Promise.all([namesOf(ids), iconsOf(ids)]);
      if (cancelled) return;

      setResolved(
        current.flatMap((stub, i) => {
          const family = families[i];
          if (!family?.length) return [];

          const members = family.map((m) => ({
            ...m,
            name: names[m.id] ?? null,
            iconSrc: icons[m.id] ?? null,
          }));

          // The template a stub's QL actually lands on names the item.
          const active =
            members.find((m) => m.ql === stub.ql) ?? members[0];

          return [
            {
              ...stub,
              low_id: stub.ids[0],
              high_id: stub.ids[1],
              members,
              name: active.name,
            },
          ];
        }),
      );
    })().catch((err) => console.error("[items] resolve failed", err));

    return () => {
      cancelled = true;
    };
  }, [key]);

  return resolved;
}

export default useResolvedItems;
