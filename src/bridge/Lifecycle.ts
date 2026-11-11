/** Single document owner. It does not cancel SDK transports or infer socket closure. */
export type Scope = { documentId: string; generation: number };
export type State = "idle" | "joining" | "active" | "closing" | "blocked";
type ObjectHandle = { phase?: string; disconnect?: () => Promise<void>; stop?: () => void; bindHtmlElement?: (element: null) => void };
export type Task = {
    scope: Scope; kind: "room" | "player"; object?: ObjectHandle;
    cancelled: boolean; completed: boolean; settled: Promise<void>; settle: () => void;
    reply: (value: any) => void; disposers: Array<() => void | Promise<void>>;
    initializations: Promise<void>[];
    close?: Promise<void>; closeResult?: Promise<void>; unstable: boolean;
    disconnecting?: boolean;
    connectionWaiter?: (phase: string) => void;
    /** Explicitly false only while preparing dependencies before calling the SDK. */
    transportStarted?: boolean;
    timer?: ReturnType<typeof setTimeout>;
};
export const documentId = `${Date.now().toString(36)}-${Math.random().toString(36).slice(2)}`;
export function sameScope(a?: Scope, b?: Scope): boolean {
    return !!a && !!b && a.documentId === b.documentId && a.generation === b.generation;
}
export function failure(code: string, message = code): string {
    return JSON.stringify({ __error: { code, message } });
}
let executingScope: Scope | undefined;
export function currentScope(): Scope | undefined { return executingScope; }
export function inScope<T>(scope: Scope | undefined, fn: () => T): T {
    const previous = executingScope; executingScope = scope;
    try { return fn(); } finally { executingScope = previous; }
}
export class Lifecycle {
    state: State = "idle";
    task?: Task;
    private boundary = 0;
    onState: (scope: Scope, state: State) => void = () => {};
    private setState(task: Task, state: State): void {
        if (this.task === task) { this.state = state; this.onState(task.scope, state); }
    }
    accepts(scope?: Scope, closing = false): boolean {
        return sameScope(scope, this.task?.scope) && (this.state === "joining" || this.state === "active" || closing);
    }
    begin(kind: Task["kind"], scope: Scope | undefined, reply: Task["reply"], timeout?: number): Task {
        if (!scope || scope.documentId !== documentId || !Number.isSafeInteger(scope.generation) || scope.generation <= this.boundary) throw new Error("StaleScope");
        if (this.state !== "idle") throw new Error(this.state === "active" ? "AlreadyJoined" : "Busy");
        this.boundary = scope.generation;
        let settle!: () => void;
        const settled = new Promise<void>(resolve => { settle = resolve; });
        const task: Task = { scope, kind, reply, settled, settle, cancelled: false, completed: false, disposers: [], initializations: [], unstable: false };
        this.task = task; this.setState(task, "joining");
        if (timeout !== undefined) task.timer = setTimeout(() => {
            if (task.completed) return;
            this.setState(task, "closing"); task.cancelled = true;
            this.complete(task, failure("JoinTimeout"));
            this.leave(task.scope).catch(() => {});
        }, timeout);
        return task;
    }
    complete(task: Task, value: any): void {
        if (task.completed) return;
        task.completed = true; clearTimeout(task.timer);
        task.reply(value);
    }
    activate(task: Task, value: any): void {
        if (task.cancelled) return;
        this.setState(task, "active"); this.complete(task, value);
    }
    phase(task: Task, phase: string): void {
        if (phase === "error" || phase === "kicked" || (phase === "reconnecting" && task.disconnecting)) task.unstable = true;
        task.connectionWaiter?.(phase);
        if ((phase === "disconnected" || phase === "stopped" || phase === "error" || phase === "kicked") && !task.close && this.state === "active") this.setState(task, "blocked");
    }
    private async disconnectRoom(task: Task): Promise<void> {
        const room = task.object!;
        // Akko's reconnect cancellation can finish before the pending transport
        // closes. Let its normal recovery finish, then use the confirmed normal
        // disconnect path before admitting a replacement Room.
        if (room.phase === "reconnecting") {
            await new Promise<void>((resolve, reject) => {
                const finish = (error?: Error): void => {
                    clearTimeout(timer); task.connectionWaiter = undefined;
                    if (error) reject(error); else resolve();
                };
                const timer = setTimeout(() => finish(new Error("LeaveTimeout")), 20000);
                task.connectionWaiter = phase => {
                    if (phase === "connected") finish();
                    else if (phase === "disconnected" || phase === "error" || phase === "kicked") finish(new Error("CloseUnconfirmed"));
                };
            });
        }
        if (room.phase !== "connected") throw new Error("CloseUnconfirmed");
        task.disconnecting = true;
        try { await room.disconnect!(); }
        finally { task.disconnecting = false; }
        if ((room.phase as string | undefined) !== "disconnected") throw new Error("CloseUnconfirmed");
    }
    async finish(task: Task, error?: Error): Promise<void> {
        task.settle();
        // Once leave owns the outcome, a late preparation rejection must not
        // move an already closed task (or its replacement) back to closing.
        if (!error || task.close) return;
        this.setState(task, task.object || task.transportStarted === false ? "closing" : "blocked");
        this.complete(task, failure(error.message || "CreateFailed"));
        if (task.object || task.transportStarted === false) this.leave(task.scope).catch(() => {});
    }
    leave(scope?: Scope): Promise<void> {
        if (!scope || scope.documentId !== documentId) return Promise.reject(new Error("StaleScope"));
        const task = this.task;
        if (!task || !sameScope(scope, task.scope)) {
            // A cancel can overtake its queued create. Only lifecycle generations advance this boundary.
            if (this.state === "idle" && scope.generation >= this.boundary) {
                this.boundary = scope.generation; return Promise.resolve();
            }
            return Promise.reject(new Error("StaleScope"));
        }
        if (task.closeResult) return task.closeResult;
        task.cancelled = true; this.setState(task, "closing");
        this.complete(task, failure("Cancelled"));
        // Defer execution until close is stored, so synchronous phase callbacks see the same close work.
        task.close = Promise.resolve().then(async () => {
            let firstError: Error | undefined;
            // No SDK transport was admitted. Cancelled continuations must check
            // task.cancelled before admitting one; dependency prefetch may finish
            // independently without holding this Room lifecycle slot.
            if (!task.object && task.transportStarted === false) {
                this.setState(task, "idle");
                return;
            }
            // Once a Room is acquired, a stalled UI/plugin mount must not keep
            // its transport alive until that initialization eventually settles.
            // The lifecycle slot still waits for all initialization and cleanup.
            const acquiredRoom = task.kind === "room" ? task.object : undefined;
            if (acquiredRoom) {
                try { await this.disconnectRoom(task); }
                catch (error) { firstError = error; }
            }
            await task.settled;
            if (!task.object) {
                if (task.transportStarted !== false) throw new Error("CloseUnconfirmed");
                this.setState(task, "idle");
                return;
            }
            for (const initialization of task.initializations) {
                try { await initialization; } catch (error) { firstError = firstError || error; }
            }
            try {
                if (task.kind === "room") {
                    if (!acquiredRoom) await this.disconnectRoom(task);
                }
                else task.object.stop!();
            } catch (error) { firstError = error; }
            for (const dispose of task.disposers.reverse()) {
                try { await dispose(); } catch (error) { firstError = firstError || error; }
            }
            if (firstError) throw firstError;
            // A late acquired Room may be closed normally after a cancelled create.
            if (task.unstable) throw new Error("CloseUnconfirmed");
            this.setState(task, "idle");
        }).catch(error => { this.setState(task, "blocked"); throw error; });
        task.closeResult = new Promise<void>((resolve, reject) => {
            const timer = setTimeout(() => { this.setState(task, "blocked"); reject(new Error("LeaveTimeout")); }, 20000);
            task.close!.then(() => { clearTimeout(timer); resolve(); }, error => { clearTimeout(timer); reject(error); });
        });
        return task.closeResult;
    }
}
export const lifecycle = new Lifecycle();
