import { useEffect, useState } from "react";

export default function MediaPreview({ file, onCancel }: { file: File; onCancel: () => void }) {
  const [url, setUrl] = useState<string | null>(null);

  useEffect(() => {
    const objectUrl = URL.createObjectURL(file);
    setUrl(objectUrl);
    return () => URL.revokeObjectURL(objectUrl);
  }, [file]);

  if (!url) return null;

  return (
    <div className="flex items-center gap-2 rounded border p-2">
      {file.type.startsWith("image/") ? (
        <img src={url} alt="preview" className="h-16 w-16 rounded object-cover" />
      ) : (
        <video src={url} className="h-16 w-16 rounded object-cover" />
      )}
      <span className="flex-1 truncate text-sm">{file.name}</span>
      <button type="button" onClick={onCancel} className="text-sm text-red-600">
        Batal
      </button>
    </div>
  );
}
