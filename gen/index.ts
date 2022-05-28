// import fs from 'fs';
import path from "path";
// import ts from "typescript";

import {gen_ir} from "./ir_gen";
let config = {
    "rpc": {
        "SDKBridge": {
            "SDKBridge": ["newWhiteSdk", "joinRoom"] // todo: support * ["*"] all method
        },
        "RoomBridge": {
            "RoomSyncBridge": [],
        },
        "WebSocket": {
            "WebSocketBridge": [],
        }
    },
    "event": {}
};
function enter() {
    // load config and parse
    console.log(config);
    // parse ast
    for (let rpc_file in config.rpc) {
        const filePath = path.resolve(process.cwd(), "dist/src/bridge/" + rpc_file + ".d.ts");
        let clazz = config.rpc[rpc_file]; // like "SDKBridge": ["newWhiteSdk"]
        for (let clazzName in clazz) {
            let methods = clazz[clazzName];
            console.log("parse " + clazzName);
            let ir = gen_ir(clazzName, methods, filePath);
            console.log(JSON.stringify(ir));
        }
    }
    // gen ir

    // gen ts
}

enter();