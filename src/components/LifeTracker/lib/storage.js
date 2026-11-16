import { appStorage as localStorage } from '../../../utils/appStorage.js';
export function readJson(key, fallback) {
  if (typeof window === 'undefined') {
    return fallback
  }

  try {
    const raw = localStorage.getItem(key)
    return raw ? JSON.parse(raw) : fallback
  } catch {
    return fallback
  }
}

export function writeJson(key, value) {
  if (typeof window === 'undefined') {
    return
  }

  localStorage.setItem(key, JSON.stringify(value))
  window.dispatchEvent(new Event('lifetracker:sync'))
}
