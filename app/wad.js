class Reader {
    constructor(arrayBuffer) {
        this.bytes = new Uint8Array(arrayBuffer);
        this.pos = 0;
        this.decoder = new TextDecoder('x-mac-roman');
    }
    spaceRemaining() {
        return this.bytes.byteLength - this.pos;
    }
    eof() {
        return 0 === this.spaceRemaining();
    }
    requireSpace(nBytes) {
        if (this.spaceRemaining() < nBytes) {
            throw new Error("unexpected end");
        }
    }
    uint8() {
        this.requireSpace(1);
        return this.bytes[this.pos++];
    }
    uint16() {
        this.requireSpace(2);
        return (this.uint8()) << 8 | this.uint8();
    }
    uint32() {
        this.requireSpace(4);
        return (this.uint16() * (1 << 16)) + this.uint16();
    }
    int8() {
        this.requireSpace(1);
        const u = this.uint8();
        return (u << 24) >> 24; // sign extend
    }
    int16() {
        this.requireSpace(2);
        const u = this.uint16();
        return (u << 16) >> 16; // sign extend
    }
    int32() {
        this.requireSpace(4);
        return (this.uint16() << 16) | this.uint16();
    }
    raw(length) {
        this.requireSpace(length);
        let bytes = this.bytes.slice(this.pos, this.pos + length);
        this.pos += length;
        return bytes;
    }
    fixString(length) {
        return this.decoder.decode(this.raw(length));
    }
    cString(maxlen) {
        let bytes = this.raw(maxlen);
        for (let i = 0; i < bytes.length; ++i) {
            if (0 === bytes[i]) {
                bytes = bytes.slice(0, i);
                break;
            }
        }
        return this.decoder.decode(bytes);
    }
    skip(nBytes) {
        this.requireSpace(nBytes);
        this.pos += nBytes;
    }
    seek(pos) {
        if (pos >= this.bytes.byteLength) {
            throw new Error('Seek past end of data');
        }
        this.pos = pos;
    }
}

function readRange(file, start, stop) {
    const slice = file.slice(start, stop);
    const reader = new FileReader();
    return new Promise((resolve, reject) => {
        reader.onerror = (e) => reject(new Error("read error"));
        reader.onload = (e) => resolve(reader.result);
        reader.readAsArrayBuffer(slice);
    });
}

function macbinCrc(bytes, start, end) {
    let crc = 0;
    for (let i = start; i < end; ++i) {
	let data = bytes[i] << 8;
	for (let j = 0; j < 8; ++j) {
	    if ((data ^ crc) & 0x8000) {
		crc = 0xffff & ((crc << 1) ^ 0x1021);
	    } else {
                crc = 0xffff & (crc << 1);
            }
            data = 0xffff & (data << 1);
	}
    }
    return crc;
}

async function getDataFork(file) {
    const macbinChunk = new Uint8Array(await readRange(file, 0, 128));
    const version = macbinChunk[0];
    const nameLength = macbinChunk[1];
    const zeroFill = macbinChunk[74];
    const minMacbinVersion = macbinChunk[123];
    const dataForkLength =
          (macbinChunk[83] << 24) |
          (macbinChunk[84] << 16) |
          (macbinChunk[85] << 8) |
          macbinChunk[86];
    const fileCrc = macbinChunk[124] << 8 | macbinChunk[125];
    const crc = macbinCrc(macbinChunk, 0, 124);

    if (0 !== version || nameLength > 63 || 0 !== zeroFill ||
        minMacbinVersion > 123 ||  crc != fileCrc)
    {
        // Not a macbin file, just return entire file
        return file;
    } else {
        return file.slice(128, 128 + dataForkLength);
    }
}

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

chunkParser.defineArray('EPNT', (r) => ({
    flags: r.uint16(),
    highestFloor: r.int16(),
    lowestCeiling: r.int16(),
    position: [r.int16(), r.int16()],
    transformed: [r.int16(), r.int16()],
    supportingPolyIdx: r.uint16(),
}));

chunkParser.defineArray('LINS', (r) => {
    const line = {
        begin: r.uint16(),
        end: r.uint16(),
        flags: r.uint16(),
        length: r.uint16(),
        hightestFloor: r.uint16(),
        highestCeiling: r.uint16(),
        frontSide: r.uint16(),
        backSide: r.uint16(),
        frontPoly: r.uint16(),
        backPoly: r.uint16()
    };
    r.skip(12);
    return line;
});

chunkParser.defineArray('POLY', (r) => {
    const readList = (n, parseFunc) => {
        const results = [];
        for (let i = 0; i < n; ++i) {
            results.push(parseFunc());
        }
        return results;
    };
    const polygon = {}
    polygon.type = r.uint16();
    polygon.flags = r.uint16();
    polygon.permutation = r.uint16();
    polygon.vertexCount = r.uint16();
    polygon.endpoints = readList(8, () => r.uint16());
    polygon.lines = readList(8, () => r.uint16());
    polygon.floorTex = r.uint16();
    polygon.ceilingTex = r.uint16();
    polygon.floorHeight = r.int16();
    polygon.ceilingHeight = r.int16();
    polygon.floorLightsource = r.uint16();
    polygon.ceilingLightsource = r.uint16();
    polygon.area = r.int32();
    polygon.firstObject = r.uint16();
    polygon.firstExclusion_zone = r.uint16();
    polygon.n_lineExclusionZones = r.uint16();
    polygon.nPointExclusionZones = r.uint16();
    polygon.floorTransferMode = r.uint16();
    polygon.ceilingTransferMode = r.uint16();
    polygon.adjacentPolygons = readList(8, () => r.uint16());
    polygon.firstNeighbor = r.uint16();
    polygon.nNeighbors = r.uint16();
    polygon.center = readList(2, () => r.uint16());
    polygon.sides = readList(8, () => r.uint16());
    polygon.floorOrigin = readList(2, () => r.uint16());
    polygon.ceilingOrigin = readList(2, () => r.uint16());
    polygon.media = r.uint16();
    polygon.mediaLightsource = r.uint16();
    polygon.sound = r.uint16();
    polygon.ambientSound = r.uint16();
    polygon.randomSound = r.uint16();
    r.skip(2);
    return polygon;
});

chunkParser.define('Minf', (r) => {
    const info = {}
    info.environmentCode = r.uint16();
    info.physics_model = r.uint16();
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
    return {
        index: index,
        header: wadHeader,
        info: chunks.get('Minf'),
        lines: chunks.get('LINS'),
        endpoints: chunks.get('EPNT'),
        polygons: chunks.get('POLY'),
    }
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

export { readAllMaps, readMapSummaries, readMapFromSummary };
