export type DocsEvent =
    | "prevPage"
    | "nextPage"
    | "prevStep"
    | "nextStep"
    | "jumpToPage"
    | "scalePage";

export type DocsEventOptions = { target?: string; appId?: string; page?: number; scale?: number };
export type PageStateOptions = { target?: string };

export type DispatchDocsEventFailureReason =
    | "invalidEvent"
    | "invalidOptions"
    | "targetNotFound"
    | "targetNotSupported"
    | "eventNotSupported"
    | "notWritable"
    | "stateUnavailable"
    | "outOfRange"
    | "commandFailed";

export type DispatchDocsEventResult =
    | { accepted: true }
    | {
          accepted: false;
          reason: DispatchDocsEventFailureReason;
          message: string;
      };

export type UnifiedPageState = {
    target: "mainView" | "DocsViewer" | "Slide" | "Presentation";
    appId?: string;
    page: number;
    pageCount: number;
    scale?: number;
};

export type UnifiedPageStateChange = UnifiedPageState & {
    status: "pending" | "success" | "failure";
    changeType?: "page" | "scale";
    mainView?: number;
    presentation?: number;
    view?: number;
    slide?: number;
    event?: DocsEvent;
    reason?: "commandFailed";
    message?: string;
};

export type UnifiedPageStateManager = {
    dispatchDocsEvent?: (
        event: DocsEvent,
        options?: DocsEventOptions
    ) => Promise<DispatchDocsEventResult>;
    getPageState?: (options?: PageStateOptions) => Promise<UnifiedPageState>;
    fitOriginSizeAndCamera?: () => void;
};

export function dispatchDocsEventOuter(
    manager: unknown,
    event: DocsEvent,
    options: DocsEventOptions = {}
): Promise<DispatchDocsEventResult> {
    const target = manager as UnifiedPageStateManager | undefined;
    if (!target?.dispatchDocsEvent) {
        return Promise.resolve({
            accepted: false,
            reason: "targetNotSupported",
            message: "window manager does not support dispatchDocsEvent",
        });
    }
    return target.dispatchDocsEvent.call(manager, event, options);
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

export function fitOriginSizeAndCameraOuter(manager: unknown): void {
    if (!manager) throw new Error("window manager not existed");
    const target = manager as UnifiedPageStateManager;
    if (!target.fitOriginSizeAndCamera) {
        throw new Error("window manager does not support fitOriginSizeAndCamera");
    }
    target.fitOriginSizeAndCamera.call(manager);
}

export function forwardUnifiedPageStateChange(
    notify: (method: string, payload: any) => void,
    state: UnifiedPageStateChange
): void {
    notify("sdk.unifiedPageStateChange", state);
}
