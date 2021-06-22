import dsBridge from "dsbridge";

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

    // 以下接口与 akko 中的 websocket interface 保持一致，没有与 web 端的 websocket 接口保持完全一致
    // 1. 不支持 EventListenerObject
    // 2. event 仅实现了上层对应 Event，没有实现 Event 那一些的接口。
    addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: FakeWebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void;

    removeEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: FakeWebSocket, ev: WebSocketEventMap[K]) => any, options?: boolean | EventListenerOptions): void;
}

function hookWebSocket() {
    const originConstructor = WebSocket;
    (WebSocket as any) = function(url, protocols?) {
        if (window.fpa) {
            return new WebSocketBridge(url);
        } else {
            return new originConstructor(url, protocols);
        }
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

    // TODO:考虑一个正在 close，另一个在初始化，此时 native 回调前后交错。
    public constructor(url: string) {
        this.registerBridge();
        dsBridge.call("ws.setup", url);
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
    private listeners: {[K in string]: any[]} = {};
    private onceListeners: {[K in string]: any[]} = {};
    
    public send(data: string | ArrayBuffer): void {
        if (data instanceof ArrayBuffer) {
            const str = encodeArrayBufferAsBase64(data);
            console.log("send data: ", data, " str: ", str);
            dsBridge.call("ws.send", {data: str, type: "arraybuffer"});
        } else {
            dsBridge.call("ws.send", {data, type: "string"});
        }
    }

    public close(code?: number, reason?: string): void {
        console.log("close: ", {code, reason});
        this._readyState = ReadyState.CLOSING;
        dsBridge.call("ws.close", {code, reason});
        // 主动调用 websocket 的 close 方法，web 端应该仍然会主动触发 close 事件。这部分操作，在 native 端实现
    }


    public addEventListener<K extends keyof WebSocketEventMap>(type: K, listener: (this: FakeWebSocket, evt: WebSocketEventMap[K]) => any, options?: boolean | AddEventListenerOptions): void {
        this.listeners[type] = this.listeners[type] || [];
        this.onceListeners[type] = this.onceListeners[type] || [];
        if (options && options !== true && options.once) {
            this.onceListeners[type].push(listener);
        } else {
            this.listeners[type].push(listener);
        }
    }

    public removeEventListener<K extends keyof WebSocketEventMap>(
        type: K, listener: (this: FakeWebSocket, ev: WebSocketEventMap[K]) => any,
        options?: boolean | EventListenerOptions): void {
        if (!(type in this.listeners)) {
            return;
        }
        const stack = this.listeners[type];
        for (let i = 0, l = stack.length; i < l; i++) {
            if (stack[i] === listener){
                stack.splice(i, 1);
                break;
            }
        }
        const onceStack = this.onceListeners[type];
        for (let i = 0, l = onceStack.length; i < l; i++) {
            if (onceStack[i] === listener){
                onceStack.splice(i, 1);
                break;
            }
        }
    }

    public dispatchEvent<K extends keyof WebSocketEventMap>(type: K, event :WebSocketEventMap[K]): boolean {
        if (!(type in this.listeners)) {
            return true;
        }
        const stack = this.listeners[type].slice();
        for (let i = 0, l = stack.length; i < l; i++) {
            stack[i].call(this, event);
        }
        const onceStack = this.onceListeners[type].slice();
        for (let i = 0, l = onceStack.length; i < l; i++) {
            onceStack[i].call(this, event);
            onceStack.splice(i, 1);
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
        // 因为是伪造的 Event，所以缺少 Event 中的一系列属性，用 any 替换一下
        if (message.type === "arraybuffer") {
            this.dispatchEvent("message", {data: base64ToArrayBuffer(message.data)} as any);
        } else {
            this.dispatchEvent("message", {data: message.data} as any);
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
        });
    }
}