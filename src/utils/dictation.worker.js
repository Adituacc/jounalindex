import { env, pipeline } from '@huggingface/transformers';

env.allowLocalModels = false;
env.backends.onnx.wasm.numThreads = 1;
env.backends.onnx.wasm.proxy = false;
const model = 'onnx-community/whisper-tiny';
const revision = 'ff4177021cc41f7db950912b73ea4fdf7d01d8e7';
let speech;
globalThis.onmessage = async ({ data }) => {
  try {
    if (!speech) {
      globalThis.postMessage({ id: data.id, stage: 'setup' });
      speech = pipeline('automatic-speech-recognition', model, { revision, device: 'wasm', dtype: 'q8' })
        .catch(error => { speech = undefined; throw error; });
    }
    const transcribe = await speech;
    globalThis.postMessage({ id: data.id, stage: 'transcribe' });
    const result = await transcribe(data.samples, { chunk_length_s: 25, stride_length_s: 4, task: 'transcribe' });
    globalThis.postMessage({ id: data.id, text: result.text?.trim() || '' });
  } catch {
    globalThis.postMessage({ id: data.id, failed: true });
  }
};
