const IMAGE_TYPES = ["image/jpeg", "image/png", "image/gif", "image/webp"];
const VIDEO_TYPES = ["video/mp4", "video/webm"];
const MAX_IMAGE_BYTES = 5 * 1024 * 1024;
const MAX_VIDEO_BYTES = 20 * 1024 * 1024;
const USERNAME_REGEX = /^[a-zA-Z0-9_]{3,20}$/;

export function isValidUsername(username: string): boolean {
  return USERNAME_REGEX.test(username);
}

export function validateImageFile(file: File): string | null {
  if (!IMAGE_TYPES.includes(file.type)) {
    return "Format gambar tidak didukung. Gunakan JPG, PNG, GIF, atau WebP.";
  }
  if (file.size > MAX_IMAGE_BYTES) {
    return "Ukuran gambar maksimal 5MB.";
  }
  return null;
}

export function validateVideoFile(file: File): string | null {
  if (!VIDEO_TYPES.includes(file.type)) {
    return "Format video tidak didukung. Gunakan MP4 atau WebM.";
  }
  if (file.size > MAX_VIDEO_BYTES) {
    return "Ukuran video maksimal 20MB.";
  }
  return null;
}
