const engine = 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1/dist/transformers.min.js';
const model = 'onnx-community/whisper-tiny';
const revision = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
let speech;
async function loadSpeech() {
  const { env, pipeline } = await import(/* @vite-ignore */ engine);
  env.allowLocalModels = false;
  env.backends.onnx.wasm.numThreads = 1;
  env.backends.onnx.wasm.proxy = false;
  return pipeline('automatic-speech-recognition', model, { revision, device: 'wasm', dtype: 'q8' });
}
globalThis.onmessage = async ({ data }) => {
  try {
    if (!speech) {
      globalThis.postMessage({ id: data.id, stage: 'setup' });
      speech = loadSpeech().catch(error => { speech = undefined; throw error; });
    }
    const transcribe = await speech;
    globalThis.postMessage({ id: data.id, stage: 'transcribe' });
    const result = await transcribe(data.samples, { chunk_length_s: 25, stride_length_s: 4, task: 'transcribe' });
    globalThis.postMessage({ id: data.id, text: result.text?.trim() || '' });
  } catch {
    globalThis.postMessage({ id: data.id, failed: true });
  }
};
