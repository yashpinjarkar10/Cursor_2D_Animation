export async function blobFromObjectUrl(objectUrl: string): Promise<Blob> {
  const res = await fetch(objectUrl);
  return await res.blob();
}
