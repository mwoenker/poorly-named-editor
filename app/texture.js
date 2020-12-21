import {SELF_LUMINESCENT_BIT} from './files/shapes.js';

// Take color table in shapes format, and output uint32 array of pixels at
// specified brightness level (between 0.0 and 1.0 ... I guess values > 1
// work for overbrightness as well.
export function compactColorTable(table, brightness) {
    const pixels = new Uint32Array(256);
    const bytes = new Uint8ClampedArray(pixels.buffer);

    for (const entry of table) {
        const colorBrightness = entry.flags & SELF_LUMINESCENT_BIT
              ? 1.0
              : brightness;
        const offset = 4 * entry.value;
        bytes[offset] = parseInt((entry.r >> 8) * brightness);
        bytes[offset + 1] = parseInt((entry.g >> 8) * brightness);
        bytes[offset + 2] = parseInt((entry.b >> 8) * brightness);
        bytes[offset + 3] = 255;
    }
    
    return pixels;
}

function textureDim(dim) {
    for (let bitWidth = 0; bitWidth < 12; ++bitWidth) {
        const shiftedVal = 1 << bitWidth;
        if (shiftedVal === dim) {
            const mask = shiftedVal - 1;
            return [bitWidth, mask];
        }
    }

    throw new Error(`Invalid texture dimension ${dim}`);
}

export class Texture {
    constructor(pixels, colorTable, width, height) {
        this.width = width;
        this.height = height;
        [this.widthBitWidth, this.widthMask] = textureDim(width);
        [this.heightBitWidth, this.heightMask] = textureDim(height);
        this.pixels = new Uint32Array(pixels.buffer);
        this.colorTable = colorTable;
    }

    sample(u, v) {
        const wrappedU = u & this.widthMask;
        const wrappedV = v & this.heightMask;
        const colorIndex = this.pixels[
            (wrappedV << this.widthBitWidth) | wrappedU];
        return this.colorTable[colorIndex];
    }
}

export class Rasterizer {
    constructor(canvas) {
        this.canvas = canvas;
        this.context = canvas.getContext('2d');
        this.width = canvas.width;
        this.height = canvas.height;
        this.buffer = this.context.createImageData(this.width, this.height);
        this.pixels = new Uint32Array(this.buffer.data.buffer);
        this.left = new Array(this.height);
        this.right = new Array(this.height);
        for (let i = 0; i < this.height; ++i) {
            this.left[i] = {
                x: 0, zReciprocal: 0, uOverZ: 0, vOverZ: 0};
            this.right[i] = {
                x: 0, zReciprocal: 0, uOverZ: 0, vOverZ: 0};
        }
    }

    pixelIndex(x, y) {
        return this.width * y + x;
    }

    swapBuffers() {
        this.context.putImageData(this.buffer, 0, 0);
    }
    
    perspectiveScanline(y, startX, endX, reciprocalStart, deltas, texture)
    {
        let zReciprocal = reciprocalStart.z;
        let uOverZ = reciprocalStart.u;
        let vOverZ = reciprocalStart.v;

        const deltaZ = deltas.z;
        const deltaU = deltas.u;
        const deltaV = deltas.v;

        const firstPixelX = Math.max(0, Math.ceil(startX));
        endX = Math.min(this.width, endX);
        const increment = firstPixelX - startX;
        
        zReciprocal += deltaZ * increment;
        uOverZ += deltaU * increment;
        vOverZ += deltaV * increment;

        let idx = this.pixelIndex(firstPixelX, y);
        
        for (let x = firstPixelX; x < endX; ++x) {
            const z = 1 / zReciprocal;
            const u = uOverZ * z;
            const v = vOverZ * z;

            this.pixels[idx] = texture.sample(u, v);
            
            ++idx;
            zReciprocal += deltaZ;
            uOverZ += deltaU;
            vOverZ += deltaV;
        }
    }

    perspectiveScanlineFakeBilinear(
        y, startX, endX, reciprocalStart, deltas, texture)
    {
        let zReciprocal = reciprocalStart.z;
        let uOverZ = reciprocalStart.u;
        let vOverZ = reciprocalStart.v;

        const deltaZ = deltas.z;
        const deltaU = deltas.u;
        const deltaV = deltas.v;

        const firstPixelX = Math.max(0, Math.ceil(startX));
        endX = Math.min(this.width, endX);
        const increment = firstPixelX - startX;
        
        zReciprocal += deltaZ * increment;
        uOverZ += deltaU * increment;
        vOverZ += deltaV * increment;

        let idx = this.pixelIndex(firstPixelX, y);

        // const uOffsets = [0.25, 0.5, 0.75, 0.0];
        // const vOffsets = [0.0, 0.5, 0.75, 0.25];
        const uOffsets = [0.0, 0.25, 0.5, 0.75];
        const vOffsets = [0.0, 0.5, 0.25, 0.75];

        const yOffsetPart = (y & 1) << 1;
        for (let x = firstPixelX; x < endX; ++x) {
            const z = 1 / zReciprocal;

            const offsetIdx = yOffsetPart | (x & 1);
            const u = uOverZ * z + uOffsets[offsetIdx];
            const v = vOverZ * z + vOffsets[offsetIdx];

            this.pixels[idx] = texture.sample(u, v);
            
            ++idx;
            zReciprocal += deltaZ;
            uOverZ += deltaU;
            vOverZ += deltaV;
        }
    }

    // for every y value of line, fill edge arrays (left and right)
    sweepLine(p1, p2) {
        if (p1.y === p2.y) {
            return;
        }
        
        if (p1.y > p2.y) {
            [p1, p2] = [p2, p1];
        }
        
        const lineStartY = Math.max(0, Math.ceil(p1.y));
        const lineMaxY = Math.min(this.height, Math.ceil(p2.y));
        const dy = p2.y - p1.y
        
        const slope = (p2.x - p1.x) / dy;
        let zReciprocalSlope = (p2.zReciprocal - p1.zReciprocal) / dy;
        let uOverZSlope = (p2.uOverZ - p1.uOverZ) / dy;
        let vOverZSlope = (p2.vOverZ - p1.vOverZ) / dy;

        const fracPart = (lineStartY - p1.y);
        let x = p1.x + slope * fracPart;
        let zReciprocal = p1.zReciprocal + zReciprocalSlope * fracPart;
        let uOverZ = p1.uOverZ + uOverZSlope * fracPart;
        let vOverZ = p1.vOverZ + vOverZSlope * fracPart;
        
        for (let y = lineStartY; y < lineMaxY; ++y) {
            if (this.left[y].x > x) {
                this.left[y].x = x;
                this.left[y].zReciprocal = zReciprocal;
                this.left[y].uOverZ = uOverZ;
                this.left[y].vOverZ = vOverZ;
            }
            if (this.right[y].x < x) {
                this.right[y].x = x;
                this.right[y].zReciprocal = zReciprocal;
                this.right[y].uOverZ = uOverZ;
                this.right[y].vOverZ = vOverZ;
            }
            x += slope;
            zReciprocal += zReciprocalSlope;
            uOverZ += uOverZSlope;
            vOverZ += vOverZSlope;
        }
    }    

    perspectivePolygon(texture, points) {
        const nextIdx = idx => idx >= points.length - 1 ? 0 : idx + 1;

        let minY = this.height;
        let maxY = 0;

        // Find topmost & bottommost y
        for (let i = 0; i < points.length; ++i) {
            minY = Math.min(minY, points[i].y);
            maxY = Math.max(maxY, points[i].y);
        }

        // restrict to valid scanlines
        minY = Math.max(0, minY);
        maxY = Math.min(this.height, maxY);

        // clear minX, maxX array values for y range of polygon
        for (let y = Math.ceil(minY); y < maxY; ++y) {
            this.left[y].x = this.width;
            this.right[y].x = 0;
        }

        // Iterate over every line & fill left, right array values
        for (let i = 0; i < points.length; ++i) {
            const p1 = points[i];
            const p2 = points[nextIdx(i)];
            this.sweepLine(p1, p2);
        }

        let startValues = {z: 0, u: 0, v: 0};
        let deltas = {z: 0, u: 0, v: 0};
        
        // Iterate over left & right array & render spans
        for (let y = Math.ceil(minY); y < maxY; ++y) {
            const leftEdge = this.left[y];
            const rightEdge = this.right[y];

            startValues.z = leftEdge.zReciprocal;
            startValues.u = leftEdge.uOverZ;
            startValues.v = leftEdge.vOverZ;

            const dx = rightEdge.x - leftEdge.x;
            deltas.z = (rightEdge.zReciprocal - leftEdge.zReciprocal) / dx;
            deltas.u = (rightEdge.uOverZ - leftEdge.uOverZ) / dx;
            deltas.v = (rightEdge.vOverZ - leftEdge.vOverZ) / dx;

            this.perspectiveScanline(
                y, leftEdge.x, rightEdge.x, startValues, deltas, texture)
        }
    }
}
