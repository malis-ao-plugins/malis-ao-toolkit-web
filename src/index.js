import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./ui";
import "./styles/base.css";
import "./styles/app.css";
import "./items/items.css";
import "./styles/overlay.css"

const root = ReactDOM.createRoot(document.getElementById("root"));
const params = new URLSearchParams(window.location.search);
const overlayMode = params.get("overlay") === "1";

if (overlayMode) {
  document.documentElement.classList.add("overlay-mode");
  document.body.classList.add("overlay-mode");
}

root.render(<App />);
