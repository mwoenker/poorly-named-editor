import {Reader, readRange, getDataFork} from './binary-read';
import x from './map';
import {MapGeometry} from './map';

function readDirectoryEntry(bytes, entrySize, wadVersion, appDataBytes) {
    const r = new Reader(bytes);
    const offset = r.uint32();
    const length = r.uint32();
    let index = 0;
    let appData = null;
    if (wadVersion >= 2) {
        index = r.uint16();
        appData = r.raw(appDataBytes);
    }
    return {offset, length, index, appData};
}

async function readWadHeader(file) {
    const r = new Reader(await readRange(file, 0, 128));
    const wadVersion = r.uint16();
    const dataVersion = r.uint16();
    const filename = r.cString(64);
    const crc = r.uint32();
    const dirOffset = r.uint32();
    const nEntries = r.uint16();
    const appDataBytes = r.uint16();
    const chunkSize = r.uint16() || 16;
    const entrySize = r.uint16() || 10;
    const parentCrc = r.uint32();

    const fullEntrySize = wadVersion < 1 ? 8 : entrySize + appDataBytes;
    const dirData = await readRange(
        file, dirOffset, dirOffset + (nEntries * fullEntrySize));
    let directory = [];
    for (let i = 0; i < nEntries; ++i) {
        const start = (i * fullEntrySize);
        const end = start + fullEntrySize;
        const entryData = dirData.slice(start, end);
        directory.push(readDirectoryEntry(
            entryData, entrySize, wadVersion, appDataBytes));
    }

    return {wadVersion,
            dataVersion,
            filename,
            crc,
            dirOffset,
            nEntries,
            appDataBytes,
            chunkSize,
            entrySize,
            parentCrc,
            directory};
}

class ChunkParser {
    constructor() {
        this.parsers = new Map();
    }
    define(type, parser) {
        this.parsers.set(type, parser);
    }
    defineArray(type, parseOne) {
        this.define(type, r => {
            const items = [];
            while (! r.eof()) {
                items.push(parseOne(r));
            }
            return items;
        });
    }
    parse(header, data) {
        const parser = this.parsers.get(header.name);
        const reader = new Reader(data);
        if (! parser) {
            return null;
        }
        return parser(reader);
    }
}

let chunkParser = new ChunkParser();

const readList = (n, parseFunc) => {
    const results = [];
    for (let i = 0; i < n; ++i) {
        results.push(parseFunc());
    }
    return results;
};

const readPoint = r => [r.int16(), r.int16()];

chunkParser.defineArray('EPNT', (r) => ({
    flags: r.uint16(),
    highestFloor: r.int16(),
    lowestCeiling: r.int16(),
    position: readPoint(r),
    transformed: readPoint(r),
    supportingPolyIdx: r.int16(),
}));

chunkParser.defineArray('PNTS', readPoint);

chunkParser.defineArray('LINS', (r) => {
    const line = {
        begin: r.int16(),
        end: r.int16(),
        flags: r.uint16(),
        length: r.uint16(),
        hightestFloor: r.int16(),
        highestCeiling: r.int16(),
        frontSide: r.int16(),
        backSide: r.int16(),
        frontPoly: r.int16(),
        backPoly: r.int16()
    };
    r.skip(12);
    return line;
});

chunkParser.defineArray('SIDS', (r) => {
    const sideTex = () => ({
        offset: readPoint(r),
        texture: r.uint16(), // shape descriptor
    });
    const line = {
        type: r.uint16(),
        flags: r.uint16(),
        primaryTexture: sideTex(),
        secondaryTexture: sideTex(),
        transparentTexture: sideTex(),
        collisionTopLeft: readPoint(r),
        collisionTopRight: readPoint(r),
        collisionBottomLeft: readPoint(r),
        collisionBottomRight: readPoint(r),
        controlPanelType: r.int16(),
        controlPanelPermutation: r.int16(),
        primaryTransferMode: r.int16(),
        secondaryTransferMode: r.int16(),
        transparentTransferMode: r.int16(),
        polygonIndex: r.int16(),
        lineIndex: r.int16(),
        primaryLightsourceIndex: r.int16(),
        secondaryLightsourceIndex: r.int16(),
        transparentLightsourceIndex: r.int16(),
        ambientDelta: r.int32(),
    };
    r.skip(2);
    return line;
});

chunkParser.defineArray('POLY', (r) => {
    // Read 8 shorts, but only return the first $nVertices
    const readPolyIndices = (nVertices) =>
          readList(8, () => r.int16()).slice(0, nVertices);
    
    const polygon = {}
    polygon.type = r.uint16();
    polygon.flags = r.uint16();
    polygon.permutation = r.uint16();
    polygon.vertexCount = r.uint16();
    polygon.endpoints = readPolyIndices(polygon.vertexCount);
    polygon.lines = readPolyIndices(polygon.vertexCount);
    polygon.floorTex = r.uint16();
    polygon.ceilingTex = r.uint16();
    polygon.floorHeight = r.int16();
    polygon.ceilingHeight = r.int16();
    polygon.floorLightsource = r.int16();
    polygon.ceilingLightsource = r.int16();
    polygon.area = r.int32();
    polygon.firstObject = r.uint16();
    polygon.firstExclusionZone = r.int16();
    polygon.nLineExclusionZones = r.int16();
    polygon.nPointExclusionZones = r.int16();
    polygon.floorTransferMode = r.int16();
    polygon.ceilingTransferMode = r.int16();
    polygon.adjacentPolygons = readPolyIndices(polygon.vertexCount);
    polygon.firstNeighbor = r.int16();
    polygon.nNeighbors = r.int16();
    polygon.center = readList(2, () => r.uint16());
    polygon.sides = readPolyIndices(polygon.vertexCount);
    polygon.floorOrigin = readList(2, () => r.uint16());
    polygon.ceilingOrigin = readList(2, () => r.uint16());
    polygon.media = r.uint16();
    polygon.mediaLightsource = r.uint16();
    polygon.firstSoundSource = r.uint16();
    polygon.ambientSound = r.uint16();
    polygon.randomSound = r.uint16();
    r.skip(2);
    return polygon;
});

chunkParser.defineArray('LITE', (r) => {
    const lightFunction = () => ({
        func: r.int16(),
        period: r.int16(),
        deltaPeriod: r.int16(),
        intensity: r.int32(),
        deltaIntensity: r.int32(),
    });
    const light = {
        type: r.int16(),
        flags: r.uint16(),
        phase: r.int16(),
        primaryActive: lightFunction(),
        secondaryActive: lightFunction(),
        becomingActive: lightFunction(),
        primaryInactive: lightFunction(),
        secondaryInactive: lightFunction(),
        becomingInactive: lightFunction(),
        tag: r.int16(),
    };
    r.skip(8);
    return light;
});

chunkParser.defineArray('OBJS', (r) => {
    const obj = {
        group: r.uint16(),
        index: r.uint16(),
        facing: r.uint16(),
        polygon: r.uint16(),
        position: [r.int16(), r.int16(), r.int16()],
        flags: r.uint16(),
    };
    return obj;
});

chunkParser.defineArray('plac', r => {
    return {
        flags: r.uint16(),
	initial_count: r.int16(),
	minimum_count: r.int16(),
	maximum_count: r.int16(),
	random_count: r.int16(),
	random_chance: r.uint16(),
    };
});

chunkParser.defineArray('medi', r => {
    const media =  {
        type: r.int16(),
        flags: r.uint16(),
        lightIndex: r.int16(),
        currentDirection: r.int16(),
        currentMagnitude: r.int16(),
        low: r.int16(),
        high: r.int16(),
        origin: readPoint(r),
        height: r.int16(),
        minimumLightIntensity: r.int32(), // fixed point
        texture: r.uint16(), // shape descriptor
        transferMode: r.int16(),
    };
    r.skip(4);
    return media;
});

chunkParser.defineArray('ambi', r => {
    const ambientSoundImage =  {
        flags: r.uint16(),
        soundIndex: r.int16(),
        volume: r.int16(),
    };
    r.skip(10);
    return ambientSoundImage;
});

chunkParser.defineArray('bonk', r => {
    const randomSoundImage =  {
        flags: r.uint16(),
        soundIndex: r.int16(),
        volume: r.int16(),
        deltaVolume: r.int16(),
        period: r.int16(),
        deltaPeriod: r.int16(),
        direction: r.int16(),
        deltaDirection: r.int16(),
        pitch: r.int32(), // fixed point
        deltaPitch: r.int32(), // fixed point
        phase: r.int16(),
    };
    r.skip(6);
    return randomSoundImage;
});

chunkParser.defineArray('NOTE', r => {
    const note =  {
        type: r.int16(),
        location: readPoint(r), // lower left of text
        polygonIndex: r.int16(),
        text: r.cString(64),
    };
    return note;
});

chunkParser.defineArray('PLAT', r => {
    const endpointOwner = () => ({
        firstPolygonIndex: r.int16(),
        polygonIndexCount: r.int16(),
        firstLineIndex: r.int16(),
        lineIndexCount: r.int16(),
    });
    
    const platform =  {
        type: r.int16(),
        staticFlags: r.uint32(),
        speed: r.int16(),
        delay: r.int16(),
        minFloorHeight: r.int16(),
        maxFloorHeight: r.int16(),
        minCeilingHeight: r.int16(),
        maxCeilingHeight: r.int16(),
        polygonIndex: r.int16(),
        dynamicFlags: r.uint16(),
        floorHeight: r.int16(),
        ceilingHeight: r.int16(),
        ticksUntilRestart: r.int16(),
        endpointOwners: readList(8, endpointOwner),
        parentPlatformIndex: r.int16(),
        tag: r.int16(),
    };
    r.skip(44);
    return platform;
});

chunkParser.define('Minf', (r) => {
    const info = {}
    info.environmentCode = r.uint16();
    info.physicsModel = r.uint16();
    info.musicId = r.uint16();
    info.missionFlags = r.uint16();
    info.environmentFlags = r.uint16();
    r.skip(8);
    info.name= r.cString(66);
    info.entryFlags = r.uint32();
    return info;
});

async function readEntryChunks(file, wadHeader, index, whitelist) {
    let entry = wadHeader.directory.find(entry => entry.index === index);
    if (! entry) {
        throw new Error(`entry ${index} not found`);
    }

    const chunks = new Map();
    const data = await readRange(
        file, entry.offset, entry.offset + entry.length);

    let chunkStart = 0;
    while (chunkStart < data.byteLength) {
        const headerSize = 0 === wadHeader.version ? 12 : wadHeader.chunkSize;
        const r = new Reader(
            data.slice(chunkStart, chunkStart + headerSize));
        const chunkHeader = {
            name: r.fixString(4),
            nextOffset: r.uint32(),
            size: r.uint32(),
        };

        const dataStart = chunkStart + headerSize;
        const chunkData = data.slice(dataStart, dataStart + chunkHeader.size);

        if (! whitelist || whitelist.includes(chunkHeader.name)) {
            const chunk = chunkParser.parse(chunkHeader, chunkData);
            if (chunk) {
                chunks.set(chunkHeader.name, chunk);
            } else {
                chunks.set(chunkHeader.name, chunkData);
            }
        }

        if (chunkHeader.nextOffset <= chunkStart) {
            break;
        }
        
        chunkStart = chunkHeader.nextOffset;
    }
    
    return chunks;
}

async function readMap(file, wadHeader, index) {
    const chunks = await readEntryChunks(file, wadHeader, index);
    let points;
    if (chunks.has('PNTS')) {
        points = chunks.get('PNTS');
    } else if (chunks.has('EPNT')) {
        points = chunks.get('EPNT').map(endpoint => endpoint.position);
    } else {
        throw Error('No EPNT or PNTS chunk');
    }

    if (! chunks.get('LINS')) {
        throw Error('No LINS chunk');
    }

    if (! chunks.get('POLY')) {
        throw Error('No POLY chunk');
    }

    return new MapGeometry({
        index: index,
        header: wadHeader,
        info: chunks.get('Minf'),
        points: points,
        lines: chunks.get('LINS'),
        sides: chunks.get('SIDS'),
        polygons: chunks.get('POLY'),
        objects: chunks.get('OBJS') || [],
        frequencies: chunks.get('plac') || [],
        ambientSounds: chunks.get('ambi') || [],
        randomSounds: chunks.get('bonk') || [],
        platforms: chunks.get('PLAT') || [],
        terminals: chunks.get('term') || [],
        notes: chunks.get('NOTE') || [],
    });
    
    // return {
    //     index: index,
    //     header: wadHeader,
    //     info: chunks.get('Minf'),
    //     lines: chunks.get('LINS'),
    //     endpoints: chunks.get('EPNT'),
    //     polygons: chunks.get('POLY'),
    // }

}

async function readMapChunkTypes(summary) {
    const chunks = await readEntryChunks(
        summary.data, summary.header, summary.index);
    return [...chunks.keys()];
}

function readMapFromSummary(summary) {
    return readMap(summary.data, summary.header, summary.index);
}

async function readAllMaps(file) {
    const wadData = await getDataFork(file);
    const wadHeader = await readWadHeader(wadData);
    const mapPromises = wadHeader.directory
          .map(entry => readMap(wadData, wadHeader, entry.index));
    const unsortedMaps = await Promise.all(mapPromises);
    const maps = unsortedMaps.sort((a, b) => a.index - b.index);
    return maps;
}

async function readMapSummaries(file) {
    const wadData = await getDataFork(file);
    const wadHeader = await readWadHeader(wadData);
    const chunkPromises = wadHeader.directory
          .map(entry => readEntryChunks(
              wadData, wadHeader, entry.index, ['Minf']));
    const mapChunks = await Promise.all(chunkPromises);
    const summaries = mapChunks.map(
        (chunks, i) => {return {
            index: wadHeader.directory[i].index,
            data: wadData,
            header: wadHeader,
            info: chunks.get('Minf')
        }});
    return summaries;
}

export { readAllMaps, readMapSummaries, readMapFromSummary, readMapChunkTypes };
