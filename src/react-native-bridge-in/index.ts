export default class Bridge {
    // methods: Map<string, any> = new Map()
    public call(method: string, args) {
        // call out
        (window as any).ReactNativeWebView.postMessage("s-m"); 
    }
    public register(name: string, fun: any) {
        window[name] = fun;
    }

    public init(){
        window.onmessage = function (event) {
            console.log(event);
            let potocol: string = event.data;
            let dser: string[] = potocol.split("|");
            let method = dser[3];
            let args = dser[4];

            let fun = window[method];
            fun.apply(args);


        }
        
    }
}
