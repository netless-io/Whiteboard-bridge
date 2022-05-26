import "core-js/stable";
import "regenerator-runtime/runtime";
import "./Polyfill";
import "./bridge/Global";
import "./bridge/WebSocket";
import * as React from "react";
import * as ReactDOM from "react-dom";
import App from "./App";
import { addExamples } from "./Example";
import { WindowManager } from '@netless/window-manager';
import html2canvas from 'html2canvas';
import { asyncDisplayerNameSpace, displayerNameSpace } from "./bridge/DisplayerBridge";
import { registerSDKBridge, sdkNameSpace } from "./bridge/SDKBridge";
import { registerBridge } from "./utils/Funs";
import { logger } from "./utils/Logger";
import { playerNameSpace, playerStateNameSpace } from "./bridge/PlayerBridge";
import { roomNamespace, pptNamespace, roomSyncNamespace, roomStateNamespace } from "./bridge/RoomBridge";

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
registerBridge([
  sdkNameSpace,
  displayerNameSpace, asyncDisplayerNameSpace,
  roomNamespace, pptNamespace, roomSyncNamespace, roomStateNamespace,
  playerNameSpace, playerStateNameSpace
], logger);

window.registerApp = WindowManager.register;
window.setBackgroundColor = setBackgroundColor;
window.html2canvas = html2canvas;

// Example functions
addExamples();