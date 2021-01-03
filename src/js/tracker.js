import Channel from "./channel";
import { NUM_ROWS_PATTERN } from "./constants";

const DEFAULT_TEMPO = 125;

// noinspection JSUnusedGlobalSymbols
export default class Tracker {
    constructor(mod, sampleRate) {
        this.mod = mod;
        this.sampleRate = sampleRate;
        this.channel0 = new Channel(0, mod, sampleRate);
        this.channel1 = new Channel(1, mod, sampleRate);
        this.channel2 = new Channel(2, mod, sampleRate);
        this.channel3 = new Channel(3, mod, sampleRate);
        this.tickLen = 0;
        this.tickLenSamples = 0;
        this.currentSequenceIndex = 0;
        this.nextSequenceIndex = 0;
        this.currentRow = 0;
        this.nextRow = 0;
        this.tickCounter = 0;
        this.ticksPerRow = 0;
        this.patternLoopCount = 0;
        this.patternLoopChannel = 0;
        this.setSequenceIndex(0);
    }

    setSequenceIndex(pos) {
        this.channel0.reset();
        this.channel1.reset();
        this.channel2.reset();
        this.channel3.reset();

        this.channel0.setPanning(64);
        this.channel1.setPanning(192);
        this.channel2.setPanning(192);
        this.channel3.setPanning(64);

        this.ticksPerRow = 6;
        this.setTempo(DEFAULT_TEMPO);

        this.patternLoopCount = -1;
        this.nextSequenceIndex = pos;
        this.nextRow = 0;
        this.tickCounter = 0;
    }

    songDuration() {
        this.setSequenceIndex(0);
        this.nextTick();
        let duration = this.tickLenSamples;
        while (!this.nextTick()) duration += this.tickLenSamples;
        this.setSequenceIndex(0);
        return duration;
    }

    read(outputBuffer) {
        outputBuffer.fill(0);
        this.nextTick();
        this.channel0.resample(outputBuffer, 0, this.tickLen);
        this.channel1.resample(outputBuffer, 0, this.tickLen);
        this.channel2.resample(outputBuffer, 0, this.tickLen);
        this.channel3.resample(outputBuffer, 0, this.tickLen);
        return this.tickLenSamples;
    }

    setTempo(bpm) {
        this.tickLen = (this.sampleRate * 5) / (bpm * 2);
        this.tickLenSamples = ((this.sampleRate << 2) + this.sampleRate) / (bpm << 1);
    }

    nextTick() {
        this.channel0.updateSampleIndex(this.tickLen);
        this.channel1.updateSampleIndex(this.tickLen);
        this.channel2.updateSampleIndex(this.tickLen);
        this.channel3.updateSampleIndex(this.tickLen);
        if (--this.tickCounter <= 0) {
            this.tickCounter = this.ticksPerRow;
            return this.row();
        }
        this.channel0.tick();
        this.channel1.tick();
        this.channel2.tick();
        this.channel3.tick();
        return false;
    }

    row() {
        let songEnd = false;

        if (this.nextSequenceIndex < 0) {
            this.nextSequenceIndex = 0;
            this.nextRow = 0;
        }

        if (this.nextSequenceIndex >= this.mod.sequenceLength) {
            songEnd = true;
            this.nextSequenceIndex = this.mod.jumpIndex;
            if (this.nextSequenceIndex < 0) {
                this.nextSequenceIndex = 0;
            }
            if (this.nextSequenceIndex >= this.mod.sequenceLength) {
                this.nextSequenceIndex = 0;
            }
            this.nextRow = 0;
        }
        if (this.nextSequenceIndex < this.currentSequenceIndex) {
            songEnd = true;
        }

        if (this.nextSequenceIndex === this.currentSequenceIndex) {
            if (this.nextRow <= this.currentRow) {
                if (this.patternLoopCount < 0) {
                    songEnd = true;
                }
            }
        }
        this.currentSequenceIndex = this.nextSequenceIndex;

        if (this.nextRow < 0 || this.nextRow >= NUM_ROWS_PATTERN) {
            this.nextRow = 0;
        }

        this.currentRow = this.nextRow++;
        if (this.nextRow >= NUM_ROWS_PATTERN) {
            this.nextSequenceIndex = this.currentSequenceIndex + 1;
            this.nextRow = 0;
        }

        const patternNotes = this.mod.getSequencePattern(this.currentSequenceIndex).notes;
        const currRow = this.currentRow << 2;
        this.processChannel(this.channel0, patternNotes[currRow + 0]);
        this.processChannel(this.channel1, patternNotes[currRow + 1]);
        this.processChannel(this.channel2, patternNotes[currRow + 2]);
        this.processChannel(this.channel3, patternNotes[currRow + 3]);
        return songEnd;
    }

    processChannel(channel, note) {
        channel.row(note);
        switch (note.effectNumber) {
            case 0xB:
                if (this.patternLoopCount < 0) {
                    this.nextSequenceIndex = note.effectParameter;
                    this.nextRow = 0;
                }
                break;
            case 0xD:
                if (this.patternLoopCount < 0) {
                    this.nextSequenceIndex = this.currentSequenceIndex + 1;
                    this.nextRow = (note.effectParameter >> 4) * 10 + (note.effectParameter & 0x0F);
                }
                break;
            case 0x0E:
                switch (note.effectParameter & 0xF0) {
                    case 0x60:
                        if ((note.effectParameter & 0x0F) === 0) {
                            channel.patternLoopRow = this.currentRow;
                        }
                        if (channel.patternLoopRow < this.currentRow) {
                            if (this.patternLoopCount < 0) {
                                this.patternLoopCount = note.effectParameter & 0x0F;
                                this.patternLoopChannel = channel.index;
                            }
                            if (this.patternLoopChannel === channel.index) {
                                if (this.patternLoopCount === 0) {
                                    channel.patternLoopRow = this.currentRow + 1;
                                } else {
                                    this.nextRow = channel.patternLoopRow;
                                    this.nextSequenceIndex = this.currentSequenceIndex;
                                }
                                this.patternLoopCount -= 1;
                            }
                        }
                        break;
                    case 0xE0: {
                        this.tickCounter += this.ticksPerRow * (note.effectParameter & 0x0F);
                        break;
                    }
                }
                break;
            case 0xF:
                if (note.effectParameter < 32) {
                    if (note.effectParameter > 0 && note.effectParameter < 256) {
                        this.ticksPerRow = note.effectParameter;
                    }
                    this.tickCounter = this.ticksPerRow;
                } else if (note.effectParameter > 31 && note.effectParameter < 256) {
                    this.setTempo(note.effectParameter);
                }
                break;
        }
    }
}
