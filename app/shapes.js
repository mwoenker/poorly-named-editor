import React, {useState, useReducer, useEffect, useLayoutEffect, useRef} from 'react';
import ReactDOM from 'react-dom';

import {collectionIndex, readShapes} from './files/shapes';

const blackBytes = Uint8Array.of(0, 0, 0, 255);
const black = new Uint32Array(blackBytes.buffer)[0];

function calcColorTable(collection, idx) {
    if (! idx) {
        idx = 0;
    }
    const table = collection.colorTables[idx];
    const buf = new ArrayBuffer(4 * 256);
    const pixels = new Uint32Array(buf);
    const bytes = new Uint8Array(buf);

    pixels.fill(black);

    for (const entry of collection.colorTables[idx]) {
        const offset = 4 * entry.value;
        bytes[offset] = entry.r >> 8;  
        bytes[offset + 1] = entry.g >> 8;  
        bytes[offset + 2] = entry.b >> 8;  
        bytes[offset + 3] = 255;
    }
    
    return pixels;
}

function Texture({collection, frameIndex, clutIndex}) {
    const canvas = useRef();
    
    const colorTable = calcColorTable(collection, clutIndex);
    const bitmapIdx = collection.frames[frameIndex].bitmapIndex;
    //const bitmapIdx = frameIndex;
    const bitmap = -1 !== bitmapIdx &&
          collection.bitmaps[collection.frames[frameIndex].bitmapIndex];

    useEffect(() => {
        if (canvas.current) {
            let {width, height} = bitmap;
            const context = canvas.current.getContext('2d');
            const imgData = context.createImageData(2 * width, 2 * height);

            const pixels = new Uint32Array(imgData.data.buffer);
            for (let y = 0; y < height; ++y) {
                for (let x = 0; x < width; ++x) {
                    const srcIdx = bitmap.columnOrder
                          ? height * x + y
                          : width * y + x;
                    const dstIdx = 2 * (2 * width * y + x);
                    pixels[dstIdx] = colorTable[bitmap.data[srcIdx]];
                    pixels[dstIdx + 1] = colorTable[bitmap.data[srcIdx]];
                    pixels[dstIdx + 2 * width] =
                        colorTable[bitmap.data[srcIdx]];
                    pixels[dstIdx + 2 * width + 1] =
                        colorTable[bitmap.data[srcIdx]];
                }
            }
            
            context.putImageData(imgData, 0, 0);
            context.fillStyle = 'white';
            context.font = '14px sans';
            context.fillText(`${bitmap.offset},${bitmap.bytesPerRow},${bitmap.flags}`, 30, 30);
        }
    }, [collection, frameIndex, clutIndex]);

    if (! bitmap) {
        return null;
    }

    return <canvas
               style={{backgroundColor: 'green'}}
               ref={canvas}
               width={bitmap.width * 2}
               height={bitmap.height * 2} />;
}

function Collection({collection, clutIndex}) {
    if (! collection) {
        return <div>Invalid Collection</div>;
    }
    return (
        <div>
            {collection.frames.map((frame, i) =>
                <Texture
                    key={i}
                    collection={collection}
                    frameIndex={i}
                    clutIndex={clutIndex} />
            )}
        </div>
    );
}

function Shapes(props) {
    const [file, setFile] = useState(null);
    const [collectionIndex, setCollectionIndex] = useState(0);
    const [clutIndex, setClutIndex] = useState(0);
    
    async function uploadFile(e) {
        const file = e.target.files[0];
        if (file) {
            setFile({
                file: file,
                collections: await readShapes(file),
            });
        }
    }

    const collections = file && file.collections ? file.collections : [];
    const currentCollection = (collectionIndex in collections) &&
          collections[collectionIndex];
    const clutIndexes = currentCollection
          ? Object.keys(currentCollection.colorTables)
          : [];
    return (
        <>
            <input type="file" onChange={uploadFile} />
            <select onChange={e => {
                        setClutIndex(0);
                        setCollectionIndex(e.target.value);
                    }}
                    value={collectionIndex}>
                {Object.entries(collections).map((c, i) =>
                    <option value={i} key={i}>{i}</option>
                )}
            </select>
            <select onChange={e => setClutIndex(e.target.value)}
                    value={clutIndex}>
                {clutIndexes.map((i) => <option value={i} key={i}>{i}</option> )}
            </select>
            <Collection collection={currentCollection} clutIndex={clutIndex} />
        </>
    );
}

ReactDOM.render(<Shapes />, document.getElementById('app'));
