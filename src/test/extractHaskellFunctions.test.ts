
import { extractHaskellFunctions } from '../../src/utils/extractHaskellFunctions';
import * as fs from 'fs/promises';

jest.mock('fs/promises');

describe('extractHaskellFunctions', () => {
    beforeEach(() => {
        jest.clearAllMocks();
    });

    it('should extract simple function definition', async () => {
        (fs.readFile as jest.Mock).mockResolvedValue(`
myFunc :: Int -> Int
myFunc x = x + 1
        `);

        const funcs = await extractHaskellFunctions('test.hs');
        expect(funcs).toHaveLength(1);
        expect(funcs[0]).toEqual({
            name: 'myFunc',
            args: ['x'],
            body: ['x + 1']
        });
    });

    it('should extract function with multiple arguments', async () => {
        (fs.readFile as jest.Mock).mockResolvedValue(`
add :: Int -> Int -> Int
add x y = x + y
        `);

        const funcs = await extractHaskellFunctions('test.hs');
        expect(funcs[0]).toEqual({
            name: 'add',
            args: ['x', 'y'],
            body: ['x + y']
        });
    });

    it('should handle multiline function bodies', async () => {
        (fs.readFile as jest.Mock).mockResolvedValue(`
complexFunc x = 
    let y = x + 1
    in y * 2
        `);

        const funcs = await extractHaskellFunctions('test.hs');
        expect(funcs).toHaveLength(1);
        expect(funcs[0].name).toBe('complexFunc');
        expect(funcs[0].body).toHaveLength(3); // main line + 2 indented lines
    });

    it('should ignore keywords and comments', async () => {
        (fs.readFile as jest.Mock).mockResolvedValue(`
module Main where
import Data.List

-- This is a comment
data MyType = A | B

validFunc x = x
        `);

        const funcs = await extractHaskellFunctions('test.hs');
        expect(funcs).toHaveLength(1);
        expect(funcs[0].name).toBe('validFunc');
    });

    it('should handle arguments nested in parentheses', async () => {
        // e.g. func (Just x) y = ...
        (fs.readFile as jest.Mock).mockResolvedValue(`
maybeFunc (Just x) y = x + y
        `);

        const funcs = await extractHaskellFunctions('test.hs');
        expect(funcs[0].args).toEqual(['(Just x)', 'y']);
    });
});
