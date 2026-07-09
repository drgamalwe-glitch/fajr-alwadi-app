/// <reference types="vite/client" />
/// <reference types="@tauri-apps/api/types" />

declare module "*.png" {
  const src: string;
  export default src;
}
