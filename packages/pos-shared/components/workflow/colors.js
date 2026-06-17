// Bootstrap contextual color → hex, shared by the workflow canvas, viewer and
// board so the stage palette stays consistent in one place.
export const COLOR_HEX = {
    secondary: "#6c757d",
    info: "#0dcaf0",
    primary: "#0d6efd",
    warning: "#ffc107",
    success: "#198754",
    danger: "#dc3545",
    dark: "#212529",
    light: "#adb5bd",
};

export const hexFor = (c) => COLOR_HEX[c] || COLOR_HEX.secondary;

// Stage header text needs dark ink on light backgrounds.
export const isLightColor = (c) => ["light", "warning", "info"].includes(c);
