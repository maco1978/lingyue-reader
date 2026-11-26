/** 播放一段合成音频；播放结束/出错或 abort 都会 resolve，并回收 blob URL */
export function playBlob(
  blob: Blob,
  controller: AbortController,
  setAudio: (a: HTMLAudioElement | null) => void,
): Promise<void> {
  return new Promise((resolve) => {
    const audio = new Audio(URL.createObjectURL(blob));
    setAudio(audio);
    let settled = false;
    const done = () => {
      if (settled) return;
      settled = true;
      controller.signal.removeEventListener('abort', done);
      audio.pause();
      URL.revokeObjectURL(audio.src);
      resolve();
    };
    controller.signal.addEventListener('abort', done, { once: true });
    audio.onended = done;
    audio.onerror = done;
    audio.play().catch(() => {});
  });
}
