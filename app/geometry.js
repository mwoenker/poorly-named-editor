import v2 from './vector2.js';

// return list of polygon indices at a x,y coordinate
export function polygonsAt([x, y], map) {
    const intersectedPolys = [];
    
    for (let i = 0; i < map.polygons.length; ++i) {
        const polygon = map.polygons[i];
        let nLeftIntersections = 0;
        for (let j = 0; j < polygon.vertexCount; ++j) {
            const line = map.lines[polygon.lines[j]];
            const begin = map.points[line.begin];
            const end = map.points[line.end];
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

    for (let i = 0; i < map.points.length; ++i) {
        const epDist = v2.distSquared(pos, map.points[i]);
        if (-1 === closest || epDist < closestDist) {
            closest = i;
            closestDist = epDist;
        }
    }

    return closest;
}

export function closestLine(pos, map) {
    function distToLine(lineIdx) {
        const line = map.lines[lineIdx];
        const begin = map.points[line.begin];
        const end = map.points[line.end];
        
        // Find parameter of parametric representation of projection of pos
        // onto the infinite line
        const lineDirection = v2.sub(end, begin);
        const t = v2.dot(lineDirection, pos);
        const beginT = v2.dot(lineDirection, begin);
        const endT = v2.dot(lineDirection, end);
        
        if (t < beginT) {
            // We are closest to begin point
            return v2.dist(pos, begin);
        } else if (t > endT) {
            // We are closest to end point
            return v2.dist(pos, end);
        } else {
            // We are closest to some point between endpoints
            const projection = v2.add(
                begin,
                v2.scale((t - beginT) / v2.lengthSquared(lineDirection), lineDirection));
            return v2.dist(pos, projection);
        }
    }

    let closestIdx = null;
    let closestDist = 0;
    for (let i = 0; i < map.lines.length; ++i) {
        const dist = distToLine(i);
        if (null === closestIdx || dist < closestDist) {
            closestIdx = i;
            closestDist = dist;
        }
    }

    return [closestIdx, closestDist];
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
