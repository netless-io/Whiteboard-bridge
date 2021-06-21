import dsBridge from "dsbridge";

// 以下 interface 与 akko 中的 websocket interface 保持一致
interface MessageEvent {
    readonly data: string | ArrayBuffer;
}

interface WebSocketEventMap {
    close: CloseEvent;
    error: Event;
    message: MessageEvent;
    open: Event;
}

enum ReadyState {
    CONNECTING = 0,
    OPEN = 1,
    CLOSING = 2,
    CLOSED = 3,
}

export interface FakeWebSocket {

    binaryType: BinaryType;

    readonly bufferedAmount: number;
    readonly readyState: ReadyState;

    send(data: string | ArrayBuffer | Buffer): void;
    close(code?: number, reason?: string): void;

    addEventListener<K extends keyof WebSocketEventMap>(
        type: K, listener: (this: FakeWebSocket, ev: WebSocketEventMap[K]) => any,
        options?: boolean | AddEventListenerOptions): void;

    removeEventListener<K extends keyof WebSocketEventMap>(
        type: K, listener: (this: FakeWebSocket, ev: WebSocketEventMap[K]) => any,
        options?: boolean | EventListenerOptions): void;
}

function hookWebSocket() {
    (WebSocket as any) = function(url) {
        // TODO: 最好有开关
        return new WebSocketBridge(url);
    }
}

hookWebSocket();

function encodeArrayBufferAsBase64(ab) {
    var arr = new Uint8Array(ab);
    var binary = '';
    var len = arr.length;
    for (var i = 0; i < len; i++) {
        binary += String.fromCharCode(arr[i]);
    }
    return window.btoa(binary);
};

function base64ToArrayBuffer(base64) {
    var binary_string = window.atob(base64);
    var len = binary_string.length;
    var bytes = new Uint8Array(len);
    for (var i = 0; i < len; i++) {
        bytes[i] = binary_string.charCodeAt(i);
    }
    return bytes.buffer;
}

// 最终应该在底层把 akko-socket 拆解掉比较好
export class WebSocketBridge implements FakeWebSocket {
    // "arraybuffer" | "blob";
    public binaryType = "blob" as const;

    public constructor(url: string) {
        dsBridge.call("ws.setup", url);
        this.registerBridge();
    }

    // TODO:测试该状态
    public get readyState(): ReadyState {
        return this._readyState;
    }

    // TODO:实现该值
    public get bufferedAmount(): number {
        return this._bufferedAmount;
    }

    private _readyState = ReadyState.CONNECTING;
    private _bufferedAmount = 0;
    private listeners: {[K in string]: any} = {};
    
    public send(data: string | ArrayBuffer | Buffer): void {
        // string 可以直接传，其他不可以
        if (data instanceof Buffer) {
            
        } else if (data instanceof ArrayBuffer) {
            const str = encodeArrayBufferAsBase64(data)
            console.log("send data: ", data, " str: ", str);
            dsBridge.call("ws.send", {data: str, type: "arraybuffer"});
        } else {
            dsBridge.call("ws.send", {data, type: "string"});
        }
    }

    // TODO:确认正常 websocket 主动调用 close，是否也会回调 onClose 事件，然后实现对应逻辑
    public close(code?: number, reason?: string): void {
        console.log("close: ", {code, reason});
        this._readyState = ReadyState.CLOSING;
        dsBridge.call("ws.close", {code, reason});
    }


    // FIXME:实现option 以及 once 等操作逻辑
    public addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: FakeWebSocket, evt: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
        if (!(type in this.listeners)) {
            this.listeners[type] = [];
        }
        this.listeners[type].push(listener);
    }

    public removeEventListener<K extends keyof WebSocketEventMap>(
        type: K, listener: (this: FakeWebSocket, ev: WebSocketEventMap[K]) => any,
        options?: boolean | EventListenerOptions): void {
        if (!(type in this.listeners)) {
            return;
        }
        var stack = this.listeners[type];
        for (var i = 0, l = stack.length; i < l; i++) {
            if (stack[i] === listener){
                stack.splice(i, 1);
                return;
            }
        }
    }

    public dispatchEvent<K extends keyof WebSocketEventMap>(type: K, event :WebSocketEventMap[K]): boolean {
        if (!(type in this.listeners)) {
            return true;
        }
        var stack = this.listeners[type].slice();
        
        for (var i = 0, l = stack.length; i < l; i++) {
            stack[i].call(this, event);
        }
        return true;
    }

    private _onError = (e: any) => {
        console.log("_onError: ", e);
        // 是否要处理 readyState
        this.dispatchEvent("error", e);
    }

    private _onMessage = (message: {data: string, type: BinaryType}) => {
        console.log("_onMessage: ", message);
        if (message.type === "arraybuffer") {
            this.dispatchEvent("message", {data: base64ToArrayBuffer(message.data)});
        } else {
            this.dispatchEvent("message", {data: message.data});
        }
    }

    private _onClose = (event: CloseEvent) => {
        console.log("_onClose: ", event);
        this._readyState = ReadyState.CLOSED;
        this.dispatchEvent("close", event);
    }

    private _onOpen = () => {
        console.log("_onOpen");
        this._readyState = ReadyState.OPEN;
        this.dispatchEvent("open", {} as any);
    }

    private registerBridge() {
        dsBridge.register("ws", {
            onError: this._onError,
            onMessage: this._onMessage,
            onClose: this._onClose,
            onOpen: this._onOpen,    
        })
    }
}