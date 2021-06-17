import dsBridge from "dsbridge";

// 以下 interface 与 akko 中的 websocket interface 保持一致
interface MessageEvent {
    readonly data: string | ArrayBuffer;
}

interface WebSocketEventMap {
    close: CloseEvent;
    error: {};
    message: MessageEvent;
    open: {};
}

interface AddEventListenerOptions extends EventListenerOptions {
    once?: boolean;
    passive?: boolean;
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

function ab2str(buf: ArrayBuffer) {
    console.log(new Uint16Array(buf));
    return String.fromCharCode.apply(null, new Uint16Array(buf) as any);
}

function str2ab(str: string) {
    var buf = new ArrayBuffer(str.length * 2); // 2 bytes for each char
    var bufView = new Uint16Array(buf);
    for (var i = 0, strLen = str.length; i < strLen; i++) {
      bufView[i] = str.charCodeAt(i);
    }
    return buf;
}

// 最终应该在底层把 akko-socket 拆解掉比较好
export class WebSocketBridge implements FakeWebSocket {
    // "arraybuffer" | "blob";
    public binaryType = "blob" as const;

    public constructor(url: string) {
        dsBridge.call("ws.setup", url);
        this.registerBridge();
    }

    public get readyState(): ReadyState {
        return this._readyState;
    }

    public get bufferedAmount(): number {
        return this._bufferedAmount;
    }

    private _readyState = ReadyState.CONNECTING;
    private _bufferedAmount = 0;
    private listeners: {[K in string]: any} = {};
    
    public send(data: string | ArrayBuffer | Buffer): void {
        console.log("send: ", data);
        // string 可以直接传，其他不可以
        if (data instanceof Buffer) {
            
        } else if (data instanceof ArrayBuffer) {
            const str = ab2str(data)
            dsBridge.call("ws.send", {data: str, type: "arraybuffer"});
        } else {
            dsBridge.call("ws.send", {data, type: "string"});
        }
    }

    public close(code?: number, reason?: string): void {
        console.log("close: ", {code, reason});
        this._readyState = ReadyState.CLOSING;
        dsBridge.call("ws.close", {code, reason});
    }

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
            this.dispatchEvent("message", {data: str2ab(message.data)});
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
        this.dispatchEvent("open", {});
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