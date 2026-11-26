import type { VoiceCard } from './types';
import type { Storage } from '../types';

const KEY = 'lingyue:voices';

export function voiceCards(storage: Storage) {
  function list(): VoiceCard[] {
    const raw = storage.get(KEY);
    if (!raw) return [];
    try {
      const parsed: unknown = JSON.parse(raw);
      return Array.isArray(parsed) ? (parsed as VoiceCard[]) : [];
    } catch {
      return [];
    }
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
