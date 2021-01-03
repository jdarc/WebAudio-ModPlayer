import Sample from "./sample";
import { FIXED_POINT_MASK, FIXED_POINT_ONE, FIXED_POINT_SHIFT, log2, raise2, SINE_TABLE } from "./constants";

const CHANNEL_GAIN = 0x3000;
const LOG2_29024 = log2(29024);
const LOG2_1712 = log2(1712);

const clamp = (v, min, max) => v < min ? min : v > max ? max : v;

const computeWaveform = (phase, type) => {
    switch (type) {
        case 0:
        case 4:
            return (phase & 0x20) === 0 ? SINE_TABLE[phase & 0x1F] : -SINE_TABLE[phase & 0x1F];
        case 1:
        case 5:
            return 255 - ((phase + 0x20 & 0x3F) << 3);
        case 2:
        case 6:
            return (phase & 0x20) > 0 ? 255 : -255;
        case 3:
        case 7:
            return (Math.random() * 0xFFFFFF >> 15) - 255
        default:
            return 0;
    }
};

// noinspection SpellCheckingInspection
export default class Channel {
    constructor(index, mod, sampleRate) {
        this.log2SamplingRate = log2(sampleRate);
        this.index = index;
        this.mod = mod;
        this.sample = Sample.EMPTY;
        this.currentNote = 0;
        this.silent = 0;
        this.sampleIndex = 0;
        this.sampleFrac = 0;
        this.step = 0;
        this.leftGain = 0;
        this.rightGain = 0;
        this.volume = 0;
        this.panning = 0;
        this.period = 0;
        this.portaPeriod = 0;
        this.keyAdd = 0;
        this.tremoloSpeed = 0;
        this.tremoloDepth = 0;
        this.tremoloTick = 0;
        this.tremoloWave = 0;
        this.tremoloAdd = 0;
        this.vibratoSpeed = 0;
        this.vibratoDepth = 0;
        this.vibratoTick = 0;
        this.vibratoWave = 0;
        this.vibratoAdd = 0;
        this.volumeSlideParam = 0;
        this.portamentoParam = 0;
        this.effectTick = 0;
        this.fadeOutVolume = 0;
        this.log2C2Rate = 0;
    }

    setPeriod(p) {
        return this.period = clamp(p, 32, 32768);
    };

    keyToPeriod(key) {
        return raise2(LOG2_29024 - (key << FIXED_POINT_SHIFT) / 12) >> FIXED_POINT_SHIFT;
    };

    setVibratoSpeed(speed) {
        return speed > 0 && (this.vibratoSpeed = speed);
    };

    setVibratoDepth(depth) {
        return depth > 0 && (this.vibratoDepth = depth);
    };

    setVibratoWave(wave) {
        return this.vibratoWave = wave < 0 || wave > 7 ? 0 : wave;
    };

    setTremoloSpeed(speed) {
        return speed > 0 && (this.tremoloSpeed = speed);
    };

    setTremoloDepth(depth) {
        return depth > 0 && (this.tremoloDepth = depth);
    };

    setTremoloWave(wave) {
        this.tremoloWave = wave < 0 || wave > 7 ? 0 : wave;
    }

    vibrato() {
        return this.vibratoAdd += computeWaveform(this.vibratoTick * this.vibratoSpeed, this.vibratoWave) * this.vibratoDepth >> 5;
    };

    tremolo() {
        return this.tremoloAdd += computeWaveform(this.tremoloTick * this.tremoloSpeed, this.tremoloWave) * this.tremoloDepth >> 6;
    };

    setPortamentoParam(param) {
        return param !== 0 && (this.portamentoParam = param);
    };

    setVolumeSlideParam(param) {
        return param !== 0 && (this.volumeSlideParam = param);
    };

    tonePortamento() {
        if (this.portaPeriod < this.period) {
            const newPeriod = this.period - (this.portamentoParam << 2);
            this.setPeriod(newPeriod < this.portaPeriod ? this.portaPeriod : newPeriod);
        }
        if (this.portaPeriod > this.period) {
            const newPeriod = this.period + (this.portamentoParam << 2);
            this.setPeriod(newPeriod > this.portaPeriod ? this.portaPeriod : newPeriod);
        }
    };

    portamentoUp() {
        switch (this.portamentoParam & 0xF0) {
            case 0xE0:
                if (this.effectTick === 0) this.setPeriod(this.period - (this.portamentoParam & 0x0F));
                break;
            case 0xF0:
                if (this.effectTick === 0) this.setPeriod(this.period - ((this.portamentoParam & 0x0F) << 2));
                break;
            default:
                if (this.effectTick > 0) this.setPeriod(this.period - (this.portamentoParam << 2));
                break;
        }
    }

    portamentoDown() {
        switch (this.portamentoParam & 0xF0) {
            case 0xE0:
                if (this.effectTick === 0) this.setPeriod(this.period + (this.portamentoParam & 0x0F));
                break;
            case 0xF0:
                if (this.effectTick === 0) this.setPeriod(this.period + ((this.portamentoParam & 0x0F) << 2));
                break;
            case 0:
                this.setPeriod(this.period + (this.portamentoParam << 2));
                break;
        }
    }

    volumeSlide() {
        const up = (this.volumeSlideParam & 0xF0) >> 4;
        const down = this.volumeSlideParam & 0x0F;
        if (down === 0x0F && up > 0) {
            if (this.effectTick === 0) {
                this.setVolume(this.volume + up);
            }
        } else if (up === 0x0F && down > 0) {
            if (this.effectTick === 0) {
                this.setVolume(this.volume - down);
            }
        } else if (this.effectTick > 0) {
            this.setVolume(this.volume + up - down);
        }
    }

    setSampleIndex(index) {
        this.sampleIndex = index;
        this.sampleFrac = 0;
    }

    trigger(key, sampleIndex, effect) {
        if (sampleIndex > 0) {
            this.sample = this.mod.getSample(sampleIndex);
            this.volume = clamp(this.sample.volume, 0, 64);
            this.log2C2Rate = log2(this.sample.rate);
            this.fadeOutVolume = 32768;
        }
        if (key > 0 && key < 97) {
            this.portaPeriod = this.keyToPeriod(key);
            if (effect !== 0x03 && effect !== 0x05) {
                if (this.vibratoWave < 4) this.vibratoTick = 0;
                if (this.tremoloWave < 4) this.tremoloTick = 0;
                this.setPeriod(this.portaPeriod);
                this.setSampleIndex(0);
            }
        }
    }

    calculateAmplitude() {
        this.silent = this.sample.hasFinished(this.sampleIndex);
        if (!this.silent) {
            const tremoloVolume = clamp(this.volume + this.tremoloAdd, 0, 64);
            let amplitude = tremoloVolume << FIXED_POINT_SHIFT - 6;
            amplitude = amplitude * this.fadeOutVolume >> 15;
            amplitude = amplitude * CHANNEL_GAIN >> FIXED_POINT_SHIFT;
            if (amplitude < 1) {
                this.silent = true;
            } else {
                const mixerPanning = (this.panning & 0xFF) << FIXED_POINT_SHIFT - 8;
                this.leftGain = amplitude * (FIXED_POINT_ONE - mixerPanning) >> FIXED_POINT_SHIFT;
                this.rightGain = amplitude * mixerPanning >> FIXED_POINT_SHIFT;
            }
        }
    }

    calculateFrequency() {
        const b = ((this.keyAdd << 7) + this.sample.fineTune << FIXED_POINT_SHIFT) / 1536;
        const a = this.log2C2Rate + LOG2_1712 - log2(clamp(this.period + this.vibratoAdd, 32, 32768));
        return this.step = raise2(a + b - this.log2SamplingRate);
    }

    reset() {
        this.tremoloSpeed = this.tremoloDepth = this.tremoloWave = 0;
        this.vibratoSpeed = this.vibratoDepth = this.vibratoWave = 0;
        this.volumeSlideParam = this.portamentoParam = 0;
        this.sample = Sample.EMPTY;
    };

    resample(mixBuffer, frameOffset, frames) {
        if (!this.silent) {
            const loopStart = this.sample.loopStart;
            const loopLength = this.sample.loopLength;
            const loopEnd = loopStart + loopLength - 1;
            const end = frameOffset + frames - 1 << 1;
            const data = this.sample.data;
            let sampIdx = this.sampleIndex;
            let sampFrc = this.sampleFrac;
            let offset = frameOffset << 1;
            while (offset <= end) {
                if (sampIdx > loopEnd) {
                    if (loopLength <= 1) break;
                    sampIdx = loopStart + (sampIdx - loopStart) % loopLength;
                }
                mixBuffer[offset++] += data[sampIdx] * this.leftGain << 8 >> FIXED_POINT_SHIFT;
                mixBuffer[offset++] += data[sampIdx] * this.rightGain << 8 >> FIXED_POINT_SHIFT;
                sampFrc += this.step;
                sampIdx += sampFrc >> FIXED_POINT_SHIFT;
                sampFrc &= FIXED_POINT_MASK;
            }
        }
    };

    setVolume(vol) {
        this.volume = clamp(vol, 0, 64);
    }

    setPanning(pan) {
        this.panning = clamp(pan, 0, 255);
    }

    updateSampleIndex(length) {
        this.sampleFrac += this.step * length;
        this.sampleIndex += this.sampleFrac >> FIXED_POINT_SHIFT;
        this.sampleFrac &= FIXED_POINT_MASK;
    };

    row(note) {
        const key = note.key;
        const sampleIndex = note.sampleNumber;
        let effect = note.effectNumber & 0xFF;
        let effectParam = note.effectParameter;

        if (effect >= 0x30) effect = 0;
        if (effect === 0x00 && effectParam !== 0) effect = 0x40;
        if (effect === 0x0E) {
            effect = 0x30 + ((effectParam & 0xF0) >> 4);
            effectParam &= 0x0F;
        }
        if (effect === 0x21) {
            effect = 0x40 + ((effectParam & 0xF0) >> 4);
            effectParam &= 0x0F;
        }

        this.currentNote = note;
        this.effectTick = 0;
        this.keyAdd = 0;
        this.vibratoAdd = 0;
        this.tremoloAdd = 0;

        if (!(effect === 0x3D && effectParam > 0)) {
            this.trigger(key, sampleIndex, effect);
        }

        switch (effect) {
            case 0x01:
                this.setPortamentoParam(effectParam);
                this.portamentoUp();
                break;
            case 0x02:
                this.setPortamentoParam(effectParam);
                this.portamentoDown();
                break;
            case 0x03:
                this.setPortamentoParam(effectParam);
                break;
            case 0x04:
                this.setVibratoSpeed((effectParam & 0xF0) >> 4);
                this.setVibratoDepth(effectParam & 0x0F);
                this.vibrato();
                break;
            case 0x05:
                this.setVolumeSlideParam(effectParam);
                this.volumeSlide();
                break;
            case 0x06:
                this.setVolumeSlideParam(effectParam);
                this.vibrato();
                this.volumeSlide();
                break;
            case 0x07:
                this.setTremoloSpeed((effectParam & 0xF0) >> 4);
                this.setTremoloDepth(effectParam & 0x0F);
                this.tremolo();
                break;
            case 0x08:
                this.setPanning(effectParam);
                break;
            case 0x09:
                this.setSampleIndex(effectParam << 8);
                break;
            case 0x0A:
                this.setVolumeSlideParam(effectParam);
                this.volumeSlide();
                break;
            case 0x0C:
                this.setVolume(effectParam);
                break;
            case 0x11:
                this.setVolumeSlideParam(effectParam);
                break;
            case 0x15:
                break;
            case 0x19:
                this.setVolumeSlideParam(effectParam);
                break;
            case 0x31:
                this.setPortamentoParam(0xF0 | effectParam);
                this.portamentoUp();
                break;
            case 0x32:
                this.setPortamentoParam(0xF0 | effectParam);
                this.portamentoDown();
                break;
            case 0x34:
                this.setVibratoWave(effectParam);
                break;
            case 0x37:
                this.setTremoloWave(effectParam);
                break;
            case 0x39:
                break;
            case 0x3A:
                this.setVolumeSlideParam(effectParam << 4 | 0x0F);
                this.volumeSlide();
                break;
            case 0x3B:
                this.setVolumeSlideParam(0xF0 | effectParam);
                this.volumeSlide();
                break;
            case 0x3C:
                effectParam === 0 && this.setVolume(0);
                break;
        }
        this.calculateAmplitude();
        this.calculateFrequency();
    };

    tick() {
        this.effectTick++;
        if (this.currentNote.effectNumber === 0x3D && this.currentNote.effectParameter === this.effectTick) {
            this.currentNote.effectParameter = 0;
            this.currentNote.effectParameter = 0;
            this.row(this.currentNote);
        } else {
            this.vibratoTick++;
            this.tremoloTick++;
            this.keyAdd = 0;
            this.vibratoAdd = 0;
            this.tremoloAdd = 0;
            switch (this.currentNote.effectNumber) {
                case 0x01:
                    this.portamentoUp();
                    break;
                case 0x02:
                    this.portamentoDown();
                    break;
                case 0x03:
                    this.tonePortamento();
                    break;
                case 0x04:
                    this.vibrato();
                    break;
                case 0x05:
                    this.tonePortamento();
                    this.volumeSlide();
                    break;
                case 0x06:
                    this.vibrato();
                    this.volumeSlide();
                    break;
                case 0x07:
                    this.tremolo();
                    break;
                case 10:
                    this.volumeSlide();
                    break;
                case 25:
                    this.setPanning(this.panning - ((this.volumeSlideParam & 0xF0) >> 4) + (this.volumeSlideParam & 0x0F));
                    break;
                case 60:
                    this.effectTick === this.currentNote.effectParameter && this.setVolume(0);
                    break;
                case 64:
                    switch (this.effectTick % 3) {
                        case 0:
                            break;
                        case 1:
                            this.keyAdd = (this.currentNote.effectParameter & 0xF0) >> 4;
                            break;
                        case 2:
                            this.keyAdd = this.currentNote.effectParameter & 0x0F;
                            break;
                    }
                    break;
            }
        }
        this.calculateAmplitude();
        this.calculateFrequency();
    };
}
