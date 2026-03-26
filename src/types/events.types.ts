export type EventMap = Record<string, unknown>

export type EventHandler<T = unknown> = (payload: T) => void | Promise<void>

export type InferEventPayload<
  E extends EventMap,
  K extends keyof E,
> = E[K]
