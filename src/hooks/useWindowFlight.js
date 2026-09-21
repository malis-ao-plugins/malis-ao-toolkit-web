import { useLayoutEffect, useState } from "react";

/**
 * A window's way in and way out: it flies out of the launcher puck when it
 * opens and back into it when it is dismissed.
 *
 * Shared so every floating window behaves the same. An app window and the
 * options window are the same kind of thing to look at, and one of them
 * appearing instantly while the other glides is the sort of difference you
 * notice without being able to name.
 *
 * The offset is measured at the moment each flight starts: the puck is fixed,
 * but a window can be anywhere and can have been moved since it opened.
 */

const reducedMotion = () =>
  window.matchMedia?.("(prefers-reduced-motion: reduce)").matches ?? false;

/** How far the puck is from the window, as the custom properties CSS moves by. */
function setFlight(el, from, to) {
  el.style.setProperty(
    "--fly-x",
    `${to.left + to.width / 2 - (from.left + from.width / 2)}px`,
  );
  el.style.setProperty(
    "--fly-y",
    `${to.top + to.height / 2 - (from.top + from.height / 2)}px`,
  );
}

/** Matches the transition in app.css. */
export const FLIGHT_MS = 180;

export function useWindowFlight(ref, onGone) {
  const [entering, setEntering] = useState(true);
  const [flying, setFlying] = useState(true);
  const [leaving, setLeaving] = useState(false);

  useLayoutEffect(() => {
    const el = ref.current;
    const puck = document.querySelector(".lch__puck");

    if (!el || !puck || reducedMotion()) {
      setEntering(false);
      setFlying(false);
      return undefined;
    }

    setFlight(el, el.getBoundingClientRect(), puck.getBoundingClientRect());

    // one frame at the puck, then let the transition carry it out to where it
    // belongs — set before paint, so it is never seen at full size first
    const id = requestAnimationFrame(() => setEntering(false));

    // and the transition itself is gone once it has landed, so a drag can
    // never pick it up
    const done = setTimeout(() => setFlying(false), FLIGHT_MS + 20);

    return () => {
      cancelAnimationFrame(id);
      clearTimeout(done);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  /** Play the way out, then tell the owner it is done. */
  const dismiss = () => {
    const el = ref.current;
    const puck = document.querySelector(".lch__puck");

    if (leaving) return;
    if (!el || !puck || reducedMotion()) {
      onGone();
      return;
    }

    setFlight(el, el.getBoundingClientRect(), puck.getBoundingClientRect());
    setLeaving(true);
    setTimeout(onGone, FLIGHT_MS);
  };

  const flightClass =
    `${flying ? " app--flying" : ""}` +
    `${entering ? " app--entering" : ""}` +
    `${leaving ? " app--leaving" : ""}`;

  return { flightClass, dismiss, leaving };
}

export default useWindowFlight;
