import {Reader, readRange, getDataFork} from './binary-read';

const nCollections = 32;
const collectionHeaderSize = 32

// See shape_descriptors.h in aleph one
// These are the only collections we load.
export const collectionIndex = {
    wall: {
        water: 17,
        lava: 18,
        sewage: 19,
        jjaro: 20,
        pfhor: 21,
    },
    scenery: {
        water: 22,
        lava: 23,
        sewage: 24,
        jjaro: 25,
        pfhor: 26,
    },
    landscape: {
        day: 27,
        night: 28,
        moon: 29,
        space: 30,
    },
};

const COLUMN_ORDER_BIT = 0x8000;

function readColorTable(bytes, colorsPerTable) {
    const r = new Reader(bytes);
    
    const table = [];
    for (let i = 0; i < colorsPerTable; ++i) {
        table.push({
            flags: r.uint8(),
            value: r.uint8(),
            r: r.uint16(),
            g: r.uint16(),
            b: r.uint16(),
        });
    }
    return table;
}

function readColorTables(bytes, collection) {
    const tables = [];
    for (let i = 0; i < collection.colorTableCount; ++i) {
        const colorSize = 8;
        const tableSize = collection.colorsPerTable * colorSize;
        const tableBase = collection.colorTablesOffset + i * tableSize;
        const tableBytes = bytes.slice(tableBase, tableBase + tableSize);
        tables.push(readColorTable(tableBytes, collection.colorsPerTable));
    }

    return tables;
}

function readBitmap(bytes, offset) {
    const r = new Reader(bytes.slice(offset));

    const bitmap = {
        width: r.int16(),
        height: r.int16(),
        bytesPerRow: r.int16(),
        flags: r.uint16(),
        bitDepth: r.int16(),
    };

    const columnOrder = 0 != (bitmap.flags & COLUMN_ORDER_BIT);
    bitmap.columnOrder = columnOrder;
    
    const nSlices = columnOrder ? bitmap.width : bitmap.height;
    const sliceSize = columnOrder ? bitmap.height : bitmap.width;

    console.assert(bitmap.width <= 2048);
    console.assert(bitmap.height <= 2048);
    console.assert(-1 === bitmap.bytesPerRow ||
                   sliceSize === bitmap.bytesPerRow);
    console.assert(8 === bitmap.bitDepth);
    
    r.skip(20);
    r.skip(4 * nSlices);

    if (bitmap.bytesPerRow < 0) {
        bitmap.data = new Uint8Array(bitmap.width * bitmap.height);
        for (let i = 0; i < nSlices; ++i) {
            const begin = r.int16();
            const end = r.int16();
            console.assert(begin >= 0 && begin < 2048);
            console.assert(end >= 0 && end < 2048);
            for (let j = begin; j < end; ++j) {
                bitmap.data[sliceSize * i + j] = r.uint8();
            }
        }
    } else {
        bitmap.data = r.raw(bitmap.width * bitmap.height);
    }

    return bitmap;
}

function readBitmaps(bytes, collection) {
     const r = new Reader(bytes.slice(
        collection.bitmapTableOffset,
        collection.bitmapTableOffset + 4 * collection.bitmapCount));

    const bitmaps = []
    for (let i = 0; i < collection.bitmapCount; ++i) {
        const offset = r.int32();
        bitmaps.push(readBitmap(bytes, offset));
    }
    return bitmaps;
}

function readFrame(bytes, offset) {
    const r = new Reader(bytes.slice(offset, offset + 36));

    return {
        flags: r.int16(),
        minimumLighIntensity: r.int32(),
        bitmapIndex: r.int16(),
        origin: [r.int16(), r.int16()],
        key: [r.int16(), r.int16()],
        worldLeft: r.int16(),
        worldRight: r.int16(),
        worldTop: r.int16(),
        worldBottom: r.int16(),
        world: [r.int16(), r.int16()],
    }
}

function readFrames(bytes, collection) {
     const r = new Reader(bytes.slice(
        collection.frameTableOffset,
        collection.frameTableOffset + 4 * collection.frameCount));

    const frames = [];
    for (let i = 0; i < collection.frameCount; ++i) {
        const offset = r.int32();
        frames.push(readFrame(bytes, offset));
    }

    return frames;
}

function readSequence(bytes, offset) {
    const r = new Reader(bytes.slice(offset, offset + 88));

    const seq =  {
        type: r.int16(),
        flags: r.uint16(),
        name: r.pascalString(34),
        numberOfViews: r.int16(),
        framesPerView: r.int16(),
        ticksPerFrame: r.int16(),
        keyFrame: r.int16(),
        transferMode: r.int16(),
        transferModePeriod: r.int16(),
        firstFrameSound: r.int16(),
        keyFrameSound: r.int16(),
        lastFrameSound: r.int16(),
        scaleFactor: r.int16(),
        loopFrame: r.int16(),
    };
    
    return seq;
}

// Sequence, aka high level shapes in marathon terminology
async function readSequences(bytes, collection) {
    const r = new Reader(bytes.slice(
        collection.sequenceTableOffset,
        collection.sequenceTableOffset + 4 * collection.sequenceCount));

    const sequences = [];
    for (let i = 0; i < collection.sequenceCount; ++i) {
        const offset = r.int32();
        sequences.push(readSequence(bytes, offset));
    }

    return sequences;
}

async function readCollection(file, header) {
    let offset, length;
    if (header.offset16 <= 0 || header.length16 <= 0) {
        offset = header.offset8;
        length = header.length8;
    } else {
        offset = header.offset16;
        length = header.offset16;
    }
    if (offset <= 0 || length <= 0) {
        return null;
    }

    const collectionBytes = await readRange(file, offset, offset + length);
    const r = new Reader(collectionBytes);
    
    const collection = {
        header: header,
        version: r.int16(),
	type: r.int16(),
        flags: r.uint16(),
	colorsPerTable: r.int16(),
        colorTableCount: r.int16(),
        colorTablesOffset: r.int32(),
        sequenceCount: r.int16(),
        sequenceTableOffset: r.int32(),
        frameCount: r.int16(),
        frameTableOffset: r.int32(),
        bitmapCount: r.int16(),
        bitmapTableOffset: r.int32(),
        scaleFactor: r.int16(),
        collectionSize: r.int32(),
    };

    collection.sequences = readSequences(collectionBytes, collection);
    collection.frames = readFrames(collectionBytes, collection);
    collection.bitmaps = readBitmaps(collectionBytes, collection);
    collection.colorTables = readColorTables(collectionBytes, collection);
    return collection;
}

export async function readShapes(file) {
    const r = new Reader(await readRange(
        file,
        0,
        nCollections * collectionHeaderSize));
    const headers = [];
    for (let i = 0; i < nCollections; ++i) {
        const header = {
            status: r.int16(),
            flags: r.uint16(),
            offset8: r.int32(),
            length8: r.int32(),
            offset16: r.int32(),
            length16: r.int32(),
        }
        r.skip(12);
        headers.push(header);
    }

    // const collectionIndexes = Object.values(collectionIndex).flatMap(
    //     category => Object.values(category));
    const collectionIndexes = [
        0, 1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11, 12, 13, 14, 15, 16, 17, 18, 19,
        20, 21, 22, 23, 24, 25, 26, 27, 28, 29, 30, 31];
    const promises = collectionIndexes.map(
        async i => [i, await readCollection(file, headers[i])]);
    return Object.fromEntries(await Promise.all(promises));
}
