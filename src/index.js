import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import OverlayInputProxy from "./OverlayInputProxy";
import "./ui";
import "./styles/base.css";
import "./styles/app.css";
import "./items/items.css";
import "./styles/overlay.css"

const root = ReactDOM.createRoot(document.getElementById("root"));
const params = new URLSearchParams(window.location.search);
const overlayMode = params.get("overlay") === "1";
const inputProxyMode = params.get("inputProxy") === "1";

if (overlayMode || inputProxyMode) {
  document.documentElement.classList.add("overlay-mode");
  document.body.classList.add("overlay-mode");
}

root.render(inputProxyMode ? <OverlayInputProxy /> : <App />);
