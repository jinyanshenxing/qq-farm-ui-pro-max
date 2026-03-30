const test = require('node:test');
const assert = require('node:assert/strict');

const { getItemImageById } = require('../src/config/gameConfig');

test('fertilizer items resolve to extracted PNG icons instead of SVG placeholders', () => {
    const expectations = new Map([
        [80002, 'icon_feterlize2.png'],
        [80004, 'icon_feterlize4.png'],
        [80012, 'icon_feterlize6.png'],
        [80014, 'icon_feterlize8.png'],
    ]);

    for (const [itemId, filename] of expectations) {
        const image = getItemImageById(itemId);
        assert.equal(image.endsWith(`/item_icons/${filename}`), true, `item ${itemId} should use ${filename}`);
        assert.equal(image.endsWith('.svg'), false, `item ${itemId} should not fall back to SVG`);
    }
});

test('generic mall preview ids resolve to extracted PNG fallbacks', () => {
    const expectations = new Map([
        [1, '1.png'],
        [8, '8.png'],
        [16, '16.png'],
    ]);

    for (const [itemId, filename] of expectations) {
        const image = getItemImageById(itemId);
        assert.equal(image.endsWith(`/item_icons/${filename}`), true, `item ${itemId} should use ${filename}`);
        assert.equal(image.endsWith('.svg'), false, `item ${itemId} should not fall back to SVG`);
    }
});

test('currency items resolve to extracted PNG icons instead of generated SVGs', () => {
    const expectations = new Map([
        [1001, 'golds.png'],
        [1002, '1002.png'],
        [1005, '1005.png'],
        [1004, 'icon_diamond.png'],
    ]);

    for (const [itemId, filename] of expectations) {
        const image = getItemImageById(itemId);
        assert.equal(image.endsWith(`/item_icons/${filename}`), true, `item ${itemId} should use ${filename}`);
        assert.equal(image.endsWith('.svg'), false, `item ${itemId} should not fall back to SVG`);
    }
});

test('pet items resolve to extracted PNG icons from live mini-game cache', () => {
    const expectations = new Map([
        [90001, '90001.png'],
        [90002, '90002.png'],
        [90003, '90003.png'],
        [90006, 'dogFood3.png'],
        [90011, '90011.png'],
    ]);

    for (const [itemId, filename] of expectations) {
        const image = getItemImageById(itemId);
        assert.equal(image.endsWith(`/item_icons/${filename}`), true, `item ${itemId} should use ${filename}`);
        assert.equal(image.endsWith('.svg'), false, `item ${itemId} should not fall back to SVG`);
    }
});

test('dress shop items resolve to extracted PNG icons from live mini-game cache', () => {
    const expectations = new Map([
        [21011, '21011.png'],
    ]);

    for (const [itemId, filename] of expectations) {
        const image = getItemImageById(itemId);
        assert.equal(image.endsWith(`/item_icons/${filename}`), true, `item ${itemId} should use ${filename}`);
        assert.equal(image.endsWith('.svg'), false, `item ${itemId} should not fall back to SVG`);
    }
});
