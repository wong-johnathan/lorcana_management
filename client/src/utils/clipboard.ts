/**
 * Copy `text` to the clipboard (REQ-SHP-1).
 *
 * Prefers the async Clipboard API (`navigator.clipboard.writeText`, guarded so
 * insecure contexts don't throw), then falls back to the legacy
 * `document.execCommand("copy")` technique already used by
 * `SettingsPage.handleCopy`: a hidden `<input>` is appended, selected, copied,
 * and removed. Resolves `true` on success and `false` on any failure — this
 * helper never throws.
 */
export async function copyTextToClipboard(text: string): Promise<boolean> {
  if (navigator.clipboard?.writeText) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch {
      // Fall through to the legacy technique (e.g. permission denied).
    }
  }

  return copyWithExecCommand(text);
}

function copyWithExecCommand(text: string): boolean {
  let input: HTMLInputElement | null = null;
  try {
    input = document.createElement("input");
    input.value = text;
    input.setAttribute("readonly", "");
    input.style.position = "fixed";
    input.style.top = "-1000px";
    input.style.opacity = "0";
    document.body.appendChild(input);
    input.select();
    return document.execCommand("copy");
  } catch {
    return false;
  } finally {
    input?.remove();
  }
}
