import Sample from "./sample";
import Note from "./note";
import Pattern from "./pattern";
import { FIXED_POINT_SHIFT, log2, NUM_ROWS_PATTERN } from "./constants";

const NUM_SAMPLES = 31;
const NUM_CHANNELS = 4;

const range = (n) => [...Array(n).keys()];

const read16 = (bytes, offset) => bytes[offset] << 8 & 0xFF00 | bytes[offset + 1] & 0xFF;

const readString = (bytes, offset, length) => range(length).map(it => String.fromCharCode(bytes[offset + it])).join("");

const toKey = period => {
    if (period >= 32) {
        const oct = log2(7256) - log2(period);
        if (oct >= 0) {
            const key = oct * 12 >> FIXED_POINT_SHIFT - 1;
            return (key >> 1) + (key & 1) & 0xFF;
        }
    }
    return 0;
};

const extractSample = (data, sampleOffset, offset) => new Sample(
    readString(data, sampleOffset, 22),
    8312,
    data[sampleOffset + 24] << 4 & 0xF0,
    data[sampleOffset + 25] & 0x7F,
    read16(data, sampleOffset + 26) << 1,
    read16(data, sampleOffset + 28) << 1,
    new Int8Array(data.slice(offset, offset + read16(data, sampleOffset + 22) * 2))
);

const extractNote = (data, offset) => {
    const b1 = data[offset++];
    const b2 = data[offset++];
    const b3 = data[offset++];
    const b4 = data[offset++];
    const key = toKey(b1 << 8 & 0xF00 | b2 & 0xFF);
    const sampleNumber = b1 & 0xF0 | b3 >> 4 & 0x0F;
    const effect = b3 & 0x0F;
    const effectParam = b4 & 0xFF;
    return new Note(key, sampleNumber, effect, effectParam);
};

const loadPatterns = (data, numPatterns) => {
    let offset = 1084;
    const patterns = new Array(numPatterns);
    for (let i = 0; i < patterns.length; i++) {
        const notes = new Array(NUM_CHANNELS * NUM_ROWS_PATTERN);
        for (let noteIdx = 0; noteIdx < notes.length; noteIdx++) {
            notes[noteIdx] = extractNote(data, offset);
            offset += 4;
        }
        patterns[i] = new Pattern(notes);
    }
    return patterns;
};

const loadSamples = (data, numPatterns) => {
    let offset = 1084 + numPatterns * NUM_ROWS_PATTERN * NUM_CHANNELS * 4;
    const samples = new Array(NUM_SAMPLES);
    for (let i = 0; i < samples.length; ++i) {
        samples[i] = extractSample(data, 20 + i * 30, offset);
        offset += samples[i].data.length;
    }
    return samples;
};

// noinspection JSUnusedGlobalSymbols
export default class Module {
    constructor(data) {
        this.title = readString(data, 0, 20);
        this.sequenceLength = data[950] & 0x7F;
        this.jumpIndex = (data[951] & 0x7F) >= this.sequenceLength ? 0 : data[951] & 0x7F;
        this.numPatterns = Math.max.apply(Math, data.slice(952, 952 + 127)) + 1;
        this.sequences = new Int8Array(range(this.sequenceLength).map(it => data[952 + it] & 0x7F));
        this.patterns = loadPatterns(data, this.numPatterns);
        this.samples = loadSamples(data, this.numPatterns);
    }

    getSequencePattern(index) {
        return this.patterns[this.sequences[index]];
    };

    getSample(index) {
        return index > 0 && index <= this.samples.length ? this.samples[index - 1] : Sample.EMPTY;
    };
}
