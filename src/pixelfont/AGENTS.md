# pixelfont — notes for agents

This folder draws text as one-bit bitmaps, so it comes out with hard pixel edges and no
antialiasing at any zoom. It is plain ES modules with no dependencies and no build step.

`README.md` next to this file explains how the library works and what the atlas format is.
This file is about working with it from another project.

## This folder is shared

It is a junction to a single source folder on this machine, not a copy that belongs to the
project you are working in. Anything you change here changes for every project at once, and
nothing you change here is tracked by the repository you are in.

So: do not edit these files. If something needs fixing or extending, stop and say what is
needed. Do not commit this folder either; it is ignored on purpose.

## Using it

Load an atlas once at startup, then refer to it by the name you gave it.

    import { loadFont } from "./pixelfont/index.js";
    await loadFont("chat", "./pixelfont/fonts/verdana-13.json");

Two elements are then available. They are ordinary custom elements, so they work the same in
plain JavaScript and in a framework.

    <pixel-text font="chat" ink="#ffdd55" scale="2">Hello</pixel-text>
    <pixel-input font="chat" scale="2"></pixel-input>

The input behaves like a text field. It has a value, it can be focused, and it fires input and
change events. It also accepts `selection-bg` and `selection-ink` if the default selection
colours clash with the surrounding design.

To draw text yourself instead:

    import { getFont, onDeviceScaleChange } from "./pixelfont/index.js";
    const font = getFont("chat");
    font.measure(text);                          // width in pixels
    font.render(text, { ink, scale, canvas });   // sizes the canvas for you
    font.draw(ctx, text, x, y, { ink, scale });  // into a canvas you already own

## Four things that will silently undo it

Each of these puts the blur back. They are easy to introduce by accident and hard to notice
until someone looks closely at a screenshot.

**Never let stylesheet rules scale these canvases.** A blanket rule that caps canvas width
resamples them. Put the canvas in a container that scrolls instead.

**Keep the scale a whole number.** A fractional scale lands pixels on fractional boundaries,
and the browser smooths the result.

**Serve the page over HTTP.** Modules and network requests do not work from a file path.

**If you draw to your own canvas, re-render when the device pixel ratio changes.** Subscribe
with `onDeviceScaleChange`. Zooming the browser changes the ratio, and therefore changes what
size every canvas should be. Without this a canvas keeps whatever size it was last given, and
only corrects itself the next time something happens to redraw it, which looks like elements
resizing when they are clicked.

## Fonts

Each atlas holds one face at one size in one style, and lives in `fonts/`. Four exist so far:
Verdana at 13, Verdana bold at 13, Verdana bold at 20, and Lucida Console at 16.

Making a new one runs the font through the operating system's own rasteriser, which only works
on the machine that owns this folder. Ask for the atlas you need rather than trying to generate
one. When you ask, give the face name, the style, and the cell height in pixels — that is a
pixel height, not a point size, and the two are not the same number.

Characters that are not in an atlas draw nothing and log a warning once. If text is coming out
with gaps, that is usually why.

## What it does not do

The input has no preview while composing text through an input method editor; characters appear
only once they are committed. It is not a form control, so it has no name, no disabled or
readonly state, no length limit, and it will not submit with a form. On a touch screen, dragging
across it selects text rather than scrolling.
