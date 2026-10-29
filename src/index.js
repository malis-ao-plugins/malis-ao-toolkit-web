import React from "react";
import ReactDOM from "react-dom/client";
import App from "./App";
import "./ui";
import "./styles/base.css";
import "./styles/app.css";
import "./items/items.css";
import "./styles/overlay.css"
// Listens for the window moving over the game; see shell/overlay.js.
import "./shell/overlay";

const root = ReactDOM.createRoot(document.getElementById("root"));

root.render(<App />);
