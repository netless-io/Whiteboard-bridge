import uuid from 'react-native-uuid';
class Bridge {
    methods: Map<string, any> = new Map();
    queue: Map<string|number[], any> = new Map();
    public call(method: string, args): Promise<any> {
        return new Promise((resolve, reject) => {
            const actionId = uuid.v4();
            const potocol = 'evt|' + actionId + '|0|' + method + '|' + args;
            this.queue.set(actionId, { ack: false, resolve: resolve, reject: reject });
            // call out
            (window as any).ReactNativeWebView.postMessage(potocol); 
        });
      
    }
    public register(name: string, fun: any) {
        this.methods.set(name, fun);
    }

    public recv(potocol: string) {
        if (typeof potocol == "string") {
            let dser: string[] = potocol.split("|");
            let type = dser[0];
            let action = dser[1];
            let object = dser[2];
            let methodOrRet = dser[3];
            let argsOrErr = dser[4];
            switch (type) {
                case 'req':
                    if (this.methods.has(methodOrRet)) {
                        let fun = this.methods.get(methodOrRet);
                        try {
                            const ret = fun.apply(argsOrErr);
                            const potocolForAck = 'ack|' + action + '|0|' + ret;
                            // call out
                            (window as any).ReactNativeWebView.postMessage(potocolForAck);
                        } catch (e) {
                            const potocolForAck =
                                'ack|' + action + '|0|undefined|' + JSON.stringify(e);
                            // call out
                            (window as any).ReactNativeWebView.postMessage(potocolForAck);
                        }
                    }
                    break;
                case 'ack':
                    if (this.queue.has(action)) {
                        const q = this.queue.get(action);
                        q.ack = true;
                        if (argsOrErr) {
                            q.reject(argsOrErr);
                        } else {
                            q.resolve(methodOrRet);
                        }
                        this.queue.delete(action);
                    }
                    break;
            }
        }
    }
}
const bridge = new Bridge();
export default bridge;
