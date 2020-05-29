import React, {useRef, useEffect, useLayoutEffect} from 'react';
import colors from '../colors';
import {isConvex} from '../geometry.js'

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

function draw(map, canvas, pixelSize, viewCenter, selection) {
    const width = canvas.width;
    const height = canvas.height;

    const pointWidth = 3;
    const selectedPointWidth = 6;

    const nonConvexWarningPattern = getNonConvexPattern();
    
    // edges of viewport in world coords
    const left = viewCenter[0] - (width / 2 * pixelSize);
    const top = viewCenter[1] - (height / 2 * pixelSize);
    const right = viewCenter[0] + (width / 2 * pixelSize);
    const bottom = viewCenter[1] + (height / 2 * pixelSize);

    const dimMin = -0x8000;
    const dimMax = 0x7fff;

    function toPixel(p) {
        return [
            (p[0] - left) / pixelSize,
            (p[1] - top) / pixelSize,
        ];
    }

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


    if (! map) {
        return;
    }

    map.polygons.forEach((poly, i) => {
        const nPoints = poly.vertexCount;
        const points = poly.endpoints.slice(0, nPoints).map(
            idx => map.endpoints[idx].position);
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
    
    for (const line of map.lines) {
        const begin = map.endpoints[line.begin].position;
        const end = map.endpoints[line.end].position;

        const inSelectedPoly =  'polygon' === selection.objType &&
              [line.frontPoly, line.backPoly].includes(selection.index);
        const isPortal = line.frontPoly != 0xffff &&
              line.backPoly != 0xffff;
        let color = colors.line;
        if (isPortal) {
            color = colors.portalLine;
        } else if (inSelectedPoly) {
            color = colors.lineInSelectedPoly;
        }

        context.strokeStyle = color;
        context.beginPath();
        context.moveTo(...toPixel(begin));
        context.lineTo(...toPixel(end));
        context.stroke();
    }

    map.endpoints.forEach((point, i) => {
        const selected =
              'point' === selection.objType && i === selection.index;
        const width = selected ? selectedPointWidth : pointWidth;
        const color = selected ? colors.selectedPoint : colors.point;
        const pos = toPixel(point.position);
        context.fillStyle = color;
        context.beginPath();
        context.rect(
            pos[0] - (width/2),
            pos[1] - (width/2),
            width,
            width);
        context.fill();
    });
}

export function CanvasMap(allProps) {
    const {
        map,
        pixelSize,
        addPoint,
        selection,
        viewCenter,
        viewportSize,
        ...props
    } = allProps;
    const ref = useRef();

    useLayoutEffect(
        () => {
            if (ref.current) {
                draw(map, ref.current, pixelSize, viewCenter, selection);
            }
        }
    );

    // We set translation of canvas to chase the scroll region around
    const containerCenter = [
        (viewCenter[0] + 0x8000) / pixelSize,
        (viewCenter[1] + 0x8000) / pixelSize,
    ];
    
    const left = Math.max(0, containerCenter[0] - (viewportSize[0] / 2));
    const top = Math.max(0, containerCenter[1] - (viewportSize[1] / 2));
    
    return (
        <div style={{
                 //position: 'relative',
                 width: 0xffff / pixelSize,
                 height: 0xffff / pixelSize,
             }}
        >
            <canvas width={viewportSize[0]}
                    height={viewportSize[1]}
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
