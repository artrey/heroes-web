import React from "react";
import ReactDOM from "react-dom/client";

import { App } from "./App";
import { installNetworkHooks } from "./net/sync";

import "./styles.css";

installNetworkHooks();

ReactDOM.createRoot(document.getElementById("root")!).render(
  <React.StrictMode>
    <App />
  </React.StrictMode>,
);
