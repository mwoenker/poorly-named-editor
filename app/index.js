import React, {useState, useReducer, useEffect, useLayoutEffect, useRef} from 'react';
import ReactDOM from 'react-dom';
import './index.css';
import {
    IconButton,
    Button,
    Grid,
    Select,
    MenuItem,
} from '@material-ui/core';
import ZoomInIcon from '@material-ui/icons/ZoomIn';
import ZoomOutIcon from '@material-ui/icons/ZoomOut';

import {readMapSummaries, readMapFromSummary} from './files/wad'
import colors from './colors.js';
import {SvgMap} from './draw/svg.js';
import {Viewport, CanvasMap} from './draw/canvas.js';
import {polygonsAt, closestPoint, isConvex} from './geometry.js'
import v2 from './vector2.js'

function MapSummary({directoryEntry, map}) {
    if (map && map.polygons && map.lines && map.endpoints) {
        return `Level: ${map.info.name} - ` +
            `${map.polygons.length} polygons, ` +
            `${map.lines.length} lines, ` +
            `${map.endpoints.length} points`;
    } else {
        return '';
    }
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

function MapView({pixelSize, map, setMap, drawType, ...props}) {
    const [viewportSize, setViewportSize] = useState([0, 0]);
    const [viewCenter, setViewCenter] = useState([0, 0]);
    //const [selection, setSelection] = useState({type: null, index: null});
    const [selection, updateSelection] = useReducer(
        reduceSelection, blankSelection);
    const ref = useRef(null);

    const viewport = new Viewport(
        viewportSize[0], viewportSize[1], pixelSize, viewCenter);

    function toWorld(coord) {
        return coord.map(e => e * pixelSize - 0x7fff);
    }

    function toPixel(coord) {
        return coord.map(e => (e + 0x7fff) / pixelSize);
    }

    function mouseDown(e) {
        const [x, y] = viewport.toWorld([
            e.nativeEvent.offsetX,
            e.nativeEvent.offsetY
        ]);

        // Did we click on a point?
        const pointIndex = closestPoint([x, y], map);
        console.log([x, y], pointIndex);
        const position = map.endpoints[pointIndex].position;
        console.log({click: [x, y], position, dist: v2.dist(position, [x, y])});
        if (v2.dist(position, [x, y]) < pixelSize * 8) {
            return updateSelection({
                type: 'down',
                objType: 'point',
                index: pointIndex,
                coords: [x, y],
            });
        }

        // Did we click on a polygon?
        const polygons = polygonsAt([x, y], map);
        if (polygons.length > 0) {
            console.log('poly');
            return updateSelection({
                type: 'down',
                objType: 'polygon',
                index: polygons[polygons.length - 1],
                coords: [x, y],
            });
        }

        // // For testing coord transforms, create a new point where we clicked.
        // const newMap = {
        //     ...map,
        //     endpoints: [
        //         ...map.endpoints,
        //         {
        //             flags: 0,
        //             highestFloor: 0,
        //             lowestCeiling: 0,
        //             position: [x, y],
        //             transformed: [0, 0],
        //             supportingPolyIdx: -1,
        //         },
        //     ],
        // };
        // setMap(newMap);
        // console.log('did set');
        
        updateSelection({type: 'cancel'});
    }

    function mouseMove(e) {
        let viewX = e.nativeEvent.offsetX;
        let viewY = e.nativeEvent.offsetY;

        updateSelection({
            type: 'move',
            coords: viewport.toWorld([viewX, viewY]),
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
        const centerPixel = [
            ref.current.scrollLeft + (ref.current.clientWidth / 2),
            ref.current.scrollTop + (ref.current.clientHeight / 2)];
        const centerWorld = centerPixel.map(e => e * pixelSize - 0x7fff);
        setViewCenter(centerWorld);
    }

    function recenterView() {
        if (ref.current) {
            const pixelCenter = toPixel(viewCenter);
            const pixelCorner = [
                pixelCenter[0] - (ref.current.clientWidth / 2),
                pixelCenter[1] - (ref.current.clientHeight / 2)
            ];
            ref.current.scrollTo(...pixelCorner);
            if (viewportSize[0] != ref.current.clientWidth ||
                viewportSize[1] != ref.current.clientHeight)
            {
                setViewportSize(
                    [ref.current.clientWidth, ref.current.clientHeight]);
            }
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
                    newEndpoint.position = [...selection.currentCoords.map(
                        x => parseInt(x))];
                    newMap.endpoints[i] = newEndpoint;
                    setMap(newMap);
                }
            }
        },
        [selection.isDragging, selection.currentCoords]
    );

    let mapView;

    if ('svg' === drawType) {
        mapView = (
            <SvgMap
                map={map}
                pixelSize={pixelSize}
                selection={selection}
            />
        );
    } else if ('canvas' === drawType) {
        mapView = (
            <CanvasMap
                map={map}
                selection={selection}
                viewport={viewport}
            />
        );
    }

    return (
        <div style={{
                 flex: '1 1 auto',
                 overflow: 'scroll',
             }}
             onScroll={updateScroll}
             onMouseDown={mouseDown}
             onMouseMove={mouseMove}
             onMouseUp={mouseUp}
             onMouseLeave={mouseLeave}
             ref={ref}
        >
            {mapView}
        </div>
    );
}

function Editor(props) {
    const [mapFile, setMapFile] = useState({file: null, summaries: []});
    const [map, setMap] = useState(null);
    const [drawType, setDrawType] = useState('canvas');
    // size of screen pixel in map units
    const [pixelSize, setPixelSize] = useState(64);

    async function uploadMap(e) {
        const file = e.target.files[0];
        if (file) {
            setMapFile({file: file, summaries: await readMapSummaries(file)});
        }
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

    return (
        <Grid container spacing={3} style={{width: '100%', height: '100%', overflow: 'hidden'}}>
            <Grid item xs={3} lg={2} style={{height: '100vh', overflowY: 'scroll'}} >
                <div>
                    <input type="file" onChange={uploadMap} />
                </div>
                <MapList maps={mapFile.summaries}
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
                <div style={{display: 'flex'}}>
                    <div style={{flex: '0 0 auto'}}>
                        <IconButton onClick={zoomOut}>
                            <ZoomOutIcon />
                        </IconButton>
                        <IconButton onClick={zoomIn}>
                            <ZoomInIcon />
                        </IconButton>
                        <Select
                            value={drawType}
                            onChange={(e) => setDrawType(e.target.value)}
                        >
                            <MenuItem value='svg'>SVG</MenuItem>
                            <MenuItem value='canvas'>Canvas</MenuItem>
                        </Select>
                    </div>
                    <div style={{
                             flex: '1 auto',
                             textAlign: 'right',
                             padding: '12px',
                         }}>
                        <MapSummary map={map} />
                    </div>
                </div>
                <MapView map={map}
                         setMap={setMap}
                         pixelSize={pixelSize}
                         drawType={drawType}
                         addPoint={(x, y) => {
                             map.endpoints.push({position: [x, y]});
                             setMap({...map});
                         }} />
            </Grid>
        </Grid>
    );
}

ReactDOM.render(<Editor />, document.getElementById('app'));
