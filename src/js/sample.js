export default class Sample {
    constructor(name, rate, fineTune, volume, loopStart, loopLength, data) {
        this.name = name;
        this.rate = rate;
        this.fineTune = fineTune > 127 ? fineTune - 256 : fineTune;
        this.volume = volume;
        if (loopStart + loopLength > data.length) loopLength = data.length - loopStart;
        if (loopLength < 4) {
            this.loopStart = data.length;
            this.loopLength = 0;
        } else {
            this.loopStart = loopStart;
            this.loopLength = loopLength;
        }
        this.data = data;
    }

    hasFinished(index) {
        return this.loopLength <= 1 && index > this.loopStart;
    }
}

Sample.EMPTY = new Sample("", 0, 0, 0, 0, 0, new Int8Array(0));
