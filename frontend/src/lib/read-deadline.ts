/** Stop awaiting a read; callers must apply results only after this promise resolves. */
export async function readWithDeadline<T>(read: () => Promise<T>, label: string, timeoutMs = 15_000): Promise<T> {
  let timer: ReturnType<typeof setTimeout> | undefined;
  const timeout = new Promise<never>((_, reject) => {
    timer = setTimeout(() => reject(new Error(`${label}: o serviço não respondeu no prazo. Tente novamente.`)), timeoutMs);
  });
  try { return await Promise.race([Promise.resolve().then(read), timeout]); }
  finally { clearTimeout(timer); }
}
