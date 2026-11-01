// Percepção local: MediaPipe Pose Landmarker servido do próprio projeto (sem CDN).
import { FilesetResolver, PoseLandmarker } from '../vendor/tasks-vision/vision_bundle.mjs';

const WASM = new URL('../vendor/tasks-vision/wasm', import.meta.url).href;
const modelUrl = (v) => new URL(`../models/pose_landmarker_${v}.task`, import.meta.url).href;

async function modelExists(v) {
  try { return (await fetch(modelUrl(v), { method: 'HEAD' })).ok; } catch { return false; }
}

// opts: { maxPessoas, modelo: 'lite'|'full'|'heavy', confianca, forceCpu }
// forceCpu: contingência para máquinas com problema de GPU/WebGL (abrir o painel com ?cpu=1)
export async function createPerception({ maxPessoas, modelo = 'full', confianca = 0.5, forceCpu = false }) {
  let variant = modelo;
  let aviso = null;
  if (!(await modelExists(variant))) {
    aviso = `modelo ${variant} não encontrado (rode npm run setup${variant === 'heavy' ? ' -- --heavy' : ''}); usando lite`;
    variant = 'lite';
  }
  const fileset = await FilesetResolver.forVisionTasks(WASM);
  const options = (delegate) => ({
    baseOptions: { modelAssetPath: modelUrl(variant), delegate },
    runningMode: 'VIDEO',
    numPoses: maxPessoas,
    minPoseDetectionConfidence: confianca,
    minPosePresenceConfidence: confianca,
    minTrackingConfidence: 0.5,
  });
  let landmarker, delegate;
  try {
    if (forceCpu) throw new Error('CPU forçada por ?cpu=1');
    landmarker = await PoseLandmarker.createFromOptions(fileset, options('GPU'));
    delegate = 'GPU';
  } catch (err) {
    console.warn('GPU indisponível, usando CPU:', err);
    landmarker = await PoseLandmarker.createFromOptions(fileset, options('CPU'));
    delegate = 'CPU';
  }

  // Aquecimento: a primeira inferência compila shaders/WASM e pode levar segundos.
  // Fazê-la aqui evita que o controle confunda esse atraso com câmera congelada.
  const warm = document.createElement('canvas');
  warm.width = warm.height = 256;
  warm.getContext('2d').fillRect(0, 0, 256, 256);
  let lastTs = Math.round(performance.now());
  const t0 = performance.now();
  landmarker.detectForVideo(warm, lastTs);
  const warmupMs = performance.now() - t0;

  return {
    variant,
    aviso,
    delegate,
    warmupMs,
    detect(video) {
      // detectForVideo exige timestamps estritamente crescentes
      let ts = Math.round(performance.now());
      if (ts <= lastTs) ts = lastTs + 1;
      lastTs = ts;
      const t1 = performance.now();
      const result = landmarker.detectForVideo(video, ts);
      return { poses: result.landmarks || [], inferenceMs: performance.now() - t1 };
    },
    close() { landmarker.close(); },
  };
}
