const escapeXml = (value: string) =>
    value
        .replaceAll('&', '&amp;')
        .replaceAll('<', '&lt;')
        .replaceAll('>', '&gt;')
        .replaceAll('"', '&quot;')
        .replaceAll("'", '&apos;');

const stringifyNode = (name: string, value: unknown): string => {
    if (value === null || value === undefined) {
        return '';
    }

    if (Array.isArray(value)) {
        return value.map((item) => stringifyNode(name, item)).join('');
    }

    if (typeof value !== 'object') {
        return `<${name}>${escapeXml(String(value))}</${name}>`;
    }

    const attrs: string[] = [];
    const children: string[] = [];

    for (const [key, child] of Object.entries(value as Record<string, unknown>)) {
        if (key.startsWith('@')) {
            if (child !== null && child !== undefined) {
                attrs.push(`${key.slice(1)}="${escapeXml(String(child))}"`);
            }
            continue;
        }
        children.push(stringifyNode(key, child));
    }

    const attrStr = attrs.length > 0 ? ` ${attrs.join(' ')}` : '';
    if (children.length === 0) {
        return `<${name}${attrStr}/>`;
    }

    return `<${name}${attrStr}>${children.join('')}</${name}>`;
};

export const stringify = (doc: Record<string, unknown>) => {
    const version = String(doc['@version'] ?? '1.0');
    const encoding = String(doc['@encoding'] ?? 'UTF-8');
    let xml = `<?xml version="${escapeXml(version)}" encoding="${escapeXml(encoding)}"?>`;

    for (const [key, value] of Object.entries(doc)) {
        if (key.startsWith('@')) {
            continue;
        }
        xml += stringifyNode(key, value);
    }

    return xml;
};
