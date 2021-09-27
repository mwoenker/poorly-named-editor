import * as React from 'react';
import { useState, useReducer, useEffect, useLayoutEffect, useRef } from 'react';
import { render } from 'react-dom';
import './index.css';

import IconButton from '@material-ui/core/IconButton';
import Select from '@material-ui/core/Select';
import MenuItem from '@material-ui/core/MenuItem';

import ZoomInIcon from '@material-ui/icons/ZoomIn';
import ZoomOutIcon from '@material-ui/icons/ZoomOut';

import {
    readMapSummaries, readMapFromSummary
} from './files/wad';
import { Viewport, CanvasMap } from './draw/canvas';
import { polygonsAt, closestPoint, closestLine } from './geometry';
import { Vec2, v2dist, v2sub } from './vector2';

import './index.css';

function MapSummary({ map }: { map: any }) {
    if (map && map.polygons && map.lines && map.points) {
        return (
            <div className="mapSummary">
                {`Level: ${map.info.name} - ` +
                    `${map.polygons.length} polygons, ` +
                    `${map.lines.length} lines, ` +
                    `${map.points.length} points`}
            </div>
        );
    } else {
        return <></>;
    }
}

function MapList({ maps, selectedMap, onMapSelected }: any) {
    return (
        <Select value={selectedMap ? selectedMap.index : ''}>
            {maps.map((m: any) =>
                <MenuItem key={m.index}
                    value={m.index}
                    onClick={() => onMapSelected(m)}
                    selected={selectedMap && selectedMap.index === m.index}>
                    {m.info.name}
                </MenuItem>)
            }
        </Select>
    );
}

function dragDist(state: any) {
    if (!state.startCoords || !state.currentCoords) {
        return 0;
    } else {
        const dx = state.startCoords[0] - state.currentCoords[0];
        const dy = state.startCoords[1] - state.currentCoords[1];
        return Math.sqrt((dx * dx) + (dy * dy));
    }
}

interface Selection {
    objType: 'point' | 'line' | 'polygon' | null,
    index: number,
    relativePos: Vec2,
    isMouseDown: boolean,
    isDragging: boolean,
    startCoords: Vec2,
    currentCoords: Vec2,
}
const blankSelection: Selection = {
    objType: null,
    index: -1,
    relativePos: [0, 0], // Position of initial mousedown relative to object
    isMouseDown: false,
    isDragging: false,
    startCoords: [0, 0],
    currentCoords: [0, 0],
};

function reduceSelection(state: Selection, action: any) {
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
            if (!state.isMouseDown) {
                return state;
            }
            const newState = { ...state, currentCoords: action.coords }
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

interface MapViewProps { pixelSize: number, map: any, setMap: (map: any) => void }
function MapView({ pixelSize, map, setMap }: MapViewProps) {
    const [viewportSize, setViewportSize] = useState([0, 0]);
    const [viewCenter, setViewCenter] = useState([0, 0] as Vec2);
    const [selection, updateSelection] = useReducer(
        reduceSelection, blankSelection);
    const ref = useRef<HTMLDivElement>(null);
    const viewport = new Viewport(
        viewportSize[0], viewportSize[1], pixelSize, viewCenter);

    /* function toWorld(coord) {
     *   return coord.map(e => e * pixelSize - 0x7fff);
     * }
     */
    function toPixel(coord: Vec2) {
        return coord.map(e => (e + 0x7fff) / pixelSize);
    }

    function mouseDown(e: any) {
        const clickPos = viewport.toWorld([
            e.nativeEvent.offsetX,
            e.nativeEvent.offsetY
        ]);

        const distThreshold = pixelSize * 8;

        // Did we click on a point?
        const pointIndex = closestPoint(clickPos, map);
        const position = map.points[pointIndex];
        if (v2dist(position, clickPos) < distThreshold) {
            return updateSelection({
                type: 'down',
                objType: 'point',
                index: pointIndex,
                relativePos: v2sub(clickPos, position),
                coords: clickPos,
            });
        }

        // Did we click on a line?
        const closest = closestLine(clickPos, map);
        if (closest && closest.distance < distThreshold) {
            const linePos = map.points[map.lines[closest.index].begin];
            return updateSelection({
                type: 'down',
                objType: 'line',
                index: closest.index,
                relativePos: v2sub(clickPos, linePos),
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
                relativePos: v2sub(clickPos, polyPos),
                coords: clickPos,
            });
        }

        updateSelection({ type: 'cancel' });
    }

    function mouseMove(e: React.MouseEvent) {
        let viewX = e.nativeEvent.offsetX;
        let viewY = e.nativeEvent.offsetY;

        updateSelection({
            type: 'move',
            coords: viewport.toWorld([viewX, viewY]),
            pixelSize: pixelSize,
        });
    }

    function mouseUp(e: React.MouseEvent) {
        updateSelection({ type: 'up' });
    }

    function mouseLeave(e: React.MouseEvent) {
        updateSelection({ type: 'up' });
    }

    function keyDown(e: React.KeyboardEvent) {
        switch (e.key) {
            case 'Backspace':
            case 'Delete':
                if ('point' === selection.objType) {
                    setMap(map.deletePoint(selection.index));
                    updateSelection({ type: 'cancel' });
                } else if ('polygon' === selection.objType) {
                    setMap(map.deletePolygon(selection.index));
                    updateSelection({ type: 'cancel' });
                } else if ('line' === selection.objType) {
                    setMap(map.deleteLine(selection.index));
                    updateSelection({ type: 'cancel' });
                }
                break;
            default:
                console.log('key', e.key);
        }
    }

    function updateScroll() {
        if (ref.current) {
            const centerPixel = [
                ref.current.scrollLeft + (ref.current.clientWidth / 2),
                ref.current.scrollTop + (ref.current.clientHeight / 2)];
            const centerWorld = centerPixel.map(e => e * pixelSize - 0x7fff) as Vec2;
            setViewCenter(centerWorld);
        }
    }

    function recenterView() {
        if (ref.current) {
            const pixelCenter = toPixel(viewCenter);
            const pixelCorner = [
                pixelCenter[0] - (ref.current.clientWidth / 2),
                pixelCenter[1] - (ref.current.clientHeight / 2)
            ];
            ref.current.scrollTo(pixelCorner[0], pixelCorner[1])
            if (viewportSize[0] != ref.current.clientWidth ||
                viewportSize[1] != ref.current.clientHeight) {
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
                        selection.currentCoords.map((x: any) => parseInt(x))));
                } else if ('polygon' === selection.objType) {
                    setMap(map.movePolygon(
                        selection.index,
                        v2sub(
                            selection.currentCoords,
                            selection.relativePos)));
                }
            }
        },
        [selection.isDragging, selection.currentCoords]
    );

    return (
        <div className='mapView'
            tabIndex={0}
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

function Editor() {
    const [mapFile, setMapFile] = useState<any>({ file: null, summaries: [] });
    const [map, setMap] = useState<any>(null);
    // size of screen pixel in map units
    const [pixelSize, setPixelSize] = useState(64);

    const uploadMap = async (e: React.ChangeEvent<HTMLInputElement>) => {
        if (e && e.target && e.target.files) {
            const file = e.target.files[0];
            const summaries = await readMapSummaries(file);
            setMapFile({ file, summaries });
        }
    }

    async function setSelectedMap(summary: any) {
        setMap(await readMapFromSummary(summary));
    }

    function keyDown(e: React.KeyboardEvent) {
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

    const zoomIncrement = 1.5;

    function zoomIn() {
        setPixelSize(pixelSize / zoomIncrement);
    }

    function zoomOut() {
        setPixelSize(pixelSize * zoomIncrement);
    }

    return (
        <div className="editor">
            <div className="leftPanel">
                <div>
                    <input type="file" onChange={uploadMap} />
                </div>
                <MapList maps={mapFile.summaries}
                    selectedMap={map}
                    onMapSelected={setSelectedMap} />
            </div>
            <div className="rightPanel"
                tabIndex={0}
                onKeyDown={keyDown} >
                <div className="topBar">
                    <div className="zoomIcons">
                        <IconButton onClick={zoomOut}>
                            <ZoomOutIcon />
                        </IconButton>
                        <IconButton onClick={zoomIn}>
                            <ZoomInIcon />
                        </IconButton>
                    </div>
                    <MapSummary map={map} />
                </div>
                <MapView map={map}
                    setMap={setMap}
                    pixelSize={pixelSize}
                />
            </div>
        </div>
    );
}

render(<Editor />, document.getElementById('app'));
