import React, {useRef, useEffect, useLayoutEffect} from 'react';
import colors from '../colors';
import {isConvex} from '../geometry.js'

export class Viewport {
    constructor(width, height, pixelSize, viewCenter) {
        this.height = height;
        this.width = width;
        this.pixelSize = pixelSize;
        this.viewCenter = viewCenter;
        // edges of viewport in world coords
        this.left = viewCenter[0] - (width / 2 * pixelSize);
        this.top = viewCenter[1] - (height / 2 * pixelSize);
        this.right = viewCenter[0] + (width / 2 * pixelSize);
        this.bottom = viewCenter[1] + (height / 2 * pixelSize);
    }
    toPixel(p) {
        const [x, y] = p;
        const {left, top, pixelSize} = this;
        return [(x - left) / pixelSize, (y - top) / pixelSize]
    }
    toWorld(p) {
        const [x, y] = p;
        const {left, top, pixelSize} = this;
        return [x * pixelSize + left, y * pixelSize + top];
    }
}

// Striped red line pattern that polygon is drawn w/ if non convex
let nonConvexPattern;
function getNonConvexPattern() {
    if (! nonConvexPattern) {
        const canvas = document.createElement('canvas');
        canvas.width = 10;
        canvas.height = 10;
        const context = canvas.getContext('2d');
        context.fillStyle = colors.nonconvexWarning;
        const polys = [
            [[0, 8], [8, 0], [10, 0], [10, 2], [2, 10], [0, 10]],
            [[0, 0], [0, 2], [2, 0]],
            [[10, 10], [8, 10], [10, 8]],
        ];
        for (const poly of polys) {
            context.beginPath();
            context.moveTo(...poly[0]);
            for (let i = 1; i < poly.length; ++i) {
                context.lineTo(...poly[i]);
            }
            context.fill();
        }
        nonConvexPattern = context.createPattern(canvas, 'repeat')
    }
    return nonConvexPattern;
}

function draw(map, selection, canvas, viewport) {
    const pointWidth = 3;
    const selectedPointWidth = 6;

    const nonConvexWarningPattern = getNonConvexPattern();
    
    const dimMin = -0x8000;
    const dimMax = 0x7fff;

    const toPixel = p => viewport.toPixel(p);
    const {width, height, left, top, right, bottom} = viewport;

    const context = canvas.getContext('2d');

    // Draw background
    context.beginPath();
    context.rect(0, 0, width, height);
    context.fillStyle = colors.background;
    context.fill();

    const gridLeft = Math.max(dimMin, left);
    const gridRight = Math.min(dimMax, right);
    const gridTop = Math.max(dimMin, top);
    const gridBottom = Math.min(dimMax, bottom);

    context.save();
    
    // Draw ruler lines
    const ruleSize = 256;
    context.strokeStyle = colors.ruleLine;
    for (let y = gridTop - (gridTop % ruleSize);
         y <= gridBottom;
         y += ruleSize)
    {
        context.beginPath();
        context.moveTo(...toPixel([gridLeft, y]));
        context.lineTo(...toPixel([gridRight, y]));
        context.stroke();
    }

    for (let x = gridLeft - (gridLeft % ruleSize);
         x <= gridRight;
         x += ruleSize)
    {
        context.beginPath();
        context.moveTo(...toPixel([x, gridTop]));
        context.lineTo(...toPixel([x, gridBottom]));
        context.stroke();
    }

    // Draw world unit markers
    const wuSize = 1024
    const markerRadius = 1.5;
    context.fillStyle = colors.wuMarker;
    for (let y = gridTop - (gridTop % wuSize); y <= gridBottom; y += wuSize) {
        for (let x = gridLeft - (gridLeft % wuSize);
             x <= gridRight;
             x += wuSize)
        {
            context.beginPath();
            const [sx, sy] = toPixel([x, y]);
            context.moveTo(sx - markerRadius, sy - markerRadius);
            context.lineTo(sx + markerRadius, sy - markerRadius);
            context.lineTo(sx + markerRadius, sy + markerRadius);
            context.lineTo(sx - markerRadius, sy + markerRadius);
            context.fill();
        }
    }
    
    context.restore();

    if (! map) {
        return;
    }

    context.save();
    map.polygons.forEach((poly, i) => {
        const nPoints = poly.vertexCount;
        const points = poly.endpoints.slice(0, nPoints).map(
            idx => map.points[idx]);
        const selected = 'polygon' === selection.objType 
              && i === selection.index;
        const color = selected
              ? colors.selectedPolygon
              : colors.polygon;

        const drawPoly = (points) => {
            context.beginPath();
            context.moveTo(...toPixel(points[0]));
            for (let i = 1; i < points.length; ++i) {
                context.lineTo(...toPixel(points[i]));
            }
            context.fill();
        }

        context.fillStyle = color;
        drawPoly(points);
        
        if (! isConvex(points)) {
            context.fillStyle = nonConvexWarningPattern;
            drawPoly(points);
        }
    });
    context.restore();

    context.save();
    map.lines.forEach((line, i) => {
        const begin = map.points[line.begin];
        const end = map.points[line.end];

        const isSelected =
              'line' === selection.objType && i === selection.index;
        const inSelectedPoly =  'polygon' === selection.objType &&
              [line.frontPoly, line.backPoly].includes(selection.index);
        const isPortal = line.frontPoly != -1 && line.backPoly != -1;
        let color = colors.line;
        
        if (isSelected) {
            color = colors.lineSelected;
        } else if (isPortal) {
            color = colors.portalLine;
        } else if (inSelectedPoly) {
            color = colors.lineInSelectedPoly;
        }

        context.lineWidth = isSelected ? 5 : 1;
        context.strokeStyle = color;
        context.beginPath();
        context.moveTo(...toPixel(begin));
        context.lineTo(...toPixel(end));
        context.stroke();
    });
    context.restore();

    context.save();
    map.points.forEach((point, i) => {
        const selected =
              'point' === selection.objType && i === selection.index;
        const width = selected ? selectedPointWidth : pointWidth;
        const color = selected ? colors.selectedPoint : colors.point;
        const pos = toPixel(point);
        context.fillStyle = color;
        context.beginPath();
        context.rect(
            pos[0] - (width/2),
            pos[1] - (width/2),
            width,
            width);
        context.fill();
    });
    context.restore();

    context.save();
    map.objects.forEach((object, i) => {
        console.log(object);
        context.fillStyle = 'blue';
        const [x, y] = toPixel(object.position);
        context.beginPath();
        context.rect(x - 2, y - 2, 5, 5);
        context.fill();
    });
    context.restore();
}

export function CanvasMap(allProps) {
    const {
        map,
        selection,
        viewport,
        ...props
    } = allProps;
    const ref = useRef();
    const frameRequest = useRef(0);

    const redraw = () => {
        if (ref.current) {
            const canvas = ref.current;
            draw(map, selection, canvas, viewport);
        }
        frameRequest.current = 0;
    }

    useLayoutEffect(
        () => {
            if (0 !== frameRequest.current) {
                cancelAnimationFrame(frameRequest.current);
            }
            frameRequest.current = requestAnimationFrame(redraw);
        }
    );

    // We set translation of canvas to chase the scroll region around
    const containerCenter = [
        (viewport.viewCenter[0] + 0x8000) / viewport.pixelSize,
        (viewport.viewCenter[1] + 0x8000) / viewport.pixelSize,
    ];
    
    const left = Math.max(0, containerCenter[0] - (viewport.width / 2));
    const top = Math.max(0, containerCenter[1] - (viewport.height / 2));
    
    return (
        <div style={{
                 //position: 'relative',
                 width: 0xffff / viewport.pixelSize,
                 height: 0xffff / viewport.pixelSize,
             }}
        >
            <canvas width={viewport.width}
                    height={viewport.height}
                    onClick={(e) => {
                        let canvasX = e.nativeEvent.offsetX;
                        let canvasY = e.nativeEvent.offsetY;
                    }}
                    style={{
                        //transform: `translate(${left}px, ${top}px)`,
                        position: 'sticky',
                        top: 0,
                        left: 0,
                    }}
                    data-left={left}
                    data-top={top}
                    ref={ref}>
            </canvas>
        </div>
    );
}
