import "core-js/stable";
import "regenerator-runtime/runtime";
import "whatwg-fetch";
import * as React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";

ReactDOM.render(
  <App />,
  document.getElementById("root") as HTMLElement,
);