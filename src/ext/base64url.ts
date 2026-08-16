const bytesOf = (input: BufferSource) => {
    if (input instanceof ArrayBuffer) {
        return new Uint8Array(input);
    }
    return new Uint8Array(input.buffer, input.byteOffset, input.byteLength);
};

export const decodeBase64 = (input: string) => {
    const padded = input.length % 4 === 0 ? input : input + '='.repeat(4 - (input.length % 4));
    const normalized = padded.replaceAll('-', '+').replaceAll('_', '/');
    const binary = atob(normalized);
    const bytes = new Uint8Array(binary.length);
    for (let i = 0; i < binary.length; i++) {
        bytes[i] = binary.charCodeAt(i);
    }
    return bytes;
};

export const encodeBase64 = (input: BufferSource) => {
    const bytes = bytesOf(input);
    let binary = '';
    for (const byte of bytes) {
        binary += String.fromCharCode(byte);
    }
    return btoa(binary).replaceAll('+', '-').replaceAll('/', '_').replaceAll('=', '');
};
