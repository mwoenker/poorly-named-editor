function add(a, b) {
    return [a[0] + b[0], a[1] + b[1]];
}

function sub(a, b) {
    return [a[0] - b[0], a[1] - b[1]];
}

function dot(a, b) {
    return (a[0] * b[0]) + (a[1] * b[1]);
}

function lengthSquared(v) {
    return (v[0] * v[0]) + (v[1] * v[1]);
}

function length(v) {
    return Math.sqrt(lengthSquared(v));
}

function distSquared(a, b) {
    return lengthSquared(sub(a, b));
}

function dist(a, b) {
    return length(sub(a, b));
}

export default {
    add,
    sub,
    dot,
    lengthSquared,
    length,
    distSquared,
    dist,
};
