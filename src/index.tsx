import "core-js/stable";
// The appliance lifecycle calls Promise.allSettled during force-Done. Keep
// this feature import explicit because the legacy Babel/core-js compatibility
// data used by this bridge can omit this stable API from the broad entry.
import "core-js/features/promise/all-settled";
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
