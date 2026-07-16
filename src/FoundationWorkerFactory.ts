import foundationWorkerString from "../.generated/foundation-worker.js?raw";

let foundationWorkerBlobUrl: string | undefined;

export function createWorkerInstance(): Worker {
    if (!foundationWorkerBlobUrl) {
        const blob = new Blob([foundationWorkerString], { type: "text/javascript" });
        foundationWorkerBlobUrl = URL.createObjectURL(blob);
    }
    return new Worker(foundationWorkerBlobUrl);
}
