import v3 from './vector3';

export class Plane {
    constructor(direction, offset) {
        this.direction = direction;
        this.offset = offset;
    }
    signedDistance(v) {
        return v3.dot(v, this.direction) - this.offset;
    }
    clip(polygon) {
        const dist = polygon.map(pt => this.signedDistance(pt));
        const newPoints = []
        
        for (let i = 0; i < polygon.length; ++i) {
            const next = (i + 1) % polygon.length
            const p1 = polygon[i];
            const p2 = polygon[next];

            if (dist[i] >= 0) {
                newPoints.push(p1);
            }

            if ((dist[i] >= 0 && dist[next] < 0) ||
                (dist[i] < 0 && dist[next] >= 0))
            {
                const t = -dist[i] / (dist[next] - dist[i]);
                const intersection = v3.add(
                    v3.scale(1 - t, p1),
                    v3.scale(t, p2));
                newPoints.push(intersection);
            } 
        }
    }
}

