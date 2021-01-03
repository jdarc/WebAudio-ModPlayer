import Module from "./module";
import Tracker from "./tracker";

export default function ModPlayer() {
    const context = new AudioContext({ latencyHint: "playback" });
    const bufferSize = context.sampleRate * 5;
    const mixerBuffer = new Int32Array(4096);
    const stream0 = new Float32Array(bufferSize);
    const stream1 = new Float32Array(bufferSize);
    const volume = 1.0;

    let tracker = null;
    let position = 0;
    let remaining = 0;

    this.callback = null;

    const bufferData = () => {
        let lastCount = 0, capacity = bufferSize, pos = position;
        while (capacity > lastCount) {
            const count = lastCount = tracker.read(mixerBuffer);
            for (let i = 0, len = count * 2; i < len; pos = ++pos % bufferSize) {
                stream0[pos] = mixerBuffer[i++] / 32768.0;
                stream1[pos] = mixerBuffer[i++] / 32768.0;
            }
            remaining += count;
            capacity -= count;
        }
    };

    const renderToChannels = function(outputBuffer, cb) {
        const channel0 = outputBuffer.getChannelData(0);
        const channel1 = outputBuffer.getChannelData(1);
        for (let i = 0; i < outputBuffer.length; i++) {
            if (tracker && --remaining <= 0) bufferData();
            channel0[i] = stream0[position] * volume;
            channel1[i] = stream1[position] * volume;
            if (++position >= bufferSize) position = 0;
            cb && cb(position, stream0, stream1);
        }
    };

    const node = context.createScriptProcessor(1024, 0, 2);
    node.onaudioprocess = evt => renderToChannels(evt.outputBuffer, this.callback);

    this.start = () => node.connect(context.destination);

    this.stop = () => node.disconnect();

    this.load = async url => {
        const response = await fetch(url);
        const data = await response.arrayBuffer();
        tracker = new Tracker(new Module(new Uint8Array(data)), context.sampleRate);
        position = remaining = 0;
    }
}
