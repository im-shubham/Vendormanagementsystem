import { ref, uploadBytesResumable } from 'firebase/storage';
import { storage } from '@/lib/firebase';

export interface UploadFiles {
  podDocument: File;
  supportingPhoto?: File | null;
}

const ext = (f: File) => (f.name.split('.').pop() ?? '').toLowerCase();

/**
 * Uploads to pod-documents/{vendorId}/{submissionId}/version-{n}/.
 * storage.rules decide who may write there (owning vendor, admin, or the
 * category team of that vendor); a Cloud Function then verifies and registers it.
 */
export async function uploadVersion(vendorId: string, submissionId: string, version: number, files: UploadFiles, onProgress?: (pct: number) => void) {
  const list: Array<[string, File]> = [[`pod-document.${ext(files.podDocument)}`, files.podDocument]];
  if (files.supportingPhoto) list.push([`supporting-photo.${ext(files.supportingPhoto)}`, files.supportingPhoto]);
  const total = list.reduce((s, [, f]) => s + f.size, 0);
  const done = new Map<string, number>();
  await Promise.all(
    list.map(
      ([name, file]) =>
        new Promise<void>((resolve, reject) => {
          const task = uploadBytesResumable(ref(storage, `pod-documents/${vendorId}/${submissionId}/version-${version}/${name}`), file, {
            contentType: file.type,
            customMetadata: { originalName: file.name.slice(0, 150) },
          });
          task.on(
            'state_changed',
            (s) => {
              done.set(name, s.bytesTransferred);
              onProgress?.(Math.round(([...done.values()].reduce((a, b) => a + b, 0) / total) * 100));
            },
            reject,
            () => resolve(),
          );
        }),
    ),
  );
}
