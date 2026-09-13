export function videoBlobKeyForClipId(id: string): string {
  return `clip:${id}:video`;
}

export function audioBlobKeyForClipId(id: string): string {
  return `clip:${id}:audio`;
}
