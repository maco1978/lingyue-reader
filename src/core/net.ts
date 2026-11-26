/**
 * 网络请求的共享超时工具。
 * 关键契约：超时与「调用方主动取消」必须区分——前者要给用户人话提示，后者应静默退出。
 */

export class TimeoutError extends Error {
  constructor(message: string, options?: ErrorOptions) {
    super(message, options);
    this.name = 'TimeoutError';
  }
}

/**
 * 给一次网络交互（含读响应体）加总超时，并转发外层取消。
 * @param label 人话前缀，例如「语音合成」「模型调用」
 * @param outer 调用方的 AbortSignal；转发它的取消，但不会把它当成超时
 */
export async function withTimeout<T>(
  label: string,
  timeoutMs: number,
  outer: AbortSignal | undefined,
  run: (signal: AbortSignal) => Promise<T>,
): Promise<T> {
  const controller = new AbortController();
  let timedOut = false;
  const timer = setTimeout(() => { timedOut = true; controller.abort(); }, timeoutMs);
  const forward = () => controller.abort();

  if (outer) {
    if (outer.aborted) controller.abort();
    else outer.addEventListener('abort', forward, { once: true });
  }

  try {
    return await run(controller.signal);
  } catch (e) {
    if (timedOut) {
      const seconds = Math.max(1, Math.round(timeoutMs / 1000));
      throw new TimeoutError(label + '超时（' + seconds + ' 秒），请检查网络后重试', { cause: e });
    }
    throw e;
  } finally {
    clearTimeout(timer);
    outer?.removeEventListener('abort', forward);
  }
}
