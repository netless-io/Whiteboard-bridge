export default class Bridge {
    methods: Map<string, any> = new Map()
    public call(method: string, args) {
        // call out
        (window as any).ReactNativeWebView.postMessage("s-m"); 
    }
    public register(name: string, fun: any) {
        this.methods.set(name, fun);
    }

    public recv(potocol: string) {
        let dser: string[] = potocol.split("|");
        let method = dser[3];
        let args = dser[4];

        let fun = this.methods.get(method);
        fun.apply(args);
    }
}
