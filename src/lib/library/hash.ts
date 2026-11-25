import type { Song } from "@/lib/types";

/** Browser memory is acceptable for files up to ~100 MB. */
export async function sha256Hex(blob: Blob): Promise<string> {
  const digest = await crypto.subtle.digest("SHA-256", await blob.arrayBuffer());
  return Array.from(new Uint8Array(digest), (b) => b.toString(16).padStart(2, "0")).join("");
}

export type UploadFailure = Error & { reason: string };

function failure(reason: string): UploadFailure {
  return Object.assign(new Error(reason), { reason });
}

/** PUTs the raw file via XHR (for progress). Rejects with an Error carrying `.reason`. */
export function uploadFile(
  file: File,
  folderId: string | null,
  onProgress: (fraction: number) => void,
): Promise<Song> {
  return new Promise<Song>((resolve, reject) => {
    const xhr = new XMLHttpRequest();
    const qs = `name=${encodeURIComponent(file.name)}&folderId=${encodeURIComponent(folderId ?? "")}`;
    xhr.open("PUT", `/api/songs/upload?${qs}`);
    xhr.responseType = "json";
    xhr.upload.onprogress = (e) => {
      if (e.lengthComputable && e.total > 0) onProgress(e.loaded / e.total);
    };
    xhr.onload = () => {
      if (xhr.status >= 200 && xhr.status < 300) {
        onProgress(1);
        resolve(xhr.response as Song);
      } else {
        const reason = (xhr.response as { reason?: string } | null)?.reason;
        reject(failure(reason ?? (xhr.status === 401 ? "unauthorized" : "server_error")));
      }
    };
    xhr.onerror = () => reject(failure("network"));
    xhr.onabort = () => reject(failure("aborted"));
    xhr.send(file);
  });
}
