import v2 from './vector2.js';

// return list of polygon indices at a x,y coordinate
export function polygonsAt([x, y], map) {
    const intersectedPolys = [];
    
    for (let i = 0; i < map.polygons.length; ++i) {
        const polygon = map.polygons[i];
        let nLeftIntersections = 0;
        for (let j = 0; j < polygon.vertexCount; ++j) {
            const line = map.lines[polygon.lines[j]];
            const begin = map.endpoints[line.begin].position;
            const end = map.endpoints[line.end].position;
            if ((begin[1] <= y && y < end[1]) ||
                (begin[1] > y && y >= end[1]))
            {
                const t = (y - begin[1]) / (end[1] - begin[1]);
                const intersectX = begin[0] + t * (end[0] - begin[0]);
                if (intersectX <= x) {
                    ++nLeftIntersections;
                }
            }
        }
        if (1 == (nLeftIntersections % 2)) {
            intersectedPolys.push(i);
        }
    }

    return intersectedPolys;
}

// return index of closest point
export function closestPoint(pos, map) {
    let closest = -1;
    let closestDist = 0;

    for (let i = 0; i < map.endpoints.length; ++i) {
        const epDist = v2.distSquared(pos, map.endpoints[i].position);
        if (-1 === closest || epDist < closestDist) {
            closest = i;
            closestDist = epDist;
        }
    }

    return closest;
}

// Return true if list of points describes a convex polygon
export function isConvex(points) {
    let polyWinding = 0;
    for (let i = 0; i < points.length; ++i) {
        const p1 = points[i];
        const p2 = points[(i + 1) % points.length];
        const p3 = points[(i + 2) % points.length];
        const seg1 = [p2[0] - p1[0], p2[1] - p1[1]];
        const seg2 = [p3[0] - p2[0], p3[1] - p2[1]];
        const winding = Math.sign(seg1[0] * seg2[1] - seg1[1] * seg2[0]);
        if (winding !== 0) {
            if (polyWinding !== 0 && polyWinding !== winding) {
                return false;
            } else {
                polyWinding = winding;
            }
        }
    }
    return true;
}
