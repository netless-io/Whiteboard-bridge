import "core-js/stable";
import "regenerator-runtime/runtime";
import "./Polyfill";
import "./Global";
import "./WebSocket";
import * as React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";
import { addDebugFunctions } from "./debug/Debug";
import { WindowManager } from '@netless/window-manager';
import { registerSDKBridge } from "./bridge/SDK";
import { addPcmDebugFunctions } from "./debug/PcmDebug";

ReactDOM.render(
  <App />,
  document.getElementById("root") as HTMLElement,
);

registerSDKBridge();

window.registerApp = WindowManager.register;

// Debug functions
if (process.env.NODE_ENV === 'development') {
  addDebugFunctions();
  addPcmDebugFunctions();
}