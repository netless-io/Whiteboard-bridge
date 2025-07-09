import { call } from "./bridge";
import { logger } from "./utils/Logger";

function getUTCTimeStamp(): string {
  const date = new Date();
  const result = /((\d+:){2}\d+)/.exec(new Date().toUTCString());
  if (result) {
    return result?.[0] + ":" + date.getUTCMilliseconds();
  } else {
    return date.toTimeString().split(" ")[0] + ":" + date.getMilliseconds();
  }
}

const MEDIA_ELEMENT_EVENTS_LIST = [
  "play",
  "playing",
  "loadeddata",
  "canplay",
  "pause",
  "stalled",
  "suspend",
  "waiting",
  "abort",
  "emptied",
  "ended",
  "error",
];

export class PCMProxy {
  private audioContext: AudioContext;
//   private scriptProcessor: ScriptProcessorNode;

  private _updatingPcmData = false;

  private connectCollection: string[] = [];
  private disconnectCollection: string[] = [];
  private resultCollection: string[] = [];

  private mediaElementMap: Map<string, HTMLMediaElement> = new Map();
  private mediaElementStateMap: Map<string, string> = new Map();

  private sources = [];

  private problemMediaElements: HTMLMediaElement[] = [];

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
    const audioContext = new AudioContext();
    // const scriptProcessor = audioContext.createScriptProcessor(
    //   bufferSize,
    //   channelCount,
    //   channelCount
    // );

    setInterval(() => {
      console.error("---interval--test----");
    }, 1000);

    // scriptProcessor.onaudioprocess = (event) => {
    //   const inputBuffer = event.inputBuffer;
    //   const inputArray = inputBuffer.getChannelData(0);
    //   const isAllZero = inputArray.every((value) => value === 0);
    //   if (isAllZero) {
    //     if (this._updatingPcmData) {
    //       this._updatingPcmData = false;
    //       console.log(`${getUTCTimeStamp()} [pcm] stream become empty`);
    //     }
    //     return;
    //   }
    //   const int16Array = this.convertToInt16Array(inputArray);
    //   const array = Array.from(int16Array);
    //   call("pcm.pcmDataUpdate", array);
    //   if (!this._updatingPcmData) {
    //     this._updatingPcmData = true;
    //     console.log(`${getUTCTimeStamp()} [pcm] stream become valid`);
    //   }
    // };
    // scriptProcessor.connect(audioContext.destination);
    this.audioContext = audioContext;
    // this.scriptProcessor = scriptProcessor;
    logger(
      `${getUTCTimeStamp()} [pcm] proxy init sampleRate: ${sampleRate}, bufferSize: ${bufferSize}, channelCount: ${channelCount}, state: ${
        audioContext.state
      }`
    );

    audioContext.onstatechange = (event) => {
      console.log(
        `${getUTCTimeStamp()} [pcm] audioContext onstatechange`,
        audioContext.state
      );
      if (audioContext.state !== "running") {
        console.log(
          `${getUTCTimeStamp()} [pcm] audioContext state is not running, resuming`
        );
        audioContext.resume();
      }
    };

    const timePrint = () => {
      console.log(
        `[pcm] time: ${audioContext.currentTime}, resultCon: ${this.resultCollection.length}, connectCon: ${this.connectCollection.length}, disconnectCon: ${this.disconnectCollection.length}`
      );
    };
    setInterval(timePrint, 1000);
  }

  elementsMap: Map<string, HTMLMediaElement[]> = new Map();
  async connect(
    mediaElement: HTMLMediaElement
  ): Promise<MediaElementAudioSourceNode> {
    return undefined as any;

//     console.log(
//       `${getUTCTimeStamp()} [pcm] mediaElement: ${
//         mediaElement instanceof HTMLVideoElement ? "video" : "audio"
//       }`
//     );

//     const fetchSource = await fetch(mediaElement.src);

//     if (mediaElement.paused) {
//       try {
//         await mediaElement.play();
//       } catch (e) {
//         console.error("play mediaElement error", e);
//       }
//     }

//     console.log(
//       `${getUTCTimeStamp()} [pcm] fetch source, state: ${fetchSource.status}`
//     );

//     console.log(
//       `${getUTCTimeStamp()} [pcm] check state: ${this.audioContext.state}`
//     );
//     console.log(
//       `${getUTCTimeStamp()} [pcm] check time: ${this.audioContext.currentTime}`
//     );
//     let duplicateIndex = this.elementsMap.get(mediaElement.src)?.length || 0;
//     if (!this.elementsMap.has(mediaElement.src)) {
//       this.elementsMap.set(mediaElement.src, []);
//     }
//     this.elementsMap.get(mediaElement.src)!.push(mediaElement);
//     const logTag = `${mediaElement.src}__${duplicateIndex}`;

//     this.connectCollection.push(logTag);
//     this.resultCollection.push(logTag);

//     Object.defineProperty(mediaElement, "src", {
//       get: function () {
//         return this.getAttribute("src");
//       },
//       set: function (value) {
//         console.log(
//           `${getUTCTimeStamp()}   ${logTag}  [pcm] setting mediaElement.src to: ${value}`
//         );
//         this.setAttribute("src", value);
//       },
//     });
//     const originalLoad = mediaElement.load.bind(mediaElement);

//     mediaElement.load = () => {
//       console.log(
//         `${getUTCTimeStamp()}   ${logTag}  [pcm] load mediaElement use load`
//       );
//       return originalLoad();
//     };

//     MEDIA_ELEMENT_EVENTS_LIST.forEach((event) => {
//       mediaElement.addEventListener(event, () => {
//         console.log(
//           `${getUTCTimeStamp()} [pcm] [index:  ${logTag}] mediaElement: ${event}`
//         );
//         this.mediaElementStateMap.set(logTag, event);
//         if (event === "emptied") {
//           console.log(
//             `${getUTCTimeStamp()} [pcm] [index:  ${logTag}] mediaElement: ${logTag} emptied, cur state: ${
//               this.audioContext.state
//             }, cur time: ${this.audioContext.currentTime}`
//           );
//           if (this.problemMediaElements.includes(mediaElement)) {
//             console.error("has already in problemMediaElements");
//           }
//           this.problemMediaElements.push(mediaElement);
//         }
//       });
//     });

//     if (!this.mediaElementMap.has(logTag)) {
//       this.mediaElementMap.set(logTag, mediaElement);
//     } else {
//       console.error(
//         `${getUTCTimeStamp()} [pcm] mediaElement: ${logTag} already exists`
//       );
//     }

//     const source = this.audioContext.createMediaElementSource(mediaElement);
//     source.connect(this.scriptProcessor);

//     console.log(
//       `${getUTCTimeStamp()} [pcm] [index:  ${logTag}] connect media element tag: ${logTag}`
//     );
//     const originalDisconnect = source.disconnect.bind(source);
//     source.disconnect = () => {
//       console.log(
//         `${getUTCTimeStamp()} [pcm] [index:  ${logTag}] disconnect media element tag: ${logTag}, but without disconnect`
//       );
//       this.disconnectCollection.push(logTag);
//       if (this.resultCollection.includes(logTag)) {
//         this.resultCollection.splice(this.resultCollection.indexOf(logTag), 1);
//       }
//       originalDisconnect(this.scriptProcessor);
//     };

//     this.sources.push(source);
//     return source;
  }
}
// Array.from(__pcmProxy.mediaElementMap.values()).forEach(
//   (mediaElement, index) => {
//     console.log("cur state", index, mediaElement.src);
//   }
// );
