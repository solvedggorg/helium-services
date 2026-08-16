export const basename = (path: string) => {
    const trimmed = path.replace(/\/+$/, '');
    const index = trimmed.lastIndexOf('/');
    return index === -1 ? trimmed : trimmed.slice(index + 1);
};

export const dirname = (path: string) => {
    const trimmed = path.replace(/\/+$/, '') || '/';
    const index = trimmed.lastIndexOf('/');
    if (index <= 0) {
        return '/';
    }
    return trimmed.slice(0, index);
};

export const join = (...parts: string[]) => {
    const absolute = parts.length > 0 && parts[0]!.startsWith('/');
    const stack: string[] = [];

    for (const part of parts) {
        for (const segment of part.split('/')) {
            if (!segment || segment === '.') {
                continue;
            }
            if (segment === '..') {
                if (stack.length > 0 && stack[stack.length - 1] !== '..') {
                    stack.pop();
                } else if (!absolute) {
                    stack.push('..');
                }
                continue;
            }
            stack.push(segment);
        }
    }

    const joined = stack.join('/');
    if (absolute) {
        return `/${joined}`;
    }
    return joined;
};
