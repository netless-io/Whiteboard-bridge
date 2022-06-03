import "core-js/stable";
import "regenerator-runtime/runtime";
import "./Polyfill";
import "./Global";
import "./bridge/WebSocket";
import * as React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";
import { addDebugFunctions } from "./Debug";
import { WindowManager } from '@netless/window-manager';
import html2canvas from 'html2canvas';
import { registerSDKBridge } from "./bridge/SDKBridge";

ReactDOM.render(
  <App />,
  document.getElementById("root") as HTMLElement,
);

export const whiteboardContainerId = "whiteboard-container";

function setBackgroundColor(r: number, g: number, b: number, a?: number) {
  const div = document.getElementById(whiteboardContainerId);
  if (div) {
    const color = (a === 1 || a === undefined) ? `rgb(${r}, ${g}, ${b})` : `rgb(${r}, ${g}, ${b})`;
    div.style.background = color;
  } else {
    console.log(whiteboardContainerId, "not exist");
  }
}

registerSDKBridge();

window.registerApp = WindowManager.register;
window.setBackgroundColor = setBackgroundColor;
window.html2canvas = html2canvas;

// Debug functions
addDebugFunctions();