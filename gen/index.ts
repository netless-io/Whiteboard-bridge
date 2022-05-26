import fs from 'fs';
import ts from "typescript";
let config = {
    "rpc": {
        "SDKBridge": {
            "SDKBridge": ["newWhiteSdk"]
        }
    },
    "event": {}
};
function enter() {
    // load config and parse
    console.log(config);
    // parse ast
    for (let rpc_file in config.rpc) {
        // const dTsFile = fs.readFileSync(resolve(__dirname, "", rpc_file), 'utf-8');
        // const sourceFile = ts.createSourceFile(
        //     'sdk.ts',                      
        //     dTsFile,                        
        //     ts.ScriptTarget.Latest          
        // )
        console.log("read ts file " + rpc_file + ".d.ts");
        let clazz = config.rpc[rpc_file]; // like "SDKBridge": ["newWhiteSdk"]
        for (let clazzName in clazz) {
            let methods = clazz[clazzName];
            console.log("parse " + clazzName);
        }
    }
    // gen ir

    // gen ts
}

enter();