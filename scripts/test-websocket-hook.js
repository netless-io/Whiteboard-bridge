const assert = require("assert/strict");
const fs = require("fs");
const path = require("path");
const vm = require("vm");
const ts = require("typescript");

const code = ts.transpileModule(fs.readFileSync(path.join(__dirname, "../src/WebSocket.ts"), "utf8"), {
    compilerOptions: { target: ts.ScriptTarget.ES5, module: ts.ModuleKind.CommonJS },
}).outputText;
const states = { CONNECTING: 0, OPEN: 1, CLOSING: 2, CLOSED: 3 };

for (const nativeWebSocket of [undefined, false, true]) {
    const calls = [], handlers = {};
    class BrowserSocket {
        constructor(url, protocols) {
            this.url = url;
            this.protocols = protocols;
            this.readyState = BrowserSocket.CONNECTING;
        }
        send(data) { this.lastSent = data; }
        close(code, reason) { this.lastClose = { code, reason }; }
    }
    for (const [name, value] of Object.entries(states)) {
        Object.defineProperty(BrowserSocket, name, { value, enumerable: true });
    }
    const context = vm.createContext({
        WebSocket: BrowserSocket,
        window: {
            nativeWebSocket,
            btoa: value => Buffer.from(value, "binary").toString("base64"),
            atob: value => Buffer.from(value, "base64").toString("binary"),
        },
        ArrayBuffer,
        Uint8Array,
        exports: {},
        console: { log() {} },
        process: { env: { NODE_ENV: "production" } },
        require(name) {
            assert.equal(name, "./bridge");
            return {
                call(method, data) { calls.push({ method, data }); },
                register(name, value) { handlers[name] = value; },
            };
        },
    });
    vm.runInContext(code, context);
    const Socket = context.WebSocket;
    assert.notEqual(Socket, BrowserSocket);
    for (const [name, value] of Object.entries(states)) {
        assert.equal(Socket[name], value, `${name}, nativeWebSocket=${nativeWebSocket}`);
        assert.deepEqual(Object.getOwnPropertyDescriptor(Socket, name),
            Object.getOwnPropertyDescriptor(BrowserSocket, name));
        assert.throws(() => vm.runInContext(`"use strict"; WebSocket.${name} = 99`, context), /TypeError/);
    }

    const protocols = ["test"];
    const socket = new Socket("wss://example.invalid/socket", protocols);
    assert.equal(socket.readyState, Socket.CONNECTING);
    if (nativeWebSocket) {
        assert.equal(calls.length, 1);
        assert.equal(calls[0].method, "ws.setup");
        assert.equal(calls[0].data.url, "wss://example.invalid/socket");
        const key = calls[0].data.key;
        const firstHandlers = handlers.ws;
        let opens = 0, closes = 0, errors = 0, message;
        socket.addEventListener("open", function () {
            assert.equal(this, socket);
            assert.equal(this.readyState, Socket.OPEN);
            opens++;
        });
        socket.addEventListener("close", function () {
            assert.equal(this.readyState, Socket.CLOSED);
            closes++;
        });
        socket.addEventListener("error", () => errors++);
        socket.addEventListener("message", event => { message = event.data; });
        firstHandlers.onOpen({ key });
        assert.equal(opens, 1);

        socket.send("hello");
        assert.equal(calls[1].method, "ws.send");
        assert.equal(calls[1].data.data, "hello");
        assert.equal(calls[1].data.type, "string");
        assert.equal(calls[1].data.key, key);
        socket.send(Uint8Array.from([1, 2, 3]).buffer);
        assert.equal(calls[2].data.data, "AQID");
        assert.equal(calls[2].data.type, "arraybuffer");
        firstHandlers.onMessage({ key, data: "world", type: "string" });
        assert.equal(message, "world");
        firstHandlers.onMessage({ key, data: "AQID", type: "arraybuffer" });
        assert.deepEqual(Array.from(new Uint8Array(message)), [1, 2, 3]);
        firstHandlers.onError({ key });
        assert.equal(errors, 1);
        assert.equal(socket.readyState, Socket.OPEN);

        socket.close(4000, "regression");
        assert.equal(socket.readyState, Socket.CLOSING);
        assert.equal(closes, 0, "requesting close must still wait for the Native close callback");
        assert.equal(calls[3].method, "ws.close");
        assert.equal(calls[3].data.code, 4000);
        assert.equal(calls[3].data.reason, "regression");
        assert.equal(calls[3].data.key, key);
        firstHandlers.onClose({ key, code: 1006 });
        assert.equal(closes, 1);
        // A consumer starting after the close event can recognize CLOSED.
        assert.equal(socket.readyState, Socket.CLOSED);

        const second = new Socket("wss://example.invalid/replacement");
        assert.equal(second.readyState, Socket.CONNECTING);
        assert.notEqual(calls[4].data.key, key);
        handlers.ws.onClose({ key, code: 1006 });
        assert.equal(second.readyState, Socket.CONNECTING, "old key must not close the replacement");
        assert.equal(socket.readyState, Socket.CLOSED);
    } else {
        assert(socket instanceof BrowserSocket);
        assert.equal(socket.url, "wss://example.invalid/socket");
        assert.equal(socket.protocols, protocols);
        assert.equal(socket.send, BrowserSocket.prototype.send);
        assert.equal(socket.close, BrowserSocket.prototype.close);
        socket.send("hello");
        assert.equal(socket.lastSent, "hello");
        socket.close(4000, "regression");
        assert.deepEqual(socket.lastClose, { code: 4000, reason: "regression" });
        socket.readyState = BrowserSocket.CLOSED;
        assert.equal(socket.readyState, Socket.CLOSED);
        assert.equal(calls.length, 0, "browser passthrough must not call Native Socket methods");
    }
    console.log(`WebSocket hook contract passed (nativeWebSocket=${nativeWebSocket})`);
}
