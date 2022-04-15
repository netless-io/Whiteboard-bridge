class Bridge {
    methods: Map<string, any> = new Map()
    public call(method: string, args) {
        // call out
        (window as any).ReactNativeWebView.postMessage("s-m"); 
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
            let method = dser[3];
            let args = dser[4];
            if (this.methods.has(method)) {
                let fun = this.methods.get(method);
                fun.apply(args);
            }
        }
    }
}
const bridge = new Bridge();
export default bridge;
