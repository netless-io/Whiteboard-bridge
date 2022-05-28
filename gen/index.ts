// import fs from 'fs';
import path from "path";
// import ts from "typescript";

import {gen_ir} from "./ir_gen";
let config = {
    "rpc": {
        "SDKBridge": {
            "SDKBridge": ["newWhiteSdk", "joinRoom"] // todo: support * ["*"] all method
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
        // const dTsFile = fs.readFileSync(filePath, 'utf-8');
        // console.log(dTsFile);
        // const sourceFile = ts.createSourceFile(
        //     rpc_file + ".d.ts",                      
        //     dTsFile,                        
        //     ts.ScriptTarget.Latest          
        // )
        // console.log("read ts file " + JSON.stringify(sourceFile));
        let clazz = config.rpc[rpc_file]; // like "SDKBridge": ["newWhiteSdk"]
        for (let clazzName in clazz) {
            let methods = clazz[clazzName];
            console.log("parse " + clazzName);
            gen_ir(clazzName, methods, filePath);
        }
    }
    // gen ir

    // gen ts
}

enter();