import type { VoiceCard } from './types';
import type { Storage } from '../types';

export function memoryStorage(): Storage {
  const map = new Map<string, string>();
  return { get: k => map.get(k) ?? null, set: (k, v) => { map.set(k, v); } };
}

const KEY = 'lingyue:voices';

export function voiceCards(storage: Storage) {
  function list(): VoiceCard[] {
    const raw = storage.get(KEY);
    return raw ? JSON.parse(raw) as VoiceCard[] : [];
  }
  function save(card: VoiceCard): void {
    const all = list().filter(c => c.id !== card.id);
    all.push(card);
    storage.set(KEY, JSON.stringify(all));
  }
  function remove(id: string): void {
    storage.set(KEY, JSON.stringify(list().filter(c => c.id !== id)));
  }
  return { list, save, remove };
}
