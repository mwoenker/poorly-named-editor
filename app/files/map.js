import { v2sub, v2add } from '../vector2';

function outOfRange(pt) {
    return pt[0] < -0x8000 || pt[0] > 0x7fff ||
        pt[1] < -0x8000 || pt[1] > 0x7fff;
}

// Holds sets of object indices
class Dependencies {
    constructor() {
        this.objects = new Map();
    }

    // Add object, but not its dependencies. Returns true if object is already
    // in list.
    _add(type, index) {
        if (!this.objects.has(type)) {
            this.objects.set(type, [index]);
            return true;
        } else {
            const typeObjs = this.objects.get(type);
            if (!typeObjs.includes(index)) {
                this.objects.get(type).push(index)
                return true;
            } else {
                return false;
            }
        }
    }

    objectsOfType(type) {
        return this.objects.get(type) || [];
    }

    includes(type, index) {
        return this.objectsOfType(type).includes(index);
    }

    // Functions to add an object, plus recursively all its dependencies. An
    // object B is dependent on object A if B must be deleted when A is deleted
    // -- i.e. a line is dependent on its two endpoints because when one of its
    // endpoints is deleted, the line can no longer exist.

    addPoint(map, pointIndex) {
        if (this._add('points', pointIndex)) {
            for (let i = 0; i < map.lines.length; ++i) {
                const line = map.lines[i];
                if (pointIndex === line.begin || pointIndex === line.end) {
                    this.addLine(map, i);
                }
            }
        }
    }
    addLine(map, lineIndex) {
        if (this._add('lines', lineIndex)) {
            const line = map.lines[lineIndex];
            if (-1 !== line.frontSide) {
                this.addSide(map, line.frontSide);
            }
            if (-1 !== line.backSide) {
                this.addSide(map, line.backSide);
            }
            if (-1 !== line.frontPoly) {
                this.addPolygon(map, line.frontPoly);
            }
            if (-1 !== line.backPoly) {
                this.addPolygon(map, line.backPoly);
            }
        }
    }
    addSide(map, sideIndex) {
        if (this._add('sides', sideIndex)) {
            const side = map.sides[sideIndex];
            if (-1 !== side.polygonIndex) {
                this.addPolygon(map, side.polygonIndex);
            }
        }
    }
    addPolygon(map, polygonIndex) {
        if (this._add('polygons', polygonIndex)) {
            const polygon = map.polygons[polygonIndex];
            for (const sideIndex of polygon.sides) {
                if (-1 !== sideIndex) {
                    this.addSide(map, sideIndex);
                }
            }
            for (var i = 0; i < map.objects.length; ++i) {
                const obj = map.objects[i];
                if (map.objects[i].polygon === polygonIndex) {
                    this.addObject(map, i);
                }
            }
            for (var i = 0; i < map.notes.length; ++i) {
                if (map.notes[i].polygonIndex === polygonIndex) {
                    this.addNote(map, i);
                }
            }
        }
    }
    addObject(map, objectIndex) { this._add('objects', objectIndex); }
    addNote(map, noteIndex) { this._add('notes', noteIndex); }
}

const objectTypes = [
    'points',
    'lines',
    'sides',
    'polygons',
    'lights',
    'objects',
    'frequencies',
    'media',
    'ambientSounds',
    'randomSounds',
    'platforms',
    'notes',
];

// return new object with updates merged into original. If updates don't
// actually change any values of the original, return the original unchanged
function updateObject(original, updates) {
    function compare(a, b) {
        // return true if objects are the same or are arrays with identical
        // elements
        if (a === b) {
            return true;
        } else if (Array.isArray(a) && Array.isArray(b)
            && a.length === b.length) {
            for (let i = 0; i < a.length; ++i) {
                if (a[i] !== b[i]) {
                    return false;
                }
            }
            return true;
        } else {
            return false;
        }
    }

    for (const prop in updates) {
        if (!compare(original[prop], updates[prop])) {
            return { ...original, ...updates };
        }
    }
    return original;
}

export class MapGeometry {
    constructor({ index, header, info, ...arrays }) {
        this.index = index;
        this.header = header;
        this.info = info;
        for (const type of objectTypes) {
            this[type] = arrays[type] || [];
        }
    }

    movePoint(i, [x, y]) {
        const newPoints = [...this.points];
        newPoints[i] = [parseInt(x), parseInt(y)];
        if (outOfRange(newPoints[i])) {
            return this;
        } else {
            return new MapGeometry({ ...this, points: newPoints });
        }
    }

    movePolygon(polyIdx, position) {
        const polygon = this.polygons[polyIdx];
        const referencePos = this.points[polygon.endpoints[0]];
        const offset = v2sub(position, referencePos);
        const newPoints = [...this.points];
        for (const ptIdx of polygon.endpoints) {
            newPoints[ptIdx] = v2add(newPoints[ptIdx], offset).map(x =>
                parseInt(x));
            if (outOfRange(newPoints[ptIdx])) {
                return this;
            }
        }
        return new MapGeometry({ ...this, points: newPoints });
    }

    removeObjectsAndRenumber(deadObjects) {
        const newIndices = {};
        const newObjects = {};

        // For each object type, calculate new object arrays w/o the dead
        // objects and a index array mapping the old indexes to the new. Dead
        // objects are assigned index -1
        for (const type of objectTypes) {
            newIndices[type] = new Array(this[type].length);
            newObjects[type] = new Array(
                this[type].length - deadObjects.objectsOfType(type).length);
            for (let i = 0, newIndex = 0; i < this[type].length; ++i) {
                if (deadObjects.includes(type, i)) {
                    newIndices[type][i] = -1;
                } else {
                    newIndices[type][i] = newIndex;
                    newObjects[type][newIndex] = this[type][i];
                    ++newIndex;
                }
            }
        }

        function remap(type, index) {
            return -1 === index
                ? -1
                : newIndices[type][index];
        }

        // Remap indices in line objects
        for (let i = 0; i < newObjects.lines.length; ++i) {
            const line = newObjects.lines[i];

            newObjects.lines[i] = updateObject(line, {
                begin: remap('points', line.begin),
                end: remap('points', line.end),
                frontSide: remap('sides', line.frontSide),
                backSide: remap('sides', line.backSide),
                frontPoly: remap('polygons', line.frontPoly),
                backPoly: remap('polygons', line.backPoly),
            });
        }

        // Remap indices in side objects
        for (let i = 0; i < newObjects.sides.length; ++i) {
            const side = newObjects.sides[i];
            newObjects.sides[i] = updateObject(side, {
                polygonIndex: remap('polygons', side.polygonIndex),
                lineIndex: remap('lines', side.lineIndex),
                primaryLightsourceIndex: remap(
                    'lights', side.primaryLightsourceIndex),
                secondaryLightsourceIndex: remap(
                    'lights', side.secondaryLightsourceIndex),
                transparentLightsourceIndex: remap(
                    'lights', side.transparentLightsourceIndex),
            });
        }

        for (let i = 0; i < newObjects.polygons.length; ++i) {
            const polygon = newObjects.polygons[i];
            newObjects.polygons[i] = updateObject(polygon, {
                endpoints: polygon.endpoints.map(j => remap('points', j)),
                lines: polygon.lines.map(j => remap('lines', j)),
                sides: polygon.sides.map(j => remap('sides', j)),
                floorLightsource: remap('lights', polygon.floorLightsource),
                ceilingLightsource: remap(
                    'lights', polygon.ceilingLightsource),
                adjacentPolygons: polygon.adjacentPolygons.map(
                    j => remap('polygons', j)),
            });
        }

        return new MapGeometry({
            index: this.index,
            header: this.header,
            info: this.info,
            ...newObjects,
        });
    }

    deletePolygon(polygonIdx) {
        const deletions = new Dependencies();
        deletions.addPolygon(this, polygonIdx);
        return this.removeObjectsAndRenumber(deletions);
    }

    deleteLine(pointIdx) {
        const deletions = new Dependencies();
        deletions.addLine(this, pointIdx);
        return this.removeObjectsAndRenumber(deletions);
    }

    deletePoint(pointIdx) {
        const deletions = new Dependencies();
        deletions.addPoint(this, pointIdx);
        return this.removeObjectsAndRenumber(deletions);
    }
}

