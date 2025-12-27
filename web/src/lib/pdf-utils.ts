/**
 * Shared PDF Utility Functions
 * Common functions for downloading, previewing, and printing PDFs
 */

/**
 * Download a PDF blob as a file
 */
export function downloadPDFBlob(blob: Blob, filename: string): void {
  const url = URL.createObjectURL(blob);
  const link = document.createElement("a");
  link.href = url;
  link.download = filename;
  document.body.appendChild(link);
  link.click();
  document.body.removeChild(link);
  URL.revokeObjectURL(url);
}

/**
 * Open a PDF blob in a new browser tab for preview
 * URL is automatically revoked after 60 seconds
 */
export function previewPDFBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  window.open(url, "_blank");
  // Revoke URL after delay to allow viewing
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}

/**
 * Open a PDF blob in a new window and trigger the browser print dialog
 * URL is automatically revoked after 60 seconds
 */
export function printPDFBlob(blob: Blob): void {
  const url = URL.createObjectURL(blob);
  const printWindow = window.open(url, "_blank");
  if (printWindow) {
    printWindow.addEventListener("load", () => {
      printWindow.print();
    });
  }
  // Cleanup after delay
  setTimeout(() => URL.revokeObjectURL(url), 60000);
}


