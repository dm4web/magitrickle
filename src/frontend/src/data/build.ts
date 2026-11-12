export const version = import.meta.env.VITE_PKG_VERSION || "0.0.0";
export const isDev =
  import.meta.env.VITE_PKG_VERSION_IS_DEV?.toLowerCase() === "true" || version === "0.0.0";
