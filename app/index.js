import React, {useState, useReducer, useEffect, useLayoutEffect, useRef} from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import {
    IconButton,
    Button,
    Grid,
//    List,
//    ListItem
    Select,
    MenuItem,
} from '@material-ui/core';
import ZoomInIcon from '@material-ui/icons/ZoomIn';
import ZoomOutIcon from '@material-ui/icons/ZoomOut';

import {readMapSummaries, readMapFromSummary} from './wad.js'

function MapSummary({map}) {
    return (
        <table>
            <tbody>
                <tr>
                    <th>Polygons</th>
                    <td>{map && map.polygons && map.polygons.length}</td>
                </tr>
                <tr>
                    <th>Lines</th>
                    <td>{map && map.lines && map.lines.length}</td>
                </tr>
                <tr>
                    <th>Endpoints</th>
                    <td>{map && map.endpoints && map.endpoints.length}</td>
                </tr>
            </tbody>
        </table>
    );
}

function MapList({maps, selectedMap, setSelectedMap}) {
    return (
        <Select value={selectedMap ? selectedMap.index : ''}>
            {maps.map(m =>
                <MenuItem key={m.index}
                          value={m.index}
                          onClick={() => setSelectedMap(m)}
                          selected={selectedMap && selectedMap.index === m.index}>
                    {m.info.name}
                </MenuItem>)
            }
        </Select>
    );
}

const MapGeometry = React.memo((allProps) => {
    const {map, pixelSize, addPoint, selection, ...props} = allProps;
    const polygons = map && map.polygons ? map.polygons : [];
    const endpoints = map && map.endpoints ? map.endpoints : [];
    const lines = map && map.lines ? map.lines : [];
    const dimMin = -0x8000;
    const dimMax = 0xffff;
    const viewBox = `${dimMin} ${dimMin} ${dimMax} ${dimMax}`;
    const pointWidth = 3 * pixelSize;
    const selectedPointWidth = 6 * pixelSize;

    //console.log('geom');

    function isConvex(points) {
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

    return (
        <svg viewBox={viewBox}
             style={{width: dimMax / pixelSize, height: dimMax / pixelSize}}
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
                             fill="#ff0000" />
                    <polygon points="0,0 0,2 2,0" fill="#ff0000" />
                    <polygon points="10,10 8,10 10,8" fill="#ff0000" />
                </pattern>
            </defs>
            <rect x={dimMin}
                  y={dimMin} 
                  width={dimMax}
                  height={dimMax}
                  fill="#aaa" />
            {polygons.map((poly, i) => {
                const nPoints = poly.vertexCount;
                const points = poly.endpoints.slice(0, nPoints).map(
                    idx => endpoints[idx].position);
                const svgPoints = points.map(pt => `${pt[0]},${pt[1]}`)
                      .join(' ');
                const selected = 'polygon' === selection.objType 
                      && i === selection.index;
                const convex = isConvex(points);
                //const color = selected ? '#ee9933' : '#fff';
                const color = selected ? '#000' : '#fff';

                let nonConvexWarning = null;
                if (! convex) {
                    nonConvexWarning = (
                        <polygon key={`poly-${i}`}
                                 points={svgPoints}
                                 fill="url(#nonconvex)" />
                    );
                }

                'url(#nonconvex)';
                
                return (
                    <>
                        <polygon key={`poly-${i}`}
                                 points={svgPoints}
                                 fill={color} />
                        {nonConvexWarning}
                    </>
                );
            })}
            {lines.map((line, i) => {
                const inSelectedPoly =  'polygon' === selection.objType &&
                      [line.frontPoly, line.backPoly].includes(selection.index);
                const isPortal = line.frontPoly != 0xffff &&
                      line.backPoly != 0xffff;
                let color = '#000';
                if (isPortal) {
                    color = 'cyan';
                } else if (inSelectedPoly) {
                    color = '#fff';
                }
                return <line x1={endpoints[line.begin].position[0]}
                             y1={endpoints[line.begin].position[1]}
                             x2={endpoints[line.end].position[0]}
                             y2={endpoints[line.end].position[1]}
                             key={`line-${i}`}
                             stroke={color}
                             strokeWidth="1.5px"
                             vectorEffect="non-scaling-stroke"/>
            })}
            {endpoints.map((point, i) => {
                const selected =
                      'point' === selection.objType && i === selection.index;
                const width = selected ? selectedPointWidth : pointWidth;
                const color = selected ? 'black' : 'red';
                return (
                    <rect x={point.position[0] - width/2}
                          y={point.position[1] - width/2}
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

const blankSelection = {
    objType: null,
    index: null,
    isMouseDown: false,
    isDragging: false,
    startCoords: null,
    currentCoords: null,
};

function dragDist(state) {
    if (! state.startCoords || ! state.currentCoords) {
        return 0;
    } else {
        const dx = state.startCoords[0] - state.currentCoords[0];
        const dy = state.startCoords[1] - state.currentCoords[1];
        return Math.sqrt((dx * dx) + (dy * dy));
    }
}

function reduceSelection(state, action) {
    switch (action.type) {
    case 'down':
        return {
            ...blankSelection,
            objType: action.objType,
            index: action.index,
            isMouseDown: true,
            startCoords: action.coords,
            currentCoords: action.coords,
        }
    case 'up':
        // Not dragging any more
        return {
            ...state,
            isMouseDown: false,
            isDragging: false,
            currentCoords: null,
        };
    case 'move':
        if (! state.isMouseDown) {
            return state;
        }
        const newState = {...state, currentCoords: action.coords}
        if (dragDist(newState) >= 8 * action.pixelSize) {
            newState.isDragging = true;
        }
        return newState;
    case 'cancel':
        return blankSelection;
    default:
        throw new Error(`invalid selection action: ${action.type}`);
    }
}

function MapView({pixelSize, map, setMap, ...props}) {
    //const [viewport, setViewport] = useState(null);
    const [viewCenter, setViewCenter] = useState([0, 0]);
    //const [selection, setSelection] = useState({type: null, index: null});
    const [selection, updateSelection] = useReducer(
        reduceSelection, blankSelection);
    const ref = useRef(null);

    function toWorld(coord) {
        return coord.map(e => e * pixelSize - 0x7fff);
    }

    function toPixel(coord) {
        return coord.map(e => (e + 0x7fff) / pixelSize);
    }

    function mouseDown(e) {
        const [x, y] = toWorld([e.nativeEvent.offsetX, e.nativeEvent.offsetY]);
        
        function distSq(endpoint) {
            const dx = endpoint.position[0] - x;
            const dy = endpoint.position[1] - y;
            return (dx * dx) + (dy * dy);
        }

        // Did we click on a point?
        let closest = -1;
        for (let i = 0; i < map.endpoints.length; ++i) {
            if (-1 === closest ||
                distSq(map.endpoints[i]) < distSq(map.endpoints[closest]))
            {
                closest = i;
            }
        }

        if (Math.sqrt(distSq(map.endpoints[closest])) <= pixelSize * 8) {
            return updateSelection({
                type: 'down',
                objType: 'point',
                index: closest,
                coords: [x, y],
            });
        }

        // Did we click on a polygon?
        let intersectedPoly = null;
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
                intersectedPoly = i;
            }
        }
        if (null !== intersectedPoly) {
            return updateSelection({
                type: 'down',
                objType: 'polygon',
                index: intersectedPoly,
                coords: [x, y],
            });
        }


        // return updateSelection({
        //             type: 'down',
        //             objType: 'polygon',
        //             index: 1,
        //             coords: [x, y],
        //         });

        updateSelection({type: 'cancel'});
    }

    function mouseMove(e) {
        updateSelection({
            type: 'move',
            coords: toWorld([e.nativeEvent.offsetX, e.nativeEvent.offsetY]),
            pixelSize: pixelSize,
        });
    }

    function mouseUp(e) {
        updateSelection({type: 'up'});
    }

    function mouseLeave(e) {
        updateSelection({type: 'up'});
    }

    function updateScroll() {
        setViewCenter(
            toWorld([
                ref.current.scrollLeft + (ref.current.clientWidth / 2),
                ref.current.scrollTop + (ref.current.clientHeight / 2)]));
    }

    function recenterView() {
        if (ref.current) {
            const pixelCenter = toPixel(viewCenter);
            const pixelCorner = [
                pixelCenter[0] - (ref.current.clientWidth / 2),
                pixelCenter[1] - (ref.current.clientHeight / 2)
            ];
            ref.current.scrollTo(...pixelCorner);
        }
    }
    
    useLayoutEffect(
        // Keep view centered on viewCenter whenever we render or window is
        // resized.
        () => {
            recenterView()
            window.addEventListener('resize', recenterView);
            return () => window.removeEventListener('resize', recenterView);
        },
    );

    useEffect(
        () => {
            if (selection.isDragging) {
                if ('point' === selection.objType) {
                    const i = selection.index;
                    const newMap = {...map, endpoints: [...map.endpoints]};
                    const newEndpoint = {...newMap.endpoints[i]};
                    newEndpoint.position = [...selection.currentCoords];
                    newMap.endpoints[i] = newEndpoint;
                    setMap(newMap);
                }
            }
        },
        [selection.isDragging, selection.currentCoords]
    );

    return (
        <div style={{flex: '1 1 auto', overflow: 'scroll'}}
             onScroll={updateScroll}
             onMouseDown={mouseDown}
             onMouseMove={mouseMove}
             onMouseUp={mouseUp}
             onMouseLeave={mouseLeave}
             ref={ref}
        >
            <MapGeometry {...props}
                         map={map}
                         pixelSize={pixelSize}
                         selection={selection}
            />
        </div>
    );
}

function Editor(props) {
    const [file, setFile] = useState({file: null, summaries: []});
    const [map, setMap] = useState(null);
    // size of screen pixel in map units
    const [pixelSize, setPixelSize] = useState(64);

    async function upload(e) {
        const file = e.target.files[0];
        setFile({file: file, summaries: await readMapSummaries(file)});
    }

    async function setSelectedMap(summary) {
        setMap(await readMapFromSummary(summary));
    }

    function zoomIn() {
        setPixelSize(pixelSize / 2);
    }

    function zoomOut() {
        setPixelSize(pixelSize * 2);
    }
    
    function fuckUpMap() {
        if (map && map.endpoints) {
            const {endpoints, ...rest} = map;
            const modified = [...endpoints];
            for (let i = 0; i < modified.length; i += 200) {
                let {position, ...epnt_rest} = {...modified[i]}
                const newPos = [-position[0], -position[1]];
                modified[i] = {position: newPos, ...epnt_rest};
            }
            setMap({endpoints: modified, ...rest});
        }
    }

    return (
        <Grid container spacing={3} style={{width: '100%', height: '100%', overflow: 'hidden'}}>
            <Grid item xs={3} lg={2} style={{height: '100vh', overflowY: 'scroll'}} >
                <div>
                    <input type="file" onChange={upload} />
                </div>
                <MapList maps={file.summaries}
                         selectedMap={map}
                         setSelectedMap={setSelectedMap} />
            </Grid>
            <Grid item xs={9} lg={10}
                  style={{
                      height: '100vh',
                      display: 'flex',
                      flexDirection: 'column',
                      padding: 0,
                  }} >
                <div style={{flex: '0 0 auto'}}>
                    <IconButton onClick={zoomOut}>
                        <ZoomOutIcon />
                    </IconButton>
                    <IconButton onClick={zoomIn}>
                        <ZoomInIcon />
                    </IconButton>
                </div>
                <MapView map={map} setMap={setMap}
                         pixelSize={pixelSize}
                         addPoint={(x, y) => {
                             map.endpoints.push({position: [x, y]});
                             setMap({...map});
                         }} />
            </Grid>
        </Grid>
    );
}

ReactDOM.render(<Editor />, document.getElementById('app'));
