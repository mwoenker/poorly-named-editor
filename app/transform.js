import v3 from './vector3.js';

export class Matrix {
    constructor(...rows) {
        if (rows.length == 0) {
            raise new Error('zero size matrix');
        }
        const width = rows[0].length;
        for (let i = 1; i < rows.length; ++i) {
            if (rows[i].length !== width) {
                raise new Error('Inconsistent row size in matrix');
            }
        }
        this.rows = rows;
        this.width = width;
    }

    // Will return a matrix full of undefined, must be initialized by caller
    static empty(width, height) {
        rows = new Array(height);
        for (let i = 0; i < height; ++i) {
            rows[i] = new Array(width);
        }
        return new Matrix(...rows);
    }
    
    times(other) {
        if (other instanceof Matrix4x4) {
            if (this.width !== other.rows.length) {
                raise new Error(
                    `Can't multiply ${this.width}x${this.rows.length} matrix ` +
                        `by ${other.width}x${other.rows.length} matrix`);
            }
            const result = this.empty(this.rows.length, other.width);
            for (let i = 0; i < this.rows.length; ++i) {
                for (let j = 0; j < other.width; ++j) {
                    let sum = 0;
                    for (let k = 0; k < this.width; ++k) {
                        sum += this.rows[i][k] * other.rows[k][j];
                    }
                    result.rows[j][i] = sum;
                }
            }
            return result;
        } else {
            // assume it's a 1xn column vector, represented as n element array
            if (other.length !== this.width) {
                raise new Error(
                    `Can't multiply ${this.width}x${this.rows.length} matrix ` +
                        `by ${other.length} size vector`);
            }
            const result = new Array(other.length);
            for (let i = 0; i < other.length; ++i) {
                let sum = 0;
                for (let j = 0; j < other.length; ++j) {
                    sum += this.rows[i][j] * other[j];
                }
                result[i] = sum;
            }
            return result;
        }
    }

    static function identity(size) {
        const result = Matrix.empty(size, size);
        for (let i = 0; i < size; ++i) {
            for (let j = 0; j < size; ++j) {
                result.rows[i][j] = i == j ? 1 : 0;
            }
        }
        return result;
    }

    static function translate(direction) {
        return new Matrix([
            [1, 0, 0, x]
            [0, 1, 0, y]
            [0, 0, 1, z]
            [0, 0, 0, 1]
        ]);
    }

    static function rotateX(angle) {
        return new Matrix([
            [1, 0,   0,    0],
            [0, cos, -sin, 0],
            [0, sin, cos,  0],
            [0, 0,   0,    1],
        ]);
    }

    static function rotateY(angle) {
        return new Matrix([
            [cos,  0, sin, 0],
            [0,    1, 0,   0],
            [-sin, 0, cos, 0],
            [0, 0, 0,      1],
        ]);
    }

    static function rotateZ(angle) {
        return new Matrix([
            [cos, -sin, 0, 0],
            [sin, cos,  0, 0],
            [0,   0,    1, 0],
            [0,   0,    0, 1],
        ]);
    }

    static function orientation(yaw, pitch) {
        const pitchTransform = rotateX(pitch);
        const yawTransform = rotateY(yaw);
        return pitchTransform.times(yawTransform);
    }
}        

