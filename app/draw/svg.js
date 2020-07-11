import React from 'react';
import colors from '../colors';
import {isConvex} from '../geometry.js'

export const SvgMap = React.memo((allProps) => {
    const {map, pixelSize, addPoint, selection, ...props} = allProps;
    const polygons = map && map.polygons ? map.polygons : [];
    const points = map && map.points ? map.points : [];
    const lines = map && map.lines ? map.lines : [];
    const dimMin = -0x8000;
    const dimMax = 0x7fff;
    const dimWidth = 0xffff
    const viewBox = `${dimMin} ${dimMin} ${dimWidth} ${dimWidth}`;
    const pointWidth = 3 * pixelSize;
    const selectedPointWidth = 6 * pixelSize;

    //console.log('geom');

    // coordinates of grid lines
    let ruleSize = 512;
    const rules = [];
    for (let i = dimMin; i <= dimMax; i += ruleSize) {
        rules.push(i);
    }

    // locations of dots that mark even world units
    const wuMarkers = [];
    for (let y = dimMin; y <= dimMax; y += 1024) {
        for (let x = dimMin; x <= dimMax; x += 1024) {
            wuMarkers.push([x, y]);
        }
    }

    return (
        <svg viewBox={viewBox}
             style={{width: dimWidth / pixelSize, height: dimWidth / pixelSize}}
             preserveAspectRatio="xMidYMid"
             xmlns="http://www.w3.org/2000/svg"
             {...props}>
            <defs>
                <pattern id="nonconvex"
                         x="0"
                         y="0"
                         width="10"
                         height="10"
                         patternUnits="userSpaceOnUse"
                         patternTransform={`scale(${pixelSize})`}>
                    <polygon points="0,8 8,0 10,0 10,2 2,10 0,10"
                             fill={colors.nonconvexWarning} />
                    <polygon points="0,0 0,2 2,0"
                             fill={colors.nonconvexWarning} />
                    <polygon points="10,10 8,10 10,8"
                             fill={colors.nonconvexWarning} />
                </pattern>
            </defs>

            <rect x={dimMin}
                  y={dimMin} 
                  width={dimWidth}
                  height={dimWidth}
                  fill={colors.background} />


            {polygons.map((poly, i) => {
                const nPoints = poly.vertexCount;
                const points = poly.endpoints.slice(0, nPoints).map(
                    idx => points[idx]);
                const svgPoints = points.map(pt => `${pt[0]},${pt[1]}`)
                      .join(' ');
                const selected = 'polygon' === selection.objType 
                      && i === selection.index;
                const convex = isConvex(points);
                //const color = selected ? '#ee9933' : '#fff';
                const color = selected
                      ? colors.selectedPolygon
                      : colors.polygon;

                let nonConvexWarning = null;
                if (! convex) {
                    nonConvexWarning = (
                        <polygon key={`poly-nonconvex-${i}`}
                                 points={svgPoints}
                                 fill="url(#nonconvex)" />
                    );
                }

                return [
                    <polygon key={`poly-${i}`}
                             points={svgPoints}
                             fill={color} />,
                    nonConvexWarning
                ];
            })}
            {lines.map((line, i) => {
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
                return <line x1={points[line.begin][0]}
                             y1={points[line.begin][1]}
                             x2={points[line.end][0]}
                             y2={points[line.end][1]}
                             key={`line-${i}`}
                             stroke={color}
                             strokeWidth="1px"
                             vectorEffect="non-scaling-stroke"/>
            })}
            {points.map((point, i) => {
                const selected =
                      'point' === selection.objType && i === selection.index;
                const width = selected ? selectedPointWidth : pointWidth;
                const color = selected ? colors.selectedPoint : colors.point;
                return (
                    <rect x={point[0] - width/2}
                          y={point[1] - width/2}
                          key={`point-${i}`}
                          width={width}
                          height={width}
                          vectorEffect="non-scaling-stroke"
                          fill={color} />
                );
            })}
        </svg>
    );
});
