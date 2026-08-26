export type PageEvent = "prevPage" | "nextPage" | "prevStep" | "nextStep" | "jumpToPage";

export type PageEventOptions = { target?: string; page?: number };
export type PageStateOptions = { target?: string };

export type UnifiedPageState = {
    target: "mainView" | "Slide" | "Presentation";
    appId?: string;
    page: number;
    pageCount: number;
};

export type UnifiedPageStateChange = UnifiedPageState & {
    status: "pending" | "success" | "failure";
    mainView?: number;
    presentation?: number;
    view?: number;
    slide?: number;
    event?: PageEvent;
    reason?: "commandFailed";
    message?: string;
};

export type UnifiedPageStateManager = {
    dispatchPageEvent?: (event: PageEvent, options?: PageEventOptions) => Promise<boolean>;
    getPageState?: (options?: PageStateOptions) => Promise<UnifiedPageState>;
};

export function dispatchPageEventOuter(
    manager: unknown,
    event: PageEvent,
    options: PageEventOptions = {}
): Promise<boolean> {
    const target = manager as UnifiedPageStateManager | undefined;
    if (!target?.dispatchPageEvent) return Promise.resolve(false);
    return target.dispatchPageEvent.call(manager, event, options);
}

export function getPageStateOuter(
    manager: unknown,
    options: PageStateOptions = {}
): Promise<UnifiedPageState> {
    if (!manager) return Promise.reject(new Error("window manager not existed"));
    const target = manager as UnifiedPageStateManager;
    if (!target.getPageState) {
        return Promise.reject(new Error("window manager does not support getPageState"));
    }
    return target.getPageState.call(manager, options);
}

export function forwardUnifiedPageStateChange(
    notify: (method: string, payload: any) => void,
    state: UnifiedPageStateChange
): void {
    notify("sdk.unifiedPageStateChange", state);
}
