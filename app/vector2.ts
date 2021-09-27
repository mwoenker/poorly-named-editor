export type Vec2 = [number, number]

export function v2add(a: Vec2, b: Vec2): Vec2 {
    return [a[0] + b[0], a[1] + b[1]];
}

export function v2sub(a: Vec2, b: Vec2): Vec2 {
    return [a[0] - b[0], a[1] - b[1]];
}

export function v2dot(a: Vec2, b: Vec2): number {
    return (a[0] * b[0]) + (a[1] * b[1]);
}

export function v2lengthSquared(v: Vec2): number {
    return (v[0] * v[0]) + (v[1] * v[1]);
}

export function v2length(v: Vec2): number {
    return Math.sqrt(v2lengthSquared(v));
}

export function v2distSquared(a: Vec2, b: Vec2): number {
    return v2lengthSquared(v2sub(a, b));
}

export function v2dist(a: Vec2, b: Vec2): number {
    return v2length(v2sub(a, b));
}

export function v2scale(s: number, v: Vec2): Vec2 {
    return [s * v[0], s * v[1]];
}

export function v2lerp(t: number, v1: Vec2, v2: Vec2): Vec2 {
    return v2add(v2scale(1 - t, v1), v2scale(t, v2));
}

export function v2direction(radians: number): Vec2 {
    return [Math.cos(radians), Math.sin(radians)];
}

export function isClockwise(v1: Vec2, v2: Vec2, v3: Vec2): boolean {
    const d1 = v2sub(v2, v1);
    const d2 = v2sub(v3, v2);
    return (d1[0] * d2[1]) - (d1[1] * d2[0]) > 0;
}
