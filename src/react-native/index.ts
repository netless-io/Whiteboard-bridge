import {v4 as uuid} from 'uuid';

interface ReactNativeWebView {
    postMessage(message: string): void;
}
declare global {
    interface Window {
        // React Native WebView 中，会嵌入的对象
        ReactNativeWebView?: ReactNativeWebView;
    }
}

enum EventType {
    // RN 主动发送的消息
    req = 'req',
    // bridge 主动发送的消息
    evt = 'evt',
    // 远端根据本地发送的请求，被动返回的消息
    ack = 'ack',
}

type AckPayload = {
    data: any;
    actionId: string;
    complete: boolean;
}

const splitChar = "|";
const ackTypeFinish = "finish";
const ackTypeError = "error";
 
/**
 * 
 * @param type 事件类型
 * @param actionId action Id 事件唯一标识
 * @param method 方法名，当事件类型为 ack 时，该值表示 success 还是 fail；fail 时，payload 为错误信息
 * @param payload 数据信息
 * @returns 
 */
function messageTemplate(type: EventType, actionId: string, method: string, payload: any): string {
    return [type, actionId, method, JSON.stringify(payload)].join(splitChar);
}

function parseMessage(message: string): {type: EventType, actionId: string, method: string, payload: any} {
    const [type, actionId, method, payload] = message.split(splitChar);
    return {type: type as EventType, actionId, method, payload: JSON.parse(payload)};
}

class Bridge {
    methods: Map<string, any> = new Map();
    asyncMethods: Map<string, any> = new Map();
    queue: Map<string|number[], any> = new Map();

    public call(method: string, ...args: any): Promise<any> {
        return new Promise((resolve, reject) => {
            const actionId = uuid();
            const message = messageTemplate(EventType.evt, method, actionId, args);
            this.queue.set(actionId, { ack: false, resolve: resolve, reject: reject, method });
            window.ReactNativeWebView!.postMessage(message); 
        });
    }

    public register(name: string, fun: any) {
        this.methods.set(name, fun);
    }

    public registerAsyn(name: string, fun: any) {
        this.asyncMethods.set(name, fun);
    }

    public recv(protocol: string) {
        if (typeof protocol == "string") {
            const {type, actionId, method, payload} = parseMessage(protocol);
            switch (type) {
                case EventType.req:
                {
                    const ret: AckPayload = {
                        data: undefined,
                        actionId: actionId,
                        complete: true
                    }
                    const call = function (f, ob) {
                        try {
                            ret.data = f.apply(ob, payload);
                            const ackMessage =  messageTemplate(EventType.ack, actionId, ackTypeFinish, ret);
                            window.ReactNativeWebView!.postMessage(ackMessage);
                        } catch (e) {
                            const ackMessage = messageTemplate(EventType.ack, actionId, ackTypeError, e);
                            window.ReactNativeWebView!.postMessage(ackMessage);
                        }
                    }
                    const callWithProgressCallback = function (f, ob) {
                        payload.push(function (data, complete) {
                            ret.data = data;
                            ret.complete = complete!==false;
                        })
                        try {
                            f.apply(ob, payload);
                            const ackMessage =  messageTemplate(EventType.ack, actionId, ackTypeFinish, ret);
                            window.ReactNativeWebView!.postMessage(ackMessage);
                        } catch (e) {
                            const ackMessage = messageTemplate(EventType.ack, actionId, ackTypeError, e);
                            window.ReactNativeWebView!.postMessage(ackMessage);
                        }
                    }
                    const fun = this.methods.get(method);
                    const funWithProgressCallback = this.asyncMethods.get(method);
                    if (fun) {
                        call(fun, this.methods);
                    } else if (funWithProgressCallback) {
                        callWithProgressCallback(funWithProgressCallback, this.asyncMethods);
                    } else {
                        const names = method.split(".")
                        if (names.length < 2) {
                            return;
                        }
                        const namespaceMethod = names.pop();
                        const namespace = names.join(".");
                        const namespaceObj = this.methods.get(namespace);
                        if (namespaceObj) {
                            const fun = namespaceObj[namespaceMethod!];
                            if (fun && typeof fun === "function") {
                                call(fun, namespaceObj);
                                return;
                            }
                        }
                        const progressNamespaceObj = this.asyncMethods.get(namespace);
                        if (progressNamespaceObj) {
                            const fun = progressNamespaceObj[namespaceMethod!];
                            if (fun && typeof fun === "function") {
                                callWithProgressCallback(fun, progressNamespaceObj);
                                return;
                            }
                        }
                    }
                    break;
                }    
                case EventType.ack:
                {
                    const ackPayload = payload as AckPayload;
                    if (this.queue.has(actionId)) {
                        const q = this.queue.get(actionId);
                        q.ack = true;
                        if (method === ackTypeError) {
                            q.reject(payload);
                        } else {
                            q.resolve(ackPayload.data);
                        }
                        if (ackPayload.complete) {
                            this.queue.delete(actionId);
                        }
                    }
                    break;
                }
            }
        }
    }
}
const bridge = new Bridge();
export default bridge;