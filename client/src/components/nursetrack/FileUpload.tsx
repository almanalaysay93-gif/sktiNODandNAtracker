import { Button } from "@/components/ui/button";
import { toast } from "sonner";
import { ALLOWED_PHOTO_MIMES, ALLOWED_DOCUMENT_MIMES, MAX_FILE_BYTES, validateMime } from "../../../../shared/nursetrack";
import { Upload } from "lucide-react";

/**
 * File picker that returns base64 content ready for the upload mutations.
 * Validates MIME type and size before returning.
 */
export function pickFile(kind: "photo" | "document"): Promise<{ fileBase64: string; fileName: string; mimeType: string } | null> {
  return new Promise((resolve) => {
    const input = document.createElement("input");
    input.type = "file";
    input.accept = kind === "photo" ? "image/jpeg,image/png" : "image/jpeg,image/png,application/pdf";
    input.onchange = () => {
      const file = input.files?.[0];
      if (!file) {
        resolve(null);
        return;
      }
      const mimeCheck = validateMime(file.type, kind);
      if (!mimeCheck.ok) {
        toast.error(mimeCheck.error ?? "File type not supported.");
        resolve(null);
        return;
      }
      if (file.size > MAX_FILE_BYTES) {
        toast.error("File is too large (max 10 MB).");
        resolve(null);
        return;
      }
      const reader = new FileReader();
      reader.onload = () => {
        const result = reader.result as string;
        const base64 = result.split(",")[1] ?? "";
        resolve({ fileBase64: base64, fileName: file.name, mimeType: file.type });
      };
      reader.onerror = () => {
        toast.error("Could not read the file.");
        resolve(null);
      };
      reader.readAsDataURL(file);
    };
    input.click();
  });
}

export function FileUploadButton({
  kind,
  onFile,
  label,
  disabled,
  className,
}: {
  kind: "photo" | "document";
  onFile: (file: { fileBase64: string; fileName: string; mimeType: string }) => void;
  label?: string;
  disabled?: boolean;
  className?: string;
}) {
  return (
    <Button
      type="button"
      variant="outline"
      size="sm"
      disabled={disabled}
      className={className}
      onClick={async () => {
        const file = await pickFile(kind);
        if (file) onFile(file);
      }}
    >
      <Upload className="h-4 w-4 mr-1" />
      {label ?? (kind === "photo" ? "Upload Photo" : "Upload File")}
    </Button>
  );
}
