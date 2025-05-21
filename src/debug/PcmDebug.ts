export function addPcmDebugFunctions() {
    const testVideoSrc = "https://convertcdn.netless.group/dynamicConvert/58e146797ab24dc8abdf09fac1f4ffa0/jsonOutput/6ba73baf17b70046a1ba3846aa95c82b.mp4";
    const testAudioSrc = "https://convertcdn.netless.link/dynamicConvert/de2518f7fb824ad585dbcb8f970610a0/jsonOutput/768b8f88c83acf5213ad2d25fc5dbd2f.mp3";
    const testYoutubeSrc = "https://www.youtube.com/watch?v=bTqVqk7FSmY";

    (window as any).testAddPlyrAudio = () => {
        window.manager?.addApp({
            kind: "Plyr",
            attributes: {
                src: testAudioSrc,
            },
        });
    }
    (window as any).testAddPlyrYoutube = () => {
        window.manager?.addApp({
            kind: "Plyr",
            attributes: {
                src: testYoutubeSrc,
                provider: "youtube"
            },
        });
    }
    (window as any).testAddPlyrVideo = () => {
        window.manager?.addApp({
            kind: "Plyr",
            attributes: {
                src: testVideoSrc,
            }
        });
    }
    (window as any).testAddMediaPlayer = () => {
        window.manager?.addApp({
            kind: "MediaPlayer",
            attributes: {
                src: testVideoSrc,
            },
        });
    }

    (window as any).testAddAudioElement = () => {
        const v = document.createElement("audio");
        v.src = testAudioSrc;
        v.crossOrigin = "anonymous";
        document.body.appendChild(v);
        (window as any).pcmAudio = v;
        if (window.__pcmProxy) {
            (window as any).pcmsource = window.__pcmProxy.connect(v);
        }
    }

    (window as any).testAddVideoElement = () => {
        const v = document.createElement("video");
        v.src = testVideoSrc;
        v.crossOrigin = "anonymous";
        document.body.appendChild(v);
        (window as any).pcmVideo = v;
        if (window.__pcmProxy) {
            (window as any).pcmsource = window.__pcmProxy.connect(v);
        }
    }
}