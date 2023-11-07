export class SlideLoggerPlugin {
    public hookPoint = "Slide.initConfig";

    constructor() {}

    after(args: any): any {
        return args;
    }

    before(args: any[]): any[] {
        const [config] = args;
        const originalLogger = config.logger;
        config.logger = {
            info(msg) {
                console.log(msg);
                if (originalLogger?.info){
                    originalLogger.info(msg);
                }
            },
            warn(msg) {
                console.warn(msg);
                if (originalLogger?.warn){
                    originalLogger.warn(msg);
                }
            },
            error(msg) {
                console.error(msg);
                if (originalLogger?.error){
                    originalLogger.error(msg);
                }
            }
        }
        return [config];
    }

    context(ctx: any) {}
}