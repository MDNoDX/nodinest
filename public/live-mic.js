// Röznoma live talk: hands the microphone's raw samples to the page
// (components/assistant/voice-talk.tsx resamples them to 16 kHz for Gemini Live).
class MicTap extends AudioWorkletProcessor {
  process(inputs) {
    const ch = inputs[0] && inputs[0][0];
    if (ch) this.port.postMessage(ch.slice(0));
    return true;
  }
}
registerProcessor("mic-tap", MicTap);
