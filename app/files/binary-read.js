export class Reader {
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
    pascalString(nBytes) {
        let bytes = this.raw(nBytes);
        return this.decoder.decode(bytes.slice(1, 1 + bytes[0]));
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

export function readRange(file, start, stop) {
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

export async function getDataFork(file) {
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
