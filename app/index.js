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

import {
    readMapSummaries, readMapFromSummary, readMapChunkTypes} from './files/wad'
import colors from './colors.js';
import {Viewport, CanvasMap} from './draw/canvas.js';
import {polygonsAt, closestPoint, closestLine, isConvex} from './geometry.js'
import v2 from './vector2.js'

function MapSummary({directoryEntry, map}) {
    if (map && map.polygons && map.lines && map.points) {
        return `Level: ${map.info.name} - ` +
            `${map.polygons.length} polygons, ` +
            `${map.lines.length} lines, ` +
            `${map.points.length} points`;
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

function dragDist(state) {
    if (! state.startCoords || ! state.currentCoords) {
        return 0;
    } else {
        const dx = state.startCoords[0] - state.currentCoords[0];
        const dy = state.startCoords[1] - state.currentCoords[1];
        return Math.sqrt((dx * dx) + (dy * dy));
    }
}

const blankSelection = {
    objType: null,
    index: null,
    relativePos: null, // Position of initial mousedown relative to object
    isMouseDown: false,
    isDragging: false,
    startCoords: null,
    currentCoords: null,
};

function reduceSelection(state, action) {
    switch (action.type) {
    case 'down':
        return {
            ...blankSelection,
            objType: action.objType,
            index: action.index,
            relativePos: action.relativePos,
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
    const [viewportSize, setViewportSize] = useState([0, 0]);
    const [viewCenter, setViewCenter] = useState([0, 0]);
    //const [selection, setSelection] = useState({type: null, index: null});
    const [selection, updateSelection] = useReducer(
        reduceSelection, blankSelection);
    const ref = useRef(null);
    console.log(selection);
    const viewport = new Viewport(
        viewportSize[0], viewportSize[1], pixelSize, viewCenter);

    function toWorld(coord) {
        return coord.map(e => e * pixelSize - 0x7fff);
    }

    function toPixel(coord) {
        return coord.map(e => (e + 0x7fff) / pixelSize);
    }

    function mouseDown(e) {
        const clickPos = viewport.toWorld([
            e.nativeEvent.offsetX,
            e.nativeEvent.offsetY
        ]);

        const distThreshold = pixelSize * 8;

        // Did we click on a point?
        const pointIndex = closestPoint(clickPos, map);
        const position = map.points[pointIndex];
        if (v2.dist(position, clickPos) < distThreshold) {
            return updateSelection({
                type: 'down',
                objType: 'point',
                index: pointIndex,
                relativePos: v2.sub(clickPos, position),
                coords: clickPos,
            });
        }

        // Did we click on a line?
        const [lineIndex, dist] = closestLine(clickPos, map);
        console.log({lineIndex, dist, distThreshold});
        if (lineIndex && dist < distThreshold) {
            const linePos = map.points[map.lines[lineIndex].begin];
            return updateSelection({
                type: 'down',
                objType: 'line',
                index: lineIndex,
                relativePos: v2.sub(clickPos, linePos),
                coords: clickPos,
            });
        }

        // Did we click on a polygon?
        const polygons = polygonsAt(clickPos, map);
        if (polygons.length > 0) {
            const idx = polygons[polygons.length - 1];
            const poly = map.polygons[idx];
            // polygon "position" is position of first endpoint
            const polyPos = map.points[poly.endpoints[0]];
            return updateSelection({
                type: 'down',
                objType: 'polygon',
                index: idx,
                relativePos: v2.sub(clickPos, polyPos),
                coords: clickPos,
            });
        }

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

    function keyDown(e) {
        switch (e.key) {
        case 'Backspace':
        case 'Delete':
            if ('point' === selection.objType) {
                setMap(map.deletePoint(selection.index));
                updateSelection({type: 'cancel'});
            } else if ('polygon' === selection.objType) {
                setMap(map.deletePolygon(selection.index));
                updateSelection({type: 'cancel'});
            } else if ('line' === selection.objType) {
                setMap(map.deleteLine(selection.index));
                updateSelection({type: 'cancel'});
            }
            break;
        default:
            console.log('key', e.key);
        }
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
                    setMap(map.movePoint(
                        selection.index,
                        selection.currentCoords.map(x => parseInt(x))));
                } else if ('polygon' === selection.objType) {
                    setMap(map.movePolygon(
                        selection.index,
                        v2.sub(
                            selection.currentCoords,
                            selection.relativePos)));
                }
            }
        },
        [selection.isDragging, selection.currentCoords]
    );

    return (
        <div style={{
                 flex: '1 1 auto',
                 overflow: 'scroll',
             }}
             tabIndex="0"
             onScroll={updateScroll}
             onMouseDown={mouseDown}
             onMouseMove={mouseMove}
             onMouseUp={mouseUp}
             onMouseLeave={mouseLeave}
             onKeyDown={keyDown}
             ref={ref}
        >
            <CanvasMap
                map={map}
                selection={selection}
                viewport={viewport}
            />
        </div>
    );
}

function Editor(props) {
    const [mapFile, setMapFile] = useState({file: null, summaries: []});
    const [map, setMap] = useState(null);
    // size of screen pixel in map units
    const [pixelSize, setPixelSize] = useState(64);

    async function uploadMap(e) {
        const file = e.target.files[0];
        if (file) {
            const summaries = await readMapSummaries(file);
            setMapFile({file, summaries});
            // const types = new Map();
            // for (const summary of summaries) {
            //     for (const type of await readMapChunkTypes(summary)) {
            //         types.set(type, true);
            //     }
            // }
            // console.log('chunk types', [...types.keys()]);
        }
    }

    async function setSelectedMap(summary) {
        setMap(await readMapFromSummary(summary));
    }

    function keyDown(e) {
        switch (e.key) {
        case '+':
        case '=':
            e.preventDefault();
            zoomIn();
            break;
        case '_':
        case '-':
            e.preventDefault();
            zoomOut();
            break;
        default:
            console.log('key', e.key);
        }
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
                  }}
                  tabIndex="0"
                  onKeyDown={keyDown} >
                <div style={{display: 'flex'}}>
                    <div style={{flex: '0 0 auto'}}>
                        <IconButton onClick={zoomOut}>
                            <ZoomOutIcon />
                        </IconButton>
                        <IconButton onClick={zoomIn}>
                            <ZoomInIcon />
                        </IconButton>
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
                         addPoint={(x, y) => {
                             map.endpoints.push({position: [x, y]});
                             setMap({...map});
                         }} />
            </Grid>
        </Grid>
    );
}

ReactDOM.render(<Editor />, document.getElementById('app'));
