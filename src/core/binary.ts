const encoder = new TextEncoder()
const decoder = new TextDecoder()

const BINARY_MARKER = 0x01

export function encodeBinaryFrame(event: string, data: ArrayBuffer | Uint8Array): ArrayBuffer {
  const eventBytes = encoder.encode(event)
  const payload = data instanceof ArrayBuffer ? new Uint8Array(data) : data
  const frame = new Uint8Array(1 + 2 + eventBytes.length + payload.length)
  frame[0] = BINARY_MARKER
  frame[1] = (eventBytes.length >> 8) & 0xff
  frame[2] = eventBytes.length & 0xff
  frame.set(eventBytes, 3)
  frame.set(payload, 3 + eventBytes.length)
  return frame.buffer
}

export function decodeBinaryFrame(
  message: Buffer | ArrayBuffer,
): { event: string; payload: ArrayBuffer } | null {
  const bytes = message instanceof Buffer ? new Uint8Array(message) : new Uint8Array(message)
  if (bytes.length < 3 || bytes[0] !== BINARY_MARKER) return null

  const eventLen = (bytes[1]! << 8) | bytes[2]!
  if (bytes.length < 3 + eventLen) return null

  const event = decoder.decode(bytes.slice(3, 3 + eventLen))
  const payload = bytes.slice(3 + eventLen).buffer
  return { event, payload }
}
