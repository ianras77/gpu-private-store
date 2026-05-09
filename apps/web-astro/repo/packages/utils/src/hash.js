import crypto from "crypto";
const stableStringify = (value) => {
    if (value === null || typeof value !== "object") {
        return JSON.stringify(value);
    }
    if (Array.isArray(value)) {
        return `[${value.map(stableStringify).join(",")}]`;
    }
    const entries = Object.entries(value).sort(([a], [b]) => a.localeCompare(b));
    const inner = entries.map(([key, val]) => `${JSON.stringify(key)}:${stableStringify(val)}`);
    return `{${inner.join(",")}}`;
};
export const hashObject = (value) => {
    const payload = stableStringify(value);
    return crypto.createHash("sha256").update(payload).digest("hex");
};
