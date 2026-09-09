export class StartupDeadlineError extends Error {}

export function withStartupDeadline<T>(operation: Promise<T>, timeoutMs: number, label: string, onLateSettled?: () => void): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined
  let expired = false
  const observed = operation.finally(() => { if (expired) onLateSettled?.() })
  const deadline = new Promise<never>((_, reject) => {
    timer = setTimeout(() => { expired = true; reject(new StartupDeadlineError(`${label} timed out after ${timeoutMs}ms`)) }, timeoutMs)
  })
  return Promise.race([observed, deadline]).finally(() => { if (timer) clearTimeout(timer) })
}
