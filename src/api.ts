export interface ModelStatus {
  local: boolean;
  embeddings: boolean;
  chat: boolean;
  embedModel: string;
  chatModel: string;
}

export async function api<T>(path: string, input?: unknown): Promise<T> {
  const response = await fetch(
    "/api/" + path,
    input === undefined
      ? {
          signal: AbortSignal.timeout(2000),
        }
      : {
          method: "POST",
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify(input),
          signal: AbortSignal.timeout(300_000),
        },
  );
  const data = await response.json();
  if (!response.ok)
    throw new Error(
      data.error ?? "The local service could not complete the request.",
    );
  return data as T;
}
