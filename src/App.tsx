import React, { useEffect, useRef } from "react";
import { globalErrorEvent, postCustomMessage } from "./utils/Funs";
import { setWhiteboardDivGetter } from "./bridge/SDK";
import "@netless/window-manager/dist/style.css";
import '@hqer/appliance-plugin/dist/style.css'; 
import "./App.css";
import 'video.js/dist/video-js.css';

export const whiteboardContainerId = "whiteboard-container";

export default function App() {
    useEffect(()=> {
        return () => {
            window.removeEventListener("error", globalErrorEvent);
            window.removeEventListener("message", postCustomMessage);
        }
    }, []);

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