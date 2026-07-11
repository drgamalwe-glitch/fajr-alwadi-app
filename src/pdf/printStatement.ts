import { createElement } from "react";
import { Font, pdf } from "@react-pdf/renderer";
import { invoke } from "@tauri-apps/api/core";
import { join, resolveResource, tempDir } from "@tauri-apps/api/path";
import { readFile, writeFile } from "@tauri-apps/plugin-fs";
import { PartnerStatementPDF, type PartnerStatementPrintProps } from "./PartnerStatementPDF";

let pdfFontsRegistered = false;

const isTauriRuntime = () =>
  typeof window !== "undefined" &&
  ("__TAURI_INTERNALS__" in window || "__TAURI__" in window || import.meta.env.TAURI_ENV_PLATFORM != null);

const bytesToBase64 = (bytes: Uint8Array) => {
  const chunkSize = 0x8000;
  const chunks: string[] = [];
  for (let i = 0; i < bytes.length; i += chunkSize) {
    const chunk = bytes.subarray(i, i + chunkSize);
    chunks.push(String.fromCharCode(...chunk));
  }
  return btoa(chunks.join(""));
};

const fetchLogoFromPublicPath = async (): Promise<string | undefined> => {
  try {
    const response = await fetch("/logo.png");
    if (!response.ok) return undefined;
    const bytes = new Uint8Array(await response.arrayBuffer());
    return `data:image/png;base64,${bytesToBase64(bytes)}`;
  } catch {
    return undefined;
  }
};

async function getLogoBase64(): Promise<string | undefined> {
  if (!isTauriRuntime()) {
    return fetchLogoFromPublicPath();
  }

  for (const resourcePath of ["assets/logo.png", "logo.png"]) {
    try {
      const logoPath = await resolveResource(resourcePath);
      const bytes = await readFile(logoPath);
      return `data:image/png;base64,${bytesToBase64(bytes)}`;
    } catch {
      continue;
    }
  }

  return fetchLogoFromPublicPath();
}

const readResourceBytes = async (resourcePath: string) => {
  const resolvedPath = await resolveResource(resourcePath);
  return readFile(resolvedPath);
};

const readPublicBytes = async (publicPath: string) => {
  const response = await fetch(publicPath);
  if (!response.ok) {
    throw new Error(`Failed to load ${publicPath}`);
  }
  return new Uint8Array(await response.arrayBuffer());
};

const getAssetBase64 = async (resourcePath: string, publicPath: string, mimeType: string) => {
  if (isTauriRuntime()) {
    try {
      const bytes = await readResourceBytes(resourcePath);
      return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
    } catch {
      // Fall back to the bundled frontend asset path used in dev and packaged builds.
    }
  }

  const bytes = await readPublicBytes(publicPath);
  return `data:${mimeType};base64,${bytesToBase64(bytes)}`;
};

async function ensurePdfFontsRegistered(): Promise<void> {
  if (pdfFontsRegistered) return;

  const [regular, medium, bold, extraBold] = await Promise.all([
    getAssetBase64("fonts/Tajawal-Regular.ttf", "/fonts/Tajawal-Regular.ttf", "font/ttf"),
    getAssetBase64("fonts/Tajawal-Medium.ttf", "/fonts/Tajawal-Medium.ttf", "font/ttf"),
    getAssetBase64("fonts/Tajawal-Bold.ttf", "/fonts/Tajawal-Bold.ttf", "font/ttf"),
    getAssetBase64("fonts/Tajawal-ExtraBold.ttf", "/fonts/Tajawal-ExtraBold.ttf", "font/ttf"),
  ]);

  Font.register({
    family: "Tajawal",
    fonts: [
      { src: regular, fontWeight: 400 },
      { src: medium, fontWeight: 500 },
      { src: bold, fontWeight: 700 },
      { src: extraBold, fontWeight: 900 },
    ],
  });

  pdfFontsRegistered = true;
}

const downloadInBrowser = (blob: Blob, filename: string) => {
  const url = URL.createObjectURL(blob);
  const anchor = document.createElement("a");
  anchor.href = url;
  anchor.download = filename;
  anchor.style.display = "none";
  document.body.appendChild(anchor);
  anchor.click();
  anchor.remove();
  window.setTimeout(() => URL.revokeObjectURL(url), 1000);
};

export async function printStatement(props: PartnerStatementPrintProps): Promise<void> {
  await ensurePdfFontsRegistered();
  const logoSrc = await getLogoBase64();
  const statementDocument = createElement(PartnerStatementPDF, { ...props, logoSrc }) as unknown as Parameters<typeof pdf>[0];
  const blob = await pdf(
    statementDocument
  ).toBlob();
  const filename = `fajr_statement_${Date.now()}.pdf`;

  if (!isTauriRuntime()) {
    downloadInBrowser(blob, filename);
    return;
  }

  const bytes = new Uint8Array(await blob.arrayBuffer());
  const dir = await tempDir();
  const filePath = await join(dir, filename);
  await writeFile(filePath, bytes);
  await invoke("open_temp_pdf", { path: filePath });
}
