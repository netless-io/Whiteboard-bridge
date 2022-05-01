import "core-js/stable";
import "regenerator-runtime/runtime";
import "./Polyfill";
import "./bridge/Global";
import "./bridge/WebSocket";
import * as React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";
import { addExamples } from "./Example";

ReactDOM.render(
  <App />,
  document.getElementById("root") as HTMLElement,
);

// Example functions
addExamples();