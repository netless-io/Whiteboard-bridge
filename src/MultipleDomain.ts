import promiseAny from "promise.any";

const storages = ["https://scdncloudharestoragev3.herewhite.com", "https://expresscloudharestoragev2.herewhite.com"];
const cdns = ["https://cdncloudroomv2.herewhite.com", "https://cdnroom.netless.pro"];
const constantMock = window.fetch;

function multipleDomain(): void {
    window.fetch = async function(input: RequestInfo, init?: RequestInit): Promise<Response> {
        if (!needBackupRequest(input)) {
            return constantMock.call(this, input, init);
        }
        return promiseAny([constantMock.call(this, input, init), constantMock.call(this, createBackupRequest(input), init)]);
    };
}

export default multipleDomain;

function createBackupRequest(input: RequestInfo): RequestInfo {

    let list: string[] = [];
    const originUrl = typeof input === "string" ? input : input.url;

    if (storages.findIndex(v => originUrl.indexOf(v) !== -1) !== -1) {
        list = storages;
    } else if (cdns.findIndex(v => originUrl.indexOf(v) !== -1) !== -1) {
        list = cdns;
    } else {
        return input;
    }

    let newRequest;
    if (typeof input === "string") {
        const index = list.findIndex(v => {
            return input.indexOf(v) !== -1;
        });
        const replaceIndex = list.length - 1 - index;
        newRequest = input.replace(list[index], list[replaceIndex]);
    } else {
        const index = list.findIndex(v => {
            return input.url.indexOf(v) !== -1;
        });
        const replaceIndex = list.length - 1 - index;
        newRequest = new Request(input.url.replace(list[index], list[replaceIndex]), input);
    }
    return newRequest;
}

function needBackupRequest(input: RequestInfo): boolean {
    const list = storages.concat(cdns);
    if (typeof input === "string") {
        return list.some(v => {
            return input.indexOf(v) !== -1;
        });
    } else {
        return list.some(v => {
            return input.url.indexOf(v) !== -1;
        });
    }
}