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
//         window.testPcm = (number) => {
//             function test() {
// // const u2 = "https://solutions-apaas.agora.io/cloud-disk/dynamicConvert/2de616bbd0ce43ca8a204387ebb524ba/jsonOutput/8c65d2baccc671c4ff2c5144150d391c.mp3";
//                 const u2 = "https://solutions-apaas.agora.io/cloud-disk/dynamicConvert/2de616bbd0ce43ca8a204387ebb524ba/jsonOutput/0d7dc2355a03f3cd995040f34eedd2f5.mp3";

//                 const aAudio = new Audio(u2);aAudio.crossOrigin = "anonymous";window.__pcmProxy?.connect(aAudio);aAudio.play();
//             }
//             [...Array(number)].forEach(() => {
//                 test();
//             });
//         }
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
                    console.log(`${Date.now()} [pcm] stream become empty`);
                }
                return;
            }
            const int16Array = this.convertToInt16Array(inputArray);
            const array = Array.from(int16Array);
            call("pcm.pcmDataUpdate", array);
            if (!this._updatingPcmData) {
                this._updatingPcmData = true;
                console.log(`${Date.now()} [pcm] stream become valid`);
            }
        };
        scriptProcessor.connect(audioContext.destination);
        this.audioContext = audioContext;
        this.scriptProcessor = scriptProcessor;
        logger(`${Date.now()} [pcm] proxy init sampleRate: ${sampleRate}, bufferSize: ${bufferSize}, channelCount: ${channelCount}, state: ${audioContext.state}`);

        audioContext.onstatechange = (event) => {
            console.log(`${Date.now()} [pcm] audioContext onstatechange`, audioContext.state);
            if (audioContext.state !== 'running') {
                console.log(`${Date.now()} [pcm] audioContext state is not running, resuming`);
                audioContext.resume();
            }
        };

        const timePrint = () => {
            console.log(`[pcm] time: ${audioContext.currentTime}`);
        };
        setInterval(timePrint, 5000);
    }

    elementsMap: Map<string, HTMLMediaElement[]> = new Map();
    connect(mediaElement: HTMLMediaElement): MediaElementAudioSourceNode {
        let duplicateIndex = this.elementsMap.get(mediaElement.src)?.length || 0;
        if (!this.elementsMap.has(mediaElement.src)) {
            this.elementsMap.set(mediaElement.src, []);
        }
        this.elementsMap.get(mediaElement.src)!.push(mediaElement);
        const logTag = `${mediaElement.src}__${duplicateIndex}`;

        const source = this.audioContext.createMediaElementSource(mediaElement);
        source.connect(this.scriptProcessor);
        console.log(`${Date.now()} [pcm] connect media element tag: ${logTag}`);
        const originalDisconnect = source.disconnect.bind(source);
        source.disconnect = () => {
            console.log(`${Date.now()} [pcm] disconnect media element tag: ${logTag}`);
            originalDisconnect();
        };

        

        
        

        return source;
    }
}