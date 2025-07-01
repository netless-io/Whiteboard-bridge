import { call } from "./bridge";
import { logger } from "./utils/Logger";

export class PCMProxy {
    private audioContext: AudioContext;
    private scriptProcessor: ScriptProcessorNode;

    private _updatingPcmData = false;

    convertToInt16Array(float32Array: Float32Array): Int16Array {
        const int16Array = new Int16Array(float32Array.length);
        for (let i = 0; i < float32Array.length; i++) {
            const pcm = Math.max(-1, Math.min(1, float32Array[i])) * 32767;
            int16Array[i] = pcm;
        }
        return int16Array;
    }

    constructor() {
        const sampleRate = 48000;
        const bufferSize = 4096;
        const channelCount = 1;
        const audioContext = new AudioContext({ sampleRate: sampleRate });
        const scriptProcessor = audioContext.createScriptProcessor(bufferSize, channelCount, channelCount);
        scriptProcessor.onaudioprocess = (event) => {
            const inputBuffer = event.inputBuffer;
            const inputArray = inputBuffer.getChannelData(0);
            const isAllZero = inputArray.every((value) => value === 0);
            if (isAllZero) {
                if (this._updatingPcmData) {
                    this._updatingPcmData = false;
                    console.log("[pcm] stream become empty");
                }
                return;
            }
            const int16Array = this.convertToInt16Array(inputArray);
            const array = Array.from(int16Array);
            call("pcm.pcmDataUpdate", array);
            if (!this._updatingPcmData) {
                this._updatingPcmData = true;
                console.log("[pcm] stream become valid");
            }
        };
        scriptProcessor.connect(audioContext.destination);
        this.audioContext = audioContext;
        this.scriptProcessor = scriptProcessor;
        logger(`[pcm] proxy init sampleRate: ${sampleRate}, bufferSize: ${bufferSize}, channelCount: ${channelCount}, state: ${audioContext.state}`);

        audioContext.onstatechange = (event) => {
            console.log("[pcm] audioContext onstatechange", audioContext.state);
            if (audioContext.state !== 'running') {
                console.log("[pcm] audioContext state is not running, resuming");
                audioContext.resume();
            }
        };

        const timePrint = () => {
            console.log(`[pcm] time: ${audioContext.currentTime}`);
        };
        setInterval(timePrint, 5000);
    }

    elementsNameMap: Map<string, number> = new Map();
    connect(mediaElement: HTMLMediaElement): MediaElementAudioSourceNode {
        let duplicateIndex = 0;
        if (this.elementsNameMap.has(mediaElement.src)) {
            duplicateIndex = this.elementsNameMap.get(mediaElement.src)! + 1;
            this.elementsNameMap.set(mediaElement.src, duplicateIndex);
        } else {
            this.elementsNameMap.set(mediaElement.src, duplicateIndex);
        }
        const logTag = `${mediaElement.src}__${duplicateIndex}`;

        const source = this.audioContext.createMediaElementSource(mediaElement);
        source.connect(this.scriptProcessor);
        console.log(`[pcm] connect media element tag: ${logTag}`);
        const originalDisconnect = source.disconnect.bind(source);
        source.disconnect = () => {
            console.log(`[pcm] disconnect media element tag: ${logTag}`);
            originalDisconnect();
        };
        return source;
    }
}