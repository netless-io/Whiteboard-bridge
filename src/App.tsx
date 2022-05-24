import React, { useEffect, useRef } from "react";
import { AsyncModuleLoadMode, setAsyncModuleLoadMode } from "white-web-sdk";
import { globalErrorEvent, postCustomMessage } from "./utils/Funs";
import { setWhiteboardDivGetter } from "./bridge/SDKBridge";
import "@netless/window-manager/dist/style.css";
import "./App.css";
import 'video.js/dist/video-js.css';
import { whiteboardContainerId } from ".";
import bridge from "./react-native-bridge-in";

export default function App() {
    useEffect(()=> {
        return () => {
            window.removeEventListener("error", globalErrorEvent);
            window.removeEventListener("message", postCustomMessage);
        }
    }, []);

    setAsyncModuleLoadMode(AsyncModuleLoadMode.StoreAsBase64);
    window.addEventListener("error", globalErrorEvent);
    window.addEventListener("message", postCustomMessage);

    const divRef = useRef(null);
    const fullStyle: React.CSSProperties = {position: "absolute", left: 0, top: 0, right: 0, bottom: 0, zIndex: 1};

    const getDiv = () => { return divRef.current as unknown as HTMLElement };
    setWhiteboardDivGetter(getDiv);

    return (
        <div id={whiteboardContainerId} ref={divRef} style={fullStyle}></div>
    )
}